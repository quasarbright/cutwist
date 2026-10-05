// The tile-turning puzzles (hexagons, squares or triangles on a torus): loading, turns through
// the test hook, and real pointer input on the flat view (drag a circle, click a tile's middle).
import { test, expect } from "@playwright/test";
import { open, info, turn, finish, noErrors, pick, openView } from "./helpers.mjs";

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page); });
test.afterEach(async () => { await noErrors(errors); });

const load = (page, tiling = "hex", params) =>
  page.evaluate(({ id, params }) => window.cutwist.load(id, { params }), { id: `tiles-${tiling}`, params });

test("each tiling opens from the shelf, solved, flat and in 3D", async ({ page }) => {
  for (const [tiling, title, kinds] of [
    ["hex", "12 hexagons on a torus", { 1: 12, 2: 36, 3: 24 }],
    ["square", "9 squares on a torus", { 1: 45, 2: 18, 4: 9 }],
    ["triangle", "8 triangles on a torus", { 1: 56, 2: 36, 6: 4 }],
  ]) {
    await pick(page, `tiles-${tiling}`);
    const s = await info(page);
    expect(s).toMatchObject({ title, tiling, solved: true, kinds });
    await expect(page.locator("#plane")).toBeVisible();
    await expect(page.locator("#c")).toBeVisible();
  }
  await expect(page.locator(".nx-empty")).toHaveText("drag a circle · tap a tile's middle");
});

test("size and skew: a² + ab + b² tiles; too small for a circle to fit grows", async ({ page }) => {
  await load(page, "hex", { a: 2, b: 1 });
  expect((await info(page)).tiles).toBe(7);
  await load(page, "square", { a: 1, b: 0 });
  const s = await info(page);
  expect(s).toMatchObject({ a: 2, b: 0, tiles: 4 });
  expect(new URL(page.url()).searchParams.get("a")).toBe("2");
});

test("a turn and its reverse; six sixths of a hexagon's turn is no change", async ({ page }) => {
  await load(page);
  await turn(page, [3, 0, 1]);
  expect((await info(page)).solved).toBe(false);
  await turn(page, [3, 0, -1]);
  expect((await info(page)).solved).toBe(true);
  await turn(page, [5, 0, 2], [5, 0, 4]);
  expect((await info(page)).solved).toBe(true);
});

test("dragging a circle turns it: it follows the pointer and snaps to whole steps", async ({ page }) => {
  await load(page);
  const m = await page.evaluate(() => window.cutwist.tileMiddle(4));
  const a = await page.evaluate(() => window.cutwist.tileCircle(4, -0.3));
  await page.mouse.move(a.x, a.y);
  expect((await info(page)).hover).toBe(4); // (the circle lights up)
  const R = Math.hypot(a.x - m.x, a.y - m.y), a0 = Math.atan2(a.y - m.y, a.x - m.x);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) { const th = a0 + (k * 1.15) / 12; await page.mouse.move(m.x + R * Math.cos(th), m.y + R * Math.sin(th)); }
  await page.mouse.up();
  await finish(page);
  const s = await info(page);
  expect(s.moves).toBe(1);
  expect(s.solved).toBe(false);
  await expect(page.locator(".nx-step .nx-mark")).toHaveCount(1);
  await expect(page.locator(".nx-step .nx-mark sup")).toHaveCount(0); // (one step clockwise: no ′ or count)
  await page.click("#undo"); await finish(page);
  expect((await info(page)).solved).toBe(true);
});

test("a drag stays with the circle pressed, even out by one of its copies", async ({ page }) => {
  await load(page, "hex", { a: 3, b: 0 });
  const m = await page.evaluate(() => window.cutwist.tileMiddle(0)), a = await page.evaluate(() => window.cutwist.tileCircle(0, 0));
  const R = Math.hypot(a.x - m.x, a.y - m.y), far = 4.5 * R; // (the step between copies: 3 tiles, the circle's radius 2/3 of one)
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  // out to the right, past where the next copy's middle is, then round a sixth and a bit
  for (let k = 1; k <= 10; k++) await page.mouse.move(m.x + R + ((far - R) * k) / 10, m.y);
  for (let k = 1; k <= 10; k++) { const th = (k * 1.2) / 10; await page.mouse.move(m.x + far * Math.cos(th), m.y + far * Math.sin(th)); }
  await page.mouse.up();
  await finish(page);
  const after = await page.evaluate(() => window.cutwist.state);
  await page.click("#undo"); await finish(page);
  await turn(page, [0, 0, 1]);
  expect(await page.evaluate(() => window.cutwist.state)).toEqual(after); // (one step clockwise, of tile 0's circle)
});

test("clicking a tile's middle turns it clockwise; a right click, counterclockwise", async ({ page }) => {
  await load(page, "square");
  const m = await page.evaluate(() => window.cutwist.tileMiddle(0));
  await page.mouse.click(m.x, m.y); await finish(page);
  expect((await info(page)).moves).toBe(1);
  await page.mouse.click(m.x, m.y, { button: "right" }); await finish(page);
  const s = await info(page);
  expect(s.moves).toBe(2);
  expect(s.solved).toBe(true);
  await expect(page.locator(".nx-step").last().locator("sup")).toHaveText("′");
});

test("scramble, then undoing it by hand, solves it", async ({ page }) => {
  for (const tiling of ["hex", "triangle"]) {
    await load(page, tiling, { a: 2, b: 1 });
    const moves = await page.evaluate(() => { const m = window.cutwist.scramble(); window.cutwist.finish(); return m; });
    expect((await info(page)).solved).toBe(false);
    await page.evaluate((moves) => { for (const m of window.cutwist.invert(moves)) window.cutwist.turn(m.axis, m.layer, m.q); window.cutwist.finish(); }, moves);
    expect((await info(page)).solved).toBe(true);
  }
});

test("the views: flat only, 3D only, both; the rear view stays off while the flat view shows", async ({ page }) => {
  await load(page);
  await expect(page.locator("#rear")).toBeDisabled();
  await openView(page);
  await page.uncheck("#viewFlat");
  await expect(page.locator("#plane")).toBeHidden();
  await expect(page.locator("#rear")).toBeEnabled();
  expect(new URL(page.url()).searchParams.get("flat")).toBe("off");
  await page.check("#viewFlat");
  await page.uncheck("#view3D");
  await expect(page.locator("#c")).toBeHidden();
  await expect(page.locator("#refPlane")).toBeVisible(); // (the solved card goes flat)
});

test("textures: off up to 12 tiles, on from 13; the button toggles them and goes in the URL", async ({ page }) => {
  await load(page);
  await expect(page.locator("#textures")).toBeVisible();
  expect((await info(page)).textures).toBe(false);
  await page.click("#textures");
  expect((await info(page)).textures).toBe(true);
  expect(new URL(page.url()).searchParams.get("textures")).toBe("on");
  await load(page, "hex", { a: 3, b: 1 }); // (13 tiles)
  expect((await info(page)).textures).toBe(true);
});

// ---- customizing: the solids' editor, on a tiling ----
const block = (page, group, name) => page.locator(`#${group} .tw-rblock`).filter({ has: page.locator(".tw-rname", { hasText: new RegExp(`^${name}$`) }) });

test("customize opens the editor on the tiling: tilings for solids, the same rulers, the torus's steppers", async ({ page }) => {
  await load(page, "hex", { a: 3, b: 0 });
  await page.click(".nx-custombtn");
  const s = await info(page);
  expect(s).toMatchObject({ id: "custom", tiling: "hex", pieces: 54 });
  await expect(page.locator("#bSolidLabel")).toHaveText("tiling");
  await expect(page.locator("#bSolid").getByRole("radio", { name: "hexagons" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#bStats")).toContainText("54 pieces");
  await expect(page.locator("#paramControls .control")).toHaveCount(2); // (size and skew)
  // another tiling, then undo
  await page.locator("#bSolid").getByRole("radio", { name: "squares" }).click();
  expect((await info(page)).tiling).toBe("square");
  await page.click("#bUndo");
  expect((await info(page)).tiling).toBe("hex");
});

test("cuts around corners and edges, rings of circles, and truncation", async ({ page }) => {
  await load(page, "hex", { a: 3, b: 0 });
  await page.click(".nx-custombtn");
  await block(page, "bSets", "corners").getByRole("button", { name: "+ cut" }).click();
  let s = await info(page);
  expect(s.axes.filter((a) => a.kind === "vertex").map((a) => a.order)).toEqual(Array(18).fill(3)); // (a hexagon's corners turn in thirds)
  await block(page, "bSets", "faces").getByRole("button", { name: "+ cut" }).click();
  s = await info(page);
  expect(s.axes.find((a) => a.kind === "face").layers).toBe(2); // (two circles around each middle: a disk and a ring)
  await block(page, "bTrim", "edges").getByRole("button", { name: "+ truncate" }).click();
  s = await info(page);
  expect(s.faces).toBe(9 + 27); // (the edges' faces)
  // still a puzzle: scramble, undo the scramble's turns, solved
  const moves = await page.evaluate(() => { const m = window.cutwist.scramble(); window.cutwist.finish(); return m; });
  await page.evaluate((moves) => { for (const m of window.cutwist.invert(moves)) window.cutwist.turn(m.axis, m.layer, m.q); window.cutwist.finish(); }, moves);
  expect((await info(page)).solved).toBe(true);
});

test("black out pieces: a click on a piece blacks out every piece like it", async ({ page }) => {
  await load(page, "hex", { a: 3, b: 0 });
  await page.click(".nx-custombtn");
  await page.click("#bPaint");
  const m = await page.evaluate(() => window.cutwist.tileMiddle(0));
  await page.mouse.click(m.x, m.y); // (a center)
  expect((await info(page)).black).toBe(9);
  await page.click("#bRestore");
  expect((await info(page)).black).toBe(0);
});

test("a tile design's share link opens the same design", async ({ page }) => {
  await load(page, "triangle", { a: 2, b: 0 });
  await page.click(".nx-custombtn");
  await block(page, "bTrim", "corners").getByRole("button", { name: "+ truncate" }).click();
  const before = await info(page), link = await page.evaluate(() => window.cutwist.shareLink());
  const errors2 = await open(page, new URL(link).search);
  const after = await info(page);
  expect(after).toMatchObject({ id: "custom", tiling: "triangle", pieces: before.pieces, faces: before.faces });
  await noErrors(errors2);
});

test("on a phone, a flat puzzle shows just the flat view", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "?puzzle=tiles-hex");
  expect((await info(page)).views).toEqual({ flat: true, surface: false });
  await expect(page.locator("#c")).toBeHidden();
  await open(page, "?puzzle=sliding-torus&3d=on");
  expect((await info(page)).views).toEqual({ flat: true, surface: true });
});

test("algorithms light the pieces they'd move", async ({ page }) => {
  await load(page);
  await page.click(".nx-rec");
  await turn(page, [0, 0, 1], [1, 0, 1], [0, 0, -1], [1, 0, -1]);
  await page.click(".nx-rec");
  await page.locator('.nx-alg[data-name="A"] [data-act="play"]').hover();
  const lit = await page.evaluate(() => window.cutwist.lit());
  expect(lit.length).toBeGreaterThan(0);
  expect(lit.length).toBeLessThan(20); // (a commutator: just the pieces it cycles, of 54)
});
