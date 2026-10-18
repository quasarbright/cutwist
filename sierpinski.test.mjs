// Unit tests for the Sierpinski puzzle (sierpinski.mjs). Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIER_PRESETS, buildSier, solvedSierState, applySierMove, inverseSierMove, isSierSolved, sierScrambleMoves } from "./sierpinski.mjs";

const build = (L) => buildSier({ ...SIER_PRESETS[0], levels: L });
const play = (P, moves, s = solvedSierState(P)) => { for (const m of moves) applySierMove(P, s, m); return s; };
const isId = (s) => s.every((v, i) => v === i);
const moved = (s) => s.reduce((k, v, i) => k + (v !== i), 0);
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test("every triangle a piece: 13 on 3 levels, 40 on 4", () => {
  assert.equal(build(3).N, 13);
  assert.equal(build(4).N, 40);
});

test("a turn three times is nothing, a zoom L times is nothing; and what each takes", () => {
  for (const L of [3, 4]) {
    const P = build(L);
    for (let axis = 0; axis < P.axes.length; axis++) for (let layer = 0; layer < P.axes[axis].layers; layer++) {
      const m = { axis, layer, q: 1 };
      assert.ok(isId(play(P, Array(P.axes[axis].order).fill(m))), `${L} levels, axis ${axis} layer ${layer}`);
      assert.ok(!isId(play(P, [m])), `${L} levels, axis ${axis} layer ${layer}: moves something`);
    }
  }
  const P = build(4);
  assert.equal(moved(play(P, [{ axis: 0, layer: 0, q: 1 }])), 21); // (the whole's ring: its thirds, 6 ninths, 12 smallest)
  assert.equal(moved(play(P, [{ axis: 1, layer: 0, q: 1 }])), 9); // (a third's ring)
  assert.equal(moved(play(P, [{ axis: 1, layer: 1, q: 1 }])), 12); // (a third turned: all inside it)
});

test("zooming into a third: its triangles each up a level, the rest into the smallest places", () => {
  const P = build(4);
  for (const c of [0, 1, 2]) {
    const s = play(P, [{ axis: P.zoomAxes[c], layer: 0, q: 1 }]);
    P.addr.forEach((a, i) => {
      const here = P.addr[s.indexOf(i)];
      if (a.length && a[0] === c) assert.deepEqual(here, a.slice(1), `third ${c}: ${a}`);
      else assert.equal(here.length, P.L - 1, `third ${c}: ${a} to the smallest`);
    });
  }
  // (zooms into different thirds differ)
  const a = play(P, [{ axis: P.zoomAxes[0], layer: 0, q: 1 }]), b = play(P, [{ axis: P.zoomAxes[1], layer: 0, q: 1 }]);
  assert.ok(!a.every((v, i) => v === b[i]));
});

test("solved: home, or the whole turned; a zoom, a ring or a third turn isn't", () => {
  const P = build(4);
  for (const q of [1, -1]) assert.ok(isSierSolved(P, play(P, [{ axis: 0, layer: 1, q }])));
  for (const m of [{ axis: P.zoomAxes[0], layer: 0, q: 1 }, { axis: 0, layer: 0, q: 1 }, { axis: 2, layer: 1, q: -1 }]) assert.ok(!isSierSolved(P, play(P, [m])), JSON.stringify(m));
});

test("scrambles undo, and scramble, with zooms, rings and third turns in them", () => {
  for (const L of [3, 4]) {
    const P = build(L), moves = sierScrambleMoves(P, undefined, seeded(L));
    const s = play(P, moves);
    assert.ok(!isSierSolved(P, s), `${L} levels`);
    play(P, moves.slice().reverse().map((m) => inverseSierMove(P, m)), s);
    assert.ok(isId(s), `${L} levels`);
    assert.ok(moves.some((m) => P.axes[m.axis].kind === "zoom") && moves.some((m) => m.layer === 1) && moves.some((m) => P.axes[m.axis].kind === "hole" && m.layer === 0));
  }
});

test("a commutator: the whole's ring and the top third's, each then back, moves 11", () => {
  const P = build(4), a = { axis: 0, layer: 0, q: 1 }, b = { axis: 1, layer: 0, q: 1 };
  assert.equal(moved(play(P, [a, b, { ...a, q: -1 }, { ...b, q: -1 }])), 11);
});
