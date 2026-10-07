// Unit tests for the hyperbolic tile puzzles (hyper.mjs), on surfaces from regular-maps/.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HYPER_PRESETS, buildHyper, solvedHyperState, applyHyperMove, inverseHyperMove, isHyperSolved, hyperScrambleMoves, hyperPiecesInLayer, mobius, hdist, geometry, hyperCircleCount, hyperSurfaces, surfaceCaps, fragmentCount } from "./hyper.mjs";
import { faceHas, inPolygon } from "./tiles.mjs";
import { fragmentShapes } from "./hyper-view.mjs";

const file = (N, M) => JSON.parse(readFileSync(new URL(`./regular-maps/${N}-${M}.json`, import.meta.url), "utf8"));
// (cuts given: those, not the preset's circle worked out for its tiling)
const preset = (id, more = {}) => { const p = HYPER_PRESETS.find((q) => q.id === id); return buildHyper({ ...p, ...(more.cuts ? { autoCut: false } : {}), ...more }, file(p.N, p.M)); };
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

// The pieces are found a tile at a time: tile 0 cut into fragments, joined across tiles' edges.
// Designs to check that on: the presets, and others with corners, edges, rings, small surfaces
// (tiles meeting themselves) and big tiles (long edges, circles past them).
const designs = () => {
  const D = (N, M, surface, face, vertex = [], edge = []) => buildHyper({ rule: "hyper", N, M, surface, cuts: [{ on: "face", depths: face }, { on: "vertex", depths: vertex }, { on: "edge", depths: edge }], blackout: [] }, file(N, M));
  return [...HYPER_PRESETS.map((p) => preset(p.id)), D(7, 3, 0, [0.714], [0.6], [0.4]), D(8, 3, 0, [0.5, 1.2], [0.7]), D(6, 4, 1, [1.45], [0.25]), D(5, 4, 0, [], [0.25]),
    D(4, 5, 0, [0.5], [], [0.3]), D(12, 4, 0, [1.7912512496328927]), D(12, 3, 0, [1.895747403967124]), D(10, 5, 0, [1.5], [0.5])];
};
const area = (l) => { let a = 0; for (let i = 0, j = l.length - 1; i < l.length; j = i++) a += l[j][0] * l[i][1] - l[i][0] * l[j][1]; return a / 2; };
const loopsArea = (ls) => Math.abs(ls.reduce((s, l) => s + area(l), 0));

// No color drawn where it isn't, nor a hole: tile 0's fragments are inside it and cover it once
// (their areas add up to its), at every level of detail drawn
test("tile 0's fragments cover it exactly, at every level of detail", () => {
  for (const P of designs()) {
    const tile = Math.abs(area(P.G.poly)), shapes = fragmentShapes(P);
    for (let lod = 0; lod < 4; lod++) {
      const sum = P.regions.reduce((s, _, f) => s + loopsArea(shapes[f][lod].loops), 0);
      assert.ok(Math.abs(sum - tile) < (lod ? 0.01 : 0.002) * tile, `{${P.N},${P.M}} level ${lod}: fragments ${sum} vs tile ${tile}`);
    }
  }
});

// a piece is one cell of the circles' arrangement: every fragment of it inside the same circles
test("every fragment of a piece is inside the same circles", () => {
  for (const P of designs()) {
    const { H } = P;
    for (const pc of P.pieces) for (const { x, f } of pc.frags) {
      const name = new Map(P.regions[f].name.map(([kind, e, ring]) => [`${kind}:${H.coset[kind].of[H.mul(x, e)]}`, ring]));
      assert.deepEqual([...name].sort(), [...pc.name].sort(), `{${P.N},${P.M}}`);
    }
  }
});

// A turn carries whole pieces onto whole pieces: after a scramble, every fragment spot of the
// surface (a tile and a fragment of it) still has exactly one piece's fragment on it
test("after a scramble, every fragment spot of the surface is still filled exactly once", () => {
  const rand = seeded(11);
  for (const P of designs()) {
    const s = play(P, hyperScrambleMoves(P, 60, rand)), home = new Set(), now = new Map();
    P.pieces.forEach((pc, i) => pc.frags.forEach(({ x, f }) => { home.add(P.canon(x, f)); const k = P.canon(P.H.mul(s[i], x), f); now.set(k, (now.get(k) || 0) + 1); }));
    assert.equal(now.size, home.size, `{${P.N},${P.M}}`);
    for (const [k, n] of now) assert.ok(n === 1 && home.has(k), `{${P.N},${P.M}}: spot ${k} has ${n}`);
  }
});

test("the circles count, worked out ahead from the plane, is the circles the pieces are found from", () => {
  for (const [id, cuts] of [["hyper-klein", null], ["hyper-octagons", [{ on: "face", depths: [0.5, 1.2] }, { on: "vertex", depths: [0.7] }]], ["hyper-klein", [{ on: "face", depths: [0.714] }, { on: "vertex", depths: [0.6] }, { on: "edge", depths: [0.4] }]]]) {
    const P = preset(id, cuts ? { cuts, autoCut: false } : {});
    assert.equal(hyperCircleCount(P, P.radii), P.circles.length, id);
  }
});

test("a preset stepped onto another tiling gets a circle just past the corners, or as big as works out", () => {
  const p = HYPER_PRESETS.find((q) => q.id === "hyper-octagons");
  for (const [N, M] of [[7, 3], [12, 5], [5, 11], [6, 10], [12, 12]]) {
    const P = buildHyper({ ...p, N, M }, file(N, M)), r = P.spec.cuts[0].depths[0];
    assert.ok(r <= 1.15 * geometry(N, M).Rv + 1e-9 && r < P.cap.face, `{${N},${M}}`);
    assert.ok(!P.tooBig && P.n > 0, `{${N},${M}}: ${P.n} pieces`);
    if (r > geometry(N, M).Rv) assert.ok(P.n > P.tiles, `{${N},${M}}: past the corners, more than a piece a tile`);
  }
  // (on its own tiling, the preset's own circle)
  assert.equal(buildHyper(p, file(8, 3)).spec.cuts[0].depths[0], p.cuts[0].depths[0]);
});

test("the circle limits stored with the surfaces are the ones worked out from scratch", () => {
  for (const [N, M] of [[7, 3], [8, 3], [5, 4], [4, 11]]) {
    const f = file(N, M);
    for (const s of hyperSurfaces(f).slice(0, 3)) assert.deepEqual(s.caps, surfaceCaps(f, s), `{${N},${M}} ${s.tiles} tiles`);
  }
});

test("a circle stops short of its own copy: the cap is under half the way to it", () => {
  const P = preset("hyper-octagons"), { G } = P;
  // (the nearest copy of tile 0's middle, found the slow way)
  assert.ok(P.cap.face > 0.5 && P.cap.face < 2 && P.cap.face > geometry(8, 3).Rv);
  assert.ok(2 * P.cap.face < hdist([0, 0], mobius.apply(mobius.about(G.corners[0], Math.PI), [0, 0])) * 2);
  // circles past the cap come in to just under it, not left to overlap themselves
  const Q = preset("hyper-octagons", { cuts: [{ on: "face", depths: [5] }] }), r = Q.spec.cuts.find((c) => c.on === "face").depths[0];
  assert.ok(Q.shrunk && r < Q.cap.face && r > Q.cap.face - 0.01, `${r} vs ${Q.cap.face}`);
});

test("a design too costly to work out shrinks, the biggest circles first and together, until it fits", () => {
  // (the Klein quartic's tiling on its biggest surface, 192 tiles: big circles mean tens of
  // thousands of pieces)
  const f = file(7, 3), last = hyperSurfaces(f).length - 1, cut = (P, on) => P.spec.cuts.find((c) => c.on === on).depths;
  const P = buildHyper({ rule: "hyper", N: 7, M: 3, surface: last, cuts: [{ on: "face", depths: [3] }, { on: "vertex", depths: [0.3] }], blackout: [] }, f);
  assert.ok(P.shrunk && !P.tooBig && P.n > 0 && P.n <= 40000 && cut(P, "face")[0] < 3, `face ${cut(P, "face")}, ${P.n} pieces`);
  assert.deepEqual(cut(P, "vertex"), [0.3]); // (the smaller one left as it was)
  // (two big ones come down together, neither to nothing)
  const Q = buildHyper({ rule: "hyper", N: 7, M: 3, surface: last, cuts: [{ on: "face", depths: [3] }, { on: "vertex", depths: [3] }], blackout: [] }, f);
  assert.ok(Math.abs(cut(Q, "face")[0] - cut(Q, "vertex")[0]) < 0.06 && cut(Q, "face")[0] > 0.3, JSON.stringify(Q.spec.cuts));
});

// (Euler's count is exact but where three lines meet at a point, as at a snap mark, where it
// counts too many: a budget that errs that way only stops a design a little early)
test("the fragments counted ahead (the budget's) are never many fewer than found, nor far more", () => {
  for (const P of designs()) {
    const est = fragmentCount(P, P.radii), n = P.regions.length;
    assert.ok(est >= 0.9 * n && est <= 1.6 * n, `{${P.N},${P.M}}: counted ${est}, found ${n}`);
  }
});
