// Unit tests for the Sierpinski puzzle (sierpinski.mjs). Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIER_PRESETS, buildSier, solvedSierState, applySierMove, inverseSierMove, isSierSolved, sierScrambleMoves } from "./sierpinski.mjs";

const build = (L) => buildSier({ ...SIER_PRESETS[0], levels: L });
const play = (P, moves, s = solvedSierState(P)) => { for (const m of moves) applySierMove(P, s, m); return s; };
const home = (P, s) => s.every((v, i) => v === P.home[i]);
// (pieces off their places: the corners' copies aren't counted)
const moved = (P, s) => s.slice(0, P.N).reduce((k, v, i) => k + (Math.floor(v / 3) !== i), 0);
const corners = (P, s) => s.slice(P.N).reduce((k, v, i) => k + (v !== P.home[P.N + i]), 0);
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test("every triangle a piece: 4 on 2 levels, 13 on 3, 40 on 4; a ring only where it's pieces, or on 2 levels the whole's", () => {
  assert.deepEqual([2, 3, 4].map((L) => build(L).N), [4, 13, 40]);
  assert.deepEqual(build(4).axes.filter((a) => a.ring).map((a) => a.depth), [0, 1, 1, 1]);
  assert.deepEqual(build(3).axes.filter((a) => a.ring).map((a) => a.depth), [0]);
  assert.deepEqual(build(2).axes.map((a) => [a.depth, a.ring]), [[0, true], [1, false], [1, false], [1, false]]);
});

test("on 2 levels, solved: each third's corners the rest of the puzzle where it is, the whole in its own place", () => {
  const P = build(2), s = solvedSierState(P), shows = (c, k) => P.addr[Math.floor(s[P.slot(P.index([c]), k)] / 3)];
  // (the top third: the whole at its top, the bottom left and right thirds at theirs; and so on)
  for (const c of [0, 1, 2]) for (const k of [0, 1, 2]) assert.deepEqual(shows(c, k), k === c ? [] : [k], `third ${c}, corner ${k}`);
  assert.ok(s.slice(P.N).every((v) => v % 3 === 0), "all the right way up");
});

test("a turn three times is nothing, once something; pieces never change level", () => {
  for (const L of [2, 3, 4]) {
    const P = build(L);
    for (const ax of P.axes) for (const layer of [0, 1]) {
      if (!P.perms[ax.h][layer]) continue;
      const m = { axis: ax.h, layer, q: 1 }, s = play(P, [m]);
      assert.ok(home(P, play(P, [m, m, m])), `${L} levels, ${ax.p} layer ${layer}`);
      assert.ok(!home(P, s), `${L} levels, ${ax.p} layer ${layer}: does something`);
      s.slice(0, P.N).forEach((v, i) => assert.equal(P.addr[Math.floor(v / 3)].length, P.addr[i].length, "a piece on its own level"));
    }
  }
});

test("what each turn takes, on 4 levels: the whole's ring its 6 ninths touching the middle and what's in them; a third its 12", () => {
  const P = build(4);
  const ring = play(P, [{ axis: 0, layer: 0, q: 1 }]);
  assert.equal(moved(P, ring), 24);
  for (const t of [[], [0], [1], [2]]) assert.equal(Math.floor(ring[P.index(t)] / 3), P.index(t), `${t} stays`);
  assert.equal(moved(P, play(P, [{ axis: 1, layer: 0, q: 1 }])), 6); // (a third's ring: its 6 smallest touching its middle)
  assert.equal(moved(P, play(P, [{ axis: 1, layer: 1, q: 1 }])), 12); // (a third turned: all inside it)
  // (a ninth turned: its 3 smallest, a third of a turn: their copies turned too)
  const ninth = play(P, [{ axis: P.holes.findIndex((p) => p.length === 2), layer: 1, q: 1 }]);
  assert.equal(moved(P, ninth), 3);
  assert.equal(corners(P, ninth), 9);
});

test("on 2 levels: the whole's ring moves the 6 corners touching its middle, turned; a third turned turns its own 3", () => {
  const P = build(2), ring = play(P, [{ axis: 0, layer: 0, q: 1 }]);
  assert.equal(moved(P, ring), 0);
  assert.equal(corners(P, ring), 6);
  // (the top third's bottom left corner, a copy of the bottom left third, now the bottom left third's bottom right, a third turned)
  assert.equal(ring[P.slot(P.index([1]), 2)], 3 * P.index([1]) + 1);
  const third = play(P, [{ axis: 1, layer: 1, q: 1 }]);
  assert.equal(moved(P, third), 0);
  assert.equal(corners(P, third), 3);
  // (the whole, now at its bottom left, turned with it)
  assert.equal(third[P.slot(P.index([0]), 1)], 1);
});

test("solved: home, or the whole turned; a ring or a turn isn't; nor a corner's copy turned", () => {
  for (const L of [2, 4]) {
    const P = build(L);
    for (const q of [1, -1]) {
      const s = play(P, [{ axis: 0, layer: 1, q }]);
      assert.ok(isSierSolved(P, s), `${L} levels`);
      assert.deepEqual([...s.slice(P.N)], [...P.home.slice(P.N)], `${L} levels: the whole turned leaves the corners`);
    }
    for (const m of [{ axis: 0, layer: 0, q: 1 }, { axis: 2, layer: 1, q: -1 }]) assert.ok(!isSierSolved(P, play(P, [m])), `${L} levels, ${JSON.stringify(m)}`);
    const s = solvedSierState(P), i = P.slot(P.index(Array(L - 1).fill(0)), 0);
    s[i] += 1;
    assert.ok(!isSierSolved(P, s), `${L} levels`);
  }
});

test("scrambles undo, and scramble, with rings and turns", () => {
  for (const L of [2, 3, 4]) {
    const P = build(L), moves = sierScrambleMoves(P, undefined, seeded(L));
    const s = play(P, moves);
    assert.ok(!isSierSolved(P, s), `${L} levels`);
    play(P, moves.slice().reverse().map((m) => inverseSierMove(P, m)), s);
    assert.ok(home(P, s), `${L} levels`);
    assert.ok(moves.some((m) => m.layer === 0) && moves.some((m) => m.layer === 1));
  }
});

test("a commutator: the whole's ring and the top third's, each then back, moves 10", () => {
  const P = build(4), a = { axis: 0, layer: 0, q: 1 }, b = { axis: 1, layer: 0, q: 1 };
  assert.equal(moved(P, play(P, [a, b, { ...a, q: -1 }, { ...b, q: -1 }])), 10);
});
