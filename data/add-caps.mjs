// Adds each two-sided surface's circle limits to regular-maps/*.json: caps { face, vertex, edge },
// how big a circle around a tile, corner or edge can be before it reaches its own copy around the
// surface (hyper.mjs's radiusCaps). Finding one is a search outward through the tiles, up to
// most of a second on a big surface, so it's done here once rather than when a surface is opened.
// Also writes the index's tilings as the surfaces the puzzles use (two-sided, more than one tile),
// so the page knows which tilings have any without fetching each.
// Run: node data/add-caps.mjs (build-regular-maps.mjs runs it at the end too);
//      node data/add-caps.mjs --index (just the index)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { surfaceCaps, isPuzzleSurface } from "../hyper.mjs";

export const CAPS_HOW = " Two-sided surfaces also have caps: how big a circle around a tile, corner or edge's middle can be (hyperbolic radius) before it reaches its own copy around the surface.";
const files = (dir) => readdirSync(dir).filter((f) => /^\d+-\d+\.json$/.test(f));

export function addCaps(dir = new URL("../regular-maps/", import.meta.url)) {
  let count = 0;
  for (const f of files(dir)) {
    const file = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    for (const s of file.surfaces) if (s.orientable) { s.caps = surfaceCaps(file, s); count++; }
    if (!file.how.includes(CAPS_HOW)) file.how += CAPS_HOW;
    writeFileSync(new URL(f, dir), JSON.stringify(file));
  }
  writeIndex(dir);
  return count;
}

// index.json's tilings: "N,M" → the tile counts of the surfaces the puzzles use, fewest first
// (tilings with none left out)
export function writeIndex(dir = new URL("../regular-maps/", import.meta.url)) {
  const index = JSON.parse(readFileSync(new URL("index.json", dir), "utf8")), tilings = {};
  for (const f of files(dir)) {
    const file = JSON.parse(readFileSync(new URL(f, dir), "utf8")), sizes = file.surfaces.filter(isPuzzleSurface).map((s) => s.tiles);
    if (sizes.length) tilings[`${file.N},${file.M}`] = sizes;
  }
  index.tilings = tilings;
  index.how = "tilings: for each N,M with surfaces for a puzzle (two-sided, more than one tile), their tile counts, fewest first.";
  writeFileSync(new URL("index.json", dir), JSON.stringify(index));
  return Object.keys(tilings).length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--index")) console.log(`index: ${writeIndex()} tilings`);
  else { const t = performance.now(), n = addCaps(); console.log(`caps for ${n} surfaces in ${((performance.now() - t) / 1000).toFixed(1)} s`); }
}
