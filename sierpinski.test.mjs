// Unit tests for the Sierpinski puzzle (sierpinski.mjs). Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIER_PRESETS, buildSier, solvedSierState, applySierMove, inverseSierMove, isSierSolved, sierScrambleMoves } from "./sierpinski.mjs";

const build = (L) => buildSier({ ...SIER_PRESETS[0], levels: L });
const play = (P, moves, s = solvedSierState(P)) => { for (const m of moves) applySierMove(P, s, m); return s; };
const home = (s) => s.every((v, i) => v === 3 * i);
const moved = (s) => s.reduce((k, v, i) => k + (Math.floor(v / 3) !== i), 0);
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test("every triangle a piece: 13 on 3 levels, 40 on 4; a ring only where it's pieces, not copies", () => {
  assert.equal(build(3).N, 13);
  assert.equal(build(4).N, 40);
  assert.deepEqual(build(4).axes.filter((a) => a.ring).map((a) => a.depth), [0, 1, 1, 1]);
  assert.deepEqual(build(3).axes.filter((a) => a.ring).map((a) => a.depth), [0]);
});

test("a turn three times is nothing, once something; pieces never change level", () => {
  for (const L of [3, 4]) {
    const P = build(L);
    for (const ax of P.axes) for (const layer of [0, 1]) {
      if (!P.perms[ax.h][layer]) continue;
      const m = { axis: ax.h, layer, q: 1 }, s = play(P, [m]);
      assert.ok(home(play(P, [m, m, m])), `${L} levels, ${ax.p} layer ${layer}`);
      assert.ok(!home(s), `${L} levels, ${ax.p} layer ${layer}: does something`);
      s.forEach((v, i) => assert.equal(P.addr[Math.floor(v / 3)].length, P.addr[i].length, "a piece on its own level"));
    }
  }
});

test("what each turn takes, on 4 levels: the whole's ring its 6 ninths touching the middle and what's in them; a third its 12", () => {
  const P = build(4);
  const ring = play(P, [{ axis: 0, layer: 0, q: 1 }]);
  assert.equal(moved(ring), 24);
  for (const t of [[], [0], [1], [2]]) assert.equal(Math.floor(ring[P.index(t)] / 3), P.index(t), `${t} stays`);
  assert.equal(moved(play(P, [{ axis: 1, layer: 0, q: 1 }])), 6); // (a third's ring: its 6 smallest touching its middle)
  assert.equal(moved(play(P, [{ axis: 1, layer: 1, q: 1 }])), 12); // (a third turned: all inside it)
  // (a ninth turned: its 3 smallest, a third of a turn: their copies turned too)
  const ninth = play(P, [{ axis: P.holes.findIndex((p) => p.length === 2), layer: 1, q: 1 }]);
  assert.equal(moved(ninth), 3);
});

test("solved: home, or the whole turned; a ring or a turn isn't; nor the smallest home but turned", () => {
  const P = build(4);
  for (const q of [1, -1]) assert.ok(isSierSolved(P, play(P, [{ axis: 0, layer: 1, q }])));
  for (const m of [{ axis: 0, layer: 0, q: 1 }, { axis: 2, layer: 1, q: -1 }]) assert.ok(!isSierSolved(P, play(P, [m])), JSON.stringify(m));
  // (a ninth turned three times over a third's ring and back: home, facing up; but its smallest turned once only isn't solved)
  const s = solvedSierState(P), i = P.index([0, 0, 0]);
  s[i] = 3 * i + 1;
  assert.ok(!isSierSolved(P, s));
});

test("scrambles undo, and scramble, with rings and turns", () => {
  for (const L of [3, 4]) {
    const P = build(L), moves = sierScrambleMoves(P, undefined, seeded(L));
    const s = play(P, moves);
    assert.ok(!isSierSolved(P, s), `${L} levels`);
    play(P, moves.slice().reverse().map((m) => inverseSierMove(P, m)), s);
    assert.ok(home(s), `${L} levels`);
    assert.ok(moves.some((m) => m.layer === 0) && moves.some((m) => m.layer === 1));
  }
});

test("a commutator: the whole's ring and the top third's, each then back, moves 10", () => {
  const P = build(4), a = { axis: 0, layer: 0, q: 1 }, b = { axis: 1, layer: 0, q: 1 };
  assert.equal(moved(play(P, [a, b, { ...a, q: -1 }, { ...b, q: -1 }])), 10);
});
