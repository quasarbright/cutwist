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
