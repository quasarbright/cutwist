import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPermutle, isGrid, gridSize, newPermutleGrid, isWord, rowText, wordRows, isPermutleSolved } from "./permutle.mjs";
import { solvedPlanarState, applyPlanarMove } from "./planar.mjs";

const build = (letters) => buildPermutle({ letters });
const rows = (P, s) => Array.from({ length: P.H }, (_, y) => rowText(P, s, y));

test("everyday and other common words count, plurals too, at every size; rare Scrabble words don't", () => {
  for (const w of ["cat", "SUN", "dogs", "WORD", "crane", "SLIDE", "votes", "cards"]) assert.ok(isWord(w), w);
  for (const w of ["alate", "laddy", "aahed", "aaaaa", "xxx", "zzzz", "ab", "cranes"]) assert.ok(!isWord(w), w);
});

test("a grid is 9, 16 or 25 letters, and says its size", () => {
  assert.equal(gridSize("CATDOGSUN"), 3);
  assert.equal(gridSize("WORDSLIDTEAMCODE"), 4);
  assert.equal(gridSize("cranesLIDEEVERYROUNDSOLVE"), 5);
  for (const g of ["CRANE", "CRANESLIDEEVERYROUNDSOLV3", "A".repeat(36), "A".repeat(4), null]) assert.equal(gridSize(g), null, String(g));
  assert.ok(isGrid("CATDOGSUN", 3));
  assert.ok(!isGrid("CATDOGSUN", 5));
});

test("it starts as its letters, row by row; a row is green when it spells a word", () => {
  const P = build("CRANESLIDEEVERYROUNDSOLVE"), s = solvedPlanarState(P);
  assert.equal(P.W, 5);
  assert.deepEqual(rows(P, s), ["CRANE", "SLIDE", "EVERY", "ROUND", "SOLVE"]);
  assert.ok(isPermutleSolved(P, s));
  applyPlanarMove(P, s, { axis: 0, layer: 1, q: 1 }); // SLIDE → ESLID
  assert.deepEqual(wordRows(P, s), [true, false, true, true, true]);
  assert.ok(!isPermutleSolved(P, s));
  const Q = build("CATDOGSUN");
  assert.equal(Q.W, 3);
  assert.ok(isPermutleSolved(Q, solvedPlanarState(Q)));
});

test("a new puzzle is n words' letters, slid apart so no row is a word, at every size", () => {
  const g = newPermutleGrid(5, Math.random, ["crane", "slide", "every", "round", "solve"]);
  assert.ok(isGrid(g, 5));
  assert.deepEqual([...g].sort(), [..."CRANESLIDEEVERYROUNDSOLVE"].sort());
  for (const n of [3, 4, 5]) for (let k = 0; k < 20; k++) {
    const P = build(newPermutleGrid(n));
    assert.equal(P.W, n);
    assert.ok(!wordRows(P, solvedPlanarState(P)).some(Boolean), `${n}: ${P.letters.join("")}`);
  }
});
