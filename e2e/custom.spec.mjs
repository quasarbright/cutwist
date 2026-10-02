// The custom puzzle editor: opening it, changing the solid, its undo, share links.
import { test, expect } from "@playwright/test";
import { open, info, noErrors } from "./helpers.mjs";

test("customize a cube: the editor shows its stats", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  await expect(page.locator("#bStats")).toContainText("26 pieces"); // pieces that show (no core)
});

test("picking a solid rebuilds the puzzle; undo edit goes back", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
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
  await page.click(".nx-custombtn");
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

test("customizing a preset starts with nothing to undo: undo can't turn it into a cube", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.cutwist.load("megaminx"));
  await page.click(".nx-custombtn");
  await expect(page.locator("#bUndo")).toBeDisabled();
  await page.locator("#bUndo").click({ force: true }); // (even a stray click does nothing)
  expect((await info(page)).faces).toBe(12);
});

test("undo covers every kind of edit, not just cuts, and counts its steps", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  const faces0 = (await info(page)).faces;
  await page.locator("#bTrim").getByRole("button", { name: "+ truncate" }).first().click(); // a truncation: new faces
  const faces1 = (await info(page)).faces;
  expect(faces1).toBeGreaterThan(faces0);
  await page.locator("#bSolid").getByRole("radio", { name: "dodeca" }).click();
  await expect(page.locator("#bUndoN")).toHaveText("2");
  await page.click("#bUndo");
  expect((await info(page)).faces).toBe(faces1);
  await page.click("#bUndo");
  expect((await info(page)).faces).toBe(faces0); // the truncation, undone
  await expect(page.locator("#bUndo")).toBeDisabled();
  await expect(page.locator("#bRedoN")).toHaveText("2");
});

test("closing the editor turns off blacking out", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  await page.click("#bPaint");
  await expect(page.locator("#bPaint")).toHaveAttribute("aria-pressed", "true");
  await page.click("#customizeDone");
  await page.click(".nx-custombtn");
  await expect(page.locator("#bPaint")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#bPaintHint")).toBeHidden();
});
