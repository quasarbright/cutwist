// Unit tests for the hyperbolic tile puzzles (hyper.mjs), on surfaces from regular-maps/.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HYPER_PRESETS, buildHyper, solvedHyperState, applyHyperMove, inverseHyperMove, isHyperSolved, hyperScrambleMoves, hyperPiecesInLayer, mobius, hdist, geometry } from "./hyper.mjs";
import { faceHas, inPolygon } from "./tiles.mjs";

const file = (N, M) => JSON.parse(readFileSync(new URL(`./regular-maps/${N}-${M}.json`, import.meta.url), "utf8"));
const preset = (id, more = {}) => { const p = HYPER_PRESETS.find((q) => q.id === id); return buildHyper({ ...p, ...more }, file(p.N, p.M)); };
function seeded(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const kinds = (P) => P.pieces.reduce((k, pc) => ({ ...k, [pc.kind]: (k[pc.kind] || 0) + 1 }), {});
const play = (P, moves, s = solvedHyperState(P)) => { for (const m of moves) applyHyperMove(P, s, m); return s; };

test("the Klein quartic, face turning: 24 heptagons, a piece for every tile, edge and corner", () => {
  const P = preset("hyper-klein");
  assert.equal(P.tiles, 24);
  assert.equal(P.H.n, 168);
  assert.deepEqual(kinds(P), { 1: 24, 2: 84, 3: 56 }); // (24 tiles, 84 edges, 56 corners)
});

test("a tiny surface: 6 octagons, each meeting a neighbor along two edges, still a piece per edge and corner", () => {
  const P = preset("hyper-octagons");
  assert.equal(P.tiles, 6);
  assert.deepEqual(kinds(P), { 1: 6, 2: 24, 3: 16 });
});

test("a turn's order is no change: a heptagon in sevenths, a corner in thirds, an edge in halves", () => {
  const P = preset("hyper-klein", { cuts: [{ on: "face", depths: [0.714] }, { on: "vertex", depths: [0.5] }, { on: "edge", depths: [0.4] }] });
  for (const kind of ["face", "vertex", "edge"]) {
    const axis = P.axes.findIndex((a) => a.kind === kind), n = P.axes[axis].order;
    const s = play(P, [{ axis, layer: 0, q: 1 }]);
    assert.equal(isHyperSolved(P, s), false, kind);
    play(P, Array(n - 1).fill({ axis, layer: 0, q: 1 }), s);
    assert.ok(s.every((v) => v === 0), kind);
  }
});

test("scrambles undo exactly, on every preset", () => {
  for (const p of HYPER_PRESETS) {
    const P = preset(p.id), moves = hyperScrambleMoves(P, 120, seeded(3)), s = play(P, moves);
    assert.equal(isHyperSolved(P, s), false, p.id);
    play(P, moves.slice().reverse().map((m) => inverseHyperMove(P, m)), s);
    assert.ok(s.every((v) => v === 0), p.id);
  }
});

test("turns of tiles that don't touch commute; neighbors' don't", () => {
  const P = preset("hyper-klein"), once = (x, y) => play(P, [x, y]).join();
  const a = { axis: 0, layer: 0, q: 1 };
  // (axis 0's neighbors share pieces with it; one that shares none commutes)
  const s0 = solvedHyperState(P), mine = new Set(hyperPiecesInLayer(P, s0, 0, 0).keys());
  const apart = P.axes.findIndex((_, i) => i > 0 && [...hyperPiecesInLayer(P, s0, i, 0).keys()].every((j) => !mine.has(j)));
  const touching = P.axes.findIndex((_, i) => i > 0 && [...hyperPiecesInLayer(P, s0, i, 0).keys()].some((j) => mine.has(j)));
  assert.ok(apart > 0 && touching > 0);
  assert.equal(once(a, { axis: apart, layer: 0, q: 1 }), once({ axis: apart, layer: 0, q: 1 }, a));
  assert.notEqual(once(a, { axis: touching, layer: 0, q: 1 }), once({ axis: touching, layer: 0, q: 1 }, a));
});

test("rings: circles around one tile at two radii make a disk and a ring that turn apart", () => {
  const P = preset("hyper-klein", { cuts: [{ on: "face", depths: [0.35, 0.714] }] }), s0 = solvedHyperState(P);
  const disk = hyperPiecesInLayer(P, s0, 0, 0), ring = hyperPiecesInLayer(P, s0, 0, 1);
  assert.ok(disk.size >= 1 && ring.size > disk.size && [...disk.keys()].every((i) => !ring.has(i)));
  const s = play(P, [{ axis: 0, layer: 1, q: 1 }]);
  for (const i of disk.keys()) assert.equal(s[i], 0);
});

// Every point of the surface inside some circle is in exactly one piece, with a sticker for the
// tile under it; a point outside every circle is in none. (A spot in two pieces, or none, is a color
// drawn where it isn't.) Points: random spots of tile 0, carried onto random tiles of the surface.
function checkCover(P, rand, count = 300) {
  const { H, G } = P;
  for (let t = 0; t < count; t++) {
    // (a random point of tile 0, by its corners' fan)
    const k = Math.floor(rand() * G.N), u = rand(), v = rand() * (1 - u), a = G.corners[k], b = G.corners[(k + 1) % G.N];
    const z = [u * a[0] + v * b[0], u * a[1] + v * b[1]];
    if (!inPolygon(G.poly, z)) continue;
    if (P.circles.some((c) => Math.abs(Math.hypot(z[0] - c.c[0], z[1] - c.c[1]) - c.r) < 1e-6)) continue; // (on an edge)
    const covered = P.circles.some((c) => Math.hypot(z[0] - c.c[0], z[1] - c.c[1]) < c.r);
    const h = H.coset.face.reps[Math.floor(rand() * P.tiles)];
    const hits = P.pieces.filter((pc) => (P.nearBy.get(H.mul(H.inv[pc.home], h)) || []).some((m) => faceHas(P.regions[pc.region].face, mobius.apply(m, z))));
    assert.equal(hits.length, covered ? 1 : 0, `point ${z} on tile ${H.coset.face.of[h]}: in ${hits.length} pieces`);
    if (hits.length) assert.ok(hits[0].faces.includes(H.coset.face.of[h]), "no sticker for the tile there");
  }
}

test("no color drawn where it isn't: every covered spot of the surface in exactly one piece", () => {
  const rand = seeded(7);
  for (const p of HYPER_PRESETS) checkCover(preset(p.id), rand);
  checkCover(preset("hyper-klein", { cuts: [{ on: "face", depths: [0.714] }, { on: "vertex", depths: [0.6] }, { on: "edge", depths: [0.4] }] }), rand);
  checkCover(preset("hyper-octagons", { cuts: [{ on: "face", depths: [0.5, 1.2] }, { on: "vertex", depths: [0.7] }] }), rand);
});

test("a circle stops short of its own copy: the cap is under half the way to it", () => {
  const P = preset("hyper-octagons"), { G } = P;
  // (the nearest copy of tile 0's middle, found the slow way)
  assert.ok(P.cap.face > 0.5 && P.cap.face < 2 && P.cap.face > geometry(8, 3).Rv);
  assert.ok(2 * P.cap.face < hdist([0, 0], mobius.apply(mobius.about(G.corners[0], Math.PI), [0, 0])) * 2);
  // circles past the cap are dropped, not left to overlap themselves
  const Q = preset("hyper-octagons", { cuts: [{ on: "face", depths: [5] }] });
  assert.equal(Q.axes.length, 0);
});
