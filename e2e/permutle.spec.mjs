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

const sizeRow = (page) => page.locator("#paramControls .control").filter({ has: page.locator(".name", { hasText: /^size$/ }) });

test("it opens from the shelf already dealt, 3×3: no row a word, flat only, no solved card", async ({ page }) => {
  await pick(page, "permutle");
  const s = await info(page);
  expect(s).toMatchObject({ permutle: true, title: "3×3 Permutle", width: 3, height: 3, pieces: 9, solved: false, scrambled: true, moves: 0, surface3D: false });
  expect(s.letters).toMatch(/^[A-Z]{9}$/);
  expect(s.rows.join("")).toBe(s.letters);
  expect(s.wordRows).toEqual([false, false, false]);
  await expect(page.locator("#plane")).toBeVisible();
  await expect(page.locator("#reference")).toBeHidden();
  await expect(page.locator(".nx-viewbtn")).toBeHidden();
  await expect(page.locator("#paramControls .control")).toHaveCount(1); // (just its size)
  await expect(page.locator("#scramble")).toHaveText("new puzzle");
  await expect(page.locator("#shareWords")).toBeVisible(); // (from the start)
  await expect(page.locator(".nx-empty")).toHaveText("make every row a word · drag a row or column"); // (the empty tape)
  expect(new URL(page.url()).searchParams.get("letters")).toBe(s.letters);
  // (no share on the other puzzles)
  await pick(page, "sliding-torus");
  await expect(page.locator("#shareWords")).toBeHidden();
});

test("a link's letters are the start; rows go green; solved, share gives the colors and that start", async ({ page }) => {
  await openGrid(page, DEALT);
  expect(await info(page)).toMatchObject({ rows: ["RRANE", "SLIDE", "CEVER", "SOUND", "YOLVE"], wordRows: [false, true, false, true, false], solved: false });
  // (before it's solved, the gray rows too)
  expect(await page.evaluate(() => window.cutwist.wordsResult())).toMatch(/^Permutle 5×5\n⬛{5}\n🟩{5}\n⬛{5}\n🟩{5}\n⬛{5}\n0 moves/u);
  await turn(page, [1, 0, -2]);
  expect((await info(page)).wordRows).toEqual([true, true, false, true, true]);
  await turn(page, [0, 2, -1]);
  const s = await info(page);
  expect(s.rows).toEqual(["CRANE", "SLIDE", "EVERY", "ROUND", "SOLVE"]);
  expect(s.solved).toBe(true);
  await expect(page.locator("#tapeStatus")).toHaveText("solved · 2 moves");
  await expect(page.locator("#shareWords")).toBeVisible();
  const result = await page.evaluate(() => window.cutwist.wordsResult());
  expect(result).toMatch(new RegExp(`^Permutle 5×5\\n(🟩{5}\\n){5}2 moves · [\\d.:]+\\nhttp\\S+/index\\.html\\?puzzle=permutle&letters=${DEALT}$`, "u"));
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
  expect((await info(page)).letters).toMatch(/^[A-Z]{9}$/); // (3×3, the default)
});

test("the size stepper: 3 to 5, new letters for each; a link's letters set the size", async ({ page }) => {
  await pick(page, "permutle");
  const up = sizeRow(page).getByRole("button", { name: "+" }), down = sizeRow(page).getByRole("button", { name: "−" });
  await up.click();
  let s = await info(page);
  expect(s).toMatchObject({ title: "4×4 Permutle", width: 4, pieces: 16, solved: false });
  expect(s.letters).toMatch(/^[A-Z]{16}$/);
  await up.click();
  expect((await info(page)).width).toBe(5);
  await expect(up).toBeDisabled(); // (5 is the most)
  await down.click(); await down.click();
  expect((await info(page)).width).toBe(3);
  await expect(down).toBeDisabled(); // (3 the fewest)
  // (a 16-letter link is 4×4, whatever its n says)
  await openGrid(page, "WORDSLIDTEAMCODE&n=3");
  s = await info(page);
  expect(s).toMatchObject({ width: 4, letters: "WORDSLIDTEAMCODE" });
  await expect(sizeRow(page).locator("input")).toHaveValue("4");
});

test("on a phone: no view button (nothing in it), the share button under the grid", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openGrid(page, DEALT);
  await expect(page.locator("#view")).toBeHidden();
  const grid = await page.locator("#plane").boundingBox(), share = await page.locator("#shareWords").boundingBox();
  const cell = await page.evaluate(() => [window.cutwist.cellCenter(0, 4), window.cutwist.cellCenter(4, 4)]);
  expect(share.y).toBeGreaterThan(cell[0].y);
  expect(share.y + share.height).toBeLessThanOrEqual(grid.y + grid.height);
  expect(Math.abs(share.x + share.width / 2 - (cell[0].x + cell[1].x) / 2)).toBeLessThan(2); // (centered)
  // (a sliding torus still has its view button, with its toggles)
  await page.evaluate(() => window.cutwist.load("sliding-torus"));
  await expect(page.locator("#view")).toBeVisible();
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
