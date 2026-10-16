// The piece limits (budget.mjs): a design past its kind's limit isn't built till you say so. The
// notice says so, in the bar under the puzzle; editing goes on meanwhile (back under the limit, it
// builds), the design stays in the link, and the notice's undo goes back to the last design under
// the limit.
import { test, expect } from "@playwright/test";
import { open, info, noErrors, dragCut, rulers } from "./helpers.mjs";

test.describe.configure({ timeout: 120_000 });

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page, "?rear=off"); });
test.afterEach(async () => { await noErrors(errors); });

const code = (design) => Buffer.from(JSON.stringify(design)).toString("base64url");
const link = (design) => `?puzzle=custom&rear=off&design=${code(design)}`;
const settled = (page) => page.evaluate(() => window.cutwist.settled());
const linked = (page) => page.evaluate(() => JSON.parse(atob(new URLSearchParams(location.search).get("design").replace(/-/g, "+").replace(/_/g, "/"))));
const note = (page) => page.locator("#limitNote");
async function customize(page, design) {
  await open(page, link(design));
  await settled(page);
  await page.click("#customize");
  await settled(page);
}
// (a dodecahedron cut round its faces and corners: 2,597 pieces, and 3,707 with the second
// corner cut at 0.8, past the solids' 3,000)
const dodeca = (v) => ({ solid: "dodecahedron", truncate: {}, cuts: [{ on: "face", depths: [0.45, 0.75] }, { on: "vertex", depths: [0.6125, v] }], blackout: [] });
const VERTEX = 3, FACE = 2; // (the rulers: cuts round corners, round faces)

test("a cut dragged past the limit keeps the last puzzle up, the design in the link; dragged back, it builds", async ({ page }) => {
  await customize(page, dodeca(0.97));
  expect((await info(page)).pieces).toBe(2597);
  await expect(note(page)).toBeHidden();
  await dragCut(page, VERTEX, 1, 0.8);
  const over = await info(page);
  expect(over.overLimit).toEqual({ limit: 3000, bare: false });
  // (the last one under the limit, still up: the drag's last step that was)
  expect(over.pieces).toBeGreaterThanOrEqual(2597);
  expect(over.pieces).toBeLessThanOrEqual(3000);
  await expect(note(page)).toBeVisible();
  await expect(page.locator("#limitText")).toContainText("Over 3,000 pieces");
  await expect(page.locator("#limitUndo")).toBeVisible();
  const v = (await rulers(page))[VERTEX].values[1];
  expect(v).toBeLessThan(0.85);
  expect((await linked(page)).cuts.find((c) => c.on === "vertex").depths[1]).toBeCloseTo(v, 6);
  // (and back under: built, the notice gone)
  await dragCut(page, VERTEX, 1, 0.95);
  const back = await info(page);
  expect(back.overLimit).toBeNull();
  expect(back.pieces).toBeLessThan(3000);
  await expect(note(page)).toBeHidden();
});

test("the notice's undo goes back to the last design under the limit, through every edit since, each one redoable", async ({ page }) => {
  await customize(page, dodeca(0.97));
  const start = await page.evaluate(() => window.cutwist.design());
  await dragCut(page, VERTEX, 1, 0.8);
  expect((await info(page)).overLimit).not.toBeNull();
  // (editing goes on while it's up)
  await dragCut(page, FACE, 0, 0.4);
  expect((await info(page)).overLimit).not.toBeNull();
  await page.click("#limitUndo");
  await settled(page);
  expect(await page.evaluate(() => window.cutwist.design())).toEqual(start);
  expect((await info(page)).overLimit).toBeNull();
  await expect(note(page)).toBeHidden();
  await expect(page.locator("#edRedo")).toHaveAttribute("title", /2 edits/);
  await page.click("#edRedo");
  await page.click("#edRedo");
  await settled(page);
  expect((await info(page)).overLimit).not.toBeNull();
  await expect(note(page)).toBeVisible();
});

test("build anyway builds it; once a build comes in under the limit, the limit's back", async ({ page }) => {
  await customize(page, dodeca(0.8));
  // (opened past the limit: nothing to undo to, and the shape uncut standing in)
  expect((await info(page)).overLimit).toEqual({ limit: 3000, bare: true });
  expect((await info(page)).pieces).toBe(1);
  await expect(page.locator("#limitUndo")).toBeHidden();
  await expect(page.locator("#limitText")).toContainText("uncut");
  await page.click("#limitBuild");
  await expect.poll(async () => (await info(page)).pieces, { timeout: 30_000 }).toBe(3707);
  expect((await info(page)).overLimit).toBeNull();
  await expect(note(page)).toBeHidden();
  // (still past it, edits build)
  await dragCut(page, VERTEX, 1, 0.75);
  expect((await info(page)).overLimit).toBeNull();
  expect((await info(page)).pieces).toBeGreaterThan(3000);
  // (under, then past it again: the notice)
  await dragCut(page, VERTEX, 1, 0.97);
  expect((await info(page)).pieces).toBeLessThan(3000);
  await dragCut(page, VERTEX, 1, 0.8);
  expect((await info(page)).overLimit).not.toBeNull();
  await expect(note(page)).toBeVisible();
});

// (opened past the limit, the shape uncut stands in, and editing on it works: a cut dragged
// back under builds)
for (const [name, design, r, i, v] of [
  ["solid", dodeca(0.8), VERTEX, 1, 0.97],
  // (2,522 pieces, over the balls' 2,500; one face circle fewer, well under)
  ["ball", { rule: "hyper", N: 5, M: 3, surface: 0, truncate: {}, cuts: [{ on: "face", depths: [0.375, 0.525, 0.675, 0.825] }, { on: "vertex", depths: [0.35, 0.45, 0.55] }], blackout: [] }, 2, 3, 1.3],
]) {
  test(`a ${name} opened past its limit is edited on its shape uncut, and builds once back under`, async ({ page }) => {
    await customize(page, design);
    expect((await info(page)).overLimit.bare).toBe(true);
    if (r === 2) { // (a ball's face circle dragged off, the rest under the limit)
      const from = await page.evaluate(({ r, i }) => window.cutwist.editCurve(r, i), { r, i });
      expect(from.lines.length).toBeGreaterThan(0);
      const [x, y] = from.lines[0][0], vp = page.viewportSize();
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(vp.width - 30, y, { steps: 12 });
      await page.mouse.up();
    } else await dragCut(page, r, i, v);
    await settled(page);
    const after = await info(page);
    expect(after.overLimit).toBeNull();
    expect(after.pieces).toBeGreaterThan(1);
    await expect(note(page)).toBeHidden();
  });
}

// (every kind of puzzle: a link to one past its limit opens with the notice, the shape uncut, the
// link as it was)
for (const [name, design, limit] of [
  ["solid", dodeca(0.8), 3000],
  ["ball", { rule: "hyper", N: 5, M: 3, surface: 0, truncate: {}, cuts: [{ on: "face", depths: [0.375, 0.525, 0.675, 0.825] }, { on: "vertex", depths: [0.35, 0.45, 0.55, 0.65] }], blackout: [] }, 2500],
  ["torus", { rule: "tiles", tiling: "hex", a: 6, b: 0, truncate: {}, cuts: [{ on: "face", depths: [0.85, 0.6, 0.4] }, { on: "vertex", depths: [0.5, 0.3] }], blackout: [] }, 4000],
  ["hyperbolic surface", { rule: "hyper", N: 7, M: 3, surface: 2, truncate: {}, cuts: [{ on: "face", depths: [0.4583, 0.575, 0.6917] }], blackout: [] }, 2500],
]) {
  test(`a link to a ${name} past its limit opens with the notice, and builds anyway`, async ({ page }) => {
    await open(page, link(design));
    await settled(page);
    expect((await info(page)).overLimit).toEqual({ limit, bare: true });
    await expect(note(page)).toBeVisible();
    await expect(page.locator("#limitText")).toContainText(`Over ${limit.toLocaleString("en-US")} pieces`);
    // (the link as it was: the same cuts, the editor's empty sets aside)
    const cuts = (d) => d.cuts.filter((c) => c.depths.length).map((c) => ({ on: c.on, depths: c.depths }));
    expect(cuts(await linked(page))).toEqual(cuts(design));
    await page.click("#limitBuild");
    await expect.poll(async () => (await info(page)).pieces, { timeout: 60_000 }).toBeGreaterThan(limit);
    await expect(note(page)).toBeHidden();
  });
}

test("the notice sits in the bar under the puzzle, on a phone too", async ({ page }) => {
  for (const vp of [{ width: 1100, height: 760 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(vp);
    await open(page, link(dodeca(0.8)));
    await settled(page);
    const box = await note(page).boundingBox(), tape = await page.locator("#nx-tape").boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(tape.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  }
});
