// The view toggles: textures, axes and rear view.
import { test, expect } from "@playwright/test";
import { open, info, openView } from "./helpers.mjs";

test.beforeEach(async ({ page }) => { await open(page); });

test("textures are off by default up to 12 faces and on past 12", async ({ page }) => {
  await expect(page.locator("#textures")).toBeVisible(); // always shown, even on a cube
  expect((await info(page)).textures).toBe(false);
  await expect(page.locator("#textures")).not.toHaveClass(/is-active/);
  await page.evaluate(() => window.cutwist.load("icosahedron"));
  expect((await info(page)).textures).toBe(true);
  await expect(page.locator("#textures")).toHaveClass(/is-active/);
});

test("the textures button toggles them, keeps the choice across sizes, and resets on a new puzzle", async ({ page }) => {
  await page.click("#textures");
  expect((await info(page)).textures).toBe(true);
  await page.click("#sizeUp");
  expect((await info(page)).textures).toBe(true);
  await page.evaluate(() => window.cutwist.load("megaminx"));
  expect((await info(page)).textures).toBe(false);
  await page.evaluate(() => window.cutwist.load("soccer"));
  await page.click("#textures");
  expect((await info(page)).textures).toBe(false);
});

test("the axes button toggles the turn stubs", async ({ page }) => {
  await expect(page.locator("#axes")).toHaveAttribute("aria-pressed", "true");
  await page.click("#axes");
  await expect(page.locator("#axes")).toHaveAttribute("aria-pressed", "false");
  await page.click("#axes");
  await expect(page.locator("#axes")).toHaveAttribute("aria-pressed", "true");
});

test("the solved reference view is shown", async ({ page }) => {
  await expect(page.locator("#reference")).toBeVisible();
});

test("buttons don't double-tap zoom on phones; the puzzle keeps all touches for itself", async ({ page }) => {
  const touch = (sel) => page.$eval(sel, (el) => getComputedStyle(el).touchAction);
  for (const sel of ["#undo", "#redo", "#scramble", "#pause", "#sizeUp", ".nx-rec", ".nx-pick", "body"]) expect(await touch(sel), sel).toBe("manipulation");
  expect(await touch("#c")).toBe("none");
});

test("rear view: on by default on a wide screen; the button toggles it, goes in the URL, and is off while a flat grid shows", async ({ page }) => {
  const rearParam = () => new URL(page.url()).searchParams.get("rear");
  await expect(page.locator("#rear")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#rearSplit")).toBeVisible();
  expect(rearParam()).toBeNull(); // (the default isn't written)
  await page.click("#rear");
  expect((await info(page)).rear).toBe(false);
  await expect(page.locator("#rearSplit")).toBeHidden();
  expect(rearParam()).toBe("off");
  await page.click("#rear");
  expect((await info(page)).rear).toBe(true);
  expect(rearParam()).toBeNull();
  // a planar puzzle with its flat grid on screen: no rear view
  await page.evaluate(() => window.cutwist.load("sliding-klein"));
  await expect(page.locator("#rear")).toBeDisabled();
  expect((await info(page)).rear).toBe(false);
  await expect(page.locator("#rearSplit")).toBeHidden();
  // only the 3D surface: back on
  await openView(page);
  await page.uncheck("#viewFlat");
  await expect(page.locator("#rear")).toBeEnabled();
  expect((await info(page)).rear).toBe(true);
  await page.click("#rear");
  expect((await info(page)).rear).toBe(false);
});

test("rear view: off on a phone, even from a link that turns it on", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "?puzzle=cube&rear=on");
  expect((await info(page)).rear).toBe(false);
  await expect(page.locator("#rearSplit")).toBeHidden();
});
