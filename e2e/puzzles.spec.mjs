// Every puzzle on the shelf loads, and the controls by its name (size, a family's own
// numbers, customize) do what they say.
import { test, expect } from "@playwright/test";
import { open, info, noErrors, pick } from "./helpers.mjs";

test("every puzzle on the shelf loads solved, with no errors", async ({ page }) => {
  test.setTimeout(90_000); // (one by one, every puzzle there is: slow when the other tests are running too)
  const errors = await open(page);
  await page.click(".nx-pick");
  const ids = await page.$$eval(".nx-card", (cs) => cs.map((c) => c.dataset.id));
  await page.keyboard.press("Escape");
  expect(ids.length).toBeGreaterThan(20);
  for (const id of ids) {
    await pick(page, id);
    const s = await info(page);
    expect(s.id, id).toBe(id);
    expect(s.pieces, id).toBeGreaterThan(0);
    expect(s.solved, id).toBe(true);
    expect(s.moves, id).toBe(0);
  }
  await noErrors(errors);
});

test("size buttons step the size and rebuild the puzzle", async ({ page }) => {
  await open(page);
  await page.click("#sizeUp");
  expect((await info(page)).title).toBe("4×4×4 cube");
  expect((await info(page)).pieces).toBe(64);
  await page.click("#sizeDown");
  await page.click("#sizeDown");
  expect((await info(page)).title).toBe("2×2×2 cube");
  await page.fill("#size", "5");
  await page.dispatchEvent("#size", "change");
  expect((await info(page)).title).toBe("5×5×5 cube");
});

test("size skips the sizes a family doesn't have", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.cutwist.load("icosahedron"));
  expect((await info(page)).size).toBe(3);
  await page.click("#sizeUp");
  expect((await info(page)).size).toBe(5); // odd only
  await page.click("#sizeDown");
  expect((await info(page)).size).toBe(3);
});

test("fixed puzzles hide the size control", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.cutwist.load("pentultimate"));
  await expect(page.locator("#sizeControl")).toBeHidden();
  await page.evaluate(() => window.cutwist.load("megaminx"));
  await expect(page.locator("#sizeControl")).toBeVisible();
});

// the −/+ row for one of a family's numbers
const param = (page, label) => page.locator("#paramControls .control").filter({ has: page.locator(".name", { hasText: new RegExp(`^${label}$`) }) });

test("a cuboid has length, height and width controls instead of a size", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.cutwist.load("cuboid"));
  expect((await info(page)).title).toBe("2×3×4 cuboid");
  await expect(page.locator("#sizeControl")).toBeHidden();
  await param(page, "length").getByRole("button", { name: "+" }).click();
  expect((await info(page)).title).toBe("3×3×4 cuboid");
  await param(page, "width").getByRole("button", { name: "−" }).click();
  expect((await info(page)).title).toBe("3×3×3 cuboid");
  // a square cross-section turns in quarters, the rest in halves
  const s = await page.evaluate(() => window.cutwist.load("cuboid", { params: { a: 3, b: 3, c: 5 } }));
  expect(s.axes.map((a) => a.order).sort()).toEqual([2, 2, 4]);
  // no maximum; the minimum is 1
  const input = param(page, "length").locator("input");
  await input.fill("12");
  await input.dispatchEvent("change");
  expect((await info(page)).title).toBe("12×3×5 cuboid");
  await input.fill("0");
  await input.dispatchEvent("change");
  expect((await info(page)).title).toBe("1×3×5 cuboid");
});

test("prisms: sides, size (cuts per side) and height", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.cutwist.load("prism"));
  expect((await info(page)).title).toBe("Hexagonal prism, size 1, height 3");
  await param(page, "sides").getByRole("button", { name: "−" }).click();
  expect((await info(page)).title).toBe("Pentagonal prism, size 1, height 3");
  await param(page, "height").getByRole("button", { name: "+" }).click();
  const s = await info(page);
  expect(s.title).toBe("Pentagonal prism, size 1, height 4");
  const cap = s.axes.find((a) => a.order === 5);
  expect(cap.layers).toBe(4);
  await page.evaluate(() => window.cutwist.load("prism-crystal"));
  expect((await info(page)).title).toBe("Hexagonal prism crystal, height 2");
});

test("customize opens the editor on presets it can express, and is hidden on the rest", async ({ page }) => {
  await open(page);
  await expect(page.locator(".nx-custombtn")).toBeVisible();
  await expect(page.locator("#builder")).toBeHidden();
  await page.click(".nx-custombtn");
  await expect(page.locator("#builder")).toBeVisible();
  expect((await info(page)).id).toBe("custom");
  expect((await info(page)).pieces).toBe(27); // the same puzzle, now editable
  await page.click(".nx-done");
  await page.evaluate(() => window.cutwist.load("cuboid"));
  await expect(page.locator(".nx-custombtn")).toBeHidden(); // (the editor can't express a cuboid)
});

test("opening the gallery doesn't focus its search box (no keyboard popping up on a phone)", async ({ page }) => {
  const errors = await open(page);
  await page.click(".nx-pick");
  await expect(page.locator("#nx-shelf")).toBeVisible();
  await expect(page.locator("#shelfSearch")).not.toBeFocused();
  await noErrors(errors);
});
