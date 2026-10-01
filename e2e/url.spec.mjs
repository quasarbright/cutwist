// The puzzle in the URL: ?puzzle=<id> first, its numbers, a custom design, and settings changed
// from their defaults. Reloading gives the same puzzle, started fresh.
import { test, expect } from "@playwright/test";
import { open, info, turn, noErrors, pick } from "./helpers.mjs";

const query = (page) => page.evaluate(() => location.search);
const params = async (page) => Object.fromEntries(new URLSearchParams(await query(page)));

test("the default puzzle writes itself into the URL, puzzle first", async ({ page }) => {
  const errors = await open(page);
  expect(await query(page)).toBe("?puzzle=cube&size=3");
  await noErrors(errors);
});

test("changing puzzle, size or a family's numbers updates the URL", async ({ page }) => {
  await open(page);
  await page.click("#sizeUp");
  expect(await params(page)).toEqual({ puzzle: "cube", size: "4" });
  await pick(page, "prism");
  expect(await params(page)).toEqual({ puzzle: "prism", sides: "6", cuts: "1", rows: "3" });
  await page.evaluate(() => window.cutwist.load("cuboid", { params: { a: 3, b: 3, c: 5 } }));
  expect(await params(page)).toEqual({ puzzle: "cuboid", a: "3", b: "3", c: "5" });
  expect((await query(page)).startsWith("?puzzle=")).toBe(true);
});

test("opening a URL gives that puzzle and those settings", async ({ page }) => {
  const errors = await open(page, "?puzzle=sliding-klein&width=6&height=4&3d=off&labels=off&axes=off&textures=on");
  const s = await info(page);
  expect(s).toMatchObject({ title: "6×4 Klein bottle", views: { flat: true, surface: false }, labels: false, planarTextures: true });
  await expect(page.locator("#axes")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#view3D")).not.toBeChecked();
  await noErrors(errors);
});

test("settings write themselves into the URL only when changed from their defaults", async ({ page }) => {
  await open(page, "?puzzle=icosahedron&size=3");
  expect(await params(page)).toEqual({ puzzle: "icosahedron", size: "3" });
  await page.click("#textures"); // on by default past 12 faces: now off
  await page.click("#axes");
  expect(await params(page)).toEqual({ puzzle: "icosahedron", size: "3", textures: "off", axes: "off" });
  await page.click("#textures");
  expect(await params(page)).toEqual({ puzzle: "icosahedron", size: "3", axes: "off" });
});

test("reloading mid-solve gives the same puzzle, started fresh", async ({ page }) => {
  await open(page, "?puzzle=megaminx&size=5");
  await page.evaluate(() => { window.cutwist.scramble(); window.cutwist.finish(); });
  await turn(page, [0, 0, 1]);
  await page.reload();
  await page.waitForFunction(() => !!window.cutwist);
  const s = await info(page);
  expect(s).toMatchObject({ title: "Gigaminx", solved: true, moves: 0, scrambled: false });
  expect(await params(page)).toEqual({ puzzle: "megaminx", size: "5" });
});

test("a custom design goes in the URL; an old ?p= link still opens", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  const p = await params(page);
  expect(p.puzzle).toBe("custom");
  expect(p.design).toBeTruthy();
  const errors = await open(page, `?p=${p.design}`); // the old form
  expect((await info(page)).id).toBe("custom");
  expect(await params(page)).toEqual({ puzzle: "custom", design: p.design });
  await noErrors(errors);
});

test("nonsense in the URL falls back to sensible values", async ({ page }) => {
  const errors = await open(page, "?puzzle=nope&size=banana");
  expect((await info(page)).title).toBe("3×3×3 cube");
  await open(page, "?puzzle=cube&size=banana");
  expect((await info(page)).title).toBe("3×3×3 cube");
  await open(page, "?puzzle=cuboid&a=0&b=-4&c=2");
  expect((await info(page)).title).toBe("1×1×2 cuboid"); // clamped to the minimum
  await noErrors(errors);
});
