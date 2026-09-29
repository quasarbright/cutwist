// The one suite that turns the puzzle with real input: mouse clicks on the axis stubs,
// sticker drags, dragging the view, and the keyboard. Everything else drives turns through
// the test hook. The hook is only used here to find where things are on screen.
import { test, expect } from "@playwright/test";
import { open, info, finish, noErrors } from "./helpers.mjs";

// keep points the page itself would receive: not under the panel, buttons or the reference
const onCanvas = (page, pts) => page.evaluate((pts) => pts.filter((p) => document.elementFromPoint(p.x, p.y)?.id === "c"), pts);
const segments = async (page) => onCanvas(page, await page.evaluate(() => window.cutwist.segments()));
const stickers = async (page) => onCanvas(page, await page.evaluate(() => window.cutwist.stickers()));
const state = (page) => page.evaluate(() => window.cutwist.state);

// the state the same turn gives when made through the hook, from solved
async function stateAfter(page, axis, layer, q) {
  return page.evaluate(({ axis, layer, q }) => {
    const c = window.cutwist;
    document.getElementById("reset").click();
    c.turn(axis, layer, q); c.finish();
    return c.state;
  }, { axis, layer, q });
}

let errors;
test.beforeEach(async ({ page }) => {
  errors = await open(page);
  await page.click("#panel .panel-title").catch(() => {}); // collapse the panel if it opened
});
test.afterEach(async () => { await noErrors(errors); });

test("left-clicking an axis stub turns that layer clockwise as seen from that end", async ({ page }) => {
  const [seg] = await segments(page);
  expect(seg, "a stub segment in view").toBeTruthy();
  await page.mouse.click(seg.x, seg.y);
  await finish(page);
  expect((await info(page)).moves).toBe(1);
  const clicked = await state(page);
  const s = await stateAfter(page, seg.axis, seg.layer, seg.end > 0 ? -1 : 1);
  expect(clicked).toEqual(s);
});

test("right-clicking an axis stub turns it counterclockwise", async ({ page }) => {
  const [seg] = await segments(page);
  await page.mouse.click(seg.x, seg.y, { button: "right" });
  await finish(page);
  const clicked = await state(page);
  const s = await stateAfter(page, seg.axis, seg.layer, seg.end > 0 ? 1 : -1);
  expect(clicked).toEqual(s);
});

test("with the axes hidden, clicking where a stub was doesn't turn anything", async ({ page }) => {
  const [seg] = await segments(page);
  await page.click("#axes");
  await page.mouse.click(seg.x, seg.y);
  await finish(page);
  expect((await info(page)).moves).toBe(0);
});

test("dragging a sticker turns a layer with that piece in it", async ({ page }) => {
  const all = await stickers(page);
  expect(all.length).toBeGreaterThan(5);
  // the sticker nearest the middle of the screen
  const vp = page.viewportSize();
  const st = all.sort((a, b) => Math.hypot(a.x - vp.width / 2, a.y - vp.height / 2) - Math.hypot(b.x - vp.width / 2, b.y - vp.height / 2))[0];
  const s0 = await state(page);
  await page.mouse.move(st.x, st.y);
  await page.mouse.down();
  await page.mouse.move(st.x + 140, st.y + 10, { steps: 12 });
  await page.mouse.up();
  await finish(page);
  const s = await info(page);
  expect(s.moves).toBe(1);
  expect(s.solved).toBe(false);
  expect((await state(page))[st.piece], "the dragged piece moved").not.toBe(s0[st.piece]);
});

test("a drag that comes back to where it started snaps back without a turn", async ({ page }) => {
  const [st] = await stickers(page);
  await page.mouse.move(st.x, st.y);
  await page.mouse.down();
  await page.mouse.move(st.x + 60, st.y, { steps: 6 });
  await page.mouse.move(st.x + 2, st.y, { steps: 6 });
  await page.mouse.up();
  await finish(page);
  const s = await info(page);
  expect(s.moves).toBe(0);
  expect(s.solved).toBe(true);
});

test("dragging empty space rotates the view and doesn't turn anything", async ({ page }) => {
  const v0 = await page.evaluate(() => window.cutwist.view());
  await page.mouse.move(80, 400);
  await page.mouse.down();
  await page.mouse.move(200, 430, { steps: 10 });
  await page.mouse.up();
  const v1 = await page.evaluate(() => window.cutwist.view());
  expect(v1).not.toEqual(v0);
  const s = await info(page);
  expect(s.moves).toBe(0);
  expect(s.solved).toBe(true);
});

test("ctrl+z undoes a turn and ctrl+shift+z redoes it", async ({ page }) => {
  const [seg] = await segments(page);
  await page.mouse.click(seg.x, seg.y);
  await finish(page);
  const turned = await state(page);
  await page.keyboard.press("Control+z");
  await finish(page);
  expect((await info(page)).solved).toBe(true);
  await page.keyboard.press("Control+Shift+z");
  await finish(page);
  expect(await state(page)).toEqual(turned);
});

test("the mouse wheel zooms without turning anything", async ({ page }) => {
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, 400);
  await page.mouse.wheel(0, -800);
  expect((await info(page)).moves).toBe(0);
});

// ---- planar puzzles: arrows and drags on the 2D canvas ----
const onPlane = (page, pts) => page.evaluate((pts) => pts.filter((p) => document.elementFromPoint(p.x, p.y)?.id === "plane"), pts);
const loadGrid = (page, params) => page.evaluate((params) => window.cutwist.load("planar", { params }), params);
async function slideState(page, axis, layer, q) {
  return page.evaluate(({ axis, layer, q }) => {
    const c = window.cutwist;
    document.getElementById("reset").click();
    c.turn(axis, layer, q); c.finish();
    return c.state;
  }, { axis, layer, q });
}

test("planar: clicking a row's right arrow slides it one cell right", async ({ page }) => {
  await loadGrid(page, { topology: "torus" });
  const arrows = await onPlane(page, await page.evaluate(() => window.cutwist.arrows()));
  const right = arrows.find((a) => a.axis === 0 && a.layer === 1 && a.q === 1);
  expect(right, "row 1's right arrow in view").toBeTruthy();
  await page.mouse.click(right.x, right.y);
  await finish(page);
  expect((await info(page)).moves).toBe(1);
  const clicked = await state(page);
  expect(clicked).toEqual(await slideState(page, 0, 1, 1));
});

test("planar: dragging a cell two cells down slides its column by two, in one move", async ({ page }) => {
  await loadGrid(page, { topology: "klein" });
  const a = await page.evaluate(() => window.cutwist.cellCenter(1, 1));
  const b = await page.evaluate(() => window.cutwist.cellCenter(1, 3));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x + 4, b.y + 6, { steps: 12 });
  await page.mouse.up();
  await finish(page);
  expect((await info(page)).moves).toBe(1);
  const dragged = await state(page);
  expect(dragged).toEqual(await slideState(page, 1, 1, 2));
});

test("planar: a short drag snaps back without a move", async ({ page }) => {
  await loadGrid(page, { topology: "torus" });
  const a = await page.evaluate(() => window.cutwist.cellCenter(2, 2));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 15, a.y, { steps: 4 });
  await page.mouse.up();
  await finish(page);
  const s = await info(page);
  expect(s.moves).toBe(0);
  expect(s.solved).toBe(true);
});

test("planar: with the axes button off, the arrows are gone", async ({ page }) => {
  await loadGrid(page, { topology: "torus" });
  const [arrow] = await onPlane(page, await page.evaluate(() => window.cutwist.arrows()));
  await page.click("#axes");
  await page.mouse.click(arrow.x, arrow.y);
  await finish(page);
  expect((await info(page)).moves).toBe(0);
});

// ---- planar puzzles: the 3D surface ----
// a visible cell whose given spots (fractions across it) are all visible, or null
async function visibleCell(page, spots) {
  return page.evaluate((spots) => {
    const c = window.cutwist, { width, height } = c.info();
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const pts = spots.map(([fx, fy]) => c.surfacePoint(x, y, fx, fy));
        if (pts.every((p) => p && document.elementFromPoint(p.x, p.y)?.id === "c")) return { x, y, pts };
      }
    return null;
  }, spots);
}

test("3D surface: clicking near a cell's right edge slides its row one cell right", async ({ page }) => {
  await loadGrid(page, { topology: "torus" });
  const found = await visibleCell(page, [[0.9, 0.5]]);
  expect(found, "a cell with its right edge in view").toBeTruthy();
  await page.mouse.click(found.pts[0].x, found.pts[0].y);
  await finish(page);
  expect((await info(page)).moves).toBe(1);
  const clicked = await state(page);
  expect(clicked).toEqual(await slideState(page, 0, found.y, 1));
});

test("3D surface: clicking near a cell's top edge slides its column up; the middle does nothing", async ({ page }) => {
  await loadGrid(page, { topology: "klein" });
  const mid = await visibleCell(page, [[0.5, 0.5]]);
  await page.mouse.click(mid.pts[0].x, mid.pts[0].y);
  await finish(page);
  expect((await info(page)).moves).toBe(0);
  const found = await visibleCell(page, [[0.5, 0.1]]);
  await page.mouse.click(found.pts[0].x, found.pts[0].y);
  await finish(page);
  const clicked = await state(page);
  expect(clicked).toEqual(await slideState(page, 1, found.x, -1));
});

test("3D surface: dragging a cell along its row slides the row", async ({ page }) => {
  await loadGrid(page, { topology: "torus" });
  // from a cell's middle to one cell over along its row (both in view)
  const found = await page.evaluate(() => {
    const c = window.cutwist;
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 4; x++) {
        const a = c.surfacePoint(x, y), b = c.surfacePoint(x + 1, y);
        if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 25) return { x, y, a, b };
      }
    return null;
  });
  expect(found, "two neighbors along a row in view").toBeTruthy();
  const { a, b } = found;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await finish(page);
  expect((await info(page)).moves).toBe(1);
  const dragged = await state(page);
  expect(dragged).toEqual(await slideState(page, 0, found.y, 1));
});

test("3D surface: dragging empty space turns the view without sliding anything", async ({ page }) => {
  await loadGrid(page, { topology: "rp2" });
  const v0 = await page.evaluate(() => window.cutwist.view());
  const vw = page.viewportSize().width;
  await page.mouse.move(vw - 60, 420);
  await page.mouse.down();
  await page.mouse.move(vw - 180, 460, { steps: 10 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.cutwist.view())).not.toEqual(v0);
  expect((await info(page)).moves).toBe(0);
});
