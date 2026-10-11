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
  // (a piece round each wedge's middle, one where neighbors' circles overlap, and the caps at both
  // poles past all of them: one piece, joined through the ball's inside)
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

test("dragging a circle on the ball turns its ring after the pointer, snapping to whole steps; tapping a middle turns it a step", async ({ page }) => {
  await open(page, "?puzzle=hyper-klein&N=4&M=3&rear=off");
  await settled(page);
  // (the hook's turn of the same ring, from solved, to compare with)
  const after = (axis, layer, q) => page.evaluate(({ axis, layer, q }) => { const c = window.cutwist; document.getElementById("reset").click(); c.turn(axis, layer, q); c.finish(); const s = c.state; document.getElementById("reset").click(); c.finish(); return s; }, { axis, layer, q });
  const ccw = await after(1, 2, 1), cw = await after(1, 2, -1);
  // (axis 1 is up; its circle 1 bounds the top ring: from a quarter of the way round it, a bit
  // past another quarter, counterclockwise as seen from above)
  const at = (t) => page.evaluate((t) => window.cutwist.ballCircle(1, 1, t), t);
  const start = await at((3 * Math.PI) / 4);
  expect(start.front).toBe(true);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) { const p = await at((3 * Math.PI) / 4 + (k / 12) * (Math.PI / 2 + 0.15)); await page.mouse.move(p.x, p.y); }
  await page.mouse.up();
  await finish(page);
  expect(await info(page)).toMatchObject({ moves: 1, solved: false });
  expect(await page.evaluate(() => window.cutwist.state)).toEqual(ccw);
  // a tap on the top's middle: a step clockwise, as seen from there
  await page.click("#reset");
  await finish(page);
  const m = await page.evaluate(() => window.cutwist.ballMiddle(1, 1));
  await page.mouse.click(m.x, m.y);
  await finish(page);
  expect(await page.evaluate(() => window.cutwist.state)).toEqual(cw);
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

test("customizing: a solid design turns into an arbitrary tiling's and back, and the link keeps it", async ({ page }) => {
  await open(page, "?puzzle=cube&rear=off");
  await page.click("#customize");
  await page.locator("#bSolid button", { hasText: "arbitrary" }).click();
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

test("the editor has the tiling's steppers too: a cube design's are {4,3}, and stepping one makes it a tiling", async ({ page }) => {
  await open(page, "?puzzle=cube&rear=off");
  await page.click("#customize");
  const panel = (label) => page.locator("#bNM .control").filter({ has: page.locator(".name", { hasText: new RegExp(`^${label}$`) }) });
  await expect(panel("sides").locator("input")).toHaveValue("4");
  await expect(panel("at a corner").locator("input")).toHaveValue("3");
  await panel("at a corner").getByRole("button", { name: "+" }).click(); // {4,4}: the square torus
  await expect.poll(async () => (await info(page)).tiling).toBe("square");
  await panel("sides").getByRole("button", { name: "−" }).click(); // {3,4}: the octahedron's ball
  expect(await settled(page)).toMatchObject({ sphere: true, N: 3, M: 4, tiles: 8 });
});

test("truncating a ball's corners: a face round each, the same pieces; and a hyperbolic one's", async ({ page }) => {
  await open(page, "?puzzle=hyper-klein&N=4&M=3&rear=off");
  await settled(page);
  await page.click("#customize");
  const before = await info(page);
  await page.locator("#bTrim .tw-rblock", { hasText: "corners" }).getByRole("button", { name: "+ truncate" }).click();
  await expect.poll(async () => (await info(page)).faces).toBe(before.faces + 8);
  expect((await info(page)).pieces).toBe(before.pieces);
  const link = await page.evaluate(() => window.cutwist.shareLink());
  expect(JSON.parse(Buffer.from(new URL(link).searchParams.get("design"), "base64url").toString()).truncate.vertex).toBeGreaterThan(0);
  await page.locator("#bNM .control", { hasText: "at a corner" }).getByRole("button", { name: "+" }).click(); // {4,4}: a torus, still truncated
  await page.locator("#bNM .control", { hasText: "at a corner" }).getByRole("button", { name: "+" }).click(); // {4,5}: hyperbolic
  expect(await settled(page)).toMatchObject({ hyper: true, N: 4, M: 5 });
  const d = JSON.parse(Buffer.from(new URL(await page.evaluate(() => window.cutwist.shareLink())).searchParams.get("design"), "base64url").toString());
  expect(d.truncate.vertex).toBeGreaterThan(0);
  const moves = await page.evaluate(() => window.cutwist.scramble());
  await finish(page);
  expect((await info(page)).solved).toBe(false);
  await turn(page, ...(await page.evaluate((m) => window.cutwist.invert(m), moves)).map((m) => [m.axis, m.layer, m.q]));
  expect((await info(page)).solved).toBe(true);
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
