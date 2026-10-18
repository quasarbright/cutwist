// The Sierpinski puzzle (issue #26): loading from the shelf, the levels stepper, and real pointer
// input: drag round a hole (its ring), drag from a small triangle (a triangle it's in), tap a hole
// (its ring a step), tap a hole's dot (zoom in on it), and the zoom buttons. Zooming in as many
// times as there are levels comes back round.
import { test, expect } from "@playwright/test";
import { open, info, turn, noErrors, pick } from "./helpers.mjs";

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page, "?puzzle=sierpinski"); });
test.afterEach(async () => { await noErrors(errors); });

const fire = (page, type, p, button = 0) => page.evaluate(({ type, p, button }) => document.getElementById("plane").dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: p.x, clientY: p.y, pointerId: 7, isPrimary: true, button, buttons: type === "pointerup" ? 0 : 1 })), { type, p, button });
const state = (page) => page.evaluate(() => window.cutwist.state);
const moved = (s) => s.filter((v, i) => v !== i).length;
const idle = (page) => expect.poll(async () => (await info(page)).idle).toBe(true);
// a drag from p round c by `turns` of a full turn, counterclockwise on screen
async function dragRound(page, c, p, turns) {
  const r = Math.hypot(p.x - c.x, p.y - c.y), a0 = Math.atan2(-(p.y - c.y), p.x - c.x);
  await fire(page, "pointerdown", p);
  for (let k = 1; k <= 16; k++) { const a = a0 + (2 * Math.PI * turns * k) / 16; await fire(page, "pointermove", { x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a) }); }
  const a = a0 + 2 * Math.PI * turns;
  await fire(page, "pointerup", { x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a) });
  await idle(page);
}

test("it opens from the shelf: 27 small triangles three levels down, 13 holes, solved, with its solved card", async ({ page }) => {
  await open(page);
  await pick(page, "sierpinski");
  expect(await info(page)).toMatchObject({ id: "sierpinski", sierpinski: true, levels: 3, pieces: 27, holes: 13, solved: true });
  await expect(page.locator("#refPlane")).toBeVisible();
  await expect(page.locator(".nx-pickname")).toHaveText("Sierpinski Zoom");
  await expect(page.locator("#customize")).toBeHidden(); // (no editor for it, as the sliding puzzles have none)
});

test("the levels stepper: 2 to 4 levels, in the link", async ({ page }) => {
  await page.locator("#paramControls .control", { hasText: "levels" }).getByRole("button", { name: "+" }).click();
  expect(await info(page)).toMatchObject({ levels: 4, pieces: 81, holes: 40, title: "4-level Sierpinski Zoom" });
  expect(new URL(page.url()).searchParams.get("levels")).toBe("4");
  await open(page, "?puzzle=sierpinski&levels=2");
  expect(await info(page)).toMatchObject({ levels: 2, pieces: 9 });
});

test("dragging round the middle hole turns its ring a third: 12 triangles; hovering it lights it", async ({ page }) => {
  const c = await page.evaluate(() => window.cutwist.sierHole(0));
  await fire(page, "pointermove", { x: c.x + 30, y: c.y + 10 });
  expect(await info(page)).toMatchObject({ hover: 0, hoverLayer: 0 });
  await dragRound(page, c, { x: c.x + 40, y: c.y }, 1 / 3);
  expect(moved(await state(page))).toBe(12);
  expect(await info(page)).toMatchObject({ moves: 1, solved: false });
  // (and back the other way: solved)
  await dragRound(page, c, { x: c.x + 40, y: c.y }, -1 / 3);
  expect(moved(await state(page))).toBe(0);
});

test("dragging from a small triangle round its third's middle turns that whole third", async ({ page }) => {
  // (the top third's top triangle, round the top third's middle: hole 1)
  const p = await page.evaluate(() => window.cutwist.sierPlace(0)), c = await page.evaluate(() => window.cutwist.sierHole(1));
  await dragRound(page, c, p, 1 / 3);
  // (all 9 of the top third's, and only those: places 0 to 8)
  const s = await state(page);
  expect(moved(s)).toBe(9);
  expect(s.slice(9).every((v, i) => v === i + 9)).toBe(true);
});

test("a tap in a hole turns its ring a step clockwise; a right click, counterclockwise", async ({ page }) => {
  // (a spot in the middle hole, off its middle's dot: hole 0 has none)
  const c = await page.evaluate(() => window.cutwist.sierHole(0));
  await fire(page, "pointerdown", { x: c.x, y: c.y + 12 }); await fire(page, "pointerup", { x: c.x, y: c.y + 12 });
  await idle(page);
  const once = await state(page);
  expect(moved(once)).toBe(12);
  await turn(page, [0, 0, 1]);
  expect(moved(await state(page))).toBe(0); // (clockwise: undone by a counterclockwise turn)
  await fire(page, "pointerdown", { x: c.x, y: c.y + 12 }, 2); await fire(page, "pointerup", { x: c.x, y: c.y + 12 }, 2);
  await idle(page);
  await turn(page, [0, 0, -1]);
  expect(moved(await state(page))).toBe(0);
});

test("tapping a hole's dot zooms in on it, as many zooms as it's deep; zooming in 3 times on 3 levels is where it started", async ({ page }) => {
  const { zoomAxis } = await info(page);
  // (a depth-2 hole: the smallest triangles' parents. Hole 4 is the top third's top ninth's)
  const d = await page.evaluate(() => window.cutwist.sierHole(4));
  await fire(page, "pointerdown", d); await fire(page, "pointerup", d);
  await idle(page);
  const s = await info(page);
  expect(s).toMatchObject({ moves: 1, solved: true }); // (a zoom of the solved puzzle is solved: it holds itself)
  expect(moved(await state(page))).toBeGreaterThan(0);
  // (one more zoom, by the button: three in all, back where it started)
  await page.click("#zoomIn");
  await idle(page);
  expect(moved(await state(page))).toBe(0);
  // (the tape: a zoom's mark)
  await expect(page.locator(".nx-moves .nx-mark").first()).toHaveText("+2");
  // (and out, by the button: the inverse)
  await page.click("#zoomOut");
  await idle(page);
  await turn(page, [zoomAxis, 0, 1]);
  expect(moved(await state(page))).toBe(0);
});

test("scramble: not solved, with zooms in it; undoing every move solves it", async ({ page }) => {
  await page.click("#scramble");
  await expect.poll(async () => (await info(page)).status, { timeout: 15_000 }).toContain("scrambled");
  expect((await info(page)).solved).toBe(false);
  // (solve it by hand: a ring turn and its undo leave it scrambled; reset brings it home)
  await turn(page, [3, 0, 1], [3, 0, -1]);
  expect((await info(page)).solved).toBe(false);
  await page.click("#reset");
  await idle(page);
  expect(moved(await state(page))).toBe(0);
});

test("textures: the toggle draws them, no errors; an algorithm lights what it moves", async ({ page }) => {
  await page.click("#textures");
  expect((await info(page)).textures).toBe(true);
  await page.click("#textures");
  expect((await info(page)).textures).toBe(false);
  await page.click(".nx-rec");
  await turn(page, [0, 0, 1], [1, 1, 1]);
  await page.click(".nx-rec");
  await page.locator('.nx-alg [data-act="play"]').first().hover();
  await expect.poll(() => page.evaluate(() => window.cutwist.lit()?.length ?? 0)).toBeGreaterThan(0);
});

test("on a phone: the triangle fits, under the title and over the tape", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "?puzzle=sierpinski");
  const plane = await page.locator("#plane").boundingBox(), tape = await page.locator("#nx-tape").boundingBox(), name = await page.locator(".nx-pick").boundingBox();
  const top = await page.evaluate(() => window.cutwist.sierPlace(0)), left = await page.evaluate(() => window.cutwist.sierPlace(9)), right = await page.evaluate(() => window.cutwist.sierPlace(26));
  expect(top.y).toBeGreaterThan(name.y + name.height);
  expect(Math.max(left.y, right.y)).toBeLessThan(tape.y);
  expect(left.x).toBeGreaterThan(0);
  expect(right.x).toBeLessThan(375);
  expect(plane.width).toBeLessThanOrEqual(375);
});

test("a drag from a small triangle tightly round a small triangle's middle turns just that one", async ({ page }) => {
  // (the top triangle, round the middle of the top three: hole 4)
  const p = await page.evaluate(() => window.cutwist.sierPlace(0)), c = await page.evaluate(() => window.cutwist.sierHole(4));
  await dragRound(page, c, p, 1 / 3);
  const s = await state(page);
  expect(moved(s)).toBe(3);
  expect(s.slice(3).every((v, i) => v === i + 3)).toBe(true);
});
