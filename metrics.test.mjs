import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, buildPuzzle } from "./puzzle.mjs";
import { puzzleMetrics } from "./metrics.mjs";

const metrics = (id) => puzzleMetrics(buildPuzzle(PRESETS.find((p) => p.id === id)));

test("3×3 cube: the faces are the turns (no slices), no two axes commute, opposite faces are the biggest commuting set", () => {
  const m = metrics("cube");
  assert.equal(m.turns, 6);
  assert.ok(Math.abs(m.destructiveness - 9 / 26) < 1e-9);
  assert.equal(m.commutativity, 0);
  assert.equal(m.vastness, 2);
  assert.ok(Math.abs(m.vulnerability - (8 * 3 + 12 * 2 + 6 * 1) / 26) < 1e-9); // (corners, edges, centers)
  assert.equal(m.degree, 4);
  assert.deepEqual(m.variety, [12, 8, 6]);
});

test("pyraminx: only the corner layers count (the tips are one piece, the faces are most of it), and none commute", () => {
  const m = metrics("pyraminx");
  assert.equal(m.turns, 4);
  assert.equal(m.commutativity, 0);
  assert.equal(m.vastness, 1);
  assert.equal(m.degree, 3);
});

test("megaminx: some turns on different axes commute (faces that don't touch)", () => {
  const m = metrics("megaminx");
  assert.ok(m.commutativity > 0 && m.commutativity < 1);
  assert.deepEqual(m.variety, [30, 20, 12]);
});
