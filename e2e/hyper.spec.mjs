// The hyperbolic tile puzzles (M N-gons at a corner, wrapped onto a closed surface, drawn in the
// Poincaré disk): loading from the shelf, the sides / at-a-corner / size controls, turns through
// the test hook, and real pointer input on the disk (tap a tile's middle, drag a circle, slide).
import { test, expect } from "@playwright/test";
import { open, info, turn, noErrors, pick } from "./helpers.mjs";

// (each test builds a surface or several, which takes a few times longer under the full parallel run)
test.describe.configure({ timeout: 60_000 });

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
  // (a spot inside the middle tile's circle, off every line and off the tile's middle: where the
  // pointer shows it'll slide)
  let from = null;
  for (const r of [0.3, 0.35, 0.4, 0.45, 0.5, 0.25]) {
    const p = await page.evaluate((r) => window.cutwist.hyperCircle(0, 1, 0, r), r);
    await page.mouse.move(p.x, p.y);
    if ((await page.evaluate(() => document.getElementById("plane").style.cursor)) === "move") { from = p; break; }
  }
  expect(from).not.toBeNull();
  await fire(page, "pointerdown", from);
  for (let i = 1; i <= 8; i++) await fire(page, "pointermove", { x: from.x + 8 * i, y: from.y });
  await fire(page, "pointerup", { x: from.x + 64, y: from.y });
  const s = await info(page);
  expect(s).toMatchObject({ panned: true, moves: 0, solved: true });
});

test("customize: the circles' rulers (no solid, no truncation), a corner circle, a share link back, blacking out", async ({ page }) => {
  // (on the 6 octagons: a corner circle on the Klein quartic makes 668 pieces, slow to build and
  // reload under a loaded run)
  await pick(page, "hyper-octagons");
  await settled(page);
  await page.click("#customize");
  let s = await settled(page);
  expect(s).toMatchObject({ id: "custom", hyper: true, pieces: 46 });
  await expect(page.locator("#bSolid")).toBeHidden();
  await expect(page.locator("#bTrim")).toBeHidden();
  await expect(page.locator("#bStats")).toContainText("46 pieces");
  // (+ cut on the corners' ruler: more pieces, and the corners turn in thirds)
  await page.locator("#bSets button", { hasText: "+ cut" }).nth(1).click();
  s = await settled(page);
  expect(s.pieces).toBeGreaterThan(46);
  expect(s.axes.some((a) => a.kind === "vertex" && a.order === 3)).toBe(true);
  // (the share link opens the same design)
  const link = await page.evaluate(() => window.cutwist.shareLink());
  const pieces = s.pieces;
  // (the page's routes and listeners are already set up: just go there)
  await page.goto(`/index.html${new URL(link).search}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.cutwist);
  s = await settled(page);
  expect(s).toMatchObject({ id: "custom", hyper: true, pieces });
  // (blacking out: a click on a piece blacks out its kind; the puzzle's still solved)
  await page.click("#bPaint");
  const mid = await page.evaluate(() => window.cutwist.hyperMiddle(0));
  await page.mouse.click(mid.x, mid.y);
  s = await info(page);
  expect(s.solved).toBe(true);
  expect(await page.evaluate(() => JSON.parse(atob(new URLSearchParams(location.search).get("design").replace(/-/g, "+").replace(/_/g, "/"))).blackout.length)).toBe(1);
});

test("nudging a cut redraws it, even when the pieces count stays the same", async ({ page }) => {
  await pick(page, "hyper-klein");
  await settled(page);
  await page.click("#customize");
  await settled(page);
  await page.mouse.move(5, 5);
  // (the disk's picture, a frame or two after a change)
  const picture = async () => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.evaluate(() => document.getElementById("plane").toDataURL());
  };
  await page.locator(".tw-handle").first().focus();
  const before = await picture(), n = (await info(page)).pieces;
  await page.keyboard.press("ArrowRight");
  expect((await info(page)).pieces).toBe(n);
  expect(await picture()).not.toBe(before);
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
