// The piece limits (budget.mjs): a design past its kind's limit isn't built till you say so. The
// notice says so, in the bar under the puzzle; editing goes on meanwhile (back under the limit, it
// builds), the design stays in the link, and the notice's undo goes back to the last design under
// the limit. (On small puzzles: the page takes smaller limits from the test, LIMITS, so nothing big
// has to be built or drawn.)
import { test, expect } from "@playwright/test";
import { open, info, noErrors, dragCut, rulers } from "./helpers.mjs";

const LIMITS = { solid: 50, sphere: 30, tiles: 40, hyper: 48 };
let errors;
test.beforeEach(async ({ page }) => {
  await page.addInitScript((limits) => { window.cutwistLimits = limits; }, LIMITS);
  errors = await open(page, "?rear=off");
});
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
// (a cube cut round its faces and corners: 35 pieces (the corner cut at 0.9: at 0.97 it ran by the corner's dot, and a press there took the dot), and 59 with it at 0.8, past the
// test's 50 for a solid)
const cube = (v) => ({ solid: "cube", truncate: {}, cuts: [{ on: "face", depths: [0.5] }, { on: "vertex", depths: [v] }], blackout: [] });
const VERTEX = 3, FACE = 2; // (the rulers: cuts round corners, round faces)

test("a cut dragged past the limit keeps the last puzzle up, the design in the link; dragged back, it builds", async ({ page }) => {
  await customize(page, cube(0.9));
  expect((await info(page)).pieces).toBe(35);
  await expect(note(page)).toBeHidden();
  await dragCut(page, VERTEX, 0, 0.8);
  const over = await info(page);
  expect(over.overLimit).toEqual({ limit: 50, bare: false });
  // (the last one under the limit, still up: the drag's last step that was)
  expect(over.pieces).toBeGreaterThanOrEqual(35);
  expect(over.pieces).toBeLessThanOrEqual(LIMITS.solid);
  await expect(note(page)).toBeVisible();
  await expect(page.locator("#limitText")).toContainText("Over 50 pieces");
  await expect(page.locator("#limitUndo")).toBeVisible();
  const v = (await rulers(page))[VERTEX].values[0];
  expect(v).toBeLessThan(0.85);
  expect((await linked(page)).cuts.find((c) => c.on === "vertex").depths[0]).toBeCloseTo(v, 6);
  // (and back under: built, the notice gone)
  await dragCut(page, VERTEX, 0, 0.9);
  const back = await info(page);
  expect(back.overLimit).toBeNull();
  expect(back.pieces).toBe(35);
  await expect(note(page)).toBeHidden();
});

test("the notice's undo goes back to the last design under the limit, through every edit since, each one redoable", async ({ page }) => {
  await customize(page, cube(0.9));
  const start = await page.evaluate(() => window.cutwist.design());
  await dragCut(page, VERTEX, 0, 0.8);
  expect((await info(page)).overLimit).not.toBeNull();
  // (editing goes on while it's up)
  await dragCut(page, FACE, 0, 0.6);
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
  await customize(page, cube(0.8));
  // (opened past the limit: nothing to undo to, and the shape uncut standing in)
  expect((await info(page)).overLimit).toEqual({ limit: 50, bare: true });
  expect((await info(page)).pieces).toBe(1);
  await expect(page.locator("#limitUndo")).toBeHidden();
  await expect(page.locator("#limitText")).toContainText("uncut");
  await page.click("#limitBuild");
  await expect.poll(async () => (await info(page)).pieces).toBe(59);
  expect((await info(page)).overLimit).toBeNull();
  await expect(note(page)).toBeHidden();
  // (still past it, edits build)
  await dragCut(page, VERTEX, 0, 0.6);
  expect((await info(page)).overLimit).toBeNull();
  expect((await info(page)).pieces).toBe(95);
  // (under, then past it again: the notice)
  await dragCut(page, VERTEX, 0, 0.9);
  expect((await info(page)).pieces).toBe(35);
  await dragCut(page, VERTEX, 0, 0.8);
  expect((await info(page)).overLimit).not.toBeNull();
  await expect(note(page)).toBeVisible();
});

// (opened past the limit, the shape uncut stands in, and editing on it works: a cut dragged
// back under builds)
for (const [name, design, r, i, v] of [
  ["solid", cube(0.8), VERTEX, 0, 0.9],
  // (45 pieces, over the test's 30 for a ball; one face circle fewer, 15)
  ["ball", { rule: "hyper", N: 4, M: 3, surface: 0, truncate: {}, cuts: [{ on: "face", depths: [0.4, 0.7] }, { on: "vertex", depths: [0.3] }], blackout: [] }, 2, 1, null],
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
  ["solid", cube(0.8), LIMITS.solid], // (59 pieces)
  ["ball", { rule: "hyper", N: 4, M: 3, surface: 0, truncate: {}, cuts: [{ on: "face", depths: [0.4, 0.7] }, { on: "vertex", depths: [0.3] }], blackout: [] }, LIMITS.sphere], // (45)
  ["torus", { rule: "tiles", tiling: "hex", a: 3, b: 0, truncate: {}, cuts: [{ on: "face", depths: [0.6] }], blackout: [] }, LIMITS.tiles], // (54)
  ["hyperbolic surface", { rule: "hyper", N: 8, M: 3, surface: 0, truncate: {}, cuts: [{ on: "face", depths: [0.6, 0.9] }], blackout: [] }, LIMITS.hyper], // (52)
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
    await expect.poll(async () => (await info(page)).pieces).toBeGreaterThan(limit);
    await expect(note(page)).toBeHidden();
  });
}

test("the notice sits in the bar under the puzzle, on a phone too", async ({ page }) => {
  for (const vp of [{ width: 1100, height: 760 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(vp);
    await open(page, link(cube(0.8)));
    await settled(page);
    const box = await note(page).boundingBox(), tape = await page.locator("#nx-tape").boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(tape.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  }
});
