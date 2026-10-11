// The customize tools against the puzzle's own shape (issue #22): every dot sits on the puzzle,
// on every solid, truncated or not, shallow and deep; and every kind of cut and truncation drags
// both ways, deeper and back out, and off to go.
import { test, expect } from "@playwright/test";
import { open, info, noErrors, editTool, editDot, dragCut, cutPoint, rulers } from "./helpers.mjs";

test.describe.configure({ timeout: 120_000 });

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page, "?rear=off"); });
test.afterEach(async () => { await noErrors(errors); });

const link = (design) => `?puzzle=custom&rear=off&design=${Buffer.from(JSON.stringify(design)).toString("base64url")}`;
const settled = (page) => page.evaluate(() => window.cutwist.settled());
async function customize(page, design) {
  await open(page, link(design));
  await settled(page);
  await page.click("#customize");
  await settled(page);
}
const offs = async (page, tool) => {
  await editTool(page, tool);
  return page.evaluate(() => window.cutwist.editDotsOff());
};

const SOLIDS = ["tetrahedron", "cube", "octahedron", "dodecahedron", "icosahedron", "rhombicDodecahedron"];
const TRIMS = [{}, { vertex: 0.9 }, { vertex: 0.4 }, { edge: 0.4 }, { vertex: 0.5, edge: 0.6 }];

for (const solid of SOLIDS) test(`every dot is on the ${solid}: truncated shallow and deep, corners, edges and both`, async ({ page }) => {
  for (const truncate of TRIMS) {
    await customize(page, { solid, truncate, cuts: [{ on: "face", depths: [0.5] }], blackout: [] });
    const name = `${solid} ${JSON.stringify(truncate)}`;
    for (const tool of ["cut", "trim"]) {
      const o = await offs(page, tool);
      expect(o.length, `${name} ${tool}: dots showing`).toBeGreaterThan(0);
      for (const d of o) expect(d.off, `${name} ${tool}: a ${d.label} dot`).toBeLessThan(0.01);
    }
  }
});

test("every dot is on the ball", async ({ page }) => {
  for (const [N, M] of [[4, 3], [3, 5], [2, 6]]) for (const truncate of [{}, { vertex: 0.5 }, { edge: 0.5 }]) {
    await customize(page, { rule: "hyper", N, M, surface: 0, truncate, cuts: [{ on: "face", depths: [0.4] }], blackout: [] });
    for (const tool of ["cut", "trim"]) for (const d of await offs(page, tool)) expect(d.off, `{${N},${M}} ${JSON.stringify(truncate)} ${tool}: a ${d.label} dot`).toBeLessThan(0.01);
  }
});

// a truncation of a solid: in deeper, back out shallower than where it started, and off past its tip
for (const solid of ["tetrahedron", "cube", "dodecahedron"]) for (const kind of ["vertex", "edge"]) {
  test(`a ${solid}'s ${kind === "vertex" ? "corner" : "edge"} truncation drags in, back out, and off`, async ({ page }) => {
    await customize(page, { solid, truncate: { [kind]: 0.8 }, cuts: [{ on: "face", depths: [0.5] }], blackout: [] });
    await editTool(page, "trim");
    const r = kind === "vertex" ? 0 : 1, off = async () => (await rulers(page))[r].values[0];
    expect(await off()).toBeCloseTo(0.2, 5);
    await dragCut(page, r, 0, 0.35);
    expect(await off()).toBeGreaterThan(0.25); // (deeper: more taken off)
    await dragCut(page, r, 0, 0.1);
    expect(await off()).toBeLessThan(0.2); // (back out, past where it started)
    expect(await off()).toBeGreaterThan(0.02);
    // (off the solid altogether: gone)
    const from = await cutPoint(page, r, 0, null), vp = page.viewportSize();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(vp.width - 40, from.y, { steps: 16 });
    await page.mouse.up();
    expect((await rulers(page))[r].values).toEqual([]);
  });
}

// a cut on a solid: deeper, shallower, both ways
for (const [solid, r, on] of [["tetrahedron", 2, "faces"], ["cube", 3, "corners"], ["octahedron", 4, "edges"]]) {
  test(`a ${solid}'s cut round its ${on} drags deeper and back`, async ({ page }) => {
    await customize(page, { solid, truncate: {}, cuts: [{ on: { faces: "face", corners: "vertex", edges: "edge" }[on], depths: [0.7] }], blackout: [] });
    const v = async () => (await rulers(page))[r].values[0];
    await dragCut(page, r, 0, 0.45);
    expect(await v()).toBeLessThan(0.6);
    await dragCut(page, r, 0, 0.85);
    expect(await v()).toBeGreaterThan(0.75);
  });
}

// a truncation on the round, flat and hyperbolic tilings: the same
for (const [name, design] of [
  ["ball", { rule: "hyper", N: 4, M: 3, surface: 0, cuts: [{ on: "face", depths: [0.4] }], blackout: [] }],
  ["torus", { rule: "tiles", tiling: "square", a: 3, b: 0, cuts: [{ on: "face", depths: [0.3] }], blackout: [] }],
  ["hyperbolic surface", { rule: "hyper", N: 8, M: 3, surface: 0, cuts: [{ on: "face", depths: [0.4] }], blackout: [] }],
]) {
  test(`a ${name}'s corner truncation drags in and back out; a circle grows and shrinks`, async ({ page }) => {
    test.setTimeout(240_000); // (a hyperbolic surface rebuilds at every step of a drag: about a second each, slower under a loaded run)
    await customize(page, { ...design, truncate: { vertex: 0.8 } });
    await editTool(page, "trim");
    const off = async () => (await rulers(page))[0].values[0];
    await dragCut(page, 0, 0, 0.4, 5);
    expect(await off()).toBeGreaterThan(0.25); // (deeper; it may snap a little short, as to the square's octagon at 0.293)
    await dragCut(page, 0, 0, 0.1, 5);
    expect(await off()).toBeLessThan(0.2);
    await editTool(page, "cut");
    const radius = async () => (await rulers(page))[2].values[0], r0 = await radius();
    await dragCut(page, 2, 0, r0 * 1.3, 5);
    expect(await radius()).toBeGreaterThan(r0 * 1.15);
    await dragCut(page, 2, 0, r0 * 0.8, 5);
    expect(await radius()).toBeLessThan(r0 * 0.9);
  });
}

test("a dot clicked on a truncated solid adds there, and the new cut's dots stay on the solid", async ({ page }) => {
  await customize(page, { solid: "tetrahedron", truncate: { vertex: 0.45 }, cuts: [{ on: "face", depths: [] }], blackout: [] });
  await editDot(page, "corner faces");
  expect((await rulers(page))[5].values.length).toBe(1);
  for (const d of await offs(page, "cut")) expect(d.off).toBeLessThan(0.01);
  expect((await info(page)).pieces).toBeGreaterThan(1);
});
