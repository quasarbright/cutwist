import { test, expect } from "@playwright/test";

// (not helpers.mjs's open: that waits for the puzzle page's hook, which background mode never sets up)
async function openBackground(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route((url) => /fonts\.(googleapis|gstatic)\.com/.test(url.hostname), (r) => r.abort());
  await page.goto("/index.html?background", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.cutwistBackground);
  return errors;
}
const info = (page) => page.evaluate(() => window.cutwistBackground.info());

test("?background shows only a full-screen canvas, the grid about the screen's shape", async ({ page }) => {
  const errors = await openBackground(page);
  await expect(page.locator("#bg")).toBeVisible();
  const box = await page.locator("#bg").boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
  // nothing else on the page shows
  const visible = await page.evaluate(() => [...document.body.querySelectorAll("*")].filter((el) => el.id !== "bg" && el.checkVisibility()).length);
  expect(visible).toBe(0);
  const s = await info(page);
  expect([s.W, s.H]).toEqual([8, 5]); // 1200×800: 5 across the short side, 7.5 → 8 along the long one
  expect(["torus", "klein", "rp2"]).toContain(s.topology);
  expect(s.movesLeft).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("?background unscrambles, then starts a new round", async ({ page }) => {
  test.setTimeout(90_000);
  await openBackground(page);
  await page.waitForFunction(() => window.cutwistBackground.info().phase === "solve");
  await page.waitForFunction(() => window.cutwistBackground.info().phase === "linger", null, { timeout: 60_000 });
  expect((await info(page)).movesLeft).toBe(0);
  await page.waitForFunction(() => window.cutwistBackground.info().phase === "fade", null, { timeout: 5_000 });
  expect((await info(page)).movesLeft).toBeGreaterThan(0);
});
