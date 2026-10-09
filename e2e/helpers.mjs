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
  page.on("pageerror", (e) => errors.push(e.message));
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
  if (await page.locator(".nx-pop").isHidden()) await page.click(".nx-viewbtn");
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
