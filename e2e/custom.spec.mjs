// The custom puzzle editor (issue #22: tools on the puzzle, no panel): opening it, the shape from
// the name's menu, cuts added at dots and dragged by hand, truncation, its undo, share links.
import { test, expect } from "@playwright/test";
import { open, info, noErrors, settleLayout, editTool, editShape, editDot, editSites, dragCut, cutPoint, rulers } from "./helpers.mjs";

const designOf = (page) => page.evaluate(() => window.cutwist.design());
const link = (design) => `?puzzle=custom&design=${Buffer.from(JSON.stringify(design)).toString("base64url")}`;

test("customize a cube: the tools, the dots and the numbers", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  await expect(page.locator("#edTools")).toBeVisible();
  await expect(page.locator("#bStats")).toContainText("26 pieces"); // pieces that show (no core)
  await expect(page.locator('.ed-tool[data-tool="cut"]')).toHaveAttribute("aria-pressed", "true");
  // (a dot on each face, corner and edge showing: three faces, seven corners, nine edges)
  const by = (sites) => sites.reduce((m, s) => ({ ...m, [s.label]: (m[s.label] || 0) + 1 }), {});
  expect(by(await editSites(page))).toEqual({ faces: 3, corners: 7, edges: 9 });
  // (the puzzle still turns while customizing; the solved card is gone)
  await expect(page.locator("#scramble")).toBeVisible();
  await expect(page.locator("#reference")).toBeHidden();
  await page.click("#customizeDone");
  await expect(page.locator("#edTools")).toBeHidden();
  await expect(page.locator("#reference")).toBeVisible();
});

test("picking a solid from the name's menu rebuilds the puzzle; undo goes back", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  await editShape(page, "dodeca");
  expect((await info(page)).faces).toBe(12);
  await expect(page.locator("#bSolid").getByRole("radio", { name: "dodeca" })).toHaveAttribute("aria-checked", "true");
  await page.click("#edUndo");
  expect((await info(page)).faces).toBe(6);
  await page.click("#edRedo");
  expect((await info(page)).faces).toBe(12);
});

test("a dot adds a cut; dragging its line moves it, snapping; dragging it off removes it; so does a right-click", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  await editDot(page, "corners");
  let r = await rulers(page);
  expect(r[3].values.length).toBe(1);
  const added = r[3].values[0];
  // (the corner cut, dragged toward the middle: deeper in, more pieces)
  const before = (await info(page)).pieces;
  await dragCut(page, 3, 0, 0.2);
  r = await rulers(page);
  expect(r[3].values[0]).toBeLessThan(added);
  expect((await info(page)).pieces).not.toBe(before);
  // (dragged off the cube and let go: gone)
  const from = await cutPoint(page, 3, 0, null), vp = page.viewportSize();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(vp.width - 60, from.y, { steps: 16 });
  await page.mouse.up();
  expect((await rulers(page))[3].values).toEqual([]);
  // (the face cut: a right-click on its line)
  const p = await cutPoint(page, 2, 0, null);
  await page.mouse.click(p.x, p.y, { button: "right" });
  expect((await rulers(page))[2].values).toEqual([]);
  expect((await info(page)).pieces).toBe(1);
  // (each was one step to undo)
  await page.click("#edUndo");
  expect((await rulers(page))[2].values.length).toBe(1);
});

test("truncating corners makes faces with their own cuts, apart from the solid's own faces'", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  await editDot(page, "corners", "trim");
  expect((await designOf(page)).truncate.vertex).toBeGreaterThan(0);
  expect((await info(page)).faces).toBe(6 + 8);
  // (the cut tool's dots: the corner faces now too; a cut round them leaves the squares' alone)
  await editTool(page, "cut");
  expect((await editSites(page)).some((s) => s.label === "corner faces")).toBe(true);
  await editDot(page, "corner faces");
  const d = await designOf(page);
  expect(d.cuts.find((c) => c.on === "face" && c.of === "vertex").depths.length).toBe(1);
  expect(d.cuts.find((c) => c.on === "face" && c.of === "face").depths.length).toBe(1);
  // (the link keeps them apart)
  const pieces = (await info(page)).pieces, url = await page.evaluate(() => window.cutwist.shareLink());
  await open(page, new URL(url).search);
  expect((await info(page)).pieces).toBe(pieces);
});

// (a link from before face types: its face cuts go round every face, the truncation's too, so it
// opens as the same puzzle)
test("an older link's face cuts go round every type of face", async ({ page }) => {
  const design = { solid: "cube", truncate: { vertex: 0.8 }, cuts: [{ on: "face", depths: [0.5] }], blackout: [] };
  const expected = await (async () => { await open(page); return page.evaluate(async (d) => (await import("./puzzle.mjs")).buildPuzzle({ rule: "custom", size: 2, ...d }).pieces.length, design); })();
  await open(page, link(design));
  expect((await info(page)).pieces).toBe(expected);
  await page.click(".nx-custombtn");
  const r = await rulers(page);
  expect(r[2].values).toEqual([0.5]); // (the cube's own faces)
  expect(r[5].values).toEqual([0.5]); // (the corners' faces)
});

test("a share link opens the same design", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.cutwist.load("megaminx"));
  await page.click(".nx-custombtn");
  const url = await page.evaluate(() => window.cutwist.shareLink());
  const before = await info(page);
  const errors = await open(page, new URL(url).search);
  const after = await info(page);
  expect(after.id).toBe("custom");
  expect(after.pieces).toBe(before.pieces);
  expect(after.faces).toBe(12);
  await noErrors(errors);
});

// (only the 16 candidates nearest a cut were checked once, so its far snaps were never found: a
// cube's corner cut with a face cut has 19)
test("a cut snaps to every depth it lines up at, however far from where it is", async ({ page }) => {
  const design = { rule: "custom", solid: "cube", cuts: [{ on: "face", depths: [0.3] }, { on: "vertex", depths: [0.6] }, { on: "edge", depths: [] }], truncate: {}, blackout: [] };
  await open(page, link(design));
  const expected = await page.evaluate(async (design) => (await import("./puzzle.mjs")).snapDepths({ name: "x", size: 2, ...design }, { s: 1, i: 0 }).length, design);
  expect(expected).toBeGreaterThan(16);
  await page.click(".nx-custombtn");
  await expect.poll(() => page.evaluate(() => window.cutwist.editSnaps(3, 0).length), { timeout: 30000 }).toBe(expected);
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
  await expect(page.locator("#edUndo")).toBeDisabled();
  await page.locator("#edUndo").click({ force: true }); // (even a stray click does nothing)
  expect((await info(page)).faces).toBe(12);
});

test("undo covers every kind of edit, not just cuts, and counts its steps", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  const faces0 = (await info(page)).faces;
  await editDot(page, "corners", "trim"); // a truncation: new faces
  const faces1 = (await info(page)).faces;
  expect(faces1).toBeGreaterThan(faces0);
  await editShape(page, "dodeca");
  await expect(page.locator("#edUndo")).toHaveAttribute("title", /2 edits/);
  await page.click("#edUndo");
  expect((await info(page)).faces).toBe(faces1);
  await page.click("#edUndo");
  expect((await info(page)).faces).toBe(faces0); // the truncation, undone
  await expect(page.locator("#edUndo")).toBeDisabled();
  await expect(page.locator("#edRedo")).toHaveAttribute("title", /2 edits/);
});

test("closing the editor turns off blacking out", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  await editTool(page, "paint");
  await expect(page.locator('.ed-tool[data-tool="paint"]')).toHaveAttribute("aria-pressed", "true");
  await page.click("#customizeDone");
  await page.click(".nx-custombtn");
  await expect(page.locator('.ed-tool[data-tool="paint"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('.ed-tool[data-tool="cut"]')).toHaveAttribute("aria-pressed", "true");
});

test("on a phone the tools sit along the bottom and the puzzle fits above them", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await page.click(".nx-custombtn");
  await settleLayout(page);
  const rail = await page.locator("#edTools").boundingBox(), tape = await page.locator("#nx-tape").boundingBox();
  expect(rail.y + rail.height).toBeLessThanOrEqual(tape.y + 1);
  expect(rail.x + rail.width).toBeLessThanOrEqual(375);
  const sites = await editSites(page);
  expect(sites.length).toBeGreaterThan(5);
  expect(sites.every((s) => s.y < rail.y)).toBe(true);
  await expect(page.locator("#bShare")).toBeVisible();
  await expect(page.locator("#customizeDone")).toBeVisible();
});

test("by touch, a long press on a cut removes it; a mouse held still doesn't", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  const press = (p, pointerType, ms) => page.evaluate(async ({ p, pointerType, ms }) => {
    const c = document.getElementById("c"), ev = (type) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: p.x, clientY: p.y, pointerId: 9, pointerType, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
    ev("pointerdown");
    await new Promise((r) => setTimeout(r, ms));
    ev("pointerup");
  }, { p, pointerType, ms });
  await press(await cutPoint(page, 2, 0, null), "mouse", 800);
  expect((await rulers(page))[2].values.length).toBe(1);
  await press(await cutPoint(page, 2, 0, null), "touch", 800);
  expect((await rulers(page))[2].values).toEqual([]);
});

test("the puzzle turns while customizing, and any edit sets it back to solved", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  await page.evaluate(() => { window.cutwist.turn(0, 0, 1); window.cutwist.finish(); });
  expect((await info(page)).solved).toBe(false);
  await editDot(page, "corners");
  expect((await info(page)).solved).toBe(true);
});

// (a solid's sides and tiles at a corner would make it a ball: only a tiling design has them, under
// its name as every tiling's are; the name is the design's shape)
test("a solid design has no tiling steppers, a tiling one does; the name says the shape", async ({ page }) => {
  await open(page);
  await page.click(".nx-custombtn");
  await expect(page.locator(".nx-pick")).toContainText("Cube");
  await expect(page.locator("#paramControls .control")).toHaveCount(0);
  await editDot(page, "corners", "trim");
  await expect(page.locator(".nx-pick")).toContainText("Truncated cube");
  await editShape(page, "tiling");
  await expect(page.locator("#paramControls .control")).toHaveCount(2);
  await expect(page.locator(".nx-pick")).toContainText("{4,3} Tiling");
  await expect(page.locator("#edMenu .control")).toHaveCount(0); // (not in the menu too)
});
