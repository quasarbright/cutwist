// Unit tests for the Sierpinski puzzle (sierpinski.mjs). Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIER_PRESETS, buildSier, solvedSierState, applySierMove, inverseSierMove, isSierSolved, sierScrambleMoves } from "./sierpinski.mjs";

const play = (P, moves, s = solvedSierState(P)) => { for (const m of moves) applySierMove(P, s, m); return s; };
const isId = (s) => s.every((v, i) => v === i);
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test("a turn three times, or a zoom n times, is nothing; the turns' sizes", () => {
  for (const n of [2, 3, 4]) {
    const P = buildSier({ ...SIER_PRESETS[0], levels: n });
    assert.equal(P.N, 3 ** n);
    assert.equal(P.holes.length, (3 ** n - 1) / 2);
    for (let axis = 0; axis < P.axes.length; axis++) for (let layer = 0; layer < P.axes[axis].layers; layer++) {
      const m = { axis, layer, q: 1 };
      assert.ok(isId(play(P, Array(P.axes[axis].order).fill(m))), `${n} levels, axis ${axis} layer ${layer}`);
      assert.ok(!isId(play(P, [m])), `${n} levels, axis ${axis} layer ${layer}: moves something`);
    }
    // (the ring round a depth-k hole: 3 · 2^(n−k−1) triangles; its triangle 3^(n−k))
    for (const ax of P.axes.filter((a) => a.kind === "hole")) {
      assert.equal(P.moving(ax.h, 0).length, 3 * 2 ** (n - ax.depth - 1), `${n} levels, a depth-${ax.depth} ring`);
      assert.equal(P.moving(ax.h, 1).length, 3 ** (n - ax.depth), `${n} levels, a depth-${ax.depth} triangle`);
    }
  }
});

test("zooming is solved; so is the whole thing turned, at any zoom; a ring turn isn't", () => {
  const P = buildSier({ ...SIER_PRESETS[0], levels: 3 }), Z = { axis: P.zoomAxis, layer: 0, q: 1 }, R = { axis: 0, layer: 1, q: 1 };
  for (const moves of [[Z], [Z, Z], [R], [Z, R, R], [Z, { ...Z, q: -1 }, R]]) assert.ok(isSierSolved(P, play(P, moves)), JSON.stringify(moves));
  for (const moves of [[{ axis: 0, layer: 0, q: 1 }], [Z, { axis: 1, layer: 0, q: 1 }], [{ axis: 2, layer: 1, q: -1 }]]) assert.ok(!isSierSolved(P, play(P, moves)), JSON.stringify(moves));
});

test("scrambles undo, and scramble", () => {
  for (const n of [2, 3, 4]) {
    const P = buildSier({ ...SIER_PRESETS[0], levels: n }), moves = sierScrambleMoves(P, undefined, seeded(n));
    const s = play(P, moves);
    assert.ok(!isSierSolved(P, s), `${n} levels`);
    play(P, moves.slice().reverse().map((m) => inverseSierMove(P, m)), s);
    assert.ok(isId(s), `${n} levels`);
    // (zooms in it, and turns at more than one depth)
    assert.ok(moves.some((m) => m.axis === P.zoomAxis));
    assert.ok(new Set(moves.filter((m) => m.axis !== P.zoomAxis).map((m) => P.axes[m.axis].depth)).size > 1);
  }
});

test("commutators: the center ring and a third's ring, each then back, change just 6 triangles", () => {
  const P = buildSier({ ...SIER_PRESETS[0], levels: 4 }), a = { axis: 0, layer: 0, q: 1 }, b = { axis: 1, layer: 0, q: 1 };
  const s = play(P, [a, b, { ...a, q: -1 }, { ...b, q: -1 }]);
  assert.equal(s.reduce((k, v, i) => k + (v !== i), 0), 6);
});

test("a zoom is a zoom: the third you zoom into fills the view, two levels down to one", () => {
  const P = buildSier({ ...SIER_PRESETS[0], levels: 3 }), s = play(P, [{ axis: P.zoomAxis, layer: 0, q: 1 }]);
  // (the triangle at the top third's place d2 d3, now at d2 d3 and its top corner)
  for (let i = 0; i < P.N; i++) { const [d1, d2, d3] = P.addr[i]; if (d1 === 0) assert.equal(s[P.index([d2, d3, 0])], i); }
});
