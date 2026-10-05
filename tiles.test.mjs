// Unit tests for the tile-turning puzzles (tiles.mjs).
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TILE_PRESETS, buildTiles, solvedTileState, applyTileMove, inverseTileMove, isTileSolved, tileScrambleMoves,
  piecesInLayer, piecePose, tileCount, tilesFit, snapTiles, signedTurn, tileSnapCandidates, tileRadiusCap, tileRegularTrims, tileFaceAt,
} from "./tiles.mjs";

const presetSpec = (tiling, a, b = 0, more = {}) => ({ ...TILE_PRESETS.find((p) => p.tiling === tiling), a, b, ...more });
const preset = (tiling, a, b = 0, more = {}) => buildTiles(presetSpec(tiling, a, b, more));
const kinds = (P, pieces = P.pieces) => pieces.reduce((k, pc) => ({ ...k, [pc.kind]: (k[pc.kind] || 0) + 1 }), {});
const play = (P, moves, s = solvedTileState(P)) => { for (const m of moves) applyTileMove(P, s, m); return s; };
function seeded(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
// designs beyond the presets, for the editor's options
const DESIGNS = {
  "hex corners": ["hex", 3, 0, { cuts: [{ on: "vertex", depths: [0.45] }] }],
  "hex edges": ["hex", 3, 0, { cuts: [{ on: "edge", depths: [0.4] }] }],
  "hex rings": ["hex", 4, 0, { cuts: [{ on: "face", depths: [0.3, 2 / 3] }] }],
  "hex faces + corners": ["hex", 3, 0, { cuts: [{ on: "face", depths: [2 / 3] }, { on: "vertex", depths: [0.3] }] }],
  "triangle corners": ["triangle", 2, 0, { cuts: [{ on: "vertex", depths: [0.6] }] }],
  "square truncated": ["square", 3, 0, { truncate: { vertex: 0.75, edge: 0.85 } }],
  // (six circles through each corner, opposite ones just touching there; and just short of it)
  "triangle through corners": ["triangle", 2, 0, { cuts: [{ on: "face", depths: [1 / Math.sqrt(3)] }] }],
  "triangle nearly through corners": ["triangle", 2, 0, { cuts: [{ on: "face", depths: [0.575] }] }],
};

test("tile counts: a² + ab + b² hexagons, a² + b² squares, twice the hexagons' count of triangles", () => {
  for (const [tiling, a, b, n] of [["hex", 3, 0, 9], ["hex", 2, 1, 7], ["hex", 3, 1, 13], ["square", 2, 1, 5], ["square", 3, 0, 9], ["triangle", 2, 0, 8], ["triangle", 2, 1, 14]]) {
    assert.equal(tileCount({ tiling, a, b }), n);
    assert.equal(preset(tiling, a, b).tiles.length, n, `${tiling} (${a}, ${b})`);
  }
});

// Every point of the torus inside some circle is in exactly one piece's outline, and that piece
// has a sticker on the face under it; a point outside every circle is in none. (Two pieces'
// outlines over the same spot, or a spot in none, is a color drawn where it isn't: it pops as
// the pieces turn.) Points within a hair of a circle are skipped (they're on an edge).
function checkCover(P, rand, count = 250) {
  const shifts = [-2, -1, 0, 1, 2].flatMap((n) => [-2, -1, 0, 1, 2].map((m) => [n * P.Ap[0] + m * P.Bp[0], n * P.Ap[1] + m * P.Bp[1]]));
  const circles = P.axes.flatMap((ax) => ax.radii.map((r) => ({ c: ax.center, r })));
  const polys = new Map(), polysOf = (pc) => {
    if (!polys.has(pc.outline)) polys.set(pc.outline, pc.outline.map((loop) => loop.flatMap(({ c, r, a0, a1 }) => {
      const k = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / 0.002));
      return Array.from({ length: k }, (_, i) => { const a = a0 + ((a1 - a0) * i) / k; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
    })));
    return polys.get(pc.outline);
  };
  const inPoly = (poly, [x, y]) => {
    let w = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[j];
      if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) w = !w;
    }
    return w;
  };
  for (let t = 0; t < count; t++) {
    const u = rand(), v = rand(), p = [u * P.Ap[0] + v * P.Bp[0], u * P.Ap[1] + v * P.Bp[1]];
    let covered = false, onEdge = false;
    for (const { c, r } of circles) for (const [dx, dy] of shifts) {
      const d = Math.hypot(p[0] - c[0] - dx, p[1] - c[1] - dy);
      if (Math.abs(d - r) < 1e-4) onEdge = true;
      if (d < r) covered = true;
    }
    if (onEdge) continue;
    const hits = [];
    for (const pc of P.pieces) for (const [dx, dy] of shifts) {
      if (Math.hypot(p[0] - pc.anchor[0] - dx, p[1] - pc.anchor[1] - dy) > pc.extent + 1e-3) continue;
      const q = [p[0] - pc.offset[0] - dx, p[1] - pc.offset[1] - dy];
      if (polysOf(pc).filter((poly) => inPoly(poly, q)).length % 2) hits.push({ pc, q });
    }
    const where = `${JSON.stringify(P.spec.cuts)} at (${p[0].toFixed(4)}, ${p[1].toFixed(4)})`;
    assert.equal(hits.length, covered ? 1 : 0, `${P.spec.tiling} ${where}: in ${hits.length} pieces`);
    if (!hits.length) continue;
    const [{ pc, q }] = hits;
    assert.ok(pc.stickers.some((st) => st.face === P.faceAt(tileFaceAt(P, p))), `${P.spec.tiling} ${where}: no sticker for the face there`);
    // (and it's inside the same circles as the rest of its piece: one region, not two run together)
    const inside = (x) => circles.flatMap(({ c, r }, i) => shifts.flatMap(([dx, dy], j) => (Math.hypot(x[0] - c[0] - dx, x[1] - c[1] - dy) < r ? [`${i}:${j}`] : []))).join();
    assert.equal(inside(q), inside([pc.anchor[0] - pc.offset[0], pc.anchor[1] - pc.offset[1]]), `${P.spec.tiling} ${where}: inside other circles than its piece`);
  }
}

test("no color drawn where it isn't: at every snap radius, each covered point is in exactly one piece", () => {
  const rand = seeded(11);
  for (const tiling of ["hex", "square", "triangle"]) {
    const base = presetSpec(tiling, TILE_PRESETS.find((p) => p.tiling === tiling).a, TILE_PRESETS.find((p) => p.tiling === tiling).b);
    for (const kind of ["face", "vertex", "edge"]) {
      // (the radii where the drawing changes: circles touching, or meeting at a point; and a
      // hair to either side)
      const marks = tileSnapCandidates({ ...base, cuts: [] }, { kind, i: 0 }).filter((r) => r <= 1.05);
      for (const r of marks) for (const d of [0, 0.002]) {
        const spec = { ...base, cuts: [{ on: kind, depths: [r + d] }] };
        if (tilesFit(spec)) checkCover(buildTiles(spec), rand, 60);
      }
    }
  }
  for (const spec of TILE_PRESETS) checkCover(buildTiles(spec), rand);
  // (big circles: many crossings, and many tiny pieces)
  for (const r of [1, 1.3]) checkCover(preset("hex", 2, 2, { cuts: [{ on: "vertex", depths: [r] }] }), rand, 120);
  // (two kinds at once, both through the corners)
  checkCover(preset("triangle", 2, 0, { cuts: [{ on: "face", depths: [0.5] }, { on: "vertex", depths: [0.5] }] }), rand);
  checkCover(preset("hex", 2, 2, { cuts: [{ on: "face", depths: [1 / Math.sqrt(3)] }, { on: "vertex", depths: [1 / Math.sqrt(3)] }] }), rand);
});

test("piece types: every piece of a type alike, and each type on every cell (so blacking one out takes them all)", () => {
  for (const spec of [...TILE_PRESETS, ...Object.values(DESIGNS).map(([t, a, b, more]) => presetSpec(t, a, b, more))]) {
    const P = buildTiles(spec), cells = P.pieces.length / new Set(P.pieces.map((pc) => pc.outline)).size;
    const byType = new Map();
    for (const pc of P.pieces) { if (!byType.has(pc.type)) byType.set(pc.type, []); byType.get(pc.type).push(pc); }
    for (const [t, ps] of byType) {
      assert.ok(ps.every((pc) => pc.kind === ps[0].kind && Math.abs(pc.area - ps[0].area) < 1e-7), `${spec.name}: type ${t}`);
      assert.equal(ps.length % cells, 0, `${spec.name}: type ${t} has ${ps.length} pieces on ${cells} cells`);
    }
  }
});

test("every preset fits its torus, and its scrambles undo", () => {
  for (const spec of TILE_PRESETS) {
    assert.ok(tilesFit(spec), spec.name);
    const P = buildTiles(spec), moves = tileScrambleMoves(P, 60, seeded(5)), s = play(P, moves);
    assert.ok(P.pieces.length > 0 && !isTileSolved(P, s), spec.name);
    play(P, moves.slice().reverse().map((m) => inverseTileMove(P, m)), s);
    assert.ok(s.every((v) => v === 0), spec.name);
  }
  assert.ok(TILE_PRESETS.some((p) => p.name === "Spiderman"));
});

test("hexagons cut like a 3×3×3: per tile a center, three edges and two corners; a turn moves 1 + 6 + 6", () => {
  for (const [a, b] of [[3, 0], [2, 1], [4, 0]]) {
    const P = preset("hex", a, b), T = P.tiles.length;
    assert.deepEqual(kinds(P), { 1: T, 2: 3 * T, 3: 2 * T });
  }
  const P = preset("hex", 4);
  assert.deepEqual(kinds(P, [...piecesInLayer(P, solvedTileState(P), 0, 0).keys()].map((i) => P.pieces[i])), { 1: 1, 2: 6, 3: 6 });
});

test("squares and triangles: the same pieces on every tile, corners of 4 and 6 tiles", () => {
  const S = preset("square", 3);
  assert.deepEqual(kinds(S), { 1: 5 * 9, 2: 2 * 9, 4: 9 });
  const T = preset("triangle", 2);
  assert.deepEqual(kinds(T), { 1: 7 * 8, 2: 4.5 * 8, 6: 0.5 * 8 });
  // (no specks at these radii)
  for (const P of [S, T, preset("hex", 3)]) assert.ok(Math.min(...P.pieces.map((pc) => pc.area)) > 0.005);
});

test("every sticker knows its face, and each face has the same stickers as the rest of its kind", () => {
  for (const [tiling, a, b, more] of [["hex", 3, 0], ["hex", 2, 1], ["square", 2, 1], ["triangle", 2, 1], DESIGNS["square truncated"]].map((d) => (Array.isArray(d) ? d : [d]))) {
    const P = preset(tiling, a, b, more), per = new Array(P.faces.length).fill(0);
    for (const pc of P.pieces) for (const st of pc.stickers) { assert.ok(Number.isInteger(st.face), `${tiling} (${a}, ${b})`); per[st.face]++; }
    for (const kind of ["face", "vertex", "edge"]) assert.ok(new Set(P.faces.flatMap((f, i) => (f.kind === kind ? [per[i]] : []))).size <= 1, `${tiling}: ${kind}`);
  }
});

test("the pieces cover every design exactly once, stickers and all (truncations, rings, corners)", () => {
  const rand = seeded(5);
  for (const [tiling, a, b, more] of [["hex", 3, 0], ["square", 3, 0], ["triangle", 2, 0], ...Object.values(DESIGNS)]) checkCover(preset(tiling, a, b, more), rand);
});

test("a turn's order: six sixths, four quarters or three thirds is no change", () => {
  for (const [tiling, n] of [["hex", 6], ["square", 4], ["triangle", 3]]) {
    const P = preset(tiling, 3);
    const s = play(P, [{ axis: 2, layer: 0, q: 1 }]);
    assert.equal(isTileSolved(P, s), false);
    play(P, Array(n - 1).fill({ axis: 2, layer: 0, q: 1 }), s);
    assert.ok(s.every((v) => v === 0), tiling);
  }
});

test("turns about corners and edges: a hexagon's corner turns in thirds, its edge in halves; a triangle's corner in sixths", () => {
  for (const [name, n] of [["hex corners", 3], ["hex edges", 2], ["triangle corners", 6]]) {
    const P = preset(...DESIGNS[name]);
    assert.equal(P.axes[0].order, n, name);
    const s = play(P, [{ axis: 0, layer: 0, q: 1 }]);
    assert.equal(isTileSolved(P, s), false, name);
    play(P, Array(n - 1).fill({ axis: 0, layer: 0, q: 1 }), s);
    assert.ok(s.every((v) => v === 0), name);
  }
});

test("concentric circles make layers: the disk and the ring turn separately", () => {
  const P = preset(...DESIGNS["hex rings"]), s0 = solvedTileState(P);
  const disk = piecesInLayer(P, s0, 0, 0), ring = piecesInLayer(P, s0, 0, 1);
  assert.ok(disk.size >= 1 && ring.size > disk.size);
  assert.ok([...disk.keys()].every((i) => !ring.has(i)));
  const s = play(P, [{ axis: 0, layer: 1, q: 1 }]);
  for (const i of disk.keys()) assert.deepEqual([s[3 * i], s[3 * i + 1], s[3 * i + 2]], [0, 0, 0]); // (the disk stayed)
});

test("scrambles undo exactly (positions are integers: no drift), on every kind of design", () => {
  for (const [tiling, a, b, more] of [["hex", 2, 1], ["square", 3, 0], ["triangle", 2, 1], ...Object.values(DESIGNS)]) {
    const P = preset(tiling, a, b, more), moves = tileScrambleMoves(P, 300, seeded(7));
    const s = play(P, moves);
    assert.equal(isTileSolved(P, s), false);
    play(P, moves.slice().reverse().map((m) => inverseTileMove(P, m)), s);
    assert.ok(s.every((v) => v === 0), `${tiling} ${JSON.stringify(more)}`);
  }
});

test("a turn's pieces each turn about the copy of its point right by them", () => {
  for (const [tiling, a, b, more] of [["hex", 3, 0], ["square", 2, 1], ["triangle", 2, 0], DESIGNS["hex faces + corners"]]) {
    const P = preset(tiling, a, b, more), s = play(P, tileScrambleMoves(P, 40, seeded(3)));
    for (let axis = 0; axis < P.axes.length; axis++)
      for (const [i, c] of piecesInLayer(P, s, axis, 0)) {
        const { anchor } = piecePose(P, s, i), q = P.toPlane(c);
        assert.ok(Math.hypot(anchor[0] - q[0], anchor[1] - q[1]) < P.axes[axis].radii[0], `${tiling}: piece ${i}, axis ${axis}`);
      }
  }
});

test("turns of tiles far apart commute; neighbors' don't", () => {
  const P = preset("hex", 5), far = P.axes.findIndex((t) => Math.hypot(...t.center) > 2.4), near = 1;
  const a = { axis: 0, layer: 0, q: 1 };
  const once = (x, y) => play(P, [x, y]).join();
  assert.equal(once(a, { axis: far, layer: 0, q: 1 }), once({ axis: far, layer: 0, q: 1 }, a));
  assert.notEqual(once(a, { axis: near, layer: 0, q: 1 }), once({ axis: near, layer: 0, q: 1 }, a));
});

test("solved means every sticker on its own face: a center turned in place still counts; blacked-out pieces don't count", () => {
  const P = preset("hex", 3), s = solvedTileState(P);
  const center = P.pieces.findIndex((pc) => pc.kind === 1);
  s[3 * center] = 2; // turned a third, in place
  assert.ok(isTileSolved(P, s));
  const B = preset("hex", 3, 0, { blackout: [P.pieces.find((pc) => pc.kind === 3).type] }), t = play(B, [{ axis: 0, layer: 0, q: 1 }]);
  assert.ok(B.pieces.some((pc) => pc.black));
  // (a turn moves corners, edges and the center; with the corners blacked out it's still unsolved: the edges moved)
  assert.equal(isTileSolved(B, t), false);
});

test("truncation makes faces of the tiles' corners and edges, with their own stickers", () => {
  const P = preset(...DESIGNS["square truncated"]);
  assert.equal(P.faces.length, 9 + 9 + 18); // (9 squares, 9 corners, 18 edges)
  assert.ok(P.pieces.some((pc) => pc.stickers.some((st) => P.faces[st.face].kind === "vertex")));
});

test("small tori: every circle has to fit without overlapping itself; snapping grows a", () => {
  assert.equal(tilesFit(presetSpec("hex", 1, 0)), false);
  assert.equal(tilesFit(presetSpec("hex", 1, 1)), true);
  assert.equal(tilesFit(presetSpec("square", 1, 1)), false);
  assert.equal(snapTiles(presetSpec("square", 1, 1)).a, 2);
  assert.equal(tilesFit(presetSpec("triangle", 1, 1)), true);
  assert.equal(tilesFit(presetSpec("hex", 1, 1, { cuts: [{ on: "face", depths: [1.2] }] })), false); // (a bigger circle needs more room)
});

test("signedTurn: the fewest of the axis's turns either way", () => {
  const P = preset("hex", 3);
  assert.deepEqual([1, 2, 3, 4, 5, -1, 7].map((q) => signedTurn(P, q)), [1, 2, 3, -2, -1, -1, 1]);
});

test("snap marks: the radii through other points of the drawing, like the neighbors' middles", () => {
  const marks = tileSnapCandidates(presetSpec("hex", 3, 0), { kind: "face", i: 0 });
  assert.ok(marks.some((r) => Math.abs(r - 1) < 1e-6)); // (the next hexagon's middle)
  assert.ok(marks.some((r) => Math.abs(r - 1 / Math.sqrt(3)) < 1e-6)); // (its own corners)
  assert.ok(marks.some((r) => Math.abs(r - 0.5) < 1e-6)); // (where neighboring middles' circles meet)
  // corners: where the circles around neighboring corners just meet, and that makes a clean puzzle
  const corner = 1 / Math.sqrt(3) / 2;
  assert.ok(tileSnapCandidates(presetSpec("hex", 3, 0), { kind: "vertex", i: 0 }).some((r) => Math.abs(r - corner) < 1e-6));
  const P = preset("hex", 3, 0, { cuts: [{ on: "vertex", depths: [corner] }] });
  checkCover(P, seeded(2));
});

test("truncation snaps where faces turn regular: a square's octagon, a hexagon's dodecagon, a triangle's hexagon", () => {
  const near = (fs, f) => fs.some((g) => Math.abs(g - f) < 1e-5);
  const trims = (tiling, truncate = {}) => tileRegularTrims({ tiling, a: 3, b: 0, cuts: [], truncate }, "vertex", [0.34, 0.99]);
  assert.ok(near(trims("square"), Math.SQRT1_2), trims("square").join(" "));
  assert.ok(near(trims("hex"), Math.sqrt(3) / 2), trims("hex").join(" "));
  assert.ok(near(trims("triangle"), 0.5), trims("triangle").join(" ")); // (a third of each side off each corner)
});

test("the radius stops short of a circle meeting its own copy, and no mark lies past it", () => {
  const spec = presetSpec("hex", 1, 1), cap = tileRadiusCap(spec);
  assert.ok(Math.abs(cap - (Math.sqrt(3) - 0.05) / 2) < 1e-5); // (the nearest copy of a center is √3 away on the (1, 1) torus)
  assert.equal(tilesFit({ ...spec, cuts: [{ on: "face", depths: [cap] }] }), true);
  assert.ok(tileSnapCandidates(spec, { kind: "face", i: 0 }).every((r) => r <= cap));
});
