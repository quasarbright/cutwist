// The intersecting circles puzzle (issue #17): families of concentric circles, a sticker
// where any two cross, a turn moves a circle's stickers one crossing along. Flat and on a
// sphere, clicked flat and in 3D.
import { test, expect } from "@playwright/test";
import { open, info, turn, finish, noErrors, pick, openView } from "./helpers.mjs";

// (then two frames, so the layout has settled around the new puzzle's controls)
const load = (page, params) => page.evaluate(async (params) => {
  window.cutwist.load("circles", { params });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}, params);

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page); });
test.afterEach(async () => { await noErrors(errors); });

test("opens from the shelf: 3 families of 2 circles, flat and on a sphere", async ({ page }) => {
  await pick(page, "circles");
  const s = await info(page);
  // each pair of families crosses 2 × 2 × 2 times: 3 pairs, 24 stickers, a color per pair
  expect(s).toMatchObject({ circles: true, title: "3 families of 2 circles", pieces: 24, colors: 3, solved: true });
  await expect(page.locator("#plane")).toBeVisible();
  await expect(page.locator("#c")).toBeVisible(); // the sphere
  await expect(page.locator(".nx-empty")).toHaveText("click a circle to turn it clockwise · right click: counterclockwise");
  await openView(page);
  await expect(page.locator("#planarViews")).toBeVisible();
  await expect(page.locator("#view3DName")).toHaveText("3D sphere");
  await expect(page.locator("#planarControls")).toBeHidden(); // (the grids' look: labels, pictures)
});

test("the families and circles per family steppers, and the link keeps them", async ({ page }) => {
  await pick(page, "circles");
  const row = (label) => page.locator("#paramControls .control").filter({ has: page.locator(".name", { hasText: new RegExp(`^${label}$`) }) });
  await row("families").getByRole("button", { name: "+" }).click();
  await row("circles per family").getByRole("button", { name: "−" }).click();
  const s = await info(page);
  expect(s).toMatchObject({ title: "4 families of 1 circle", pieces: 12, colors: 6 }); // 6 pairs, 2 crossings each
  expect(page.url()).toContain("families=4");
  await page.reload();
  await page.waitForFunction(() => !!window.cutwist);
  expect((await info(page)).title).toBe("4 families of 1 circle");
});

test("a turn and its reverse; a full trip around is the identity", async ({ page }) => {
  await load(page, { families: 3, rings: 1 });
  const start = await page.evaluate(() => window.cutwist.state);
  await turn(page, [0, 0, 1]);
  expect((await info(page)).solved).toBe(false);
  expect(await page.evaluate(() => window.cutwist.state)).not.toEqual(start);
  await turn(page, [0, 0, -1]);
  expect(await page.evaluate(() => window.cutwist.state)).toEqual(start);
  await turn(page, [1, 0, 2], [1, 0, 2]); // a great circle crosses the other two at 4 points
  expect(await page.evaluate(() => window.cutwist.state)).toEqual(start);
  expect((await info(page)).moves).toBe(4);
});

test("clicking a circle in the flat view turns it: left clockwise, right counterclockwise", async ({ page }) => {
  await load(page, { families: 3, rings: 2 });
  await page.evaluate(() => window.cutwist.setView(0, 0, 0));
  const at = await page.evaluate(() => window.cutwist.circlePoint(0, 1, 2.0));
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => page.evaluate(() => window.cutwist.hoverCircle())).not.toBeNull();
  await page.mouse.click(at.x, at.y);
  await finish(page);
  expect(await page.locator("#tapeMoves .nx-mark").allTextContents()).toEqual(["A2↻"]);
  await page.mouse.click(at.x, at.y, { button: "right" });
  await finish(page);
  expect(await page.locator("#tapeMoves .nx-mark").allTextContents()).toEqual(["A2↻", "A2↺"]);
  expect((await info(page)).solved).toBe(true);
});

test("clicking a circle on the sphere turns it, and dragging turns the view instead", async ({ page }) => {
  await load(page, { families: 3, rings: 1 });
  const at = await page.evaluate(() => window.cutwist.sphereCirclePoint(2, 0));
  expect(at).not.toBeNull();
  await page.mouse.click(at.x, at.y);
  await finish(page);
  const s = await info(page);
  expect(s.moves).toBe(1);
  expect(await page.locator("#tapeMoves .nx-mark").count()).toBe(1);
  const view = await page.evaluate(() => window.cutwist.view());
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 60, at.y + 20, { steps: 5 });
  await page.mouse.up();
  expect((await info(page)).moves).toBe(1);
  expect(await page.evaluate(() => window.cutwist.view())).not.toEqual(view);
});

test("on the sphere, left click looks clockwise from either side", async ({ page }) => {
  // the same circle clicked from the front and (turned half way round) from behind: opposite turns
  await load(page, { families: 3, rings: 1 });
  await page.evaluate(() => window.cutwist.setView(0, 0, 0));
  const front = await page.evaluate(() => window.cutwist.sphereCirclePoint(0, 0));
  await page.mouse.click(front.x, front.y);
  await finish(page);
  await page.evaluate(() => window.cutwist.setView(0, Math.PI, 0));
  const back = await page.evaluate(() => window.cutwist.sphereCirclePoint(0, 0));
  await page.mouse.click(back.x, back.y);
  await finish(page);
  const marks = await page.locator("#tapeMoves .nx-mark").allTextContents();
  expect(marks.length).toBe(2);
  expect(marks[0].slice(0, 2)).toBe(marks[1].slice(0, 2));
  expect(marks[0][2]).not.toBe(marks[1][2]);
  expect((await info(page)).solved).toBe(true);
});

test("scramble, then undoing it by hand, solves it", async ({ page }) => {
  await load(page, { families: 4, rings: 2 });
  const moves = await page.evaluate(() => { const m = window.cutwist.scramble(); window.cutwist.finish(); return m; });
  expect((await info(page)).solved).toBe(false);
  await page.evaluate((moves) => { for (const m of window.cutwist.invert(moves)) window.cutwist.turn(m.axis, m.layer, m.q); window.cutwist.finish(); }, moves);
  const s = await info(page);
  expect(s.solved).toBe(true);
  expect(s.timer.state).toBe("done");
});

test("flat only, 3D only, and the rear view with 3D only", async ({ page }) => {
  await load(page, { families: 3, rings: 2 });
  await openView(page);
  await page.locator("#view3D").uncheck();
  await expect(page.locator("#c")).toBeHidden();
  await expect(page.locator("#refPlane")).toBeVisible(); // the solved card, flat
  await page.locator("#view3D").check();
  await page.locator("#viewFlat").uncheck();
  await expect(page.locator("#plane")).toBeHidden();
  await expect(page.locator("#rear")).toBeEnabled();
  expect(page.url()).toContain("flat=off");
  const back = await page.evaluate(() => window.cutwist.sphereCirclePoint(1, 0, "rear"));
  expect(back).not.toBeNull();
});
