import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPermutle, isGrid, newPermutleGrid, isWord, rowText, wordRows, isPermutleSolved } from "./permutle.mjs";
import { solvedPlanarState, applyPlanarMove } from "./planar.mjs";

const build = (letters) => buildPermutle({ letters });
const rows = (P, s) => [0, 1, 2, 3, 4].map((y) => rowText(P, s, y));

test("Wordle's answers and other common words count, plurals too; rare Scrabble words don't", () => {
  for (const w of ["crane", "SLIDE", "every", "votes", "cards", "games"]) assert.ok(isWord(w), w);
  for (const w of ["alate", "laddy", "aahed", "aaaaa"]) assert.ok(!isWord(w), w);
});

test("a grid is 25 letters", () => {
  assert.ok(isGrid("CRANESLIDEEVERYROUNDSOLVE"));
  assert.ok(isGrid("cranesLIDEEVERYROUNDSOLVE"));
  for (const g of ["CRANE", "CRANESLIDEEVERYROUNDSOLV3", "CRANESLIDEEVERYROUNDSOLVEX", null]) assert.ok(!isGrid(g), String(g));
});

test("it starts as its letters, row by row; a row is green when it spells a word", () => {
  const P = build("CRANESLIDEEVERYROUNDSOLVE"), s = solvedPlanarState(P);
  assert.deepEqual(rows(P, s), ["CRANE", "SLIDE", "EVERY", "ROUND", "SOLVE"]);
  assert.ok(isPermutleSolved(P, s));
  applyPlanarMove(P, s, { axis: 0, layer: 1, q: 1 }); // SLIDE → ESLID
  assert.deepEqual(wordRows(P, s), [true, false, true, true, true]);
  assert.ok(!isPermutleSolved(P, s));
});

test("a new puzzle is five words' letters, slid apart so no row is a word", () => {
  const g = newPermutleGrid(Math.random, ["crane", "slide", "every", "round", "solve"]);
  assert.ok(isGrid(g));
  assert.deepEqual([...g].sort(), [..."CRANESLIDEEVERYROUNDSOLVE"].sort());
  for (let k = 0; k < 20; k++) {
    const P = build(newPermutleGrid());
    assert.ok(!wordRows(P, solvedPlanarState(P)).some(Boolean));
  }
});
