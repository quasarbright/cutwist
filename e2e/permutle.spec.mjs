// Permutle (permutle.mjs): the sliding torus of letters, through the shelf, its buttons, its link
// and a real drag.
import { test, expect } from "@playwright/test";
import { open, info, turn, finish, noErrors, pick } from "./helpers.mjs";

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page); });
test.afterEach(async () => { await noErrors(errors); });

const row = (page, label) => page.locator("#paramControls .control").filter({ has: page.locator(".name", { hasText: new RegExp(`^${label}$`) }) });

test("it opens from the shelf already dealt: no row a word, flat only, no solved card", async ({ page }) => {
  await pick(page, "permutle");
  const s = await info(page);
  expect(s).toMatchObject({ permutle: true, title: "5-word Permutle", width: 5, height: 5, pieces: 25, solved: false, scrambled: true, moves: 0, surface3D: false });
  expect(s.words).toHaveLength(5);
  expect(s.wordRows).toEqual([false, false, false, false, false]);
  expect(s.rows.join("").split("").sort()).toEqual(s.words.join("").toUpperCase().split("").sort()); // (the same letters)
  await expect(page.locator("#plane")).toBeVisible();
  await expect(page.locator("#reference")).toBeHidden();
  await expect(page.locator(".nx-viewbtn")).toBeHidden();
  await expect(page.locator("#scramble")).toHaveText("new puzzle");
  await expect(page.locator(".nx-empty")).toHaveText("make every row a word · drag a row or column"); // (the empty tape)
});

test("a row goes green when it's a word, and every row a word is solved", async ({ page }) => {
  await page.goto("/index.html?puzzle=permutle&words=0cq1dl0ix18w1f2"); // CRANE SLIDE EVERY ROUND SOLVE
  await page.waitForFunction(() => !!window.cutwist);
  expect((await info(page)).words).toEqual(["crane", "slide", "every", "round", "solve"]);
  await page.evaluate(() => window.cutwist.deal([{ axis: 0, layer: 2, q: 1 }, { axis: 1, layer: 0, q: 2 }]));
  // (EVERY one right, then the first column two down; SOUND happens to be a word too)
  expect(await info(page)).toMatchObject({ rows: ["RRANE", "SLIDE", "CEVER", "SOUND", "YOLVE"], wordRows: [false, true, false, true, false], solved: false });
  await turn(page, [1, 0, -2]);
  expect((await info(page)).wordRows).toEqual([true, true, false, true, true]);
  await turn(page, [0, 2, -1]);
  const s = await info(page);
  expect(s.solved).toBe(true);
  await expect(page.locator("#tapeStatus")).toHaveText("solved · 2 moves");
  // (reset goes back to the deal, never to the words)
  await page.click("#reset");
  expect((await info(page)).solved).toBe(false);
  await page.click("#reset");
  expect((await info(page)).solved).toBe(false);
});

test("new puzzle: new words, dealt; the link carries them, coded", async ({ page }) => {
  await pick(page, "permutle");
  const before = await info(page);
  await page.click("#scramble");
  const after = await info(page);
  expect(after.words).not.toEqual(before.words);
  expect(after.solved).toBe(false);
  const url = new URL(page.url());
  const code = url.searchParams.get("words");
  expect(code).toMatch(/^[0-9a-z]{15}$/);
  for (const w of after.words) expect(page.url()).not.toContain(w);
  await page.goto(`/index.html${url.search}`);
  await page.waitForFunction(() => !!window.cutwist);
  expect((await info(page)).words).toEqual(after.words);
});

test("the words stepper sets how many rows, with new words for them", async ({ page }) => {
  await pick(page, "permutle");
  await row(page, "words").getByRole("button", { name: "+" }).click();
  const s = await info(page);
  expect(s).toMatchObject({ title: "6-word Permutle", height: 6, pieces: 30, solved: false });
  expect(s.words).toHaveLength(6);
  // (a bad code in a link: new words instead)
  await page.goto("/index.html?puzzle=permutle&height=3&words=zzzzzz");
  await page.waitForFunction(() => !!window.cutwist);
  expect((await info(page)).words).toHaveLength(3);
});

test("dragging a cell slides its column", async ({ page }) => {
  await pick(page, "permutle");
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
