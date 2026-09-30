// Unit tests for the twisty puzzle core (puzzle.mjs).
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESETS, buildPuzzle, solvedState, applyMove, inverseMove, isSolved, randomMoves, moveLabel,
  piecesInLayer, closestOrientation, puzzleTitle, snapSize, scrambleMoves, puzzleStats, snapDepths, toCustom, pieceFinder, faceTextures, colorDistance, dot, sub, cross, len, rotMat,
} from "./puzzle.mjs";

const family = (id) => PRESETS.find((p) => p.id === id);
const preset = (id, size) => buildPuzzle(family(id), size);

// every family at a spread of sizes, for the invariants that should hold everywhere
const ALL = PRESETS.flatMap((p) => [2, 3, 4, 5].filter((n) => snapSize(p, n) === n).map((n) => ({ id: `${p.id}@${n}`, P: buildPuzzle(p, n) })));

// Volume of a convex piece: sum of tetrahedra from its centroid to each face triangle fan.
function volume(piece) {
  let v = 0;
  for (const p of piece.polys)
    for (let i = 1; i + 1 < p.verts.length; i++) {
      const a = sub(p.verts[0], piece.centroid), b = sub(p.verts[i], piece.centroid), c = sub(p.verts[i + 1], piece.centroid);
      v += dot(a, cross(b, c)) / 6;
    }
  return v;
}

function seeded(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("rotation group orders", () => {
  assert.equal(preset("pyraminx").group.mats.length, 12);
  assert.equal(preset("cube").group.mats.length, 24);
  assert.equal(preset("octahedron").group.mats.length, 24);
  assert.equal(preset("megaminx").group.mats.length, 60);
  assert.equal(preset("icosahedron").group.mats.length, 60);
});

test("piece counts match the real puzzles", () => {
  assert.equal(preset("cube", 2).pieces.length, 8);
  assert.equal(preset("cube", 3).pieces.length, 27);
  assert.equal(preset("cube", 4).pieces.length, 64);
  assert.equal(preset("cube", 7).pieces.length, 343);
  assert.equal(preset("skewb").pieces.length, 14); // 8 corners + 6 centers
  const visible = (P) => P.pieces.filter((p) => p.stickers.length).length;
  assert.equal(visible(preset("pyraminx", 3)), 14);
  assert.equal(visible(preset("octahedron", 3)), 42); // FTO
  assert.equal(visible(preset("megaminx", 3)), 62);
  assert.equal(visible(preset("megaminx", 5)), 242); // gigaminx
});

test("size 1 is one uncut piece with no turns; size 0 is empty and solved", () => {
  for (const p of PRESETS) {
    const one = buildPuzzle(p, 1);
    assert.equal(one.pieces.length, 1, p.id);
    assert.equal(one.axes.length, 0, p.id);
    assert.deepEqual(randomMoves(one, 10), []);
    assert.ok(isSolved(one, solvedState(one)));
    const zero = buildPuzzle(p, 0);
    assert.equal(zero.pieces.length, 0, p.id);
    assert.ok(isSolved(zero, solvedState(zero)));
  }
});

test("axes and turn orders", () => {
  const cube = preset("cube", 3);
  assert.equal(cube.axes.length, 3);
  assert.deepEqual(cube.axes.map((a) => a.order), [4, 4, 4]);
  assert.deepEqual(cube.axes.map((a) => a.layers), [3, 3, 3]);
  assert.deepEqual(preset("cube", 6).axes.map((a) => a.layers), [6, 6, 6]);
  assert.deepEqual(preset("skewb").axes.map((a) => a.order), [3, 3, 3, 3]);
  assert.deepEqual(preset("megaminx").axes.map((a) => a.order), [5, 5, 5, 5, 5, 5]);
  assert.deepEqual(preset("pyraminx").axes.map((a) => a.order), [3, 3, 3, 3]);
});

test("odd minxes have a real minx's stickers: 1 + 5m(m + 1) per face, no stray cuts", () => {
  for (const N of [3, 5, 7, 9]) {
    const P = preset("megaminx", N), m = (N - 1) / 2;
    const stickers = P.pieces.reduce((s, p) => s + p.stickers.length, 0);
    assert.equal(stickers, 12 * (1 + 5 * m * (m + 1)), `size ${N}`);
    // no piece touches more faces than a corner does
    assert.ok(P.pieces.every((p) => p.stickers.length <= 3), `size ${N}`);
  }
});

test("face-turning tetrahedron: odd sizes, evenly stepped cuts that never cross", () => {
  const ftt = family("ftt");
  assert.equal(snapSize(ftt, 4, 1), 5);
  assert.equal(snapSize(ftt, 4, -1), 3);
  assert.equal(snapSize(ftt, 2, -1), 1);
  const P3 = preset("ftt", 3);
  const k = {};
  for (const p of P3.pieces) k[p.stickers.length] = (k[p.stickers.length] || 0) + 1;
  assert.deepEqual(k, { 0: 1, 1: 4, 2: 6, 3: 4 }); // core, 4 centers, 6 edges, 4 corners
  for (const N of [3, 5, 7, 9]) {
    const P = preset("ftt", N);
    for (const ax of P.axes) {
      // height of each cut's line on a neighboring face: 0 at the edge, 1 at the far corner
      const hs = ax.offsets.map((d) => (1 - d) / 4).sort((a, b) => a - b);
      assert.ok(hs.every((h) => h < 1 / 3), `size ${N}: a cut line crosses the others`);
      // corner-to-cut (measured from the edge) equals cut-to-cut
      hs.forEach((h, i) => assert.ok(Math.abs(h - (i + 1) * hs[0]) < 1e-9, `size ${N}: uneven steps`));
    }
  }
});

test("golden icosahedron cuts line up: no slivers around the corners", () => {
  const P = preset("golden-icosahedron");
  const k = {};
  for (const p of P.pieces) if (p.stickers.length) k[p.stickers.length] = (k[p.stickers.length] || 0) + 1;
  // 12 corners, 60 two-sticker and 80 one-sticker pieces; slightly shallower cuts give 90 two-sticker
  assert.deepEqual(k, { 1: 80, 2: 60, 5: 12 });
  assert.equal(puzzleTitle(family("golden-icosahedron"), 2), "Golden Icosahedron");
});

test("custom puzzles: depths as fractions of the way to the surface", () => {
  // a cube cut a third of the way out on every face is a 3×3
  const cube = buildPuzzle({ name: "c", solid: "cube", rule: "custom", size: 2, on: "face", depths: [1 / 3] });
  assert.equal(cube.pieces.length, 27);
  assert.deepEqual(cube.axes.map((a) => a.layers), [3, 3, 3]);
  // arbitrary depths still give a puzzle where every turn is legal
  const odd = buildPuzzle({ name: "o", solid: "dodecahedron", rule: "custom", size: 2, on: "vertex", depths: [0.83, -0.2] });
  const s = solvedState(odd);
  const moves = scrambleMoves(odd, 100, seeded(2));
  for (const m of moves) applyMove(odd, s, m);
  assert.ok(!isSolved(odd, s));
  for (const m of [...moves].reverse()) applyMove(odd, s, inverseMove(odd, m));
  assert.ok(isSolved(odd, s));
  const st = puzzleStats(cube);
  assert.equal(st.pieces, 26);
  assert.ok(Math.abs(st.smallest - 1 / 9) < 1e-9);
});

test("snapping finds the depths where cuts line up", () => {
  const snaps = (solid, on, depths, i = 0) => snapDepths({ name: "x", rule: "custom", size: 2, solid, on, depths }, { s: 0, i });
  const has = (list, f) => list.some((g) => Math.abs(g - f) < 1e-6);
  const PHI = (1 + Math.sqrt(5)) / 2;
  assert.ok(has(snaps("icosahedron", "face", [0.8]), 1 / PHI)); // golden icosahedron
  assert.ok(has(snaps("rhombicDodecahedron", "face", [0.6]), 0.5));
  assert.ok(has(snaps("octahedron", "face", [0.3]), 1 / 3)); // FTO
  assert.ok(has(snaps("cube", "vertex", [0.3]), 0)); // skewb
  assert.ok(has(snaps("cube", "vertex", [0.3]), 1 / 3)); // dino cube: through the neighboring corners
  assert.ok(has(snaps("dodecahedron", "face", [0.72]), 1 / Math.sqrt(5))); // megaminx crystal
  // never onto another cut or its mirror (that just merges two cuts)
  const two = snaps("cube", "face", [0.2, 0.6], 0);
  assert.ok(!has(two, 0.6) && !has(two, -0.6) && has(two, 0));
  // with a second cut fixed, the first one's snaps account for it: on an octahedron with
  // one cut at 1/3, 2/3 lines up with it (it doesn't on its own)
  assert.ok(!has(snaps("octahedron", "face", [0.5], 0), 2 / 3));
  assert.ok(has(snaps("octahedron", "face", [0.5, 1 / 3], 0), 2 / 3));
});

test("custom puzzles: several cut sets, and snapping across them", () => {
  const spec = { name: "m", rule: "custom", size: 2, solid: "cube", cuts: [{ on: "face", depths: [0.6] }, { on: "vertex", depths: [0.7] }] };
  const P = buildPuzzle(spec);
  assert.deepEqual(P.axes.map((a) => a.order).sort(), [3, 3, 3, 3, 4, 4, 4]);
  const s = solvedState(P), moves = scrambleMoves(P, 100, seeded(2));
  for (const m of moves) applyMove(P, s, m);
  for (const m of [...moves].reverse()) applyMove(P, s, inverseMove(P, m));
  assert.ok(isSolved(P, s));
  // the corner cut's snaps include ones set by the face cut: through the face cut's lines
  assert.ok(snapDepths(spec, { s: 1, i: 0 }).length > snapDepths({ ...spec, cuts: [spec.cuts[1]] }, { s: 0, i: 0 }).length);
});

test("truncation trims corners or edges into new faces with their own stickers", () => {
  const cube = { name: "t", rule: "custom", size: 2, solid: "cube", cuts: [{ on: "face", depths: [1 / 3] }] };
  // corners trimmed two-thirds of the way out: a cuboctahedron (6 squares + 8 triangles)
  const cubocta = buildPuzzle({ ...cube, truncate: { vertex: 2 / 3 } });
  assert.equal(cubocta.solid.polys.length, 14);
  assert.equal(cubocta.normals.length, 14);
  assert.equal(cubocta.group.mats.length, 24);
  // a shallower trim: truncated cube, and its trim faces carry stickers
  const tc = buildPuzzle({ ...cube, truncate: { vertex: 0.85 } });
  assert.equal(tc.solid.polys.length, 14);
  assert.ok(tc.pieces.some((p) => p.stickers.some((st) => st.color >= 6)));
  const s = solvedState(tc);
  for (const m of scrambleMoves(tc, 50, seeded(8))) applyMove(tc, s, m);
  assert.ok(!isSolved(tc, s));
  // a trimmed tetrahedron keeps the tetrahedron's 12 rotations: its trim faces point where a
  // cube's corners do, but must not be swapped with its original faces
  const tet = buildPuzzle({ name: "tt", rule: "custom", size: 2, solid: "tetrahedron", cuts: [{ on: "face", depths: [0.5] }], truncate: { vertex: 0.6 } });
  assert.equal(tet.group.mats.length, 12);
  // edges trimmed too: faces from all three kinds (trim the edges too deep and they take
  // the corner faces with them)
  const both = buildPuzzle({ ...cube, truncate: { vertex: 0.8, edge: 0.97 } });
  assert.equal(both.solid.polys.length, 6 + 8 + 12);
  assert.equal(buildPuzzle({ ...cube, truncate: { vertex: 0.9, edge: 0.9 } }).solid.polys.length, 6 + 12);
  // snapping on a trimmed solid still finds candidates
  assert.ok(snapDepths({ ...cube, truncate: { vertex: 0.85 } }, { s: 0, i: 0 }).length > 0);
});

test("cuts go around the truncated shape: face cuts cut the truncation's faces too", () => {
  const spec = { name: "t", rule: "custom", size: 2, solid: "cube", truncate: { vertex: 0.85 }, cuts: [{ on: "face", depths: [0.6] }] };
  const P = buildPuzzle(spec);
  // face cuts around the 6 squares (4-fold) and the 8 corner triangles (3-fold)
  assert.deepEqual(P.axes.map((a) => a.order).sort(), [3, 3, 3, 3, 4, 4, 4]);
  const s = solvedState(P), moves = scrambleMoves(P, 80, seeded(9));
  for (const m of moves) applyMove(P, s, m);
  for (const m of [...moves].reverse()) applyMove(P, s, inverseMove(P, m));
  assert.ok(isSolved(P, s));
});

test("truncation snaps: a cube's corners truncated to the edge midpoints is a cuboctahedron", () => {
  const spec = { name: "t", rule: "custom", size: 2, solid: "cube", truncate: { vertex: 0.8 }, cuts: [] };
  const snaps = snapDepths(spec, { trim: "vertex" });
  assert.ok(snaps.some((f) => Math.abs(f - 2 / 3) < 1e-6), snaps.join(" "));
});

test("piece types: pieces the solid's rotations carry onto each other", () => {
  const count = (P) => { const c = {}; for (const t of P.types) c[t] = (c[t] || 0) + 1; return Object.values(c).sort((a, b) => a - b); };
  assert.deepEqual(count(preset("cube", 3)), [1, 6, 8, 12]); // core, centers, corners, edges
  assert.deepEqual(count(preset("skewb")), [6, 8]); // centers, corners
  assert.deepEqual(count(preset("megaminx", 3)), [1, 12, 20, 30]);
  // blacking out a type blacks out every piece of it and nothing else
  const spec = { name: "c", solid: "cube", rule: "custom", size: 2, on: "face", depths: [1 / 3] };
  const plain = buildPuzzle(spec);
  const edgeType = plain.types[plain.pieces.findIndex((p) => p.stickers.length === 2)];
  const P = buildPuzzle({ ...spec, blackout: [edgeType] });
  assert.equal(P.pieces.filter((p) => p.stickers.length).length, 26 - 12);
  assert.ok(P.pieces.every((p, i) => (P.types[i] === edgeType) === (p.stickers.length === 0 && plain.pieces[i].stickers.length > 0)));
});

test("layers with no stickers are marked empty, and scrambles skip them", () => {
  const spec = { name: "c", solid: "cube", rule: "custom", size: 2, on: "face", depths: [1 / 3] };
  const plain = buildPuzzle(spec);
  assert.ok(plain.axes.every((a) => a.empty.every((e) => !e)));
  // black out edges and centers: a 3×3's middle slices then hold nothing visible
  const kind = (n) => plain.types[plain.pieces.findIndex((p) => p.stickers.length === n)];
  const P = buildPuzzle({ ...spec, blackout: [kind(1), kind(2)] });
  assert.ok(P.axes.every((a) => a.empty[1] && !a.empty[0] && !a.empty[2]));
  const s = solvedState(P);
  for (const m of scrambleMoves(P, 60, seeded(4))) assert.notEqual(m.layer, 1);
});

test("every preset converts to a custom puzzle with the same pieces and stickers", () => {
  // same pieces (matched by centroid, within a tolerance) with the same sticker colors
  const colors = (q) => q.stickers.map((s) => s.color).sort().join(".");
  for (const p of PRESETS.filter((p) => !p.noCustom)) { // cuboids and prisms aren't in the editor
    const sizes = p.fixed ? [p.size] : [1, 2, 3, 4, 5].filter((n) => snapSize(p, n) === n);
    for (const n of sizes) {
      const P = buildPuzzle(p, n), C = buildPuzzle(toCustom(P));
      assert.equal(C.pieces.length, P.pieces.length, `${p.id}@${n}`);
      const find = pieceFinder(P.pieces);
      for (const q of C.pieces) {
        const r = find(q.centroid);
        assert.ok(r && colors(r) === colors(q), `${p.id}@${n}`);
      }
    }
  }
  // the 3×3 is one cut a third of the way out; the tetrahedron keeps its negative depth
  assert.deepEqual(toCustom(preset("cube", 3)).cuts[0].depths.map((d) => +d.toFixed(6)), [0.333333]);
  assert.ok(toCustom(preset("ftt", 3)).cuts[0].depths[0] < 0);
});

test("rhombic dodecahedron cuts through its neighbors' centers, with no slivers", () => {
  const rd = preset("rhombic-dodeca");
  const k = {};
  for (const p of rd.pieces) if (p.stickers.length) k[p.stickers.length] = (k[p.stickers.length] || 0) + 1;
  assert.deepEqual(k, { 1: 24, 3: 8, 4: 6 });
  assert.ok(rd.axes.every((a) => a.order === 2)); // half turns only
});

test("rhombic triacontahedron: half turns, each face a center, 4 edges and 4 corners", () => {
  const P = preset("rhombic-triaconta");
  const k = {};
  for (const p of P.pieces) if (p.stickers.length) k[p.stickers.length] = (k[p.stickers.length] || 0) + 1;
  assert.deepEqual(k, { 1: 30, 2: 60, 3: 20, 5: 12 }); // 9 stickers per face
  assert.equal(P.group.mats.length, 60);
  assert.ok(P.axes.every((a) => a.order === 2));
  assert.ok(puzzleStats(P).smallest > 0.02);
});

test("soccer ball: a corner-truncated icosahedron turning around its 32 faces", () => {
  const P = preset("soccer");
  const sides = {};
  for (const f of P.solid.polys) sides[f.verts.length] = (sides[f.verts.length] || 0) + 1;
  assert.deepEqual(sides, { 5: 12, 6: 20 });
  const k = {};
  for (const p of P.pieces) if (p.stickers.length) k[p.stickers.length] = (k[p.stickers.length] || 0) + 1;
  assert.deepEqual(k, { 1: 32, 2: 90, 3: 60 }); // the Tuttminx's pieces
  // pentagons turn in fifths; hexagons in thirds (the solid only has 3-fold symmetry there)
  const orders = P.axes.map((a) => a.order).sort();
  assert.deepEqual(orders, [...Array(10).fill(3), ...Array(6).fill(5)]);
  assert.ok(puzzleStats(P).smallest > 0.03);
  // odd sizes: the inner row stays at size 3's depth, the rest evenly spaced outside it
  const P5 = preset("soccer", 5);
  assert.deepEqual(P5.cuts[0].depths.map((d) => +d.toFixed(4)), [0.9435, 0.8871]);
  assert.ok(P5.axes.every((a) => a.layers === 5));
  assert.ok(puzzleStats(P5).smallest > 0.005);
  assert.equal(preset("soccer", 1).pieces.length, 1);
  // even sizes: the next odd size's pieces with the middle strips blacked out, like an even minx
  const visible = (Q) => Q.pieces.filter((p) => p.stickers.length);
  const P2 = preset("soccer", 2);
  assert.equal(P2.pieces.length, P.pieces.length);
  assert.equal(visible(P2).length, 60); // only the corners show
  const P4 = preset("soccer", 4);
  assert.equal(P4.pieces.length, P5.pieces.length);
  assert.equal(visible(P4).length, 420);
});

test("even minxes are the next odd size with the middle strips blacked out", () => {
  const visible = (P) => P.pieces.filter((p) => p.stickers.length);
  const kilo = preset("megaminx", 2);
  assert.equal(kilo.pieces.length, preset("megaminx", 3).pieces.length); // same cuts as a megaminx
  assert.equal(visible(kilo).length, 20); // only the corners show
  assert.ok(visible(kilo).every((p) => p.stickers.length === 3));
  assert.equal(visible(preset("megaminx", 4)).length, 140); // master kilominx: 20 + 60 + 60
  assert.equal(puzzleTitle(family("megaminx"), 2), "Kilominx");
});

test("titles", () => {
  assert.equal(puzzleTitle(family("cube"), 3), "3×3×3 cube");
  assert.equal(puzzleTitle(family("megaminx"), 5), "Gigaminx");
  assert.equal(puzzleTitle(family("icosahedron"), 3), "Icosahedron, size 3");
  assert.equal(puzzleTitle(family("pyraminx"), 7), "Pyraminx, size 7");
});

test("pieces fill the solid and every piece has positive volume", () => {
  for (const { id, P } of ALL) {
    const solidVol = volume({ ...P.solid, centroid: [0, 0, 0] });
    const vols = P.pieces.map(volume);
    assert.ok(vols.every((v) => v > 1e-9), `${id} has a degenerate piece`);
    assert.ok(Math.abs(vols.reduce((a, b) => a + b, 0) - solidVol) < 1e-6, `${id} volume mismatch`);
  }
});

test("a full turn is the identity; a single turn unsolves", () => {
  for (const { id, P } of ALL) {
    const s = solvedState(P);
    const m = { axis: 0, layer: P.axes[0].layers - 1, q: 1 };
    applyMove(P, s, m);
    assert.ok(!isSolved(P, s), `${id}: one turn should unsolve`);
    for (let i = 1; i < P.axes[0].order; i++) applyMove(P, s, m);
    assert.deepEqual([...s], [...solvedState(P)], id);
  }
});

test("scramble then inverse returns exactly to solved", () => {
  for (const { id, P } of ALL) {
    const s = solvedState(P);
    const moves = randomMoves(P, 200, seeded(7));
    for (const m of moves) applyMove(P, s, m);
    assert.ok(!isSolved(P, s), id);
    for (const m of [...moves].reverse()) applyMove(P, s, inverseMove(P, m));
    assert.ok(isSolved(P, s), id);
    assert.deepEqual([...s], [...solvedState(P)], id);
  }
});

test("turning every layer of an axis together is a rotation, and still solved", () => {
  for (const { id, P } of ALL) {
    const s = solvedState(P);
    for (let L = 0; L < P.axes[0].layers; L++) applyMove(P, s, { axis: 0, layer: L, q: 1 });
    assert.ok(isSolved(P, s), id);
  }
});

test("layers never straddle: every piece is in exactly one layer, in any state", () => {
  const P = preset("megaminx", 5);
  const s = solvedState(P);
  for (const m of randomMoves(P, 100, seeded(3))) applyMove(P, s, m);
  for (let k = 0; k < P.axes.length; k++) {
    let total = 0;
    for (let L = 0; L < P.axes[k].layers; L++) total += piecesInLayer(P, s, k, L).length;
    assert.equal(total, P.pieces.length);
  }
});

test("cube labels read like cubing notation", () => {
  const P = preset("cube", 3);
  const x = P.axes.findIndex((a) => a.dir[0] === 1);
  assert.equal(moveLabel(P, { axis: x, layer: 2, q: 3 }).suffix, "");   // clockwise from R
  assert.equal(moveLabel(P, { axis: x, layer: 2, q: 1 }).suffix, "'");
  assert.equal(moveLabel(P, { axis: x, layer: 2, q: 2 }).suffix, "2");
  assert.equal(moveLabel(P, { axis: x, layer: 0, q: 1 }).suffix, "");   // clockwise from L
  assert.equal(moveLabel(P, { axis: x, layer: 1, q: 1 }).depth, 2);
  assert.deepEqual(moveLabel(P, { axis: x, layer: 2, q: 1 }).colors, ["#c8102e"]);
  assert.equal(moveLabel(P, { axis: x, layer: 0, q: 1 }).colors[0], "#ff6a13");
  const M = preset("megaminx", 3);
  assert.equal(moveLabel(M, { axis: 0, layer: 2, q: 3 }).suffix, "2");
  assert.equal(moveLabel(M, { axis: 0, layer: 2, q: 2 }).suffix, "2'");
});

// pieces with two or more stickers that fit orientation g (every sticker on the face g puts
// its color on): see closestOrientation
const fitting = (P, s, g) => P.pieces.filter((p, i) => p.stickers.length >= 2 && p.stickers.every((x) => P.group.facePerm[s[i]][x.color] === P.group.facePerm[g][x.color])).length;
// After a scramble the solved card stays as it started (0), unless the scramble left a real
// block of pieces solved relative to each other in another orientation: a face's worth or
// more, at least as big as what fits 0 (a cuboid's half-turned slab can do that; the same
// size, it won on white). Never a flip to an orientation with nothing behind it.
const keepsOrientation = (P, s, id) => {
  const g = closestOrientation(P, s);
  if (g === 0) return;
  assert.ok(fitting(P, s, g) >= P.faceWorth && fitting(P, s, g) >= fitting(P, s, 0), `${id}: turned to ${g} (${fitting(P, s, g)} fit) over 0 (${fitting(P, s, 0)})`);
};

test("scrambles don't reorient the puzzle without a reason", () => {
  for (const { id, P } of ALL) {
    const s = solvedState(P);
    for (const m of scrambleMoves(P, 150, seeded(11))) applyMove(P, s, m);
    keepsOrientation(P, s, id);
    assert.ok(!isSolved(P, s), `${id}: scrambled`);
  }
  // a 3×3 scramble is face turns only, so the centers never move
  const cube = preset("cube", 3), s = solvedState(cube);
  for (const m of scrambleMoves(cube, 100, seeded(5))) applyMove(cube, s, m);
  cube.pieces.forEach((p, i) => { if (p.onAxis) assert.equal(cube.group.facePerm[s[i]][p.stickers[0].color], p.stickers[0].color); });
});

// every piece turned by rotation h, as if the whole puzzle were picked up and turned
const turnWhole = (P, s, h) => { for (let i = 0; i < s.length; i++) s[i] = P.group.mul[h][s[i]]; };

test("the solved card follows a solved layer, however the puzzle is held (2×2)", () => {
  const P = preset("cube", 2), G = P.group;
  const R = P.axes.findIndex((a) => Math.abs(a.dir[0]) > 0.99), U = P.axes.findIndex((a) => Math.abs(a.dir[1]) > 0.99);
  const up = (a) => (P.axes[a].dir[a === U ? 1 : 0] > 0 ? 1 : 0); // the layer on the + side
  const bottom = P.pieces.map((p, i) => i).filter((i) => P.pieces[i].centroid[1] < 0);
  // Sune (R U R' U R U2 R'), in whichever turn directions keep the bottom layer here
  let s = null;
  for (const [r, u] of [[1, 1], [1, 3], [3, 1], [3, 3]]) {
    const t = solvedState(P);
    for (const [a, q] of [[R, r], [U, u], [R, 4 - r], [U, u], [R, r], [U, 2 * u], [R, 4 - r]]) applyMove(P, t, { axis: a, layer: up(a), q: q % 4 });
    if (bottom.every((i) => t[i] === 0) && !isSolved(P, t)) { s = t; break; }
  }
  assert.ok(s, "a Sune that keeps the bottom layer");
  // picked up and turned over: the bottom layer, still solved, is now held differently
  const h = G.find(rotMat([1, 0, 0], Math.PI / 2));
  turnWhole(P, s, h);
  assert.equal(closestOrientation(P, s), h);
});

test("between solved groups the same size, the one with white wins", () => {
  // a 2×2 with its top (white) layer turned: two solved layers, four pieces each
  const P = preset("cube", 2), U = P.axes.findIndex((a) => Math.abs(a.dir[1]) > 0.99);
  const top = P.axes[U].dir[1] > 0 ? 1 : 0, s = solvedState(P);
  applyMove(P, s, { axis: U, layer: top, q: 1 });
  assert.equal(closestOrientation(P, s), P.axes[U].rot[1]);
  // and a crystal prism with its white half turned: the card turns with the white face
  const C = buildPuzzle({ ...family("prism-crystal"), sides: 6, rows: 2 }), cap = C.axes.findIndex((a) => Math.abs(a.dir[2]) > 0.99);
  const white = C.colors.findIndex((c) => c === "#f4f4ee"), t = solvedState(C);
  const whiteLayer = C.normals[white][2] * C.axes[cap].dir[2] > 0 ? C.axes[cap].layers - 1 : 0;
  applyMove(C, t, { axis: cap, layer: whiteLayer, q: 1 });
  assert.equal(closestOrientation(C, t), C.axes[cap].rot[1]);
});

test("reference orientation follows a 3×3's centers", () => {
  const P = preset("cube", 3);
  const s = solvedState(P);
  const x = P.axes.findIndex((a) => a.dir[0] === 1);
  applyMove(P, s, { axis: x, layer: 1, q: 1 }); // M slice: centers move, outer layers don't
  const g = closestOrientation(P, s);
  // every center sticker sits on the face the reference orientation puts its color on
  const fp = P.group.facePerm;
  for (let i = 0; i < P.pieces.length; i++)
    if (P.pieces[i].onAxis) for (const st of P.pieces[i].stickers) assert.equal(fp[s[i]][st.color], fp[g][st.color]);
  assert.notEqual(g, 0);
  assert.equal(P.pieces.filter((p) => p.onAxis).length, 6);
});

test("megaminx uses the standard color scheme", () => {
  const P = preset("megaminx", 3);
  const name = { "#f4f4ee": "white", "#5c6068": "gray", "#0051ba": "blue", "#5ab4ff": "light blue",
    "#c8102e": "red", "#ff6a13": "orange", "#009e60": "green", "#8ed142": "light green",
    "#7b3fb3": "purple", "#ff7eb6": "pink", "#ffe600": "yellow", "#d6c298": "beige" };
  const opp = { white: "gray", blue: "light blue", red: "orange", green: "light green", purple: "pink", yellow: "beige" };
  const color = (i) => name[P.colors[i]];
  for (let i = 0; i < 12; i++) {
    const j = P.normals.findIndex((n) => dot(n, P.normals[i]) < -1 + 1e-6);
    const [a, b] = [color(i), color(j)];
    assert.ok(opp[a] === b || opp[b] === a, `${a} is opposite ${b}`);
  }
  // around white, clockwise from outside: blue, red, green, purple, yellow
  const w = P.normals[0];
  const ring = P.normals.map((n, i) => i).filter((i) => Math.abs(dot(P.normals[i], w) - 1 / Math.sqrt(5)) < 1e-6);
  const order = ["blue"];
  let cur = ring.find((i) => color(i) === "blue");
  for (let k = 0; k < 4; k++) {
    // next clockwise neighbor: the ring face adjacent to cur for which (cur × next)·w < 0
    cur = ring.find((i) => i !== cur && Math.abs(dot(P.normals[i], P.normals[cur]) - 1 / Math.sqrt(5)) < 1e-6 && dot(cross(P.normals[cur], P.normals[i]), w) < 0);
    order.push(color(cur));
  }
  assert.deepEqual(order, ["blue", "red", "green", "purple", "yellow"]);
});

test("icosahedron uses the cubing.js / FTO Discord scheme", () => {
  const P = preset("golden-icosahedron");
  assert.equal(new Set(P.colors).size, 20);
  const col = { R: "#f4f400", C: "#d41f69", F: "#008800", E: "#5c5c5c", L: "#8800dd", U: "#ffffff", A: "#007a89",
    G: "#ff0000", I: "#7d3b11", S: "#b9a1ff", H: "#3399ff", J: "#5ec4b6", B: "#44ee00", K: "#d8b87c", D: "#aaaaaa",
    M: "#ff66cc", O: "#292929", P: "#ff8000", N: "#980000", Q: "#0000ff" };
  const at = (name) => P.normals[P.colors.indexOf(col[name])];
  // cubing.js's net: each face's neighbors, clockwise seen from outside
  const net = [["R", "C", "F", "E"], ["F", "R", "L", "U"], ["L", "F", "A", ""], ["E", "R", "G", "I"], ["I", "E", "S", "H"],
    ["S", "I", "J", "B"], ["B", "S", "K", "D"], ["K", "B", "M", "O"], ["O", "K", "P", "N"], ["P", "O", "Q", ""]];
  const edgeDot = Math.sqrt(5) / 3;
  for (const [x, ...ring] of net) {
    const n = at(x);
    ring.forEach((y, i) => {
      if (!y) return;
      assert.ok(Math.abs(dot(n, at(y)) - edgeDot) < 1e-6, `${x} and ${y} share an edge`);
      const z = ring[(i + 1) % 3];
      // clockwise from outside: going y → z turns the wrong way around n for (y × z)·n > 0
      if (z) assert.ok(dot(cross(at(y), at(z)), n) < 0, `${x}: ${y} then ${z} runs clockwise`);
    });
  }
});

test("octahedron opposite faces pair like a cube's", () => {
  const P = preset("octahedron", 3);
  const pairs = [["#f4f4ee", "#ffe600"], ["#c8102e", "#ff6a13"], ["#009e60", "#0051ba"], ["#7b3fb3", "#5c6068"]];
  for (let i = 0; i < 8; i++) {
    const j = P.normals.findIndex((n) => dot(n, P.normals[i]) < -1 + 1e-6);
    assert.ok(pairs.some(([a, b]) => (P.colors[i] === a && P.colors[j] === b) || (P.colors[i] === b && P.colors[j] === a)));
  }
});

test("textures on by default past 12 faces, and faces sharing one have clearly different colors", () => {
  assert.equal(preset("megaminx").texturesByDefault, false);
  assert.equal(preset("icosahedron").texturesByDefault, true);
  // up to 7 faces, every face gets its own texture
  assert.equal(new Set(preset("cube").textures).size, 6);
  for (const id of ["icosahedron", "rhombic-triaconta", "soccer"]) {
    const P = preset(id);
    assert.equal(P.textures.length, P.colors.length);
    let worst = Infinity;
    P.colors.forEach((a, i) => P.colors.forEach((b, j) => { if (i < j && P.textures[i] === P.textures[j]) worst = Math.min(worst, colorDistance(a, b)); }));
    assert.ok(worst > 0.12, `${id}: ${worst}`);
  }
});

test("cuboids: a layer count per axis, and non-square faces only turn in halves", () => {
  const P = buildPuzzle({ ...family("cuboid"), a: 2, b: 3, c: 4 });
  assert.equal(P.pieces.length, 24);
  assert.deepEqual(P.axes.map((a) => `${a.order}/${a.layers}`).sort(), ["2/2", "2/3", "2/4"]);
  const Q = buildPuzzle({ ...family("cuboid"), a: 3, b: 3, c: 5 });
  assert.deepEqual(Q.axes.map((a) => `${a.order}/${a.layers}`).sort(), ["2/3", "2/3", "4/5"]);
  assert.equal(puzzleTitle(Q.spec, 3), "3×3×5 cuboid");
});

test("prisms: every kind and side count scrambles cleanly", () => {
  // deep: `cuts` cuts per side make 2 × cuts columns on each side face; height is the layers
  const deep = buildPuzzle({ ...family("prism"), sides: 6, cuts: 2, rows: 4 });
  const cap = deep.axes.find((a) => Math.abs(a.dir[2]) > 0.5);
  assert.equal(cap.layers, 4);
  assert.equal(Math.max(...deep.pieces.map((p) => p.centroid[2])) > 0, true);
  // taller is taller: the solid grows with its rows
  const zTop = (P) => Math.max(...P.solid.polys.flatMap((q) => q.verts.map((v) => v[2])));
  assert.ok(Math.abs(zTop(buildPuzzle({ ...family("prism"), rows: 6 })) - 2 * zTop(buildPuzzle({ ...family("prism"), rows: 3 }))) < 1e-9);
  // crystal: each side cut through the middle; height is layers, and makes it taller
  const crystal = buildPuzzle({ ...family("prism-crystal"), sides: 5, rows: 3 });
  assert.ok(Math.abs(zTop(buildPuzzle({ ...family("prism-crystal"), rows: 4 })) - 2 * zTop(buildPuzzle({ ...family("prism-crystal"), rows: 2 }))) < 1e-9);
  const crystalCap = crystal.axes.find((a) => Math.abs(a.dir[2]) > 0.5);
  assert.equal(crystalCap.layers, 3);
  assert.ok(crystal.axes.every((a) => a === crystalCap || (a.offsets.length === 1 && Math.abs(a.offsets[0]) < 1e-9)));
  for (const kind of ["prism", "prism-crystal"])
    for (let sides = 3; sides <= 16; sides++)
      for (const variant of [{ cuts: 1, rows: 2 }, { cuts: 2, rows: 3 }]) {
        const P = buildPuzzle({ ...family(kind), sides, ...variant }), id = `${sides}-${kind}-${variant.cuts}x${variant.rows}`;
        const capAxis = P.axes.find((a) => Math.abs(a.dir[2]) > 0.5);
        if (capAxis) assert.equal(capAxis.order, sides, id);
        // four sides turn in quarters only when the prism is as tall as it is wide
        assert.ok(P.axes.every((a) => a === capAxis || a.order === 2 || (sides === 4 && a.order === 4)), id);
        // (small ones, like a hexagonal prism crystal's 6 wedges, can scramble back to solved
        // by chance, so only ask that some scramble doesn't)
        let unsolved = false;
        for (const seed of [1, 2, 3]) {
          const s = solvedState(P);
          for (const m of scrambleMoves(P, 80, seeded(sides * 10 + variant.cuts + 1000 * seed))) applyMove(P, s, m);
          keepsOrientation(P, s, id);
          unsolved ||= !isSolved(P, s);
        }
        assert.ok(unsolved, id);
      }
});

test("deep cuts: dino, helicopter, megaminx crystal, chopasaurus", () => {
  const kinds = (P) => { const k = {}; for (const p of P.pieces) if (p.stickers.length) k[p.stickers.length] = (k[p.stickers.length] || 0) + 1; return k; };
  assert.deepEqual(kinds(preset("dino")), { 2: 12 });
  // dino sizes: evenly spaced from the neighbors' plane (1/3 of the way to the corner) outward
  const dino3 = preset("dino", 3);
  assert.deepEqual(dino3.axes[0].offsets.map((o) => +(o / Math.sqrt(3)).toFixed(6)), [-2 / 3, -1 / 3, 1 / 3, 2 / 3].map((x) => +x.toFixed(6)));
  assert.deepEqual(kinds(dino3), { 2: 36 });
  assert.deepEqual(kinds(preset("helicopter")), { 1: 24, 3: 8 });
  assert.ok(preset("helicopter").axes.every((a) => a.order === 2));
  assert.deepEqual(kinds(preset("megaminx-crystal")), { 2: 30, 3: 20 });
  assert.deepEqual(kinds(preset("chopasaurus")), { 2: 30, 3: 20, 12: 1 }); // the face centers never move: one core
  assert.deepEqual(kinds(preset("icosahedron-crystal")), { 1: 60, 2: 90, 5: 12 });
  assert.deepEqual(kinds(preset("pyraminx-crystal")), { 2: 6, 3: 4 }); // (cut past the center: no face centers)
  // corner-turning octahedron: cuts at 1/3 and 2/3 of each corner's height, 9 triangles a face
  const octa = preset("octa-corner");
  assert.deepEqual(kinds(octa), { 2: 12, 4: 12 });
  assert.ok(octa.axes.every((a) => a.order === 4 && a.layers === 5));
  assert.deepEqual(octa.axes[0].offsets.map((o) => +(o / Math.sqrt(3)).toFixed(6)), [-2 / 3, -1 / 3, 1 / 3, 2 / 3].map((x) => +x.toFixed(6)));
  // skewb sizes: N even layers per corner, so every face is a grid of squares
  assert.deepEqual(kinds(preset("skewb", 2)), { 1: 6, 3: 8 });
  assert.deepEqual(kinds(preset("skewb", 3)), { 1: 30, 2: 12, 3: 8 }); // master: 6 centers + 24 petals, 12 edges, 8 corners
  assert.equal(puzzleTitle(family("skewb"), 3), "Master Skewb");
  assert.equal(puzzleTitle(family("skewb"), 4), "Professor Skewb");
  for (const n of [3, 4]) {
    const P = preset("skewb", n);
    assert.ok(P.axes.every((a) => a.layers === n && a.order === 3));
    // square stickers: every sticker away from the edges has 4 equal sides
    const squares = P.pieces.flatMap((p) => p.stickers).filter((st) => st.verts.length === 4);
    assert.ok(squares.length > 0);
    for (const st of squares) {
      const sides = st.verts.map((v, i) => len(sub(st.verts[(i + 1) % 4], v)));
      assert.ok(sides.every((x) => Math.abs(x - sides[0]) < 1e-9), `skewb@${n}`);
    }
  }
  assert.ok(puzzleStats(preset("icosahedron-crystal")).smallest > 0.015);
});
