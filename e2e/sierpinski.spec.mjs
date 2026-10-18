// The Sierpinski puzzle (issue #26): every triangle a piece, and the puzzle holds itself. Loading
// from the shelf, the levels stepper, and real pointer input as drawn in the issue: drag round a
// middle (its ring), drag on a third (the third; on the whole's band, the whole), + and − by each
// corner (zoom on that third), a tap in a middle (zoom in till it's the whole's).
import { test, expect } from "@playwright/test";
import { open, info, turn, noErrors, pick } from "./helpers.mjs";

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page, "?puzzle=sierpinski"); });
test.afterEach(async () => { await noErrors(errors); });

const fire = (page, type, p) => page.evaluate(({ type, p }) => document.getElementById("plane").dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: p.x, clientY: p.y, pointerId: 7, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 })), { type, p });
const state = (page) => page.evaluate(() => window.cutwist.state);
const moved = (s) => s.filter((v, i) => v !== i).length;
const idle = (page) => expect.poll(async () => (await info(page)).idle).toBe(true);
const index = (page, a) => page.evaluate((a) => window.cutwist.sierIndex(a), a);
// a drag from p round c by `turns` of a full turn, counterclockwise on screen
async function dragRound(page, c, p, turns) {
  const r = Math.hypot(p.x - c.x, p.y - c.y), a0 = Math.atan2(-(p.y - c.y), p.x - c.x);
  await fire(page, "pointerdown", p);
  for (let k = 1; k <= 16; k++) { const a = a0 + (2 * Math.PI * turns * k) / 16; await fire(page, "pointermove", { x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a) }); }
  const a = a0 + 2 * Math.PI * turns;
  await fire(page, "pointerup", { x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a) });
  await idle(page);
}

test("it opens from the shelf: 40 triangles on 4 levels, solved, with its solved card and a + and − by each corner", async ({ page }) => {
  await open(page);
  await pick(page, "sierpinski");
  expect(await info(page)).toMatchObject({ id: "sierpinski", sierpinski: true, levels: 4, pieces: 40, holes: 13, solved: true, textures: false });
  await expect(page.locator("#refPlane")).toBeVisible();
  await expect(page.locator("#customize")).toBeHidden();
  for (const [c, [x, y]] of [[0, [0, Math.sqrt(3) / 2]], [1, [-0.5, 0]], [2, [0.5, 0]]]) {
    const corner = await page.evaluate(({ x, y }) => window.cutwist.sierPoint(x, y), { x, y }), box = await page.locator(`.sier-zoom[data-c="${c}"]`).boundingBox();
    expect(Math.hypot(box.x + box.width / 2 - corner.x, box.y + box.height / 2 - corner.y), `corner ${c}'s buttons by it`).toBeLessThan(80);
  }
  await expect(page.locator("#paramControls")).not.toContainText("zoom"); // (none by the size control)
});

test("the levels stepper: 3 or 4 levels, in the link", async ({ page }) => {
  await page.locator("#paramControls .control", { hasText: "levels" }).getByRole("button", { name: "−" }).click();
  expect(await info(page)).toMatchObject({ levels: 3, pieces: 13, holes: 4, title: "3-level Sierpinski Zoom" });
  expect(new URL(page.url()).searchParams.get("levels")).toBe("3");
});

test("dragging round the white middle turns its ring: 21 triangles; hovering lights it; and back", async ({ page }) => {
  const c = await page.evaluate(() => window.cutwist.sierHole(0));
  await fire(page, "pointermove", { x: c.x + 20, y: c.y + 20 });
  expect(await info(page)).toMatchObject({ hover: 0, hoverLayer: 0 });
  await dragRound(page, c, { x: c.x + 40, y: c.y }, 1 / 3);
  expect(moved(await state(page))).toBe(21);
  expect(await info(page)).toMatchObject({ moves: 1, solved: false });
  await dragRound(page, c, { x: c.x + 40, y: c.y }, -1 / 3);
  expect(moved(await state(page))).toBe(0);
});

test("dragging on a third turns the third; on the whole's band, the whole (still solved)", async ({ page }) => {
  // (the top third's top triangle, round the top third's middle)
  const p = await page.evaluate(async () => window.cutwist.sierPlace(window.cutwist.sierIndex([0, 0, 0]))), c = await page.evaluate(() => window.cutwist.sierHole(1));
  await dragRound(page, c, p, 1 / 3);
  const s = await state(page), inThird = await page.evaluate(() => window.cutwist.state.map((_, i) => i).filter((i) => window.cutwist.sierIndex([0]) <= i && i <= window.cutwist.sierIndex([0, 2, 2])));
  expect(moved(s)).toBe(12);
  expect(s.every((v, i) => v === i || inThird.includes(i))).toBe(true);
  await turn(page, [1, 1, -1]);
  // (the band round the outside, near the bottom edge's middle)
  const band = await page.evaluate(() => window.cutwist.sierPoint(0, 0.008)), mid = await page.evaluate(() => window.cutwist.sierHole(0));
  await dragRound(page, mid, band, 1 / 3);
  expect(moved(await state(page))).toBe(39);
  expect((await info(page)).solved).toBe(true);
});

test("+ by a corner zooms in on its third (its triangles each up a level), − back out; 4 zooms on 4 levels is where it started", async ({ page }) => {
  for (const c of [0, 1, 2]) {
    await page.click(`.sier-zoom[data-c="${c}"] [data-q="1"]`);
    await idle(page);
    const s = await state(page);
    for (const t of [[], [0], [1, 2], [2, 0]]) expect(s[await index(page, t)], `third ${c}: ${t}`).toBe(await index(page, [c, ...t]));
    expect((await info(page)).solved).toBe(false);
    await page.click(`.sier-zoom[data-c="${c}"] [data-q="-1"]`);
    await idle(page);
    expect(moved(await state(page))).toBe(0);
  }
  for (let k = 0; k < 4; k++) { await page.click('.sier-zoom[data-c="2"] [data-q="1"]'); await idle(page); }
  expect(moved(await state(page))).toBe(0);
  await expect(page.locator(".nx-moves .nx-mark").first()).toContainText("+");
});

test("a tap in a middle zooms in till it's the whole's: a zoom into each third on the way, one undo", async ({ page }) => {
  // (the bottom left third's top ninth: two zooms, into third 1 then third 0)
  const h = await page.evaluate(() => window.cutwist.sierHole(0)); // (the whole's middle: no zoom)
  await fire(page, "pointerdown", h); await fire(page, "pointerup", h);
  await idle(page);
  expect((await info(page)).moves).toBe(0);
  const ninth = await page.evaluate(() => { const i = window.cutwist.sierIndex([1, 0]); return window.cutwist.sierPlace(i); });
  await fire(page, "pointerdown", ninth); await fire(page, "pointerup", ninth);
  await idle(page);
  const s = await state(page);
  expect(s[await index(page, [])]).toBe(await index(page, [1, 0]));
  await page.click("#undo");
  await idle(page);
  expect(moved(await state(page))).toBe(0);
});

test("scramble, then reset; textures; an algorithm lights what it moves", async ({ page }) => {
  await page.click("#scramble");
  await expect.poll(async () => (await info(page)).status, { timeout: 15_000 }).toContain("scrambled");
  expect((await info(page)).solved).toBe(false);
  await page.click("#reset");
  await idle(page);
  expect(moved(await state(page))).toBe(0);
  await page.click("#textures");
  expect((await info(page)).textures).toBe(true);
  await page.click(".nx-rec");
  await turn(page, [0, 0, 1], [1, 1, 1]);
  await page.click(".nx-rec");
  await page.locator('.nx-alg [data-act="play"]').first().hover();
  await expect.poll(() => page.evaluate(() => window.cutwist.lit()?.length ?? 0)).toBeGreaterThan(0);
});

test("on a phone: the triangle and its zoom buttons fit, under the title and over the tape", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "?puzzle=sierpinski");
  const tape = await page.locator("#nx-tape").boundingBox(), name = await page.locator(".nx-pick").boundingBox();
  const top = await page.evaluate(() => window.cutwist.sierPoint(0, Math.sqrt(3) / 2)), left = await page.evaluate(() => window.cutwist.sierPoint(-0.5, 0)), right = await page.evaluate(() => window.cutwist.sierPoint(0.5, 0));
  expect(top.y).toBeGreaterThan(name.y + name.height);
  expect(left.y).toBeLessThan(tape.y);
  for (const c of [0, 1, 2]) {
    const b = await page.locator(`.sier-zoom[data-c="${c}"]`).boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(375);
    expect(b.y + b.height).toBeLessThan(tape.y);
  }
});
