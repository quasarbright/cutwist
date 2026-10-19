import { test } from "node:test";
import assert from "node:assert/strict";
import { PERMUTLE_PRESETS, buildPermutle, encodeWords, decodeWords, newPermutleWords, isWord, rowText, wordRows, isPermutleSolved, permutleScrambleMoves } from "./permutle.mjs";
import { solvedPlanarState, applyPlanarMove } from "./planar.mjs";

const preset = PERMUTLE_PRESETS[0];
const build = (words) => buildPermutle({ ...preset, height: words.length, words: encodeWords(words) });

test("Wordle's answers are words; Scrabble-only words and plurals aren't", () => {
  for (const w of ["crane", "SLIDE", "every"]) assert.ok(isWord(w), w);
  for (const w of ["alate", "laddy", "cards", "aaaaa"]) assert.ok(!isWord(w), w);
});

test("words go into a link's code and come back", () => {
  const words = ["crane", "slide", "every", "round", "solve"], code = encodeWords(words);
  assert.equal(code.length, 15);
  assert.ok(!words.some((w) => code.includes(w)));
  assert.deepEqual(decodeWords(code, 5), words);
  assert.equal(decodeWords(code, 4), null);
  assert.equal(decodeWords("!!!", 1), null);
  assert.equal(decodeWords("zzz", 1), null); // (past the end of the list)
  const fresh = decodeWords(newPermutleWords(8), 8);
  assert.equal(new Set(fresh).size, 8);
});

test("it starts as its words, every row green; a slide can break one", () => {
  const P = build(["crane", "slide", "every", "round", "solve"]), s = solvedPlanarState(P);
  assert.equal(P.W, 5);
  assert.deepEqual([0, 1, 2, 3, 4].map((y) => rowText(P, s, y)), ["CRANE", "SLIDE", "EVERY", "ROUND", "SOLVE"]);
  assert.ok(isPermutleSolved(P, s));
  applyPlanarMove(P, s, { axis: 0, layer: 1, q: 1 }); // SLIDE → ESLID
  assert.deepEqual(wordRows(P, s), [true, false, true, true, true]);
  assert.ok(!isPermutleSolved(P, s));
});

test("any words solve it, not just the ones it started as", () => {
  // SHARE and STONE trade their second letters: STARE and SHONE
  const P = build(["share", "stone"]), s = solvedPlanarState(P);
  applyPlanarMove(P, s, { axis: 1, layer: 1, q: 1 });
  assert.deepEqual([rowText(P, s, 0), rowText(P, s, 1)], ["STARE", "SHONE"]);
  assert.ok(isPermutleSolved(P, s));
});

test("a deal leaves no row a word", () => {
  for (let k = 0; k < 20; k++) {
    const P = buildPermutle({ ...preset, words: newPermutleWords(5) }), s = solvedPlanarState(P);
    for (const m of permutleScrambleMoves(P)) applyPlanarMove(P, s, m);
    assert.ok(!wordRows(P, s).some(Boolean));
  }
});
