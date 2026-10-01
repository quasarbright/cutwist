// Turns (made through the test hook), undo and redo, the status line, scramble and reset.
import { test, expect } from "@playwright/test";
import { open, info, turn, finish } from "./helpers.mjs";

test.beforeEach(async ({ page }) => { await open(page); });

test("a turn unsolves the puzzle and counts as a move; its inverse solves it again", async ({ page }) => {
  await turn(page, [0, 2, 1]);
  let s = await info(page);
  expect(s.solved).toBe(false);
  expect(s.moves).toBe(1);
  expect(s.status).toBe("1 move");
  await turn(page, [0, 2, -1]);
  s = await info(page);
  expect(s.solved).toBe(true);
  expect(s.status).toBe("solved · 2 moves");
  await expect(page.locator("#nx-tape")).toHaveClass(/is-solved/);
});

test("four quarter turns of one face are the identity", async ({ page }) => {
  await turn(page, [1, 0, 1], [1, 0, 1], [1, 0, 1], [1, 0, 1]);
  expect((await info(page)).solved).toBe(true);
});

test("undo and redo buttons step back and forward through the turns", async ({ page }) => {
  await turn(page, [0, 2, 1], [1, 2, 1]);
  const after = await page.evaluate(() => window.cutwist.state);
  await page.click("#undo"); await finish(page);
  await page.click("#undo"); await finish(page);
  let s = await info(page);
  expect(s.solved).toBe(true);
  expect(s.moves).toBe(0);
  expect(s.canRedo).toBe(true);
  await page.click("#undo"); await finish(page); // nothing left: no-op
  expect((await info(page)).moves).toBe(0);
  await page.click("#redo"); await finish(page);
  await page.click("#redo"); await finish(page);
  expect(await page.evaluate(() => window.cutwist.state)).toEqual(after);
  expect((await info(page)).canRedo).toBe(false);
});

test("a new turn after an undo drops the redo", async ({ page }) => {
  await turn(page, [0, 2, 1]);
  await page.click("#undo"); await finish(page);
  await turn(page, [1, 2, 1]);
  expect((await info(page)).canRedo).toBe(false);
});

test("scramble mixes the puzzle up without putting anything in the undo history", async ({ page }) => {
  await page.click("#scramble");
  await finish(page);
  const s = await info(page);
  expect(s.solved).toBe(false);
  expect(s.scrambled).toBe(true);
  expect(s.moves).toBe(0);
  expect(s.canUndo).toBe(false);
  expect(s.status).toBe("scrambled · drag a sticker to turn");
});

test("scramble adds to the puzzle as it is instead of starting from solved", async ({ page }) => {
  await turn(page, [0, 2, 1]);
  const moves = await page.evaluate(() => { const m = window.cutwist.scramble(); window.cutwist.finish(); return m; });
  // undo the scramble by hand: what's left is the one turn from before it
  await page.evaluate((moves) => { for (const m of window.cutwist.invert(moves)) window.cutwist.turn(m.axis, m.layer, m.q); window.cutwist.finish(); }, moves);
  await turn(page, [0, 2, -1]);
  expect((await info(page)).solved).toBe(true);
});

test("reset goes back to the scramble after turning it, then to solved", async ({ page }) => {
  await page.evaluate(() => { window.cutwist.scramble(); window.cutwist.finish(); });
  const scrambled = await page.evaluate(() => window.cutwist.state);
  await turn(page, [0, 2, 1], [1, 0, 1]);
  await page.click("#reset");
  expect(await page.evaluate(() => window.cutwist.state)).toEqual(scrambled);
  expect((await info(page)).moves).toBe(0);
  await page.click("#reset");
  const s = await info(page);
  expect(s.solved).toBe(true);
  expect(s.scrambled).toBe(false);
});

test("switching puzzles starts fresh", async ({ page }) => {
  await turn(page, [0, 2, 1]);
  await page.click("#sizeUp");
  const s = await info(page);
  expect(s.solved).toBe(true);
  expect(s.moves).toBe(0);
  expect(s.canUndo).toBe(false);
});
