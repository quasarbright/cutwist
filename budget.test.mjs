// The piece limits: every kind of puzzle stops building once it's past its limit, and far sooner
// than building it would take; under the limit, or with none, it builds as before.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PIECE_LIMITS, TooManyPieces } from "./budget.mjs";
import { buildPuzzle } from "./puzzle.mjs";
import { buildSphere } from "./sphere.mjs";
import { buildTiles } from "./tiles.mjs";
import { buildHyper } from "./hyper.mjs";

const f73 = JSON.parse(fs.readFileSync(new URL("./regular-maps/7-3.json", import.meta.url)));
// (each kind: a design past its limit, and one under it)
const KINDS = {
  solid: (n) => buildPuzzle({ rule: "custom", solid: "dodecahedron", truncate: {}, cuts: [{ on: "face", depths: [0.45, 0.75] }, { on: "vertex", depths: [0.6125, n] }], blackout: [] }, 2, { limit: PIECE_LIMITS.solid }),
  sphere: (n) => buildSphere({ N: 5, M: 3, truncate: {}, cuts: [{ on: "face", depths: [0.375, 0.525, 0.675, 0.825].slice(0, n) }, { on: "vertex", depths: [0.35, 0.45, 0.55] }], blackout: [] }, { limit: PIECE_LIMITS.sphere }),
  tiles: (n) => buildTiles({ rule: "tiles", tiling: "hex", a: n, b: 0, truncate: {}, cuts: [{ on: "face", depths: [0.85, 0.6, 0.4] }, { on: "vertex", depths: [0.5, 0.3] }], blackout: [] }, { limit: PIECE_LIMITS.tiles }),
  hyper: (n) => buildHyper({ rule: "hyper", N: 7, M: 3, surface: n, truncate: {}, cuts: [{ on: "face", depths: [0.4583, 0.575, 0.6917] }], blackout: [] }, f73, { limit: PIECE_LIMITS.hyper }),
};
const OVER = { solid: 0.8, sphere: 4, tiles: 6, hyper: 2 }, UNDER = { solid: 0.97, sphere: 3, tiles: 4, hyper: 0 };

const NAMES = { solid: "solid", sphere: "ball", tiles: "torus", hyper: "hyperbolic surface" };
for (const [kind, build] of Object.entries(KINDS)) test(`a ${NAMES[kind]} past its limit stops building; under it, it builds`, () => {
  assert.throws(() => build(OVER[kind]), (e) => e instanceof TooManyPieces && e.limit === PIECE_LIMITS[kind] && e.count > e.limit);
  const P = build(UNDER[kind]);
  assert.ok(P.pieces.length > 1 && P.pieces.length <= PIECE_LIMITS[kind], `${P.pieces.length} pieces`);
});

// (a design of 37,000 pieces, built whole, takes 6 s)
test("a solid stops as soon as it's past: a design of 37,000 pieces turned down with not much more than the limit cut", () => {
  const spec = { rule: "custom", solid: "dodecahedron", truncate: {}, cuts: [{ on: "face", depths: [0.36, 0.48, 0.6, 0.72, 0.84] }, { on: "vertex", depths: [0.545, 0.635, 0.725, 0.815, 0.905] }], blackout: [] };
  assert.throws(() => buildPuzzle(spec, 2, { limit: PIECE_LIMITS.solid }), (e) => e instanceof TooManyPieces && e.count < 2 * PIECE_LIMITS.solid);
});
