// Permutle: a sliding torus (planar.mjs) whose cells are letters. It starts as a few
// five-letter words from Wordle's answers, one per row, slid apart; it's solved when every row spells a word, any
// word, not just the ones it started as. The moves, history and drawing are the torus's; this
// adds the letters and the words.
//
// A puzzle's words travel in its link as `words`: each word's place in the full list, 3 base-36
// digits apiece (so a link doesn't spell out the answer).
import { buildPlanar, planarScrambleMoves, applyPlanarMove, pieceOf } from "./planar.mjs";
import { WORDS } from "./permutle-words.mjs"; // (Wordle's answers: what counts, and what it starts from)

export const WORD = 5; // letters per word: a row
const split = (s) => Array.from({ length: s.length / WORD }, (_, i) => s.slice(i * WORD, (i + 1) * WORD));
let valid = null, place = null;
const words = () => {
  if (!valid) { valid = split(WORDS); place = new Map(valid.map((w, i) => [w, i])); }
  return { valid, place };
};
export const isWord = (w) => words().place.has(w.toLowerCase());

export const PERMUTLE_PRESETS = [{
  id: "permutle", name: "Permutle", rule: "planar", permutle: true, size: 2, fixed: true, noCustom: true,
  width: WORD, height: 5, topology: "torus",
  params: [{ key: "height", label: "words", min: 2, max: 8, title: "how many rows: a word each" }],
  title: (_, s) => `${s.height}-word Permutle`,
}];

// words ↔ their code for the link
export function encodeWords(list) {
  const { place } = words();
  return list.map((w) => place.get(w.toLowerCase()).toString(36).padStart(3, "0")).join("");
}
// the words in a code, or null (not a code for `count` words)
export function decodeWords(code, count) {
  const { valid } = words();
  if (typeof code !== "string" || !/^[0-9a-z]*$/.test(code) || code.length !== 3 * count) return null;
  const out = [];
  for (let i = 0; i < code.length; i += 3) {
    const w = valid[parseInt(code.slice(i, i + 3), 36)];
    if (!w) return null;
    out.push(w);
  }
  return out;
}
// `count` different words, at random, as a code
export function newPermutleWords(count, rand = Math.random) {
  const pool = words().valid.slice(), out = [];
  while (out.length < count) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return encodeWords(out);
}

// the torus, with each cell's letter (by its home) and the words it started as
export function buildPermutle(spec) {
  const P = buildPlanar({ ...spec, width: WORD, topology: "torus" });
  P.words = decodeWords(spec.words, spec.height) || split("a".repeat(WORD * spec.height)); // (the page always gives it words)
  P.letters = P.words.join("").toUpperCase().split("");
  return P;
}
// what row y spells in state s
export const rowText = (P, s, y) => Array.from({ length: P.W }, (_, x) => P.letters[pieceOf(s[y * P.W + x])]).join("");
// for each row, whether it's a word
export const wordRows = (P, s) => Array.from({ length: P.H }, (_, y) => isWord(rowText(P, s, y)));
export const isPermutleSolved = (P, s) => wordRows(P, s).every(Boolean);

// a torus scramble that leaves no row a word (tried again until it does)
export function permutleScrambleMoves(P, rand = Math.random) {
  for (let tries = 0; ; tries++) {
    const moves = planarScrambleMoves(P, undefined, rand), s = Int32Array.from({ length: P.n }, (_, i) => i * 4);
    for (const m of moves) applyPlanarMove(P, s, m);
    if (!wordRows(P, s).some(Boolean) || tries > 50) return moves;
  }
}
