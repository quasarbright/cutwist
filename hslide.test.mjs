import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hslideSurfaces, buildHSlide, solvedHSlideState, isHSlideSolved, applyHSlideMove, inverseHSlideMove, hslideScrambleMoves, hslidePiecesInLayer, slidePoint } from "./hslide.mjs";
import { mobius as Mb } from "./hyper.mjs";

const file = (M) => JSON.parse(readFileSync(new URL(`./regular-maps/4-${M}.json`, import.meta.url), "utf8"));
const f5 = file(5), P = buildHSlide({ M: 5, surface: 0 }, f5);
const near = (a, b, eps = 1e-9) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;

test("{4,5}'s surfaces are all offered; the smallest: 30 squares, 10 rows of 6, every square on two rows", () => {
  assert.deepEqual(hslideSurfaces(f5).map((s) => s.tiles), [30, 40, 80, 90, 150, 180, 330, 330]);
  assert.equal(P.n, 30);
  assert.equal(P.rows.length, 10);
  assert.ok(P.rows.every((r) => r.L === 6 && new Set(r.tiles).size === 6));
  const onRows = new Array(P.n).fill(0);
  for (const r of P.rows) for (const f of r.tiles) onRows[f]++;
  assert.ok(onRows.every((k) => k === 2));
});

test("a slide all the way round is no change; a scramble undone is solved", () => {
  for (const [M, si] of [[5, 0], [5, 2], [6, 3], [8, 5]]) {
    const Q = buildHSlide({ M, surface: si }, M === 5 ? f5 : file(M)), s = solvedHSlideState(Q);
    for (let a = 0; a < Q.rows.length; a++) { applyHSlideMove(Q, s, { axis: a, layer: 0, q: Q.rows[a].L }); assert.ok(isHSlideSolved(Q, s), `{4,${M}} row ${a}`); }
    const moves = hslideScrambleMoves(Q);
    for (const m of moves) applyHSlideMove(Q, s, m);
    assert.ok(!isHSlideSolved(Q, s));
    for (const m of [...moves].reverse()) applyHSlideMove(Q, s, inverseHSlideMove(Q, m));
    assert.ok(isHSlideSolved(Q, s));
  }
});

test("a slide moves just its row's pieces, each one square along; rows with no square in common commute", () => {
  const s = solvedHSlideState(P), moved = hslidePiecesInLayer(P, s, 0);
  assert.equal(moved.length, 6);
  applyHSlideMove(P, s, { axis: 0, layer: 0, q: 1 });
  const r = P.rows[0];
  for (let i = 0; i < P.n; i++) {
    const was = P.face[P.reps[i]], now = P.face[s[i]];
    if (moved.includes(i)) assert.equal(r.tiles[(r.tiles.indexOf(was) + 1) % r.L], now);
    else assert.equal(s[i], P.reps[i]);
  }
  const b = P.rows.findIndex((q) => q.tiles.every((f) => !r.inRow[f]));
  const x = solvedHSlideState(P), y = solvedHSlideState(P);
  applyHSlideMove(P, x, { axis: 0, q: 1 }); applyHSlideMove(P, x, { axis: b, q: 2 });
  applyHSlideMove(P, y, { axis: b, q: 2 }); applyHSlideMove(P, y, { axis: 0, q: 1 });
  assert.deepEqual([...x], [...y]);
});

test("pieces can come home turned: a few slides put one in its own square, facing another way", () => {
  // (a row out, the row across it, and back: some piece lands home but turned)
  const s = solvedHSlideState(P), a = P.rowOf[0], b = P.rowOf[P.H.right[0][0]];
  for (const m of [[a, 1], [b, 1], [a, -1], [b, -1]]) applyHSlideMove(P, s, { axis: m[0], q: m[1] });
  let turned = false;
  for (let i = 0; i < 500 && !turned; i++) {
    turned = [...s].some((g, k) => P.face[g] === P.face[P.reps[k]] && g !== P.reps[k]);
    if (!turned) applyHSlideMove(P, s, { axis: i % P.rows.length, q: 1 + (i % 5) });
  }
  assert.ok(turned);
});

test("the domain: every square once, the middle ring 0, its four neighbors ring 1 at 0°, 90°, 180°, 270°", () => {
  assert.equal(P.dom.length, 30);
  assert.ok(P.dom.every(Boolean));
  assert.deepEqual([...P.ring].filter((r) => r === 0).length, 1);
  const first = [...P.ring.keys()].filter((f) => P.ring[f] === 1).map((f) => P.degrees[f]).sort((x, y) => x - y);
  assert.deepEqual(first, [0, 90, 180, 270]);
  assert.ok(P.degrees.every((d) => d >= 0 && d < 360));
  assert.ok(P.boundary.size > 0);
});

test("sliding, drawn: a whole step is exactly the step along the row; the row's middle line stays on itself", () => {
  for (const p of [...P.G.corners, [0, 0], P.G.mids[1]]) assert.ok(near(slidePoint(P, p, 1), Mb.apply(P.Tg, p), 1e-9));
  assert.ok(near(slidePoint(P, P.G.corners[2], 0), P.G.corners[2], 1e-12));
  const step = Mb.apply(P.Tg, [0, 0]), half = slidePoint(P, [0, 0], 0.5);
  assert.ok(Math.abs(half[0] * step[1] - half[1] * step[0]) < 1e-12); // (on the line through the middle and the next square's)
});
