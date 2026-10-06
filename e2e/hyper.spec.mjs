// The hyperbolic tile puzzles (M N-gons at a corner, wrapped onto a closed surface, drawn in the
// Poincaré disk): loading from the shelf, the sides / at-a-corner / size controls, turns through
// the test hook, and real pointer input on the disk (tap a tile's middle, drag a circle, slide).
import { test, expect } from "@playwright/test";
import { open, info, turn, noErrors, pick } from "./helpers.mjs";

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page); });
test.afterEach(async () => { await noErrors(errors); });

const settled = (page) => page.evaluate(() => window.cutwist.settled());
const fire = (page, type, p) => page.evaluate(({ type, p }) => document.getElementById("plane").dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: p.x, clientY: p.y, pointerId: 7, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 })), { type, p });

test("the Klein quartic opens from the shelf: 24 heptagons, a piece per tile, edge and corner, no 3D view", async ({ page }) => {
  await pick(page, "hyper-klein");
  const s = await settled(page);
  expect(s).toMatchObject({ hyper: true, N: 7, M: 3, tiles: 24, genus: 3, pieces: 164, kinds: { 1: 24, 2: 84, 3: 56 }, solved: true });
  expect(s.sizes.slice(0, 5)).toEqual([24, 72, 156, 156, 156]);
  await expect(page.locator("#plane")).toBeVisible();
  await expect(page.locator("#c")).toBeHidden();
  await expect(page.locator(".nx-empty")).toHaveText("drag a circle · tap a tile's middle · drag elsewhere to slide");
});

test("a link opens it straight away, with its numbers", async ({ page }) => {
  await open(page, "?puzzle=hyper-octagons&N=8&M=3&surface=1");
  const s = await settled(page);
  expect(s).toMatchObject({ N: 8, M: 3, tiles: 12 });
});

test("turns: a heptagon's turn seven times is no change; a scramble undoes", async ({ page }) => {
  await pick(page, "hyper-klein");
  await settled(page);
  await turn(page, [0, 0, 1]);
  expect((await info(page)).solved).toBe(false);
  await turn(page, ...Array(6).fill([0, 0, 1]));
  expect((await info(page)).solved).toBe(true);
  await page.click("text=scramble");
  await page.evaluate(() => window.cutwist.finish());
  expect((await info(page)).solved).toBe(false);
});

test("tapping a tile's middle turns it; dragging a circle turns it by as much as dragged", async ({ page }) => {
  await pick(page, "hyper-klein");
  await settled(page);
  const mid = await page.evaluate(() => window.cutwist.hyperMiddle(0));
  await fire(page, "pointerdown", mid); await fire(page, "pointerup", mid);
  await page.evaluate(() => window.cutwist.finish());
  let s = await info(page);
  expect(s).toMatchObject({ moves: 1, solved: false });
  // (drag a seventh of the way round the next circle and a bit: one step)
  const at = (k) => page.evaluate(({ k }) => window.cutwist.hyperCircle(3, k), { k });
  await fire(page, "pointerdown", await at(0));
  for (let i = 1; i <= 12; i++) await fire(page, "pointermove", await at(((i / 12) * 2 * Math.PI * 1.1) / 7));
  await fire(page, "pointerup", await at((2 * Math.PI * 1.1) / 7));
  await page.evaluate(() => window.cutwist.finish());
  s = await info(page);
  expect(s.moves).toBe(2);
});

test("dragging away from the circles slides the plane, and turns nothing", async ({ page }) => {
  await pick(page, "hyper-klein");
  await settled(page);
  expect((await info(page)).panned).toBe(false);
  // (a spot inside the middle tile's circle, well off its line and off the tile's middle)
  const from = await page.evaluate(() => window.cutwist.hyperCircle(0, 1, 0, 0.35));
  await fire(page, "pointerdown", from);
  for (let i = 1; i <= 8; i++) await fire(page, "pointermove", { x: from.x + 8 * i, y: from.y });
  await fire(page, "pointerup", { x: from.x + 64, y: from.y });
  const s = await info(page);
  expect(s).toMatchObject({ panned: true, moves: 0, solved: true });
});

test("sides and tiles at a corner: the other one follows to a hyperbolic tiling; the size menu lists its surfaces", async ({ page }) => {
  await pick(page, "hyper-klein");
  await settled(page);
  await page.locator("#paramControls .control").nth(0).locator("button").nth(1).click(); // (sides +1: 8)
  let s = await settled(page);
  expect(s).toMatchObject({ N: 8, M: 3, tiles: 6 });
  await page.locator("#paramControls select").selectOption("1");
  s = await settled(page);
  expect(s.tiles).toBe(12);
  // (down to 6 sides: 3 at a corner is flat, so the corners go up to 4)
  await page.locator("#paramControls .control").nth(0).locator("button").nth(0).click();
  await page.locator("#paramControls .control").nth(0).locator("button").nth(0).click();
  s = await settled(page);
  expect(s).toMatchObject({ N: 6, M: 4 });
});
