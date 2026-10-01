// Recording algorithms and playing them back, through the panel's buttons.
import { test, expect } from "@playwright/test";
import { open, info, turn, finish } from "./helpers.mjs";

const row = (page, name) => page.locator(`.tw-mrow[data-name="${name}"]`);
async function record(page, ...moves) {
  await page.click("#mRecord");
  await turn(page, ...moves);
  await page.click("#mRecord");
}

test.beforeEach(async ({ page }) => { await open(page); });

test("record shows a running count, and stopping saves an algorithm", async ({ page }) => {
  await expect(page.locator("#mList")).toBeEmpty();
  await page.click("#mRecord");
  await expect(page.locator("#mRecord")).toHaveClass(/is-recording/);
  await turn(page, [0, 2, 1], [1, 2, 1]);
  await expect(page.locator("#mRecordLabel")).toHaveText("stop · 2 moves");
  await page.click("#mRecord");
  await expect(page.locator("#mRecord")).not.toHaveClass(/is-recording/);
  await expect(row(page, "A").locator(".tw-mlen")).toHaveText("2 moves");
  expect((await info(page)).algorithms).toEqual([{ name: "A", moves: 2 }]);
});

test("stopping with nothing recorded saves nothing", async ({ page }) => {
  await page.click("#mRecord");
  await page.click("#mRecord");
  await expect(page.locator("#mList .tw-mrow")).toHaveCount(0);
});

test("reverse undoes the algorithm; play repeats it", async ({ page }) => {
  await record(page, [0, 2, 1], [1, 2, 1]);
  const once = await page.evaluate(() => window.cutwist.state);
  await row(page, "A").locator('[data-act="reverse"]').click(); await finish(page);
  expect((await info(page)).solved).toBe(true);
  await row(page, "A").locator('[data-act="play"]').click(); await finish(page);
  expect(await page.evaluate(() => window.cutwist.state)).toEqual(once);
  expect((await info(page)).moves).toBe(6); // 2 recorded + 2 back + 2 again
});

test("a playback is one undo step", async ({ page }) => {
  await record(page, [0, 2, 1], [1, 2, 1], [2, 2, 1]);
  await row(page, "A").locator('[data-act="reverse"]').click(); await finish(page);
  await page.click("#undo"); await finish(page);
  const s = await info(page);
  expect(s.moves).toBe(3);
  expect(s.solved).toBe(false);
});

test("a commutator built from two algorithms", async ({ page }) => {
  // A = R, B = U; then A B A' B' recorded as C, and C six times is the identity on a 3×3
  await record(page, [0, 2, 1]);
  await page.click("#undo"); await finish(page);
  await record(page, [1, 2, 1]);
  await page.click("#undo"); await finish(page);
  await page.click("#mRecord");
  for (const [name, act] of [["A", "play"], ["B", "play"], ["A", "reverse"], ["B", "reverse"]]) {
    await row(page, name).locator(`[data-act="${act}"]`).click(); await finish(page);
  }
  await page.click("#mRecord");
  await expect(row(page, "C").locator(".tw-mlen")).toHaveText("4 moves");
  expect((await info(page)).solved).toBe(false);
  for (let i = 0; i < 5; i++) { await row(page, "C").locator('[data-act="play"]').click(); await finish(page); }
  expect((await info(page)).solved).toBe(true);
});

test("delete removes an algorithm; a new one takes the free letter", async ({ page }) => {
  await record(page, [0, 2, 1]);
  await record(page, [1, 2, 1]);
  await row(page, "A").locator('[data-act="delete"]').click();
  await expect(row(page, "A")).toHaveCount(0);
  await record(page, [2, 2, 1]);
  expect((await info(page)).algorithms.map((a) => a.name)).toEqual(["B", "A"]);
});

test("algorithms are cleared on switching puzzles, recording too", async ({ page }) => {
  await record(page, [0, 2, 1]);
  await page.click("#mRecord");
  await page.click("#sizeUp");
  const s = await info(page);
  expect(s.algorithms).toEqual([]);
  expect(s.recording).toBe(false);
});

// ---- hovering play or reverse lights what it would change ----
const lit = (page) => page.evaluate(() => window.cutwist.lit());
const changed = (a, b) => a.flatMap((v, i) => (v !== b[i] ? [i] : []));

test("hovering play lights exactly the pieces it changes; leaving clears it", async ({ page }) => {
  // a commutator (R U R' U'): it moves many pieces on the way but changes only a few
  await record(page, [0, 2, 1], [1, 2, 1], [0, 2, 3], [1, 2, 3]);
  const before = await page.evaluate(() => window.cutwist.state);
  await row(page, "A").locator('[data-act="play"]').hover();
  const shown = await lit(page);
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.length).toBeLessThan(9); // fewer than one face turn moves
  await page.mouse.move(5, 5);
  expect(await lit(page)).toBeNull();
  await row(page, "A").locator('[data-act="play"]').click(); await finish(page);
  expect(changed(before, await page.evaluate(() => window.cutwist.state))).toEqual(shown);
});

test("hovering reverse lights what reversing changes", async ({ page }) => {
  await record(page, [0, 2, 1], [1, 0, 1]);
  const before = await page.evaluate(() => window.cutwist.state);
  await row(page, "A").locator('[data-act="reverse"]').hover();
  const shown = await lit(page);
  await row(page, "A").locator('[data-act="reverse"]').click(); await finish(page);
  expect(changed(before, await page.evaluate(() => window.cutwist.state))).toEqual(shown);
});

test("planar: hovering play lights the cells it changes", async ({ page }) => {
  await page.evaluate(() => window.cutwist.load("sliding-torus"));
  await record(page, [0, 1, 1], [1, 2, 1], [0, 1, -1], [1, 2, -1]);
  const before = await page.evaluate(() => window.cutwist.state);
  await row(page, "A").locator('[data-act="play"]').hover();
  const shown = await lit(page);
  expect(shown.length).toBeGreaterThan(0);
  await row(page, "A").locator('[data-act="play"]').click(); await finish(page);
  expect(changed(before, await page.evaluate(() => window.cutwist.state))).toEqual(shown);
});
