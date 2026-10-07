// Adds each two-sided surface's circle limits to regular-maps/*.json: caps { face, vertex, edge },
// how big a circle around a tile, corner or edge can be before it reaches its own copy around the
// surface (hyper.mjs's radiusCaps). Finding one is a search outward through the tiles, up to
// most of a second on a big surface, so it's done here once rather than when a surface is opened.
// Run: node data/add-caps.mjs (build-regular-maps.mjs runs it at the end too)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { surfaceCaps } from "../hyper.mjs";

export const CAPS_HOW = " Two-sided surfaces also have caps: how big a circle around a tile, corner or edge's middle can be (hyperbolic radius) before it reaches its own copy around the surface.";

export function addCaps(dir = new URL("../regular-maps/", import.meta.url)) {
  let count = 0;
  for (const f of readdirSync(dir).filter((f) => /^\d+-\d+\.json$/.test(f))) {
    const file = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    for (const s of file.surfaces) if (s.orientable) { s.caps = surfaceCaps(file, s); count++; }
    if (!file.how.includes(CAPS_HOW)) file.how += CAPS_HOW;
    writeFileSync(new URL(f, dir), JSON.stringify(file));
  }
  return count;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t = performance.now(), n = addCaps();
  console.log(`caps for ${n} surfaces in ${((performance.now() - t) / 1000).toFixed(1)} s`);
}
