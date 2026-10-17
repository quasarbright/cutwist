// Snap marks, across the kinds of puzzle: every depth or radius on a ruler where the pieces
// count changes has a mark. Each ruler is scanned in small steps; wherever the count changes
// between two steps, a mark must lie between them. (Marks have gone missing more than once: the
// geometry behind them missing a kind of meeting, or the page checking only some of them.)
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPuzzle, snapDepths, CUT_RANGE } from "./puzzle.mjs";
import { buildTiles, tileSnapCandidates, TILE_CUT_RANGE, tileRadiusCap, TILE_PRESETS } from "./tiles.mjs";
import { buildHyper, hyperSnapCandidates, hyperCountBreaks, hyperPieceCountAt, hyperRadiusLimit } from "./hyper.mjs";
import { pool, isMainThread } from "./workers.mjs";

const STEPS = 150;
// a ruler from lo to hi: count(v) the pieces (−1: can't be built there), marks its marks; the
// changes with no mark between them
function unmarked(count, marks, lo, hi) {
  const w = (hi - lo) / STEPS, missing = [];
  let prev = count(lo);
  for (let k = 1; k <= STEPS; k++) {
    const v = lo + w * k, n = count(v);
    if (n !== prev && n >= 0 && prev >= 0 && !marks.some((m) => m >= v - w - 1e-6 && m <= v + 1e-6)) missing.push(`${(v - w).toFixed(4)}–${v.toFixed(4)}: ${prev} → ${n} pieces`);
    prev = n;
  }
  return missing;
}

const DESIGNS = {
  solids: [
    ["cube", [{ on: "vertex", depths: [0.3] }], 0],
    ["cube", [{ on: "edge", depths: [0.5] }], 0],
    ["cube", [{ on: "face", depths: [0.3] }, { on: "vertex", depths: [0.6] }], 1],
    ["octahedron", [{ on: "face", depths: [0.3] }], 0],
    ["dodecahedron", [{ on: "face", depths: [0.6] }], 0],
    ["icosahedron", [{ on: "vertex", depths: [0.8] }], 0],
  ],
  tiles: [
    ["hex", 3, 0, [{ on: "face", depths: [0.6] }], "face"],
    ["square", 3, 0, [{ on: "face", depths: [0.6] }], "face"],
    ["triangle", 3, 0, [{ on: "face", depths: [0.5] }], "face"],
    ["hex", 2, 0, [{ on: "face", depths: [0.6] }, { on: "vertex", depths: [0.3] }], "vertex"],
    ["square", 3, 1, [{ on: "face", depths: [0.6] }, { on: "edge", depths: [0.3] }], "edge"],
    ["hex", 3, 0, [{ on: "face", depths: [0.4, 0.8] }], "face"],
  ],
  hyper: [
    [7, 3, 0, [{ on: "face", depths: [0.7] }], "face"],
    [8, 3, 0, [{ on: "face", depths: [0.9] }, { on: "vertex", depths: [0.4] }], "vertex"],
    [8, 3, 0, [{ on: "face", depths: [0.9] }, { on: "edge", depths: [0.3] }], "edge"],
    [5, 4, 0, [{ on: "face", depths: [0.9] }], "face"],
    [9, 9, 0, [{ on: "face", depths: [1.2] }], "face"],
    [12, 3, 0, [{ on: "face", depths: [1.2] }], "face"],
  ],
};
const file = (N, M) => JSON.parse(readFileSync(new URL(`./regular-maps/${N}-${M}.json`, import.meta.url), "utf8"));
// One design's ruler scanned (in a worker, a design each, side by side): { label, missing }
export function scan([family, i]) {
  if (family === "solids") {
    const [solid, cuts, s] = DESIGNS.solids[i], spec = { name: "x", rule: "custom", size: 2, solid, cuts, truncate: {}, blackout: [] };
    const count = (v) => buildPuzzle({ ...spec, cuts: cuts.map((set, si) => (si === s ? { ...set, depths: set.depths.map((d, j) => (j === 0 ? v : d)) } : set)) }).pieces.length;
    return { label: `${solid} ${cuts.map((c) => `${c.on} ${c.depths}`).join(", ")}: ${cuts[s].on}`, missing: unmarked(count, snapDepths(spec, { s, i: 0 }), CUT_RANGE[0], CUT_RANGE[1]) };
  }
  if (family === "tiles") {
    const [tiling, a, b, cuts, kind] = DESIGNS.tiles[i], base = { ...TILE_PRESETS.find((p) => p.tiling === tiling), a, b, cuts, truncate: {}, blackout: [] };
    const count = (v) => { try { return buildTiles({ ...base, cuts: cuts.map((set) => (set.on === kind ? { ...set, depths: set.depths.map((d, j) => (j === 0 ? v : d)) } : set)) }).pieces.length; } catch { return -1; } };
    const top = Math.min(TILE_CUT_RANGE[1], tileRadiusCap(base)) - 1e-3;
    return { label: `${tiling} ${a},${b} ${cuts.map((c) => `${c.on} ${c.depths}`).join(", ")}: ${kind}`, missing: unmarked(count, tileSnapCandidates(base, { kind, i: 0 }), TILE_CUT_RANGE[0], top) };
  }
  // (the page's marks: the geometry's, then every change of the count it finds, see hyperCountBreaks)
  const [N, M, s, cuts, kind] = DESIGNS.hyper[i];
  const P = buildHyper({ rule: "hyper", N, M, surface: s, cuts, blackout: [] }, file(N, M)), hi = hyperRadiusLimit(P, kind, 0), geometry = hyperSnapCandidates(P, kind, 0);
  const marks = [...geometry, ...[...hyperCountBreaks(P, kind, 0, 0.05, hi, geometry)].filter((v) => v.at !== undefined).map((v) => v.at)];
  return { label: `{${N},${M}} #${s} ${cuts.map((c) => `${c.on} ${c.depths}`).join(", ")}: ${kind}`, missing: unmarked((r) => hyperPieceCountAt(P, kind, 0, r), marks, 0.05, hi) };
}

if (isMainThread) {
  // (every design at once: the tori's and hyperbolic surfaces' first, the slowest)
  const families = ["tiles", "hyper", "solids"], scans = Object.fromEntries(families.map((f) => [f, []]));
  const cases = families.flatMap((f) => DESIGNS[f].map((_, i) => [f, i]));
  pool(import.meta.url, "scan", cases).forEach((p, k) => scans[cases[k][0]].push(p));
  const each = async (family) => { for (const { label, missing } of await Promise.all(scans[family])) assert.deepEqual(missing, [], `${label}: changes with no mark`); };
  test("solids: a mark at every change in the pieces count, along every cut's ruler", () => each("solids"));
  test("flat tiles: a mark at every change in the pieces count, along every circle's ruler", () => each("tiles"));
  test("hyperbolic: a mark at every change in the pieces count, along every circle's ruler", () => each("hyper"));
}
