// Permutle (permutle.mjs): the sliding torus of letters, through the shelf, its buttons, its link
// and a real drag.
import { test, expect } from "@playwright/test";
import { open, info, turn, finish, noErrors, pick } from "./helpers.mjs";

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page); });
test.afterEach(async () => { await noErrors(errors); });

// a start: CRANE SLIDE EVERY ROUND SOLVE with EVERY slid one right, then the first column two down
const DEALT = "RRANESLIDECEVERSOUNDYOLVE";
async function openGrid(page, letters) {
  await page.goto(`/index.html?puzzle=permutle&letters=${letters}`);
  await page.waitForFunction(() => !!window.cutwist);
}

test("it opens from the shelf already dealt: no row a word, flat only, no solved card, no steppers", async ({ page }) => {
  await pick(page, "permutle");
  const s = await info(page);
  expect(s).toMatchObject({ permutle: true, title: "Permutle", width: 5, height: 5, pieces: 25, solved: false, scrambled: true, moves: 0, surface3D: false });
  expect(s.letters).toMatch(/^[A-Z]{25}$/);
  expect(s.rows.join("")).toBe(s.letters);
  expect(s.wordRows).toEqual([false, false, false, false, false]);
  await expect(page.locator("#plane")).toBeVisible();
  await expect(page.locator("#reference")).toBeHidden();
  await expect(page.locator(".nx-viewbtn")).toBeHidden();
  await expect(page.locator("#paramControls .control")).toHaveCount(0);
  await expect(page.locator("#scramble")).toHaveText("new puzzle");
  await expect(page.locator("#shareWords")).toBeHidden();
  await expect(page.locator(".nx-empty")).toHaveText("make every row a word · drag a row or column"); // (the empty tape)
  expect(new URL(page.url()).searchParams.get("letters")).toBe(s.letters);
});

test("a link's letters are the start; rows go green; solved, share gives the colors and that start", async ({ page }) => {
  await openGrid(page, DEALT);
  expect(await info(page)).toMatchObject({ rows: ["RRANE", "SLIDE", "CEVER", "SOUND", "YOLVE"], wordRows: [false, true, false, true, false], solved: false });
  await expect(page.locator("#shareWords")).toBeHidden(); // (till it's solved)
  await turn(page, [1, 0, -2]);
  expect((await info(page)).wordRows).toEqual([true, true, false, true, true]);
  await turn(page, [0, 2, -1]);
  const s = await info(page);
  expect(s.rows).toEqual(["CRANE", "SLIDE", "EVERY", "ROUND", "SOLVE"]);
  expect(s.solved).toBe(true);
  await expect(page.locator("#tapeStatus")).toHaveText("solved · 2 moves");
  await expect(page.locator("#shareWords")).toBeVisible();
  const result = await page.evaluate(() => window.cutwist.wordsResult());
  expect(result).toMatch(new RegExp(`^Permutle\\n(🟩{5}\\n){5}2 moves · [\\d.:]+\\nhttp\\S+/index\\.html\\?puzzle=permutle&letters=${DEALT}$`, "u"));
  // (reset goes back to the start, never anywhere else)
  await page.click("#reset");
  expect((await info(page)).rows.join("")).toBe(DEALT);
  await page.click("#reset");
  expect((await info(page)).rows.join("")).toBe(DEALT);
});

test("new puzzle: new letters, dealt, in the link; the link opens the same start", async ({ page }) => {
  await pick(page, "permutle");
  const before = await info(page);
  await page.click("#scramble");
  const after = await info(page);
  expect(after.letters).not.toBe(before.letters);
  expect(after.solved).toBe(false);
  const url = new URL(page.url());
  expect(url.searchParams.get("letters")).toBe(after.letters);
  await page.goto(`/index.html${url.search}`);
  await page.waitForFunction(() => !!window.cutwist);
  expect((await info(page)).rows.join("")).toBe(after.letters);
  // (not a grid of letters: a new puzzle instead)
  await openGrid(page, "CRANE");
  expect((await info(page)).letters).toMatch(/^[A-Z]{25}$/);
});

test("dragging a cell slides its column", async ({ page }) => {
  await openGrid(page, DEALT);
  const before = (await info(page)).rows;
  const a = await page.evaluate(() => window.cutwist.cellCenter(2, 1));
  const b = await page.evaluate(() => window.cutwist.cellCenter(2, 2));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x + 3, b.y + 2, { steps: 10 });
  await page.mouse.up();
  await finish(page);
  const after = await info(page);
  expect(after.moves).toBe(1);
  expect(after.rows.map((r) => r[2])).toEqual([4, 0, 1, 2, 3].map((y) => before[y][2]));
});
