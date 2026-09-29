// The solve timer, on a fake clock: time only moves when the test says so. (fastForward
// jumps the clock; runFor would draw every frame along the way.)
import { test, expect } from "@playwright/test";
import { open, info, turn, finish } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await open(page);
});

// scramble with known moves, so the test can solve it
const scramble = (page) => page.evaluate(() => {
  const moves = window.cutwist.scramble([{ axis: 0, layer: 2, q: 1 }, { axis: 1, layer: 2, q: 1 }, { axis: 2, layer: 0, q: 1 }]);
  window.cutwist.finish();
  return moves;
});
const solve = (page, moves) => page.evaluate((moves) => {
  for (const m of window.cutwist.invert(moves)) window.cutwist.turn(m.axis, m.layer, m.q);
  window.cutwist.finish();
}, moves);

test("hidden until a scramble; armed at 0.00 until the first turn", async ({ page }) => {
  await expect(page.locator("#clock")).toBeHidden();
  await scramble(page);
  await expect(page.locator("#clock")).toBeVisible();
  await expect(page.locator("#timer")).toHaveText("0.00");
  await expect(page.locator("#pause")).toBeHidden();
  await page.clock.fastForward(5000);
  expect((await info(page)).timer).toMatchObject({ state: "armed", ms: 0 });
});

test("runs from the first turn and stops on the solve", async ({ page }) => {
  const moves = await scramble(page);
  await turn(page, [0, 0, 1], [0, 0, -1]); // two turns that cancel
  expect((await info(page)).timer.state).toBe("running");
  await page.clock.fastForward(12340);
  await solve(page, moves);
  const t = (await info(page)).timer;
  expect(t.state).toBe("done");
  expect(t.ms).toBeGreaterThanOrEqual(12340);
  expect(t.ms).toBeLessThan(12600);
  await expect(page.locator("#clock")).toHaveClass(/is-done/);
  await expect(page.locator("#pause")).toBeHidden();
  await page.clock.fastForward(5000);
  expect((await info(page)).timer.ms).toBe(t.ms); // frozen
});

test("pause stops the clock, and the next turn resumes it", async ({ page }) => {
  await scramble(page);
  await turn(page, [0, 0, 1]);
  await page.clock.fastForward(2000);
  await expect(page.locator("#pause")).toHaveText("❚❚");
  await page.click("#pause");
  await expect(page.locator("#pause")).toHaveText("▶");
  await expect(page.locator("#clock")).toHaveClass(/is-paused/);
  const paused = (await info(page)).timer.ms;
  await page.clock.fastForward(30000);
  expect((await info(page)).timer.ms).toBe(paused);
  await turn(page, [0, 0, -1]);
  expect((await info(page)).timer.state).toBe("running");
  await page.clock.fastForward(1000);
  expect((await info(page)).timer.ms).toBeGreaterThanOrEqual(paused + 1000);
});

test("play resumes a paused timer too", async ({ page }) => {
  await scramble(page);
  await turn(page, [0, 0, 1]);
  await page.click("#pause");
  await page.click("#pause");
  expect((await info(page)).timer.state).toBe("running");
});

test("reset to the scramble re-arms it; reset to solved hides it", async ({ page }) => {
  await scramble(page);
  await turn(page, [0, 0, 1]);
  await page.clock.fastForward(3000);
  await page.click("#reset");
  expect((await info(page)).timer).toMatchObject({ state: "armed", ms: 0 });
  await page.click("#reset");
  await expect(page.locator("#clock")).toBeHidden();
});

test("the display shows minutes past 60 s", async ({ page }) => {
  await scramble(page);
  await turn(page, [0, 0, 1]);
  await page.clock.fastForward(62345);
  await expect(page.locator("#timer")).toHaveText(/^1:02\.3\d$/);
});
