// Unit tests for the intersecting circles puzzles (circles.mjs): crossings, turns, the sphere.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CIRCLES_PRESETS, buildCircles, circleCrossings, solvedCirclesState, isCirclesSolved, applyCirclesMove, inverseCirclesMove,
  circlesScrambleMoves, sphereLayout, sphereArcAfter, spherePlace, flatPlace, stickersDuring, crossingAt, flatAngles, flatAngleOf,
  sphereAngles, sphereAngleOf,
} from "./circles.mjs";

const venn = (families, rings) => buildCircles({ ...CIRCLES_PRESETS[0], families, rings });
const apply = (P, s, ...moves) => { for (const [axis, layer, q] of moves) applyCirclesMove(P, s, { axis, layer, q }); return s; };
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const close = (a, b, eps = 1e-9) => a.every((x, i) => Math.abs(x - b[i]) < eps);

test("two circles cross twice, touch once, or miss", () => {
  const at = circleCrossings({ c: [0, 0], r: 1 }, { c: [1, 0], r: 1 });
  assert.equal(at.length, 2);
  for (const [x, y] of at) assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-12 && Math.abs(Math.hypot(x - 1, y) - 1) < 1e-12);
  assert.equal(circleCrossings({ c: [0, 0], r: 1 }, { c: [2, 0], r: 1 }).length, 1);
  assert.equal(circleCrossings({ c: [0, 0], r: 1 }, { c: [3, 0], r: 1 }).length, 0);
  assert.equal(circleCrossings({ c: [0, 0], r: 2 }, { c: [0.5, 0], r: 1 }).length, 0); // one inside the other
});

test("every two circles of different families cross twice, and nowhere else", () => {
  for (const [N, k] of [[2, 1], [3, 1], [3, 2], [3, 3], [4, 2], [5, 3], [6, 5]]) {
    const P = venn(N, k);
    assert.equal(P.n, ((N * (N - 1)) / 2) * 2 * k * k, `${N}×${k}`);
    assert.ok(P.points.every((p) => p.circles.length === 2)); // (no three circles through one spot)
    // each circle crosses every circle of the other families twice
    assert.ok(P.cycles.every((c) => c.length === 2 * k * (N - 1)));
  }
});

test("a color per pair of families, the same at all of that pair's crossings", () => {
  const P = venn(4, 2);
  assert.equal(P.colors, 6);
  const byColor = new Map();
  for (const p of P.points) {
    const fams = p.circles.map((c) => P.circles[c].family).sort().join();
    if (byColor.has(p.color)) assert.equal(byColor.get(p.color), fams);
    else byColor.set(p.color, fams);
  }
  assert.equal(byColor.size, 6);
});

test("a circle's crossings go clockwise as drawn (y down), and a turn moves each one along", () => {
  const P = venn(3, 1), ci = P.circleOf[0][0], cyc = P.cycles[ci], c = P.circles[ci];
  const angles = cyc.map((p) => Math.atan2(P.points[p.i].at[1] - c.c[1], P.points[p.i].at[0] - c.c[0]));
  // (increasing angle with y down is clockwise on screen)
  for (let k = 1; k < angles.length; k++) assert.ok(((angles[k] - angles[0] + 2 * Math.PI) % (2 * Math.PI)) > 0);
  const s = apply(P, solvedCirclesState(P), [0, 0, 1]);
  cyc.forEach((p, k) => assert.equal(s[cyc[(k + 1) % cyc.length].i], p.i));
});

test("a turn and its inverse cancel; a full trip around is the identity", () => {
  const P = venn(3, 2), s = solvedCirclesState(P);
  apply(P, s, [1, 1, 3]);
  applyCirclesMove(P, s, inverseCirclesMove(P, { axis: 1, layer: 1, q: 3 }));
  assert.deepEqual(s, solvedCirclesState(P));
  const L = P.cycles[P.circleOf[2][0]].length;
  apply(P, s, [2, 0, L - 3], [2, 0, 3]);
  assert.deepEqual(s, solvedCirclesState(P));
});

test("solved by color: swapping two stickers of a color is still solved", () => {
  const P = venn(2, 1); // two circles, crossing twice: both stickers the same color
  const s = apply(P, solvedCirclesState(P), [0, 0, 1]);
  assert.notDeepEqual(s, solvedCirclesState(P));
  assert.ok(isCirclesSolved(P, s));
  const Q = venn(3, 1), t = apply(Q, solvedCirclesState(Q), [0, 0, 1]);
  assert.ok(!isCirclesSolved(Q, t));
});

test("a scramble turns real circles, never the same one twice running, and undoes", () => {
  const P = venn(3, 2), moves = circlesScrambleMoves(P, 40, seeded(7)), s = solvedCirclesState(P);
  assert.equal(moves.length, 40);
  for (let i = 1; i < moves.length; i++) assert.ok(moves[i].axis !== moves[i - 1].axis || moves[i].layer !== moves[i - 1].layer);
  for (const m of moves) applyCirclesMove(P, s, m);
  assert.ok(!isCirclesSolved(P, s));
  for (const m of moves.reverse()) applyCirclesMove(P, s, inverseCirclesMove(P, m));
  assert.deepEqual(s, solvedCirclesState(P));
});

test("on the sphere: every crossing on its circles, the stickers centered, the outside at the back", () => {
  for (const [N, k] of [[2, 1], [3, 2], [4, 3], [5, 1]]) {
    const P = venn(N, k), S = sphereLayout(P);
    for (const [i, p] of P.points.entries()) {
      assert.ok(Math.abs(Math.hypot(...S.points[i]) - 1) < 1e-9);
      for (const ci of p.circles) assert.ok(Math.abs(dot(S.points[i], S.circles[ci].n) - S.circles[ci].h) < 1e-9);
    }
    const m = S.points.reduce((s, p) => s.map((x, j) => x + p[j]), [0, 0, 0]);
    assert.ok(Math.hypot(...m) / P.n < 1e-6, `${N}×${k} centered`);
    // a turn's arcs go once around each circle, in the flat order
    P.cycles.forEach((cyc, ci) => {
      let sum = 0;
      for (let j = 0; j < cyc.length; j++) sum += sphereArcAfter(P, S, ci, j);
      assert.ok(Math.abs(sum - 2 * Math.PI) < 1e-9);
    });
  }
});

test("three families of one circle are a cube's middle slices: great circles at right angles", () => {
  const P = venn(3, 1), S = sphereLayout(P);
  for (const c of S.circles) assert.ok(Math.abs(c.h) < 1e-9);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.abs(dot(S.circles[i].n, S.circles[j].n)) < 1e-9);
  // seen from the front, a cube's corner: the middle region faces the viewer, three crossings around it
  const front = S.points.filter((p) => p[2] > 0);
  assert.equal(front.length, 3);
  for (const p of front) assert.ok(Math.abs(p[2] - 1 / Math.sqrt(3)) < 1e-9);
});

test("partway through a turn, moving stickers ride their circle between crossings", () => {
  const P = venn(3, 1), S = sphereLayout(P), s = solvedCirclesState(P), ci = P.circleOf[1][0], cyc = P.cycles[ci];
  const flat = stickersDuring(P, s, { axis: 1, layer: 0, p: 0.5 }, (c, k, f) => flatPlace(P, c, k, f));
  const moving = flat.filter((d) => d.at);
  assert.equal(moving.length, cyc.length);
  const circle = P.circles[ci];
  for (const d of moving) assert.ok(Math.abs(Math.hypot(d.at[0] - circle.c[0], d.at[1] - circle.c[1]) - circle.r) < 1e-12);
  // a whole step lands on the next crossing, on the sphere too
  for (let k = 0; k < cyc.length; k++) assert.ok(close(spherePlace(P, S, ci, k, 1), S.points[cyc[(k + 1) % cyc.length].i]));
  assert.ok(close(spherePlace(P, S, ci, -1, 1), S.points[cyc[0].i])); // (and backward)
});

test("dragging: an angle around a circle as a crossing count, following uneven spacing", () => {
  const angles = [0, 1, 3]; // (then back to 0 + 2π)
  assert.equal(crossingAt(angles, 0), 0);
  assert.equal(crossingAt(angles, 0.5), 0.5);
  assert.equal(crossingAt(angles, 2), 1.5);
  assert.ok(Math.abs(crossingAt(angles, 3 + (2 * Math.PI - 3) / 2) - 2.5) < 1e-12);
  assert.ok(Math.abs(crossingAt(angles, 2 * Math.PI + 1) - 4) < 1e-12); // once round, then one more
  assert.ok(Math.abs(crossingAt(angles, -0.5 * (2 * Math.PI - 3)) - -0.5) < 1e-12);
  // on the sphere and flat, each crossing's own angle is its index
  const P = venn(3, 2), S = sphereLayout(P), ci = P.circleOf[1][1];
  const L = P.cycles[ci].length, same = (u, k) => Math.abs(((u - k) % L + L + 0.5) % L - 0.5) < 1e-9; // (mod L: a turn round)
  P.cycles[ci].forEach((p, k) => {
    assert.ok(same(crossingAt(flatAngles(P, ci), flatAngleOf(P, ci, P.points[p.i].at)), k));
    assert.ok(same(crossingAt(sphereAngles(P, S, ci), sphereAngleOf(S, ci, S.points[p.i])), k));
  });
});
