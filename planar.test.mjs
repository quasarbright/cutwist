// Unit tests for the planar puzzles (planar.mjs): gluings, slides, orientation.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANAR_PRESETS, buildPlanar, wrap, loop, solvedPlanarState, isPlanarSolved, applyPlanarMove, inversePlanarMove,
  planarScrambleMoves, pieceOf, orientOf, MX, MY,
} from "./planar.mjs";

const grid = (topology, width = 5, height = 4) => buildPlanar({ ...PLANAR_PRESETS[0], topology, width, height });
const apply = (P, s, ...moves) => { for (const [axis, layer, q] of moves) applyPlanarMove(P, s, { axis, layer, q }); return s; };
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const at = (P, s, x, y) => ({ piece: pieceOf(s[y * P.W + x]), orient: orientOf(s[y * P.W + x]) });

test("torus: a row slides right and wraps straight around; W steps is the identity", () => {
  const P = grid("torus"), s = solvedPlanarState(P);
  apply(P, s, [0, 1, 1]);
  assert.deepEqual(at(P, s, 1, 1), { piece: 1 * 5 + 0, orient: 0 }); // (0,1) moved to (1,1)
  assert.deepEqual(at(P, s, 0, 1), { piece: 1 * 5 + 4, orient: 0 }); // (4,1) wrapped to (0,1)
  apply(P, s, [0, 1, 4]);
  assert.ok(isPlanarSolved(P, s));
});

test("torus: every loop is one line, never flipped", () => {
  const P = grid("torus");
  for (let r = 0; r < P.H; r++) assert.equal(loop(P, 0, r).cells.length, P.W);
  for (let c = 0; c < P.W; c++) assert.equal(loop(P, 1, c).cells.length, P.H);
  assert.ok([0, 1].every((a) => loop(P, a, 0).flips.every((f) => f === 0)));
});

test("wrap: where out-of-rectangle coordinates land", () => {
  assert.deepEqual(wrap(grid("torus"), 5, -1), { x: 0, y: 3, flip: 0 });
  // Klein: off the bottom of column 1 lands at the top of column 3, mirrored left-right
  assert.deepEqual(wrap(grid("klein"), 1, 4), { x: 3, y: 0, flip: MX });
  assert.deepEqual(wrap(grid("klein"), 5, 1), { x: 0, y: 1, flip: 0 });
  // projective plane: off the right of row 1 lands at the left of row 2, mirrored top-bottom
  assert.deepEqual(wrap(grid("rp2"), 5, 1), { x: 0, y: 2, flip: MY });
  // crossing a mirrored seam twice cancels
  assert.deepEqual(wrap(grid("klein"), 2, 8), { x: 2, y: 0, flip: 0 });
});

test("Klein bottle: a column and its mirror partner are one loop, both moving down", () => {
  const P = grid("klein", 5, 4);
  const L = loop(P, 1, 1);
  assert.equal(L.cells.length, 8); // column 1 then column 3
  assert.deepEqual(L.cells.map((i) => i % 5), [1, 1, 1, 1, 3, 3, 3, 3]);
  const s = apply(P, solvedPlanarState(P), [1, 1, 1]);
  // bottom of column 1 went to the top of column 3, flipped; top of column 3 moved down
  assert.deepEqual(at(P, s, 3, 0), { piece: 3 * 5 + 1, orient: MX });
  assert.deepEqual(at(P, s, 3, 1), { piece: 0 * 5 + 3, orient: 0 });
  assert.deepEqual(at(P, s, 1, 0), { piece: 3 * 5 + 3, orient: MX });
  // sliding the partner column is the same move
  const t = apply(P, solvedPlanarState(P), [1, 3, 1]);
  assert.deepEqual(Array.from(t), Array.from(s));
  // rows wrap straight
  assert.equal(loop(P, 0, 2).cells.length, 5);
});

test("Klein bottle, odd width: the middle column is its own partner; a full trip flips its cells", () => {
  const P = grid("klein", 5, 4), s = solvedPlanarState(P);
  assert.equal(loop(P, 1, 2).cells.length, 4);
  apply(P, s, [1, 2, 4]);
  for (let y = 0; y < 4; y++) assert.deepEqual(at(P, s, 2, y), { piece: y * 5 + 2, orient: MX });
  assert.ok(!isPlanarSolved(P, s)); // home but flipped: not solved
  apply(P, s, [1, 2, 4]);
  assert.ok(isPlanarSolved(P, s));
});

test("Klein bottle: a piece can come home flipped (cross the mirrored seam, then straight back)", () => {
  const P = grid("klein", 5, 4), s = solvedPlanarState(P);
  apply(P, s, [1, 1, 1]); // piece (1,3) → (3,0), flipped
  apply(P, s, [0, 0, -2]); // row 0 left by 2: (3,0) → (1,0)
  assert.deepEqual(at(P, s, 1, 0).orient, MX);
});

test("projective plane: rows and columns both pair up; pieces can reach every orientation", () => {
  const P = grid("rp2", 5, 4);
  assert.deepEqual(loop(P, 0, 1).cells.map((i) => Math.floor(i / 5)), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  assert.equal(loop(P, 1, 0).cells.length, 8);
  const seen = new Set(), s = solvedPlanarState(P);
  for (const m of planarScrambleMoves(P, 200, seeded(7))) { applyPlanarMove(P, s, m); s.forEach((v) => seen.add(orientOf(v))); }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]); // MX, MY and both (a half turn)
});

test("projective plane, odd height: the middle row is its own partner and comes back flipped", () => {
  const P = grid("rp2", 4, 3), s = solvedPlanarState(P);
  assert.equal(loop(P, 0, 1).cells.length, 4);
  apply(P, s, [0, 1, 4]);
  for (let x = 0; x < 4; x++) assert.deepEqual(at(P, s, x, 1), { piece: 4 + x, orient: MY });
});

test("every move is a permutation, and its inverse undoes it, on every surface", () => {
  for (const topology of ["torus", "klein", "rp2"])
    for (const [w, h] of [[5, 4], [4, 5], [3, 3], [1, 4], [2, 1]]) {
      const P = grid(topology, w, h), s = solvedPlanarState(P);
      const moves = planarScrambleMoves(P, 40, seeded(w * 10 + h));
      for (const m of moves) {
        applyPlanarMove(P, s, m);
        assert.equal(new Set(Array.from(s, pieceOf)).size, P.n, `${topology} ${w}×${h}`);
      }
      for (const m of moves.slice().reverse()) applyPlanarMove(P, s, inversePlanarMove(P, m));
      assert.ok(isPlanarSolved(P, s), `${topology} ${w}×${h}`);
    }
});

test("scrambles actually scramble, and a 1×1 grid has nothing to move", () => {
  for (const topology of ["torus", "klein", "rp2"]) {
    const P = grid(topology), s = solvedPlanarState(P);
    for (const m of planarScrambleMoves(P, undefined, seeded(3))) applyPlanarMove(P, s, m);
    assert.ok(!isPlanarSolved(P, s), topology);
  }
  assert.deepEqual(planarScrambleMoves(grid("torus", 1, 1)), []);
  assert.ok(planarScrambleMoves(grid("torus", 1, 4)).every((m) => m.axis === 1)); // only the column moves
});

test("titles", () => {
  const spec = PLANAR_PRESETS[0];
  assert.equal(spec.title(2, { ...spec, width: 6, height: 4, topology: "klein" }), "6×4 Klein bottle");
  assert.equal(spec.title(2, spec), "5×5 torus");
});

test("labels: a letter for the column, a number for the row, like chess", async () => {
  const { label, colLabel } = await import("./planar-view.mjs");
  assert.equal(label(0, 0), "A1");
  assert.equal(label(1, 0), "B1"); // row 1 reads A1, B1, C1…
  assert.equal(label(4, 2), "E3");
  assert.equal(colLabel(25), "Z");
  assert.equal(colLabel(26), "AA"); // past Z, like a spreadsheet
  assert.equal(colLabel(27), "AB");
  assert.equal(colLabel(701), "ZZ");
  assert.equal(colLabel(702), "AAA");
});

test("cell colors: puzzle colors up to 12 rows, vivid hues past; darker across; the darkest column still tells rows apart", async () => {
  const { cellColor, PUZZLE_COLORS } = await import("./planar-view.mjs");
  const { colorDistance } = await import("./puzzle.mjs");
  // up to 12 rows: column A is the puzzle color itself (a Rubik's cube's six first)
  for (let y = 0; y < 6; y++) assert.equal(cellColor(0, y, 5, 6), PUZZLE_COLORS[y]);
  assert.deepEqual(PUZZLE_COLORS.slice(0, 6), ["#f4f4ee", "#c8102e", "#0051ba", "#ffe600", "#009e60", "#ff6a13"]);
  // past 12: column A is the hue at full strength (some channel maxed, another zero)
  for (const y of [0, 5, 11]) {
    const c = cellColor(0, y, 5, 16), ch = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    assert.ok(Math.max(...ch) === 255 && Math.min(...ch) === 0, `${y}: ${c}`);
  }
  assert.equal(cellColor(0, 0, 5, 16), "#ff0000"); // row 1 is red
  // the last column is each row's color, darker, and still tells the rows apart
  // (visibly different starts around 0.02; 16 hues around the wheel are only 22.5° apart)
  for (const [H, least] of [[3, 0.045], [5, 0.045], [8, 0.045], [12, 0.045], [16, 0.03]]) {
    const dark = Array.from({ length: H }, (_, y) => cellColor(5, y, 6, H));
    let min = Infinity;
    dark.forEach((a, i) => dark.forEach((b, j) => { if (i < j) min = Math.min(min, colorDistance(a, b)); }));
    assert.ok(min > least, `${H} rows: ${min}`);
  }
});

