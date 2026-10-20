// Permutle: a sliding torus (planar.mjs) whose cells are letters, n×n for n from 3 to 5. A new
// puzzle is n everyday n-letter words, one per row, slid apart; it's solved when every row spells a
// word: any common word (plurals too), not just the ones it started as. The moves, history and
// drawing are the torus's; this adds the letters and the words.
//
// So a puzzle is just its letters as dealt, and that's what its link carries: `letters`, the n²
// row by row (their count says the size). The torus starts there (each cell's home is where it
// was dealt), so reset goes back to the deal, and a shared link is the sharer's own start.
import { buildPlanar, planarScrambleMoves, applyPlanarMove, pieceOf } from "./planar.mjs";
// (by length: the everyday words it starts from; and other common words, which count as words too)
import { WORDS, ALSO } from "./permutle-words.mjs";

export const PERMUTLE_SIZES = { min: 3, max: 5 };
const split = (s, n) => Array.from({ length: s.length / n }, (_, i) => s.slice(i * n, (i + 1) * n));
const lists = new Map(); // n → { start, known }
function words(n) {
  if (!lists.has(n)) { const start = split(WORDS[n], n); lists.set(n, { start, known: new Set([...start, ...split(ALSO[n], n)]) }); }
  return lists.get(n);
}
export const isWord = (w) => !!WORDS[w.length] && words(w.length).known.has(w.toLowerCase());

export const PERMUTLE_PRESETS = [{
  id: "permutle", name: "Permutle", rule: "planar", permutle: true, size: 2, fixed: true, noCustom: true,
  n: PERMUTLE_SIZES.min, topology: "torus",
  params: [{ key: "n", label: "size", min: PERMUTLE_SIZES.min, max: PERMUTLE_SIZES.max, title: "letters per word, and words: 3×3 is the easiest" }],
  title: (_, s) => `${s.n}×${s.n} Permutle`,
}];

// the size a link's letters are a grid of (9, 16 or 25 letters), or null
export function gridSize(letters) {
  if (typeof letters !== "string" || !/^[a-zA-Z]+$/.test(letters)) return null;
  const n = Math.round(Math.sqrt(letters.length));
  return n * n === letters.length && n >= PERMUTLE_SIZES.min && n <= PERMUTLE_SIZES.max ? n : null;
}
export const isGrid = (letters, n) => gridSize(letters) === n;

// the torus, its cells' letters dealt as `spec.letters` (row by row), spec.n on a side
export function buildPermutle(spec) {
  const n = gridSize(spec.letters) ?? spec.n ?? PERMUTLE_SIZES.min;
  const P = buildPlanar({ ...spec, width: n, height: n, topology: "torus" });
  P.letters = (gridSize(spec.letters) ? spec.letters : "A".repeat(n * n)).toUpperCase().split(""); // (the page always gives it a grid)
  return P;
}
// what row y spells in state s
export const rowText = (P, s, y) => Array.from({ length: P.W }, (_, x) => P.letters[pieceOf(s[y * P.W + x])]).join("");
// for each row, whether it's a word
export const wordRows = (P, s) => Array.from({ length: P.H }, (_, y) => isWord(rowText(P, s, y)));
export const isPermutleSolved = (P, s) => wordRows(P, s).every(Boolean);

// A new n×n puzzle: n different words, slid apart by a torus scramble until no row is a word
// (tried again till it does), as its letters. rand: random; picked: the words to use (the tests').
export function newPermutleGrid(n = PERMUTLE_SIZES.min, rand = Math.random, picked = null) {
  if (!picked) {
    const pool = words(n).start.slice();
    picked = Array.from({ length: n }, () => pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  const P = buildPermutle({ letters: picked.join("") });
  for (let tries = 0; ; tries++) {
    const s = Int32Array.from({ length: P.n }, (_, i) => i * 4);
    for (const m of planarScrambleMoves(P, undefined, rand)) applyPlanarMove(P, s, m);
    if (!wordRows(P, s).some(Boolean) || tries > 50) return Array.from({ length: n }, (_, y) => rowText(P, s, y)).join("");
  }
}
