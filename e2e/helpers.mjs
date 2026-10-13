// Shared setup for the browser tests: open the page (optionally with a query string), fail
// the test on any page error, and wait for the test hook (window.cutwist, see index.html).
import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// The page loads three.js and the shared library from the network. Fetch each once into a
// disk cache (so runs after the first work offline and a slow CDN can't stall a test), and
// skip web fonts, which only change how text looks.
const CACHE = join(import.meta.dirname, "..", "node_modules", ".cache", "cutwist-e2e");
mkdirSync(CACHE, { recursive: true });
async function serveFromCache(route) {
  const url = route.request().url();
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return route.abort();
  const file = join(CACHE, createHash("sha1").update(url).digest("hex"));
  if (existsSync(file)) {
    const { status, headers, body } = JSON.parse(readFileSync(file, "utf8"));
    return route.fulfill({ status, headers, body: Buffer.from(body, "base64") });
  }
  const res = await route.fetch();
  const body = await res.body();
  const headers = { "content-type": res.headers()["content-type"] || "application/octet-stream", "access-control-allow-origin": "*" };
  if (res.ok()) writeFileSync(file, JSON.stringify({ status: res.status(), headers, body: body.toString("base64") }));
  return route.fulfill({ status: res.status(), headers, body });
}

export async function open(page, query = "") {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message + (process.env.STACKS ? "\n" + e.stack : "")));
  page.on("console", (m) => { if (m.type() === "error" && !/net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.route((url) => url.hostname !== "localhost", serveFromCache);
  await page.goto(`/index.html${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.cutwist);
  return errors;
}

// pick a puzzle by preset id from the shelf (the gallery under the puzzle's name)
export async function pick(page, id) {
  await page.click(".nx-pick");
  await page.click(`.nx-card[data-id="${id}"]`);
}

// open the view dropdown (a sliding puzzle's views and look; on a phone, the toggles too)
export async function openView(page) {
  if (await page.locator("#viewPop").isHidden()) await page.click(".nx-viewbtn");
}

// the 3D view on (it's off by default), as its checkbox in the view dropdown does
export async function show3D(page) {
  await page.evaluate(() => { const box = document.getElementById("view3D"); box.checked = true; box.dispatchEvent(new Event("change")); });
  await settleLayout(page);
}
// (until the views have taken their places: the 3D canvas the same size two checks running)
export async function settleLayout(page) {
  let last = "";
  for (let k = 0; k < 40; k++) {
    const now = await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = document.getElementById("c").getBoundingClientRect(), p = document.getElementById("plane")?.getBoundingClientRect();
      done(JSON.stringify([r.x, r.width, p?.x, p?.width]));
    }))));
    if (now === last) return;
    last = now;
    await page.waitForTimeout(50);
  }
}

// the page's state (see cutwist.info in index.html)
export const info = (page) => page.evaluate(() => window.cutwist.info());

// make turns through the hook and finish their animations
export async function turn(page, ...moves) {
  await page.evaluate((moves) => {
    for (const [axis, layer, q] of moves) window.cutwist.turn(axis, layer, q);
    window.cutwist.finish();
  }, moves);
}

export const finish = (page) => page.evaluate(() => window.cutwist.finish());

export async function noErrors(errors) {
  expect(errors, errors.join("\n")).toEqual([]);
}

// ---- customizing (issue #22): the tools act on the puzzle ----
export const editTool = (page, tool) => page.click(`.ed-tool[data-tool="${tool}"]`);
// a solid (or tiling) from the name's menu
export async function editShape(page, name) {
  if (await page.locator("#edMenu").isHidden()) await page.click(".nx-pick");
  await page.locator("#bSolid").getByRole("radio", { name }).click();
}
// the dots showing for the tool, as the page has them (see cutwist.editSites)
export const editSites = (page) => page.evaluate(() => window.cutwist.editSites());
// a click on a dot of the set named label (the one nearest the middle of the screen): a new cut
// round every place like it (with the truncate tool, a truncation)
export async function editDot(page, label, tool = "cut") {
  await editTool(page, tool);
  const vp = page.viewportSize(), sites = (await editSites(page)).filter((s) => s.label === label);
  if (!sites.length) throw new Error(`no ${label} dots showing`);
  const s = sites.sort((a, b) => Math.hypot(a.x - vp.width / 2, a.y - vp.height / 2) - Math.hypot(b.x - vp.width / 2, b.y - vp.height / 2))[0];
  await page.mouse.click(s.x, s.y);
}
// a point a cut's line runs through (cut i of ruler r, round its place nearest the middle): the
// one nearest that place (clear of other places' lines crossing it); and the point on its line at
// depth v nearest p
export async function cutPoint(page, r, i, v, near = null) {
  const { site, lines } = await page.evaluate(({ r, i, v }) => window.cutwist.editCurve(r, i, v ?? undefined), { r, i, v });
  // (the middles of the lines' pieces: a line's ends are on the solid's edges, maybe its outline)
  const pts = lines.flatMap((l) => l.slice(1).map((q, k) => [(q[0] + l[k][0]) / 2, (q[1] + l[k][1]) / 2])), at = near || site;
  if (!pts.length) throw new Error(`cut ${r}:${i} isn't showing`);
  pts.sort((a, b) => Math.hypot(a[0] - at.x, a[1] - at.y) - Math.hypot(b[0] - at.x, b[1] - at.y));
  if (near) return { x: pts[0][0], y: pts[0][1] };
  // (one a press there takes, at whole pixels too, as some browsers round the pointer: not a hair
  // from the puzzle's outline)
  for (const [x, y] of pts.slice(0, 40)) {
    const hits = await page.evaluate((ps) => ps.map(([x, y]) => window.cutwist.editHit(x, y)), [[x, y], [Math.round(x), Math.round(y)], [Math.floor(x), Math.floor(y)]]);
    if (hits.every((h) => h && h.r === r && !h.dot)) return { x, y };
  }
  return { x: pts[0][0], y: pts[0][1] };
}
// drag cut i of ruler r by hand from its line to where depth v would put it (where lines cross,
// whichever the press took: the target is worked out for the one held)
export async function dragCut(page, r, i, v, steps = 12) {
  const from = await cutPoint(page, r, i, null);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const lines = await page.evaluate((v) => window.cutwist.editHeldCurve(v), v);
  const pts = lines.flatMap((l) => l.slice(1).map((q, k) => [(q[0] + l[k][0]) / 2, (q[1] + l[k][1]) / 2]));
  if (!pts.length) { await page.mouse.up(); throw new Error(`cut ${r}:${i} at ${v} isn't showing`); }
  // (the nearest that's on the puzzle at whole pixels too, as some browsers round the pointer: not
  // right on its outline)
  pts.sort((a, b) => Math.hypot(a[0] - from.x, a[1] - from.y) - Math.hypot(b[0] - from.x, b[1] - from.y));
  const on = await page.evaluate((ps) => ps.map(([x, y]) => !!window.cutwist.editProbe(Math.round(x), Math.round(y)) && !!window.cutwist.editProbe(Math.floor(x), Math.floor(y))), pts.slice(0, 60));
  const [x, y] = pts[Math.max(0, on.indexOf(true))];
  await page.mouse.move(x, y, { steps });
  await page.mouse.up();
}
export const rulers = (page) => page.evaluate(() => window.cutwist.editRulers());
