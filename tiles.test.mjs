// Unit tests for the tile-turning puzzles (tiles.mjs).
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TILE_PRESETS, buildTiles, solvedTileState, applyTileMove, inverseTileMove, isTileSolved, tileScrambleMoves,
  piecesInCircle, piecePose, tileCount, tilesFit, snapTiles, signedTurn, outlineArea,
} from "./tiles.mjs";

const preset = (tiling, a, b = 0) => buildTiles({ ...TILE_PRESETS.find((p) => p.tiling === tiling), a, b });
const kinds = (P, pieces = P.pieces) => pieces.reduce((k, pc) => ({ ...k, [pc.kind]: (k[pc.kind] || 0) + 1 }), {});
const play = (P, moves, s = solvedTileState(P)) => { for (const m of moves) applyTileMove(P, s, m); return s; };
function seeded(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("tile counts: a² + ab + b² hexagons, a² + b² squares, twice the hexagons' count of triangles", () => {
  for (const [tiling, a, b, n] of [["hex", 3, 0, 9], ["hex", 2, 1, 7], ["hex", 3, 1, 13], ["square", 2, 1, 5], ["square", 3, 0, 9], ["triangle", 2, 0, 8], ["triangle", 2, 1, 14]]) {
    assert.equal(tileCount({ tiling, a, b }), n);
    assert.equal(preset(tiling, a, b).tiles.length, n, `${tiling} (${a}, ${b})`);
  }
});

test("hexagons cut like a 3×3×3: per tile a center, three edges and two corners; a turn moves 1 + 6 + 6", () => {
  for (const [a, b] of [[3, 0], [2, 1], [4, 0]]) {
    const P = preset("hex", a, b), T = P.tiles.length;
    assert.deepEqual(kinds(P), { 1: T, 2: 3 * T, 3: 2 * T });
  }
  const P = preset("hex", 4);
  assert.deepEqual(kinds(P, [...piecesInCircle(P, solvedTileState(P), 0).keys()].map((i) => P.pieces[i])), { 1: 1, 2: 6, 3: 6 });
});

test("squares and triangles: the same pieces on every tile, corners of 4 and 6 tiles", () => {
  const S = preset("square", 3);
  assert.deepEqual(kinds(S), { 1: 5 * 9, 2: 2 * 9, 4: 9 });
  const T = preset("triangle", 2);
  assert.deepEqual(kinds(T), { 1: 7 * 8, 2: 4.5 * 8, 6: 0.5 * 8 });
  // every piece is a real region, not a sampling speck
  for (const P of [S, T, preset("hex", 3)]) assert.ok(Math.min(...P.pieces.map((pc) => pc.area)) > 0.005);
});

test("every sticker knows its tile, and each tile has its stickers", () => {
  for (const [tiling, a, b] of [["hex", 3, 0], ["hex", 2, 1], ["square", 2, 1], ["triangle", 2, 1]]) {
    const P = preset(tiling, a, b), per = new Array(P.tiles.length).fill(0);
    for (const pc of P.pieces) for (const st of pc.stickers) { assert.ok(Number.isInteger(st.tile), `${tiling} (${a}, ${b})`); per[st.tile]++; }
    assert.equal(new Set(per).size, 1, "every tile the same number of stickers");
  }
});

test("each piece's exact outline: closed loops of arcs enclosing the area the sampling found", () => {
  for (const [tiling, a] of [["hex", 3], ["square", 3], ["triangle", 2]]) {
    const P = preset(tiling, a);
    for (const pc of P.pieces) {
      assert.equal(pc.outline.length, 1, `${tiling}: one loop`);
      const loop = pc.outline[0], at = (arc, ang) => [arc.c[0] + P.r * Math.cos(ang), arc.c[1] + P.r * Math.sin(ang)];
      const gap = Math.hypot(...at(loop.at(-1), loop.at(-1).a1).map((v, k) => v - at(loop[0], loop[0].a0)[k]));
      assert.ok(gap < 1e-6, `${tiling}: the loop closes`);
      const area = outlineArea(pc.outline, P.r);
      assert.ok(Math.abs(area - pc.area) < 0.03 * pc.area + 0.002, `${tiling}: area ${area} vs ${pc.area}`);
    }
  }
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

test("scrambles undo exactly (positions are integers: no drift)", () => {
  for (const [tiling, a, b] of [["hex", 2, 1], ["square", 3, 0], ["triangle", 2, 1]]) {
    const P = preset(tiling, a, b), moves = tileScrambleMoves(P, 300, seeded(7));
    const s = play(P, moves);
    assert.equal(isTileSolved(P, s), false);
    play(P, moves.slice().reverse().map((m) => inverseTileMove(P, m)), s);
    assert.ok(s.every((v) => v === 0), tiling);
  }
});

test("a turn's pieces each turn about the copy of the center right by them", () => {
  for (const [tiling, a, b] of [["hex", 3, 0], ["square", 2, 1], ["triangle", 2, 0]]) {
    const P = preset(tiling, a, b), s = play(P, tileScrambleMoves(P, 40, seeded(3)));
    for (let axis = 0; axis < P.tiles.length; axis++)
      for (const [i, c] of piecesInCircle(P, s, axis)) {
        const { anchor } = piecePose(P, s, i), q = P.toPlane(c);
        assert.ok(Math.hypot(anchor[0] - q[0], anchor[1] - q[1]) < P.r, `${tiling}: piece ${i}, tile ${axis}`);
      }
  }
});

test("turns of tiles far apart commute; neighbors' don't", () => {
  const P = preset("hex", 5), far = P.tiles.findIndex((t) => Math.hypot(...t.center) > 2.4), near = 1;
  const a = { axis: 0, layer: 0, q: 1 };
  const once = (x, y) => play(P, [x, y]).join();
  assert.equal(once(a, { axis: far, layer: 0, q: 1 }), once({ axis: far, layer: 0, q: 1 }, a));
  assert.notEqual(once(a, { axis: near, layer: 0, q: 1 }), once({ axis: near, layer: 0, q: 1 }, a));
});

test("solved means every sticker on its own tile: a center turned in place still counts", () => {
  const P = preset("hex", 3), s = solvedTileState(P);
  const center = P.pieces.findIndex((pc) => pc.kind === 1);
  s[3 * center] = 2; // turned a third, in place
  assert.ok(isTileSolved(P, s));
});

test("small tori: a circle has to fit without overlapping itself; snapping grows a", () => {
  assert.equal(tilesFit({ tiling: "hex", a: 1, b: 0 }), false);
  assert.equal(tilesFit({ tiling: "hex", a: 1, b: 1 }), true);
  assert.equal(tilesFit({ tiling: "square", a: 1, b: 1 }), false);
  assert.deepEqual(snapTiles({ tiling: "square", a: 1, b: 1 }), { tiling: "square", a: 2, b: 1 });
  assert.equal(tilesFit({ tiling: "triangle", a: 1, b: 1 }), true);
});

test("signedTurn: the fewest steps either way", () => {
  const P = preset("hex", 3);
  assert.deepEqual([1, 2, 3, 4, 5, -1, 7].map((q) => signedTurn(P, q)), [1, 2, 3, -2, -1, -1, 1]);
});
