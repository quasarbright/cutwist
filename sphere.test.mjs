// Unit tests for the round tile-turning puzzles (sphere.mjs), played with puzzle.mjs's moves.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSphere, sphereGeometry, sphereGroup, isSpherical, sphereStats, regionArea, sphereCountBreaks, sphereSnapCandidates, SPHERE_RADIUS_RANGE, sphereRegularTrims } from "./sphere.mjs";
import { solvedState, applyMove, inverseMove, isSolved, scrambleMoves, piecesInLayer, applyMat, mulMat, dot } from "./puzzle.mjs";

const TILINGS = [[3, 3], [4, 3], [3, 4], [5, 3], [3, 5], [2, 3], [2, 6], [3, 2], [6, 2]];
function seeded(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const kinds = (P) => P.pieces.reduce((k, pc) => ({ ...k, [pc.kind]: (k[pc.kind] || 0) + 1 }), {});
const build = (N, M, cuts) => buildSphere({ N, M, cuts, blackout: [] });
const play = (P, moves, s = solvedState(P)) => { for (const m of moves) applyMove(P, s, m); return s; };

test("which tilings are round", () => {
  for (const [N, M] of TILINGS) assert.ok(isSpherical(N, M), `{${N},${M}}`);
  for (const [N, M] of [[2, 2], [4, 4], [6, 3], [3, 6], [7, 3], [1, 5]]) assert.ok(!isSpherical(N, M), `{${N},${M}}`);
});

test("each tiling's group: 2 × its edges, with R^N = S^M = (RS)² = 1", () => {
  for (const [N, M] of TILINGS) {
    const G = sphereGeometry(N, M), H = sphereGroup(N, M), I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const pow = (X, n) => Array.from({ length: n }, () => X).reduce(mulMat, I);
    const same = (A, B) => A.every((x, i) => Math.abs(x - B[i]) < 1e-9);
    assert.ok(same(pow(G.R, N), I) && same(pow(G.S, M), I) && same(pow(mulMat(G.R, G.S), 2), I), `{${N},${M}}`);
    assert.equal(H.n, 2 * H.points.edge.length, `{${N},${M}}`);
    assert.equal(H.normals.length * N, 2 * H.points.edge.length, `{${N},${M}}`); // (every tile has N edges, each shared by two)
    assert.equal(H.points.vertex.length * M, 2 * H.points.edge.length, `{${N},${M}}`);
  }
});

test("a Platonic tiling sits on its solid, tile k on face k", () => {
  const H = sphereGroup(4, 3);
  assert.deepEqual(H.normals.map((v) => v.map((x) => Math.round(x))), [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);
  assert.equal(build(4, 3, []).colors[2], "#f4f4ee"); // (white on top)
});

test("a cube with circles round its faces past the corners: a 3×3×3's 26 pieces", () => {
  const P = build(4, 3, [{ on: "face", depths: [1.1] }]);
  assert.deepEqual(kinds(P), { 1: 6, 2: 12, 3: 8 });
  assert.equal(P.axes.length, 3);
  assert.ok(P.axes.every((a) => a.order === 4 && a.layers === 3));
});

test("the beach ball and the two hemispheres", () => {
  // circles round the poles: two caps and the band between (every wedge in each)
  assert.deepEqual(kinds(build(2, 6, [{ on: "vertex", depths: [0.8] }])), { 6: 3 });
  // a small circle round each wedge's middle: a piece each, and the rest of the ball
  assert.deepEqual(kinds(build(2, 6, [{ on: "face", depths: [0.4] }])), { 1: 6, 6: 1 });
  // circles round the equator's corners, overlapping their neighbors: lenses and what's left of
  // each cap, both across the equator, and the two polar caps, one piece (inside no circle, they're
  // joined through the ball's inside and always turn together)
  const P = build(6, 2, [{ on: "vertex", depths: [0.8] }]);
  assert.deepEqual(kinds(P), { 2: 13 });
  assert.ok(P.axes.every((a) => a.order === 2));
});

test("the circles' pieces are the sphere's: the pieces' stickers cover every tile exactly once, and a piece is inside the same circles all over", () => {
  for (const [N, M] of TILINGS) {
    const G = sphereGeometry(N, M);
    const P = build(N, M, [{ on: "face", depths: [1.1 * G.Rv] }, { on: "vertex", depths: [0.6 * G.Ri + 0.1] }, { on: "edge", depths: [0.45] }]);
    const area = new Array(P.tiles).fill(0);
    for (const pc of P.pieces) {
      const sig = (x, f) => P.caps.map((k) => dot(k.p, applyMat(P.H.mats[x], P.regions[f].at)) > k.c).join();
      const s0 = sig(pc.frags[0].x, pc.frags[0].f);
      for (const { x, f } of pc.frags) assert.equal(sig(x, f), s0, `{${N},${M}}`);
      for (const s of pc.stickers) area[s.color] += regionArea(P, s.f);
    }
    for (const a of area) assert.ok(Math.abs(a - (4 * Math.PI) / P.tiles) < 1e-4, `{${N},${M}}: a tile's stickers add up to ${a}`);
  }
});

test("a turn's order is no change, and scrambles undo exactly", () => {
  for (const [N, M] of TILINGS) {
    const G = sphereGeometry(N, M);
    const P = build(N, M, [{ on: "face", depths: [1.15 * G.Rv] }, { on: "vertex", depths: [0.5] }]);
    for (let axis = 0; axis < P.axes.length; axis++) {
      const ax = P.axes[axis], s = play(P, [{ axis, layer: ax.layers - 1, q: 1 }]);
      play(P, Array(ax.order - 1).fill({ axis, layer: ax.layers - 1, q: 1 }), s);
      assert.ok(s.every((v) => v === 0), `{${N},${M}} axis ${axis}`);
    }
    const moves = scrambleMoves(P, 60, seeded(5)), s = play(P, moves);
    assert.equal(isSolved(P, s), false, `{${N},${M}}`);
    play(P, moves.slice().reverse().map((m) => inverseMove(P, m)), s);
    assert.ok(isSolved(P, s) && s.every((v) => v === 0), `{${N},${M}}`);
  }
});

test("a turn moves the pieces in its cap, and they land on pieces' places", () => {
  const P = build(4, 3, [{ on: "face", depths: [1.1] }]), s = solvedState(P);
  const top = P.axes.findIndex((a) => Math.abs(a.dir[1]) > 0.99), layer = P.axes[top].dir[1] > 0 ? 2 : 0;
  assert.equal(piecesInLayer(P, s, top, layer).length, 9);
  applyMove(P, s, { axis: top, layer, q: 1 });
  assert.equal(isSolved(P, s), false);
  // (every piece's middle, turned, is some piece's middle)
  const mids = P.pieces.map((pc) => pc.centroid);
  P.pieces.forEach((pc, i) => { const c = applyMat(P.group.mats[s[i]], pc.centroid); assert.ok(mids.some((m) => Math.hypot(m[0] - c[0], m[1] - c[1], m[2] - c[2]) < 1e-9)); });
});

test("truncation: corners' and edges' faces with their own colors, the stickers still covering the ball once, and no new pieces", () => {
  for (const [N, M] of TILINGS) for (const truncate of [{ vertex: 0.6 }, { edge: 0.5 }, { vertex: 0.4, edge: 0.8 }]) {
    const G = sphereGeometry(N, M), cuts = [{ on: "face", depths: [1.1 * G.Rv] }];
    const plain = buildSphere({ N, M, cuts, blackout: [] }), P = buildSphere({ N, M, cuts, truncate, blackout: [] });
    const name = `{${N},${M}} ${JSON.stringify(truncate)}`;
    assert.equal(P.n, plain.n, name);
    assert.equal(P.colors.length, P.normals.length, name);
    assert.equal(P.normals.length, P.tiles + (truncate.vertex ? P.H.points.vertex.length : 0) + (truncate.edge ? P.H.points.edge.length : 0), name);
    let area = 0;
    for (const pc of P.pieces) for (const s of pc.stickers) area += regionArea(P, s.f);
    assert.ok(Math.abs(area - 4 * Math.PI) < 1e-4, `${name}: ${area}`);
    // (a corner's face is where its corner is)
    if (truncate.vertex) assert.ok(P.regions.some((r) => r.part.kind === "vertex"), name);
  }
  // a turn of a tile, truncated: its corners' faces go round with it, so it's not solved till it's back
  const P = build(4, 3, [{ on: "face", depths: [1.1] }]), Q = buildSphere({ N: 4, M: 3, cuts: [{ on: "face", depths: [1.1] }], truncate: { vertex: 0.6 }, blackout: [] });
  for (const X of [P, Q]) { const s = play(X, [{ axis: 0, layer: 2, q: 1 }]); assert.equal(isSolved(X, s), false); play(X, [{ axis: 0, layer: 2, q: 3 }], s); assert.ok(isSolved(X, s)); }
});

test("dual tilings cut by the same circles (a tile's middle is the dual's corner) make the same pieces", () => {
  // (the beach ball's wedge circles overlap all round the equator: two polar caps outside them all,
  // one piece through the ball's inside)
  const ball = build(2, 6, [{ on: "face", depths: [0.654] }]), halves = build(6, 2, [{ on: "vertex", depths: [0.654] }]);
  assert.equal(ball.n, 13);
  assert.equal(halves.n, 13);
  for (const [N, M] of [[4, 3], [5, 3]]) {
    const a = build(N, M, [{ on: "face", depths: [0.9] }, { on: "vertex", depths: [0.5] }]), b = build(M, N, [{ on: "vertex", depths: [0.9] }, { on: "face", depths: [0.5] }]);
    assert.equal(a.n, b.n, `{${N},${M}}`);
  }
});

test("circles that just touch make the same pieces as a hair smaller: what's between them is one piece, joined through the inside", () => {
  // (the icosahedron's circles at its triangles' inner radius touch at every edge's middle)
  const G = sphereGeometry(3, 5);
  for (const truncate of [undefined, { edge: 0.7 }]) {
    const at = (r) => kinds(buildSphere({ N: 3, M: 5, cuts: [{ on: "face", depths: [r] }], truncate, blackout: [] }));
    assert.deepEqual(at(G.Ri), { 1: 20, 20: 1 });
    assert.deepEqual(at(G.Ri - 0.01), at(G.Ri));
  }
});

// (the search for where the count changes builds the ball at radii a hair from where circles meet:
// a fragment's turned anchor read on the far side of a circle found no fragment, and it threw)
test("a circle's count changes can be searched for right up to where circles meet", () => {
  const P = build(4, 3, [{ on: "face", depths: [1.0986141108431853] }, { on: "vertex", depths: [0.2 * sphereGeometry(4, 3).Rv] }]);
  let n = 0;
  for (const x of sphereCountBreaks(P, "vertex", 0, ...SPHERE_RADIUS_RANGE, sphereSnapCandidates(P, "vertex", 0))) if (x.at !== undefined) n++;
  assert.ok(n > 10);
});

test("truncations that make a face regular: the four-wedge beach ball's squares (the cube's ball), the cube's octagons", () => {
  const near = (fs, f) => fs.some((g) => Math.abs(g - f) < 1e-4);
  assert.ok(near(sphereRegularTrims({ N: 2, M: 4 }, "vertex", [0.02, 0.99]), 0.5)); // (the wedges' sides a quarter turn each)
  // (the cube's ball: corners off till the squares are regular octagons, past where the corners' faces
  // meet till the octahedron's hexagons are; edges off with the corners off too: the squares again)
  const cube = sphereRegularTrims({ N: 4, M: 3 }, "vertex", [0.02, 0.99]);
  assert.equal(cube.length, 2);
  assert.ok(cube.every((f) => f > 0.02 && f < 0.99));
  assert.ok(sphereRegularTrims({ N: 4, M: 3, truncate: { vertex: 0.6 } }, "edge", [0.02, 0.99]).length > 0);
});

test("a truncation goes on in till the tile's own face is all but gone, the ball still covered once", () => {
  for (const [N, M] of [[2, 4], [4, 3], [3, 5], [6, 2]]) for (const truncate of [{ vertex: 0.03 }, { edge: 0.03 }, { vertex: 0.2, edge: 0.1 }]) {
    const P = buildSphere({ N, M, cuts: [{ on: "face", depths: [0.8 * sphereGeometry(N, M).Rv] }], truncate, blackout: [] });
    let area = 0;
    for (const pc of P.pieces) for (const st of pc.stickers) area += regionArea(P, st.f);
    assert.ok(Math.abs(area - 4 * Math.PI) < 1e-3, `{${N},${M}} ${JSON.stringify(truncate)}: ${area}`);
  }
});

test("blacking out a kind takes its stickers off", () => {
  const P = build(4, 3, [{ on: "face", depths: [1.1] }]), corner = P.types[P.pieces.findIndex((pc) => pc.kind === 3)];
  const Q = buildSphere({ N: 4, M: 3, cuts: [{ on: "face", depths: [1.1] }], blackout: [corner] });
  assert.equal(sphereStats(Q).pieces, 26 - 8);
});

test("a truncated tiling's own corners and edges: a truncated cube's ball has 24 new corners and 24 new edges (its 12 others' middles are the cube's), and circles round them cut pieces, the ball still covered once", () => {
  const truncate = { vertex: 0.7 }, P = buildSphere({ N: 4, M: 3, cuts: [], truncate, blackout: [] });
  assert.equal(P.pts.tvertex.length, 24);
  assert.equal(P.pts.tedge.length, 24);
  const plain = buildSphere({ N: 4, M: 3, cuts: [{ on: "face", depths: [0.6] }], truncate, blackout: [] });
  const cut = buildSphere({ N: 4, M: 3, cuts: [{ on: "face", depths: [0.6] }, { on: "tvertex", depths: [0.15] }], truncate, blackout: [] });
  assert.ok(cut.n > plain.n);
  assert.equal(cut.axes.length, plain.axes.length); // (round no turning point: they don't turn)
  let area = 0;
  for (const pc of cut.pieces) for (const st of pc.stickers) area += regionArea(cut, st.f);
  assert.ok(Math.abs(area - 4 * Math.PI) < 1e-3, area);
  // (with only the edges truncated, the cube's corners are corners still: not new ones, cut round
  // with the corners' own set)
  assert.equal(buildSphere({ N: 4, M: 3, cuts: [], truncate: { edge: 0.7 }, blackout: [] }).pts.tvertex.length, 24);
});
