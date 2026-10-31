// Sliding squares on a hyperbolic surface (hslide.mjs, hslide-view.mjs): the shelf, a real drag and a
// pan, the steppers, the look menu's labels in the link, and a phone.
import { test, expect } from "@playwright/test";
import { open, info, turn, finish, noErrors, pick, openView } from "./helpers.mjs";

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page); });
test.afterEach(async () => { await noErrors(errors); });

const settled = (page) => page.evaluate(() => window.cutwist.settled());
const middle = async (page) => { const r = await page.locator("#plane").boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const row = (page, label) => page.locator("#paramControls .control").filter({ has: page.locator(".name", { hasText: new RegExp(`^${label}$`) }) });

test("it opens from the shelf: 30 squares, 5 at a corner, solved, flat, with a look menu but no textures", async ({ page }) => {
  await pick(page, "sliding-hyperbolic");
  const s = await settled(page);
  expect(s).toMatchObject({ hslide: true, title: "30 squares, 5 at a corner", M: 5, surface: 0, squares: 30, rows: 10, rowLength: 6, solved: true, labels: true, picture: false });
  expect(s.sizes).toEqual([30, 40, 80, 90, 150, 180, 330, 330]);
  await expect(page.locator("#plane")).toBeVisible();
  await expect(page.locator("#c")).toBeHidden();
  await expect(page.locator("#textures")).toBeHidden();
  await openView(page);
  await expect(page.locator("#planarControls")).toBeVisible();
  await expect(page.locator("#planarViews")).toBeHidden();
  await expect(page.locator("#texturesRow")).toBeHidden();
  await expect(page.locator(".nx-empty")).toHaveText("drag a square along its row · right-drag to move the view");
});

test("dragging the middle square sideways slides its row by the squares dragged, in one move", async ({ page }) => {
  await page.goto("/index.html?puzzle=sliding-hyperbolic");
  await page.waitForFunction(() => !!window.cutwist);
  await settled(page);
  const c = await middle(page);
  const rows = await page.evaluate(({ x, y }) => window.cutwist.hslideRowsAt(x, y), c);
  expect(rows).toHaveLength(2);
  const across = rows.reduce((a, r) => (Math.abs(r.dir[0]) > Math.abs(a.dir[0]) ? r : a));
  const k = 2.1 * across.step;
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + across.dir[0] * k, c.y + across.dir[1] * k, { steps: 14 });
  await page.mouse.up();
  await finish(page);
  const after = await info(page);
  expect(after.moves).toBe(1);
  const dragged = await page.evaluate(() => window.cutwist.state);
  // (the same slide through the hook, from solved)
  await page.click("#reset");
  await turn(page, [across.axis, 0, 2]);
  expect(await page.evaluate(() => window.cutwist.state)).toEqual(dragged);
});

test("a right-drag moves the view, not the puzzle; a slide back undoes it", async ({ page }) => {
  await page.goto("/index.html?puzzle=sliding-hyperbolic");
  await page.waitForFunction(() => !!window.cutwist);
  await settled(page);
  const c = await middle(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(c.x + 90, c.y + 40, { steps: 10 });
  await page.mouse.up({ button: "right" });
  expect(await info(page)).toMatchObject({ panned: true, moves: 0, solved: true });
  await turn(page, [3, 0, 2]);
  expect((await info(page)).solved).toBe(false);
  await turn(page, [3, 0, -2]);
  expect((await info(page)).solved).toBe(true);
});

test("two fingers move the view (the second ends the first one's slide, with no move)", async ({ page }) => {
  await page.goto("/index.html?puzzle=sliding-hyperbolic");
  await page.waitForFunction(() => !!window.cutwist);
  await settled(page);
  const c = await middle(page);
  await page.evaluate(({ x, y }) => {
    const plane = document.getElementById("plane"), ev = (type, id, px, py) => plane.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: px, clientY: py, bubbles: true, isPrimary: id === 1, button: 0, buttons: 1 }));
    ev("pointerdown", 1, x, y);
    ev("pointermove", 1, x + 30, y);
    ev("pointerdown", 2, x + 60, y + 40);
    for (let k = 1; k <= 8; k++) { ev("pointermove", 1, x + 30 + 8 * k, y + 5 * k); ev("pointermove", 2, x + 60 + 8 * k, y + 40 + 5 * k); }
    ev("pointerup", 2, x + 124, y + 80);
    ev("pointerup", 1, x + 94, y + 40);
  }, c);
  await finish(page);
  expect(await info(page)).toMatchObject({ panned: true, moves: 0, solved: true });
});

test("the steppers: squares at a corner (from 5), and the size menu's surfaces", async ({ page }) => {
  await pick(page, "sliding-hyperbolic");
  await settled(page);
  await expect(row(page, "at a corner").getByRole("button", { name: "−" })).toBeDisabled();
  await row(page, "at a corner").getByRole("button", { name: "+" }).click();
  let s = await settled(page);
  expect(s).toMatchObject({ M: 6, surface: 0, squares: 6, solved: true });
  await row(page, "size").locator("select").selectOption("4");
  s = await settled(page);
  expect(s).toMatchObject({ M: 6, surface: 4, squares: s.sizes[4] });
  expect(new URL(page.url()).searchParams.get("M")).toBe("6");
  // (scrambled, then a slide undone, then reset back to solved)
  await page.click("#scramble");
  await finish(page);
  expect((await info(page)).solved).toBe(false);
  await turn(page, [1, 0, 1]);
  await page.click("#undo");
  await finish(page);
  expect((await info(page)).moves).toBe(0);
  await page.click("#reset");
  expect((await info(page)).solved).toBe(true);
});

test("labels off goes in the link, and a link with labels off opens without them", async ({ page }) => {
  await pick(page, "sliding-hyperbolic");
  await settled(page);
  await openView(page);
  await page.locator("#labels").uncheck();
  expect(new URL(page.url()).searchParams.get("labels")).toBe("off");
  const url = new URL(page.url());
  await page.goto(`/index.html${url.search}`);
  await page.waitForFunction(() => !!window.cutwist);
  expect((await settled(page)).labels).toBe(false);
});

test("on a phone: the disk fills the width, with the look menu under view", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/index.html?puzzle=sliding-hyperbolic");
  await page.waitForFunction(() => !!window.cutwist);
  await settled(page);
  const r = await page.locator("#plane").boundingBox();
  expect(r.width).toBeGreaterThan(300);
  await expect(page.locator("#view")).toBeVisible();
});
