// The round tile puzzles ({N,M} with 1/N + 1/M > 1/2: a ball, sphere.mjs): the Beach Ball from the
// shelf, the sides / at-a-corner steppers going between balls, tori and hyperbolic surfaces, a
// real sticker drag, and the editor's {N,M} choice beside the solids.
import { test, expect } from "@playwright/test";
import { open, info, turn, finish, noErrors, pick } from "./helpers.mjs";

test.describe.configure({ timeout: 60_000 });

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page, "?rear=off"); });
test.afterEach(async () => { await noErrors(errors); });

const settled = (page) => page.evaluate(() => window.cutwist.settled());
const onCanvas = (page, pts) => page.evaluate((pts) => pts.filter((p) => document.elementFromPoint(p.x, p.y)?.id === "c"), pts);
const stepper = (page, label, dir) => page.click(`button[title="one ${dir === 1 ? "more" : "fewer"} (${label})"]`);

test("the Beach Ball opens from the shelf: six wedges, a circle round each, in 3D", async ({ page }) => {
  await pick(page, "ball-beach");
  const s = await settled(page);
  expect(s).toMatchObject({ sphere: true, N: 2, M: 6, tiles: 6, pieces: 13, kinds: { 1: 6, 2: 6, 6: 1 }, solved: true });
  expect(s.axes.every((a) => a.order === 2)).toBe(true);
  await expect(page.locator("#c")).toBeVisible();
  await expect(page.locator(".nx-pick")).toContainText("Beach Ball");
});

test("dragging a sticker on the ball turns a layer; a scramble undoes", async ({ page }) => {
  await open(page, "?puzzle=hyper-klein&N=4&M=3&rear=off");
  expect(await settled(page)).toMatchObject({ sphere: true, pieces: 26, kinds: { 1: 6, 2: 12, 3: 8 } });
  const moves = await page.evaluate(() => window.cutwist.scramble());
  await finish(page);
  expect((await info(page)).solved).toBe(false);
  await turn(page, ...(await page.evaluate((m) => window.cutwist.invert(m), moves)).map((m) => [m.axis, m.layer, m.q]));
  await finish(page);
  expect((await info(page)).solved).toBe(true);
  await open(page, "?puzzle=hyper-klein&N=4&M=3&rear=off");
  await settled(page);
  const all = await onCanvas(page, await page.evaluate(() => window.cutwist.stickers()));
  expect(all.length).toBeGreaterThan(5);
  const vp = page.viewportSize();
  const st = all.sort((a, b) => Math.hypot(a.x - vp.width / 2, a.y - vp.height / 2) - Math.hypot(b.x - vp.width / 2, b.y - vp.height / 2))[0];
  await page.mouse.move(st.x, st.y);
  await page.mouse.down();
  await page.mouse.move(st.x + 140, st.y + 10, { steps: 12 });
  await page.mouse.up();
  await finish(page);
  expect(await info(page)).toMatchObject({ moves: 1, solved: false });
});

test("the steppers go wherever {N,M} is: a torus, a ball, a hyperbolic surface", async ({ page }) => {
  await open(page, "?puzzle=tiles-hex&rear=off");
  expect((await info(page)).tiling).toBe("hex");
  await stepper(page, "sides", -1); // {5,3}: the dodecahedron's ball
  expect(await settled(page)).toMatchObject({ sphere: true, N: 5, M: 3, tiles: 12 });
  await expect(page.locator(".nx-pick")).toContainText("{5,3} Tiling");
  await stepper(page, "at a corner", 1); // {5,4}: hyperbolic
  expect(await settled(page)).toMatchObject({ hyper: true, N: 5, M: 4 });
  await stepper(page, "sides", -1); // {4,4}: the square torus
  await expect.poll(async () => (await info(page)).tiling).toBe("square");
  await stepper(page, "at a corner", -1); // {4,3}: the cube's ball
  expect(await settled(page)).toMatchObject({ sphere: true, N: 4, M: 3 });
  await stepper(page, "sides", -1); await stepper(page, "sides", -1); // {2,3}: a beach ball of three wedges
  expect(await settled(page)).toMatchObject({ sphere: true, N: 2, M: 3, tiles: 3 });
  await expect(page.locator('button[title="one fewer (sides)"]')).toBeDisabled();
});

test("customizing: a solid design turns into an {N,M} one and back, and the link keeps it", async ({ page }) => {
  await open(page, "?puzzle=cube&rear=off");
  await page.click("#customize");
  await page.locator("#bSolid button", { hasText: "{N,M}" }).click();
  expect(await settled(page)).toMatchObject({ id: "custom", sphere: true, N: 4, M: 3, pieces: 26 });
  await page.locator("#bSets .tw-rblock", { hasText: "corners" }).getByRole("button", { name: "+ cut" }).click();
  await expect.poll(async () => (await info(page)).pieces).toBeGreaterThan(26);
  const pieces = (await info(page)).pieces, link = await page.evaluate(() => window.cutwist.shareLink());
  await open(page, link.slice(link.indexOf("?")) + "&rear=off");
  expect(await settled(page)).toMatchObject({ id: "custom", sphere: true, N: 4, M: 3, pieces });
  await page.locator("#bSolid button", { hasText: "octa" }).click();
  await expect.poll(async () => (await info(page)).sphere).toBeFalsy();
  expect((await info(page)).faces).toBe(8);
});

test("on a phone, the ball fits and turns", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "?puzzle=ball-beach");
  await settled(page);
  const box = await page.locator("#c").boundingBox();
  expect(box.width).toBeLessThanOrEqual(375);
  await turn(page, [0, 0, 1]);
  await finish(page);
  expect((await info(page)).solved).toBe(false);
});
