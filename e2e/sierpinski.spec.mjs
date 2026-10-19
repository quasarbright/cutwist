// The Sierpinski puzzle (issue #26): a Sierpinski triangle with no bottom, each piece saying what's
// in its corners. Loading from the shelf, the levels stepper, and real pointer input: the turns'
// circles in their triangles' middles dragged by their lines; zooming, the camera only: + and − by
// each corner, and a tap on a dot. In through a copy of the whole, the view is exactly where it
// started.
import { test, expect } from "@playwright/test";
import { open, info, turn, noErrors, pick } from "./helpers.mjs";

let errors;
// (on 4 levels, but where a test says otherwise; the puzzle starts on 2)
test.beforeEach(async ({ page }) => { errors = await open(page, "?puzzle=sierpinski&levels=4"); });
test.afterEach(async () => { await noErrors(errors); });

const fire = (page, type, p) => page.evaluate(({ type, p }) => document.getElementById("plane").dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: p.x, clientY: p.y, pointerId: 7, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 })), { type, p });
const state = (page) => page.evaluate(() => Array.from(window.cutwist.state));
// (corners changed from a state before)
const changed = (s, from) => s.filter((v, i) => v !== from[i]).length;
const idle = (page) => expect.poll(async () => { const s = await info(page); return s.idle && !s.zooming; }).toBe(true);
const index = (page, a) => page.evaluate((a) => window.cutwist.sierIndex(a), a);
const picture = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(document.getElementById("plane").toDataURL()))));
const zoom = async (page, c, q) => { await page.click(`.sier-zoom-btn[data-c="${c}"][data-q="${q}"]`); await idle(page); };
// a drag from p round c by `turns` of a full turn, counterclockwise on screen
async function dragRound(page, c, p, turns) {
  const r = Math.hypot(p.x - c.x, p.y - c.y), a0 = Math.atan2(-(p.y - c.y), p.x - c.x);
  await fire(page, "pointerdown", p);
  for (let k = 1; k <= 16; k++) { const a = a0 + (2 * Math.PI * turns * k) / 16; await fire(page, "pointermove", { x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a) }); }
  const a = a0 + 2 * Math.PI * turns;
  await fire(page, "pointerup", { x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a) });
  await idle(page);
}
// (a circle's line, a little round from its right)
const onLine = (c, a = 0.4) => ({ x: c.x + c.r * Math.cos(a), y: c.y - c.r * Math.sin(a) });
const circle = (page, axis, layer) => page.evaluate(({ axis, layer }) => window.cutwist.sierCircle(axis, layer), { axis, layer });

test("it opens from the shelf on 2 levels: 4 pieces, solved, every ring a move, with its solved card and a + and − by each corner", async ({ page }) => {
  await open(page);
  await pick(page, "sierpinski");
  expect(await info(page)).toMatchObject({ id: "sierpinski", sierpinski: true, levels: 2, pieces: 4, holes: 4, rings: 4, solved: true, textures: false, camera: "" });
  await expect(page.locator("#refPlane")).toBeVisible();
  await expect(page.locator("#customize")).toBeHidden();
  for (const [c, [x, y]] of [[0, [0, Math.sqrt(3) / 2]], [1, [-0.5, 0]], [2, [0.5, 0]]]) {
    const corner = await page.evaluate(({ x, y }) => window.cutwist.sierPoint(x, y), { x, y }), mid = await page.evaluate(() => window.cutwist.sierPoint(0, Math.sqrt(3) / 6));
    const at = async (q) => { const b = await page.locator(`.sier-zoom-btn[data-c="${c}"][data-q="${q}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const plus = await at(1), minus = await at(-1), far = (p) => Math.hypot(p.x - mid.x, p.y - mid.y);
    expect(far(plus), `corner ${c}: + past it`).toBeGreaterThan(far(corner));
    expect(far(minus), `corner ${c}: − further`).toBeGreaterThan(far(plus) + 20);
  }
  await expect(page.locator("#paramControls")).not.toContainText("zoom");
});

test("the levels stepper: 2 to 4 levels, in the link", async ({ page }) => {
  const less = page.locator("#paramControls .control", { hasText: "levels" }).getByRole("button", { name: "−" });
  await less.click();
  expect(await info(page)).toMatchObject({ levels: 3, pieces: 13, title: "3-level Sierpinski Zoom" });
  expect(new URL(page.url()).searchParams.get("levels")).toBe("3");
  await less.click();
  expect(await info(page)).toMatchObject({ levels: 2, pieces: 4, rings: 4, holes: 4 });
  await expect(less).toBeDisabled();
});

test("changing levels draws the new puzzle as a fresh load does, and its circles and zooms work", async ({ page }) => {
  const less = page.locator("#paramControls .control", { hasText: "levels" }).getByRole("button", { name: "−" });
  for (const L of [3, 2]) {
    await less.click();
    await idle(page);
    const changedTo = await picture(page);
    const fresh = await page.context().newPage();
    await open(fresh, `?puzzle=sierpinski&levels=${L}`);
    expect(await picture(fresh), `${L} levels`).toBe(changedTo);
    await fresh.close();
    const c = await circle(page, 1, L === 3 ? 0 : 1);
    await dragRound(page, c, onLine(c), 1 / 3);
    expect((await info(page)).solved, `${L} levels`).toBe(false);
    await zoom(page, 0, 1);
    expect((await info(page)).camera).toBe("0");
    await zoom(page, 0, -1);
    await page.click("#reset");
    await idle(page);
  }
});

test("the whole's inner circle turns its ring: six corners of the thirds, those touching its middle; hovering lights it; and back", async ({ page }) => {
  const start = await state(page), c = await circle(page, 0, 0);
  await fire(page, "pointermove", onLine(c));
  expect(await info(page)).toMatchObject({ hover: 0, hoverLayer: 0 });
  await dragRound(page, c, onLine(c), 1 / 3);
  const s = await state(page), thirds = await Promise.all([[0], [1], [2]].map((a) => index(page, a)));
  expect(changed(s, start)).toBe(6);
  expect(s.every((v, i) => v === start[i] || thirds.includes(Math.floor(i / 3))), "only the thirds' corners").toBe(true);
  expect(await info(page)).toMatchObject({ moves: 1, solved: false });
  await dragRound(page, c, onLine(c), -1 / 3);
  expect(changed(await state(page), start)).toBe(0);
});

test("a third's outer circle turns it, its three corners; a drag off every circle turns nothing", async ({ page }) => {
  const start = await state(page), c = await circle(page, 1, 1), top = await index(page, [0]);
  await dragRound(page, c, onLine(c, 2.2), 1 / 3);
  const s = await state(page);
  expect(changed(s, start)).toBe(3);
  expect(s.every((v, i) => v === start[i] || Math.floor(i / 3) === top)).toBe(true);
  await turn(page, [1, 1, -1]);
  const mid = await circle(page, 0, 0);
  await dragRound(page, mid, { x: mid.x + 6, y: mid.y + 6 }, 1 / 3);
  expect(changed(await state(page), start)).toBe(0);
  expect((await info(page)).moves).toBe(2);
});

test("zooming is the camera: in on the top third four times, into the whole again, exactly where it started; no moves; and back out", async ({ page }) => {
  const start = await picture(page);
  for (let k = 0; k < 4; k++) await zoom(page, 0, 1);
  expect(await info(page)).toMatchObject({ camera: "0000", moves: 0, solved: true });
  expect(await picture(page)).toBe(start);
  await zoom(page, 0, -1);
  expect((await info(page)).camera).toBe("000");
});

test("zooming out from the top: to the far corner's smallest triangle, which holds the whole there; and back in is where it started", async ({ page }) => {
  const start = await picture(page);
  await zoom(page, 2, -1);
  expect((await info(page)).camera).toBe("222");
  expect(await picture(page)).not.toBe(start);
  await zoom(page, 2, 1);
  expect(await picture(page)).toBe(start);
});

test("a zoom never turns the camera: in on a corner holding a piece turned, and out again, it only scales; the view keeps facing that way", async ({ page }) => {
  // (the top third turned: its corners all hold pieces turned a third)
  await turn(page, [1, 1, 1]);
  await idle(page);
  const zoomTurn = async (c, q) => { await page.click(`.sier-zoom-btn[data-c="${c}"][data-q="${q}"]`); return page.evaluate(() => window.cutwist.sierZoomTurn()); };
  expect(await zoomTurn(0, 1)).toBeLessThan(1e-6);
  expect(await zoomTurn(0, 1)).toBeLessThan(1e-6);
  expect((await info(page)).camera).toBe("00");
  expect(await zoomTurn(0, -1)).toBeLessThan(1e-6);
  expect(await zoomTurn(0, -1)).toBeLessThan(1e-6);
  expect((await info(page)).camera).toBe("");
});

test("the solved card shows the piece the view does, solved: zoomed in on red, red; back out, the whole", async ({ page }) => {
  await open(page, "?puzzle=sierpinski&levels=2");
  const card = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(document.getElementById("refPlane").toDataURL()))));
  const whole = await card();
  await zoom(page, 0, 1);
  const red = await card();
  expect(red).not.toBe(whole);
  // (red solved holds the whole at its top: zoomed in again, the whole)
  await zoom(page, 0, 1);
  expect(await card()).toBe(whole);
  await zoom(page, 0, -1);
  expect(await card()).toBe(red);
  // (and a scramble doesn't change it: it's the piece solved)
  await turn(page, [0, 0, 1]);
  await idle(page);
  expect(await card()).toBe(red);
});

test("a tap on a dot zooms in on that triangle; turning there turns the puzzle", async ({ page }) => {
  const start = await state(page), d = await page.evaluate(() => window.cutwist.sierDot([1]));
  await fire(page, "pointerdown", d); await fire(page, "pointerup", d);
  await idle(page);
  expect(await info(page)).toMatchObject({ camera: "1", moves: 0 });
  // (the view's own inner circle: the bottom left third's ring)
  const c = await circle(page, 2, 0);
  await dragRound(page, c, onLine(c), 1 / 3);
  expect(changed(await state(page), start)).toBe(6);
  expect((await info(page)).moves).toBe(1);
});

test("on 2 levels: in on a third twice is the whole again; in on the top third then its bottom left is the bottom left third", async ({ page }) => {
  await open(page, "?puzzle=sierpinski&levels=2");
  const start = await picture(page);
  await zoom(page, 1, 1);
  const left = await picture(page);
  await zoom(page, 1, -1);
  await zoom(page, 0, 1);
  await zoom(page, 1, 1);
  expect(await info(page)).toMatchObject({ camera: "01", moves: 0 });
  expect(await picture(page)).toBe(left);
  await zoom(page, 1, 1);
  expect(await picture(page)).toBe(start);
  // (and out from the top: to the bottom right third, whose bottom right corner is the whole)
  await open(page, "?puzzle=sierpinski&levels=2");
  await zoom(page, 2, -1);
  expect((await info(page)).camera).toBe("2");
});

test("on 2 levels: after the whole's ring some rings aren't moves (a piece in their corners twice, or themselves), and show no inner circle", async ({ page }) => {
  await open(page, "?puzzle=sierpinski&levels=2");
  await turn(page, [0, 0, 1]);
  await idle(page);
  const s = await info(page);
  expect(s.rings).toBeLessThan(4);
  await picture(page); // (a frame drawn since)
  const drawn = await Promise.all([0, 1, 2, 3].map((h) => circle(page, h, 0)));
  expect(drawn.filter(Boolean).length).toBeLessThan(4);
  await turn(page, [0, 0, -1]);
  await idle(page);
  expect(await info(page)).toMatchObject({ rings: 4, solved: true });
});

test("scramble, then reset; textures; an algorithm lights what it moves", async ({ page }) => {
  await page.click("#scramble");
  await expect.poll(async () => (await info(page)).status, { timeout: 15_000 }).toContain("scrambled");
  expect((await info(page)).solved).toBe(false);
  await page.click("#reset");
  await idle(page);
  expect((await info(page)).solved).toBe(true);
  await page.click("#textures");
  expect((await info(page)).textures).toBe(true);
  await page.click(".nx-rec");
  await turn(page, [0, 0, 1], [1, 1, 1]);
  await page.click(".nx-rec");
  await page.locator('.nx-alg [data-act="play"]').first().hover();
  await expect.poll(() => page.evaluate(() => window.cutwist.lit()?.length ?? 0)).toBeGreaterThan(0);
});

test("on a phone: the triangle and its zoom marks fit, under the title and over the tape", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "?puzzle=sierpinski");
  const tape = await page.locator("#nx-tape").boundingBox(), name = await page.locator(".nx-pick").boundingBox();
  const top = await page.evaluate(() => window.cutwist.sierPoint(0, Math.sqrt(3) / 2)), left = await page.evaluate(() => window.cutwist.sierPoint(-0.5, 0));
  expect(top.y).toBeGreaterThan(name.y + name.height);
  expect(left.y).toBeLessThan(tape.y);
  for (const c of [0, 1, 2]) for (const q of [1, -1]) {
    const b = await page.locator(`.sier-zoom-btn[data-c="${c}"][data-q="${q}"]`).boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(375);
    expect(b.y + b.height).toBeLessThan(tape.y);
  }
});
