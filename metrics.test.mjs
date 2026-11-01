import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, buildPuzzle } from "./puzzle.mjs";
import { puzzleMetrics } from "./metrics.mjs";

const metrics = (id) => puzzleMetrics(buildPuzzle(PRESETS.find((p) => p.id === id)));

test("3×3 cube: a third of the pieces per turn, no two axes commute, a whole axis is the biggest commuting set", () => {
  const m = metrics("cube");
  assert.equal(m.turns, 9);
  assert.ok(Math.abs(m.destructiveness - (9 + 9 + 8) / 3 / 26) < 1e-9); // (two faces and a slice)
  assert.equal(m.commutativity, 0);
  assert.equal(m.vastness, 3);
  assert.equal(m.vulnerability, 3);
  assert.deepEqual(m.variety, [12, 8, 6]);
});

test("pyraminx: the tips don't count as turns, and nothing on different axes commutes", () => {
  const m = metrics("pyraminx");
  assert.equal(m.turns, 8);
  assert.equal(m.commutativity, 0);
  assert.equal(m.vastness, 2);
});

test("megaminx: some turns on different axes commute (faces that don't touch)", () => {
  const m = metrics("megaminx");
  assert.ok(m.commutativity > 0 && m.commutativity < 1);
  assert.deepEqual(m.variety, [30, 20, 12]);
});
