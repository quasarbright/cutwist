// Unit tests for the Sierpinski puzzle (sierpinski.mjs). Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIER_PRESETS, buildSier, solvedSierState, applySierMove, inverseSierMove, isSierSolved, sierScrambleMoves } from "./sierpinski.mjs";

const build = (L) => buildSier({ ...SIER_PRESETS[0], levels: L });
const play = (P, moves, s = solvedSierState(P)) => { for (const m of moves) applySierMove(P, s, m); return s; };
const home = (P, s) => s.every((v, i) => v === P.home[i]);
const changed = (P, s) => s.reduce((k, v, i) => k + (v !== P.home[i]), 0);
// (what's in piece a's corner k: its address, and turn)
const inCorner = (P, s, a, k) => { const v = s[3 * P.index(a) + k]; return [P.addr[Math.floor(v / 3)], v % 3]; };
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test("every piece turns and rings: 4 on 2 levels, 13 on 3, 40 on 4; every ring a move to start", () => {
  for (const [L, N] of [[2, 4], [3, 13], [4, 40]]) {
    const P = build(L);
    assert.equal(P.N, N);
    assert.equal(P.axes.length, N);
    assert.ok(P.nodeOf.every((n) => P.canRing(P.home, n)), `${L} levels`);
  }
});

test("to start, a piece's corners hold its thirds; the smallest's, their neighbors and the whole in their own corner", () => {
  const P2 = build(2), s2 = solvedSierState(P2);
  // (the 2 levels as the issue has it: the top third holds the whole at its top, the bottom left and right thirds at theirs; and so on)
  for (const c of [0, 1, 2]) for (const k of [0, 1, 2]) assert.deepEqual(inCorner(P2, s2, [c], k), [k === c ? [] : [k], 0], `third ${c}, corner ${k}`);
  const P3 = build(3), s3 = solvedSierState(P3);
  assert.deepEqual([0, 1, 2].map((k) => inCorner(P3, s3, [], k)[0]), [[0], [1], [2]]);
  assert.deepEqual([0, 1, 2].map((k) => inCorner(P3, s3, [2, 1], k)[0]), [[2, 0], [], [2, 2]]);
});

test("a piece turned: its corners go round, each turned a third; three times is nothing", () => {
  const P = build(3), m = { axis: P.axisAt[P.index([1])], layer: 1, q: 1 }, s = play(P, [m]);
  assert.equal(changed(P, s), 3);
  assert.deepEqual(inCorner(P, s, [1], 1), [[1, 0], 1]);
  assert.ok(home(P, play(P, [m, m, m])));
  assert.ok(home(P, play(P, [m, inverseSierMove(P, m)])));
});

test("a ring: six corners of the pieces in its corners, those touching its middle, round it a third turned; three times is nothing", () => {
  for (const L of [2, 3, 4]) {
    const P = build(L);
    for (const n of P.nodeOf) {
      const m = { axis: P.axisAt[n], layer: 0, q: 1 }, s = play(P, [m]);
      assert.equal(changed(P, s), 6, `${L} levels, ${P.addr[n]}`);
      assert.ok(home(P, play(P, [m, m, m])), `${L} levels, ${P.addr[n]}`);
      assert.ok(home(P, play(P, [m, { ...m, q: -1 }])), `${L} levels, ${P.addr[n]}`);
    }
  }
  // (2 levels, the whole's ring: the top third's bottom left corner, the bottom left third, goes to the bottom left third's bottom right, a third turned)
  const P = build(2), s = play(P, [{ axis: 0, layer: 0, q: 1 }]);
  assert.deepEqual(inCorner(P, s, [1], 2), [[1], 1]);
});

test("a ring isn't a move when its corners hold a piece twice, or itself; then it does nothing", () => {
  const P = build(2), red = P.index([0]);
  const twice = solvedSierState(P);
  twice[3 * red + 1] = twice[3 * red];
  assert.ok(!P.canRing(twice, red));
  assert.deepEqual([...applySierMove(P, twice.slice(), { axis: 1, layer: 0, q: 1 })], [...twice]);
  const itself = solvedSierState(P);
  itself[3 * red + 2] = 3 * red;
  assert.ok(!P.canRing(itself, red));
});

test("solved is every corner as it started: a turn or a ring isn't, the whole turned isn't either", () => {
  const P = build(3);
  assert.ok(isSierSolved(P, solvedSierState(P)));
  for (const m of [{ axis: 0, layer: 1, q: 1 }, { axis: 0, layer: 0, q: 1 }, { axis: 5, layer: 1, q: -1 }]) assert.ok(!isSierSolved(P, play(P, [m])), JSON.stringify(m));
});

test("scrambles undo, from solved and from another scramble, with rings and turns", () => {
  for (const L of [2, 3, 4]) {
    const P = build(L), rand = seeded(L), first = play(P, sierScrambleMoves(P, undefined, rand));
    const from = first.slice(), moves = sierScrambleMoves(P, undefined, rand, from), s = play(P, moves, from.slice());
    assert.ok(!isSierSolved(P, s), `${L} levels`);
    assert.ok(moves.some((m) => m.layer === 0) && moves.some((m) => m.layer === 1));
    play(P, moves.slice().reverse().map((m) => inverseSierMove(P, m)), s);
    assert.deepEqual([...s], [...from], `${L} levels`);
  }
});
