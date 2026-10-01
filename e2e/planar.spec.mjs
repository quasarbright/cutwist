// The planar puzzles (sliding grids on a torus, Klein bottle, projective plane), driven
// through the test hook and the view dropdown. Real drags and arrow clicks are in input.spec.
import { test, expect } from "@playwright/test";
import { open, info, turn, finish, noErrors, pick, openView } from "./helpers.mjs";

// open a sliding grid: { topology (the puzzle: torus, klein, rp2), width, height }
const load = (page, { topology = "torus", ...params } = {}) =>
  page.evaluate(({ id, params }) => window.cutwist.load(id, { params }), { id: `sliding-${topology}`, params });
const orients = (page) => page.evaluate(() => window.cutwist.state.map((v) => v & 3));
// a 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page); });
test.afterEach(async () => { await noErrors(errors); });

test("the sliding torus opens as a 5×5 torus, flat and in 3D", async ({ page }) => {
  await pick(page, "sliding-torus");
  const s = await info(page);
  expect(s).toMatchObject({ planar: true, title: "5×5 torus", pieces: 25, solved: true });
  await expect(page.locator("#plane")).toBeVisible();
  await expect(page.locator("#c")).toBeVisible(); // the 3D surface
  await openView(page);
  await expect(page.locator("#planarControls")).toBeVisible();
  await expect(page.locator("#textures")).toBeHidden();
  await expect(page.locator(".nx-empty")).toHaveText("drag a row or column to slide it"); // (the empty tape)
});

test("one puzzle per surface in the menu, each with width and height (no surface picker)", async ({ page }) => {
  for (const [id, title] of [["sliding-torus", "5×5 torus"], ["sliding-klein", "5×5 Klein bottle"], ["sliding-rp2", "5×5 projective plane"]]) {
    await pick(page, id);
    expect((await info(page)).title).toBe(title);
  }
  await expect(page.getByRole("combobox", { name: "surface" })).toHaveCount(0);
  const row = (label) => page.locator("#paramControls .control").filter({ has: page.locator(".name", { hasText: new RegExp(`^${label}$`) }) });
  await row("width").getByRole("button", { name: "+" }).click();
  await row("height").getByRole("button", { name: "−" }).click();
  expect((await info(page)).title).toBe("6×4 projective plane");
});

test("a slide and its reverse; W slides of a torus row is the identity", async ({ page }) => {
  await load(page);
  await turn(page, [0, 2, 1]);
  expect((await info(page)).solved).toBe(false);
  await turn(page, [0, 2, -1]);
  expect((await info(page)).solved).toBe(true);
  await turn(page, [1, 3, 2], [1, 3, 3]);
  expect((await info(page)).solved).toBe(true);
});

test("Klein bottle: a full trip of the middle column brings its cells home flipped, which isn't solved", async ({ page }) => {
  await load(page, { topology: "klein" });
  await turn(page, [1, 2, 5]);
  const s = await info(page);
  expect(s.solved).toBe(false);
  const o = await orients(page);
  expect([0, 1, 2, 3, 4].map((y) => o[y * 5 + 2])).toEqual([1, 1, 1, 1, 1]); // mirrored left-right
  await turn(page, [1, 2, 5]);
  expect((await info(page)).solved).toBe(true);
});

test("scramble, then undoing it by hand, solves it and stops the timer", async ({ page }) => {
  await load(page, { topology: "rp2", width: 4, height: 3 });
  const moves = await page.evaluate(() => { const m = window.cutwist.scramble(); window.cutwist.finish(); return m; });
  expect((await info(page)).solved).toBe(false);
  await page.evaluate((moves) => { for (const m of window.cutwist.invert(moves)) window.cutwist.turn(m.axis, m.layer, m.q); window.cutwist.finish(); }, moves);
  const s = await info(page);
  expect(s.solved).toBe(true);
  expect(s.timer.state).toBe("done");
});

test("undo and algorithms work on slides", async ({ page }) => {
  await load(page, { topology: "klein" });
  await page.click(".nx-rec");
  await turn(page, [0, 1, 2], [1, 0, -1]);
  await page.click(".nx-rec");
  await page.locator('.nx-alg[data-name="A"] [data-act="reverse"]').click();
  await finish(page);
  expect((await info(page)).solved).toBe(true);
  await page.click("#undo"); await finish(page);
  expect((await info(page)).solved).toBe(false);
});

test("labels are on by default and toggle; the reflected-labels option grays out without them", async ({ page }) => {
  await load(page, { topology: "klein" });
  await openView(page);
  await expect(page.locator("#labels")).toBeChecked();
  expect((await info(page)).labels).toBe(true);
  await page.locator("#labels").uncheck();
  expect((await info(page)).labels).toBe(false);
  await expect(page.locator("#reflectLabels")).toBeDisabled();
  await page.locator("#labels").check();
  await expect(page.locator("#reflectLabels")).toBeEnabled();
});

test("fill: colors by default; picture asks for one, then switches back and forth without asking again", async ({ page }) => {
  await load(page);
  await openView(page);
  await expect(page.locator("#fillColors")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#pictureChange")).toBeHidden();
  // the first click on picture opens the file chooser
  const chooser = page.waitForEvent("filechooser");
  await page.click("#fillPicture");
  await (await chooser).setFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(async () => (await info(page)).picture).toBe(true);
  await expect(page.locator("#fillPicture")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#pictureChange")).toBeVisible();
  await expect(page.locator("#planarTextures")).toBeDisabled(); // textures only go on the colors
  await page.click("#fillColors");
  expect((await info(page)).picture).toBe(false);
  await expect(page.locator("#planarTextures")).toBeEnabled();
  await page.click("#fillPicture"); // already loaded: no chooser this time
  expect((await info(page)).picture).toBe(true);
  await load(page, { topology: "rp2" });
  expect((await info(page)).picture).toBe(true); // kept across puzzles, for the session
});

test("back to a 3D puzzle: the 3D canvas returns", async ({ page }) => {
  await load(page);
  await page.evaluate(() => window.cutwist.load("cube"));
  await expect(page.locator("#c")).toBeVisible();
  await expect(page.locator("#plane")).toBeHidden();
  await expect(page.locator("#planarControls")).toBeHidden();
  await expect(page.locator("#textures")).toBeVisible();
  expect((await info(page)).pieces).toBe(27);
});

test("'labels get reflected' is on by default, hidden on a torus; unchecking keeps every label upright", async ({ page }) => {
  await load(page, { topology: "torus" });
  await openView(page);
  await expect(page.locator("#reflectRow")).toBeHidden(); // nothing on a torus ever flips
  await load(page, { topology: "klein" });
  await expect(page.locator("#reflectRow")).toBeVisible();
  await expect(page.locator("#reflectRow")).toContainText("labels get reflected");
  await expect(page.locator("#reflectLabels")).toBeChecked();
  expect((await info(page)).reflectLabels).toBe(true);
  await page.locator("#reflectLabels").uncheck();
  expect((await info(page)).reflectLabels).toBe(false);
  // switching puzzles keeps the choice (it's a viewing preference)
  await load(page, { topology: "rp2" });
  expect((await info(page)).reflectLabels).toBe(false);
});

test("colors only by default; the textures checkbox adds the column patterns", async ({ page }) => {
  await load(page);
  await openView(page);
  await expect(page.locator("#planarTextures")).not.toBeChecked();
  expect((await info(page)).planarTextures).toBe(false);
  await page.locator("#planarTextures").check();
  expect((await info(page)).planarTextures).toBe(true);
});

test("views: flat and 3D both on, side by side on a wide screen; the last one on can't be turned off", async ({ page }) => {
  await load(page);
  expect((await info(page)).views).toEqual({ flat: true, surface: true });
  await expect(page.locator("#plane")).toBeVisible();
  await expect(page.locator("#c")).toBeVisible();
  // the flat view's canvas takes the left part of the screen
  const box = await page.locator("#plane").boundingBox(), vw = page.viewportSize().width;
  expect(box.x + box.width).toBeLessThan(vw * 0.6);
  await openView(page);
  await page.locator("#viewFlat").uncheck();
  expect((await info(page)).views).toEqual({ flat: false, surface: true });
  await expect(page.locator("#plane")).toBeHidden();
  await page.locator("#view3D").click(); // the only one left: stays on
  expect((await info(page)).views).toEqual({ flat: false, surface: true });
  await expect(page.locator("#view3D")).toBeChecked();
  await page.locator("#viewFlat").check();
  await page.locator("#view3D").uncheck();
  expect((await info(page)).views).toEqual({ flat: true, surface: false });
  await expect(page.locator("#c")).toBeHidden();
});

test("on a phone: flat over 3D even when the space is wide, and no arrow buttons", async ({ page }) => {
  await page.setViewportSize({ width: 680, height: 420 }); // (a phone on its side)
  await load(page);
  const box = await page.locator("#plane").boundingBox(), vw = page.viewportSize().width;
  expect(box.width, "the flat view spans the width").toBeGreaterThan(vw * 0.8);
  expect(box.y + box.height, "the flat view is above the 3D one").toBeLessThan(420 * 0.8);
  expect(await page.evaluate(() => window.cutwist.arrows())).toEqual([]);
});

test("every surface shows up in 3D, with cells in view", async ({ page }) => {
  for (const topology of ["torus", "klein", "rp2"]) {
    await load(page, { topology });
    const visible = await page.evaluate(() => {
      let n = 0;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (window.cutwist.surfacePoint(x, y)) n++;
      return n;
    });
    // (Boy's surface folds over itself in three lobes and hides most of its cells from any one view)
    expect(visible, topology).toBeGreaterThanOrEqual(topology === "rp2" ? 3 : 5);
  }
});

test("the corner card: the solved surface in 3D with the 3D view on, the flat grid with only the flat view", async ({ page }) => {
  await load(page);
  await expect(page.locator("#refPlane")).toBeHidden(); // 3D on: the card is drawn by the 3D view
  await openView(page);
  await page.locator("#view3D").uncheck();
  await expect(page.locator("#refPlane")).toBeVisible();
  await page.locator("#view3D").check();
  await page.locator("#viewFlat").uncheck();
  await expect(page.locator("#refPlane")).toBeHidden();
});

test("the Klein bottle and projective plane can be drawn as another shape; the URL keeps it", async ({ page }) => {
  const errors = await open(page);
  await load(page);
  await openView(page);
  await expect(page.locator("#surfaceShape")).toBeHidden(); // a torus has one shape
  await load(page, { topology: "klein" });
  expect((await info(page)).shape).toBe("klein");
  await page.locator('#surfaceShape [data-shape="klein8"]').click();
  expect((await info(page)).shape).toBe("klein8");
  expect(new URL(page.url()).searchParams.get("shape")).toBe("klein8");
  // still the same puzzle: a slide moves cells as before
  await turn(page, [0, 1, 1]);
  expect((await info(page)).moves).toBe(1);
  await load(page, { topology: "rp2" });
  await page.locator('#surfaceShape [data-shape="roman"]').click();
  expect((await info(page)).shape).toBe("roman");
  await page.reload();
  await page.waitForFunction(() => !!window.cutwist);
  expect((await info(page)).shape).toBe("roman");
  await noErrors(errors);
});
