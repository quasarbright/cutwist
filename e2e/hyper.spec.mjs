// The hyperbolic tile puzzles (M N-gons at a corner, wrapped onto a closed surface, drawn in the
// Poincaré disk): loading from the shelf, the sides / at-a-corner / size controls, turns through
// the test hook, and real pointer input on the disk (tap a tile's middle, drag a circle, slide).
import { test, expect } from "@playwright/test";
import { open, info, turn, noErrors, pick } from "./helpers.mjs";

// (each test builds a surface or several, which takes a few times longer under the full parallel run)
test.describe.configure({ timeout: 60_000 });

let errors;
test.beforeEach(async ({ page }) => { errors = await open(page); });
test.afterEach(async () => { await noErrors(errors); });

const settled = (page) => page.evaluate(() => window.cutwist.settled());
const fire = (page, type, p) => page.evaluate(({ type, p }) => document.getElementById("plane").dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: p.x, clientY: p.y, pointerId: 7, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 })), { type, p });

test("the Klein quartic opens from the shelf: 24 heptagons, a piece per tile, edge and corner, no 3D view", async ({ page }) => {
  await pick(page, "hyper-klein");
  const s = await settled(page);
  expect(s).toMatchObject({ hyper: true, N: 7, M: 3, tiles: 24, genus: 3, pieces: 164, kinds: { 1: 24, 2: 84, 3: 56 }, solved: true });
  expect(s.sizes.slice(0, 5)).toEqual([24, 72, 156, 156, 156]);
  await expect(page.locator("#plane")).toBeVisible();
  await expect(page.locator("#c")).toBeHidden();
  await expect(page.locator(".nx-empty")).toHaveText("drag a circle · tap a tile's middle · drag elsewhere to slide");
});

test("a link opens it straight away, with its numbers", async ({ page }) => {
  await open(page, "?puzzle=hyper-octagons&N=8&M=3&surface=1");
  const s = await settled(page);
  expect(s).toMatchObject({ N: 8, M: 3, tiles: 12 });
});

test("turns: a heptagon's turn seven times is no change; a scramble undoes", async ({ page }) => {
  await pick(page, "hyper-klein");
  await settled(page);
  await turn(page, [0, 0, 1]);
  expect((await info(page)).solved).toBe(false);
  await turn(page, ...Array(6).fill([0, 0, 1]));
  expect((await info(page)).solved).toBe(true);
  await page.click("text=scramble");
  await page.evaluate(() => window.cutwist.finish());
  expect((await info(page)).solved).toBe(false);
});

test("tapping a tile's middle turns it; dragging a circle turns it by as much as dragged", async ({ page }) => {
  await pick(page, "hyper-klein");
  await settled(page);
  const mid = await page.evaluate(() => window.cutwist.hyperMiddle(0));
  await fire(page, "pointerdown", mid); await fire(page, "pointerup", mid);
  await page.evaluate(() => window.cutwist.finish());
  let s = await info(page);
  expect(s).toMatchObject({ moves: 1, solved: false });
  // (drag a seventh of the way round the next circle and a bit: one step)
  const at = (k) => page.evaluate(({ k }) => window.cutwist.hyperCircle(3, k), { k });
  await fire(page, "pointerdown", await at(0));
  for (let i = 1; i <= 12; i++) await fire(page, "pointermove", await at(((i / 12) * 2 * Math.PI * 1.1) / 7));
  await fire(page, "pointerup", await at((2 * Math.PI * 1.1) / 7));
  await page.evaluate(() => window.cutwist.finish());
  s = await info(page);
  expect(s.moves).toBe(2);
});

// (a tap turned only a tile's circle, as the flat tilings' does every kind's)
test("tapping a corner's or an edge's middle turns its circle", async ({ page }) => {
  const design = { rule: "hyper", N: 7, M: 3, surface: 0, cuts: [{ on: "face", depths: [0.714] }, { on: "vertex", depths: [0.6] }, { on: "edge", depths: [0.4] }], blackout: [] };
  await open(page, `?puzzle=custom&design=${Buffer.from(JSON.stringify(design)).toString("base64url")}`);
  const s0 = await settled(page);
  for (const kind of ["vertex", "edge"]) {
    const axis = s0.axes.findIndex((a) => a.kind === kind), mid = await page.evaluate((a) => window.cutwist.hyperMiddle(a), axis);
    const before = (await info(page)).moves;
    await fire(page, "pointerdown", mid); await fire(page, "pointerup", mid);
    await page.evaluate(() => window.cutwist.finish());
    expect((await info(page)).moves, kind).toBe(before + 1);
  }
});

test("dragging away from the circles slides the plane, and turns nothing", async ({ page }) => {
  await pick(page, "hyper-klein");
  await settled(page);
  expect((await info(page)).panned).toBe(false);
  // (a spot inside the middle tile's circle, off every line and off the tile's middle: where the
  // pointer shows it'll slide)
  let from = null;
  for (const r of [0.3, 0.35, 0.4, 0.45, 0.5, 0.25]) {
    const p = await page.evaluate((r) => window.cutwist.hyperCircle(0, 1, 0, r), r);
    await page.mouse.move(p.x, p.y);
    if ((await page.evaluate(() => document.getElementById("plane").style.cursor)) === "move") { from = p; break; }
  }
  expect(from).not.toBeNull();
  await fire(page, "pointerdown", from);
  for (let i = 1; i <= 8; i++) await fire(page, "pointermove", { x: from.x + 8 * i, y: from.y });
  await fire(page, "pointerup", { x: from.x + 64, y: from.y });
  const s = await info(page);
  expect(s).toMatchObject({ panned: true, moves: 0, solved: true });
});

test("customize: the circles' rulers (no solid, no truncation), a corner circle, a share link back, blacking out", async ({ page }) => {
  // (on the 6 octagons: a corner circle on the Klein quartic makes 668 pieces, slow to build and
  // reload under a loaded run)
  await pick(page, "hyper-octagons");
  await settled(page);
  await page.click("#customize");
  let s = await settled(page);
  expect(s).toMatchObject({ id: "custom", hyper: true, pieces: 46 });
  await expect(page.locator("#bSolid")).toBeHidden();
  await expect(page.locator("#bTrim")).toBeHidden();
  await expect(page.locator("#bStats")).toContainText("46 pieces");
  // (+ cut on the corners' ruler: more pieces, and the corners turn in thirds)
  await page.locator("#bSets button", { hasText: "+ cut" }).nth(1).click();
  s = await settled(page);
  expect(s.pieces).toBeGreaterThan(46);
  expect(s.axes.some((a) => a.kind === "vertex" && a.order === 3)).toBe(true);
  // (the share link opens the same design)
  const link = await page.evaluate(() => window.cutwist.shareLink());
  const pieces = s.pieces;
  // (the page's routes and listeners are already set up: just go there)
  await page.goto(`/index.html${new URL(link).search}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.cutwist);
  s = await settled(page);
  expect(s).toMatchObject({ id: "custom", hyper: true, pieces });
  // (blacking out: a click on a piece blacks out its kind; the puzzle's still solved)
  await page.click("#bPaint");
  const mid = await page.evaluate(() => window.cutwist.hyperMiddle(0));
  await page.mouse.click(mid.x, mid.y);
  s = await info(page);
  expect(s.solved).toBe(true);
  expect(await page.evaluate(() => JSON.parse(atob(new URLSearchParams(location.search).get("design").replace(/-/g, "+").replace(/_/g, "/"))).blackout.length)).toBe(1);
});

test("nudging a cut redraws it, even when the pieces count stays the same", async ({ page }) => {
  await pick(page, "hyper-klein");
  await settled(page);
  await page.click("#customize");
  await settled(page);
  await page.mouse.move(5, 5);
  // (the disk's picture, a frame or two after a change)
  const picture = async () => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.evaluate(() => document.getElementById("plane").toDataURL());
  };
  await page.locator(".tw-handle").first().focus();
  const before = await picture(), n = (await info(page)).pieces;
  await page.keyboard.press("ArrowRight");
  expect((await info(page)).pieces).toBe(n);
  expect(await picture()).not.toBe(before);
});

test("sides and tiles at a corner: the other one follows to a hyperbolic tiling; the size menu lists its surfaces", async ({ page }) => {
  await pick(page, "hyper-klein");
  await settled(page);
  await page.locator("#paramControls .control").nth(0).locator("button").nth(1).click(); // (sides +1: 8)
  let s = await settled(page);
  expect(s).toMatchObject({ N: 8, M: 3, tiles: 6 });
  await page.locator("#paramControls select").selectOption("1");
  s = await settled(page);
  expect(s.tiles).toBe(12);
  // (down to 6 sides: 3 at a corner is flat, so the corners go up to 4)
  await page.locator("#paramControls .control").nth(0).locator("button").nth(0).click();
  await page.locator("#paramControls .control").nth(0).locator("button").nth(0).click();
  s = await settled(page);
  expect(s).toMatchObject({ N: 6, M: 4 });
});

// (the marks were worked out when the link was read, before the puzzle was built, so a design
// opened from a link, or reloaded, had none till a cut was removed and added again)
test("a design opened from a link has its rulers' snap marks", async ({ page }) => {
  const design = { rule: "hyper", N: 9, M: 9, surface: 0, cuts: [{ on: "face", depths: [1.2] }, { on: "vertex", depths: [] }, { on: "edge", depths: [] }], blackout: [] };
  await open(page, `?puzzle=custom&design=${Buffer.from(JSON.stringify(design)).toString("base64url")}`);
  await settled(page);
  await page.locator(".tw-handle").first().focus();
  await expect.poll(() => page.locator(".tw-marks span:not(.tw-zero)").count(), { timeout: 15000 }).toBeGreaterThan(0);
});

// (remove showed only on the ruler of the selected handle; now on every ruler with a cut, taking
// the selected one there or else the deepest: for circles the biggest)
test("each ruler's remove takes its deepest circle when none of its own is selected", async ({ page }) => {
  await pick(page, "hyper-octagons");
  await settled(page);
  await page.click("#customize");
  await settled(page);
  // (two tile circles, then a corner circle, which is selected)
  await page.locator(".tw-rblock").filter({ hasText: "faces" }).locator("button", { hasText: "+ cut" }).click();
  await settled(page);
  await page.locator(".tw-rblock").filter({ hasText: "corners" }).locator("button", { hasText: "+ cut" }).click();
  await settled(page);
  const faces = () => page.evaluate(() => JSON.parse(atob(new URLSearchParams(location.search).get("design").replace(/-/g, "+").replace(/_/g, "/"))).cuts.find((c) => c.on === "face").depths);
  const before = await faces();
  expect(before.length).toBe(2);
  await page.locator(".tw-rblock").filter({ hasText: "faces" }).locator("button", { hasText: "remove" }).click();
  await settled(page);
  expect(await faces()).toEqual([Math.min(...before)]);
});

// (the rulers were laid out when the link was read, before the surface's puzzle was built, so a
// handle sat against the wrong range, and grabbing it jumped it to where the right one put it)
test("a design from a link: its handle is where its value is, and a grab doesn't move it", async ({ page }) => {
  const design = { rule: "hyper", N: 9, M: 4, surface: 0, cuts: [{ on: "face", depths: [] }, { on: "vertex", depths: [1.2725492333018065] }, { on: "edge", depths: [] }], blackout: [] };
  await open(page, `?puzzle=custom&design=${Buffer.from(JSON.stringify(design)).toString("base64url")}`);
  await settled(page);
  const value = () => page.evaluate(() => JSON.parse(atob(new URLSearchParams(location.search).get("design").replace(/-/g, "+").replace(/_/g, "/"))).cuts.find((c) => c.on === "vertex").depths[0]);
  const before = await value();
  // (the cut ruler, not the corners' truncation one, which a hyperbolic design hides)
  const handle = page.locator(".tw-rblock").filter({ hasText: "corners" }).filter({ hasText: "+ cut" }).locator(".tw-handle").first();
  const box = await handle.boundingBox(), x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x + 1, box.y + box.height / 2);
  // (the handle stays under the pointer, at the value it had)
  const now = await handle.boundingBox();
  expect(Math.abs(now.x + now.width / 2 - (x + 1))).toBeLessThan(4);
  await page.mouse.up();
  await settled(page);
  expect(Math.abs((await value()) - before)).toBeLessThan(0.05);
});

// (with no circles there are no pieces, and nothing works out tile 0's cuts: drawing it threw)
test("a design with no circles draws: just the tiles", async ({ page }) => {
  const design = { rule: "hyper", N: 12, M: 3, surface: 0, cuts: [{ on: "face", depths: [] }, { on: "vertex", depths: [] }, { on: "edge", depths: [] }], blackout: [] };
  await open(page, `?puzzle=custom&design=${Buffer.from(JSON.stringify(design)).toString("base64url")}`);
  const s = await settled(page);
  expect(s).toMatchObject({ N: 12, M: 3, pieces: 0 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
});

// A turn drawn partway, stopped at a whole number of steps, is the puzzle after that many steps:
// the same picture (but for the edges of lines). Drawn with the page's own view, on a canvas of
// its own, half way round and one step. (Big circles on the 12-gons, 4 of them: turned, the
// pieces from a circle's far side, near the rim, come to its near side, and they were missing,
// drawn only from the tiles showing before the turn: a hole in the turning circle.)
test("a turn stopped at whole steps looks like the puzzle after those steps: nothing missing", async ({ page }) => {
  test.setTimeout(120_000); // (sixteen full drawings, in software in the test browser: slow under a loaded run)
  const S = 320; // (the canvas, px)
  const cases = await page.evaluate(async (S) => {
    const h = await import("./hyper.mjs"), { HyperView } = await import("./hyper-view.mjs");
    // (a design and the circles to turn: two of the 12-gons' four, and a tile's and a corner's of
    // the Klein quartic's; the rest are the same by symmetry)
    const designs = [
      [{ rule: "hyper", N: 12, M: 3, surface: 0, cuts: [{ on: "face", depths: [1.895747403967124] }], blackout: [] }, ["face", "face"]],
      [{ rule: "hyper", N: 7, M: 3, surface: 0, cuts: [{ on: "face", depths: [0.714] }, { on: "vertex", depths: [0.6] }], blackout: [] }, ["face", "vertex"]],
    ];
    const out = [];
    for (const [spec, kinds] of designs) {
      const file = await (await fetch(`regular-maps/${spec.N}-${spec.M}.json`)).json(), P = h.buildHyper(spec, file);
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = S;
      canvas.style.width = canvas.style.height = S + "px"; document.body.append(canvas);
      const view = new HyperView(canvas), picture = (state, turn) => {
        view.layout(P, { left: 0, top: 0, right: S, bottom: S }); view.cache = null; view.lines = null;
        view.draw(state, turn, {});
        return view.ctx.getImageData(0, 0, S, S).data;
      };
      const axes = kinds.map((kind, j) => P.axes.map((ax, i) => [ax, i]).filter(([ax]) => ax.kind === kind)[kinds.slice(0, j).filter((k) => k === kind).length]);
      for (const [ax, axis] of axes) for (const q of [Math.floor(ax.order / 2), 1]) {
        const s0 = h.solvedHyperState(P), pieces = h.hyperPiecesInLayer(P, s0, axis, 0), s1 = s0.slice();
        h.applyHyperMove(P, s1, { axis, layer: 0, q });
        const during = picture(s0, { pieces, theta: (2 * Math.PI * q) / ax.order, axis, layer: 0 }), after = picture(s1, null);
        // (pixels that differ, then only those whose every neighbor within 2 px differs too: a line
        // drawn a hair apart is thinner than that, a missing piece isn't)
        const off = new Uint8Array(S * S);
        for (let p = 0, i = 0; p < off.length; p++, i += 4) off[p] = Math.abs(during[i] - after[i]) + Math.abs(during[i + 1] - after[i + 1]) + Math.abs(during[i + 2] - after[i + 2]) > 90 ? 1 : 0;
        let differ = 0;
        for (let y = 2; y < S - 2; y++) for (let x = 2; x < S - 2; x++) {
          let all = true;
          for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2 && all; dx++) all = off[(y + dy) * S + x + dx] === 1;
          if (all) differ++;
        }
        out.push({ design: `{${spec.N},${spec.M}} axis ${axis} (${ax.kind}) q ${q}`, differ });
      }
      canvas.remove();
    }
    return out;
  }, S);
  for (const c of cases) expect(c.differ, c.design).toBeLessThan(10);
});
