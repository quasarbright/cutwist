// The custom puzzle editor: opening it, changing the solid, its undo, share links.
import { test, expect } from "@playwright/test";
import { open, info, noErrors } from "./helpers.mjs";

test("customize a cube: the editor shows its stats", async ({ page }) => {
  await open(page);
  await page.click("#customize");
  await expect(page.locator("#bStats")).toContainText("26 pieces"); // pieces that show (no core)
});

test("picking a solid rebuilds the puzzle; undo edit goes back", async ({ page }) => {
  await open(page);
  await page.click("#customize");
  await page.locator("#bSolid").getByRole("radio", { name: "dodeca" }).click();
  expect((await info(page)).faces).toBe(12);
  await expect(page.locator("#bSolid").getByRole("radio", { name: "dodeca" })).toHaveAttribute("aria-checked", "true");
  await page.click("#bUndo");
  expect((await info(page)).faces).toBe(6);
  await page.click("#bRedo");
  expect((await info(page)).faces).toBe(12);
});

test("a share link opens the same design in the editor", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.cutwist.load("megaminx"));
  await page.click("#customize");
  const link = await page.evaluate(() => window.cutwist.shareLink());
  const before = await info(page);
  const errors = await open(page, new URL(link).search);
  const after = await info(page);
  expect(after.id).toBe("custom");
  expect(after.pieces).toBe(before.pieces);
  expect(after.faces).toBe(12);
  await expect(page.locator("#builder")).toBeVisible();
  await noErrors(errors);
});

test("a broken share link falls back to the default puzzle", async ({ page }) => {
  const errors = await open(page, "?p=not-a-design");
  expect((await info(page)).title).toBe("3×3×3 cube");
  await noErrors(errors);
});
