// Permutle: a sliding torus (planar.mjs) whose cells are letters, 5×5. A new puzzle is five
// words from Wordle's answers, one per row, slid apart; it's solved when every row spells a word:
// any common word (plurals too), not just the ones it started as. The moves, history and drawing
// are the torus's; this adds the letters and the words.
//
// So a puzzle is just its letters as dealt, and that's what its link carries: `letters`, the 25
// row by row. The torus starts there (each cell's home is where it was dealt), so reset goes back
// to the deal, and a shared link is the sharer's own start.
import { buildPlanar, planarScrambleMoves, applyPlanarMove, pieceOf } from "./planar.mjs";
// (Wordle's answers, which it starts from; and other common words, which count as words too)
import { WORDS, ALSO } from "./permutle-words.mjs";

export const WORD = 5; // letters per word: a row, and rows: the grid's square
const split = (s) => Array.from({ length: s.length / WORD }, (_, i) => s.slice(i * WORD, (i + 1) * WORD));
let start = null, known = null;
const words = () => {
  if (!start) { start = split(WORDS); known = new Set([...start, ...split(ALSO)]); }
  return { start, known };
};
export const isWord = (w) => words().known.has(w.toLowerCase());

export const PERMUTLE_PRESETS = [{
  id: "permutle", name: "Permutle", rule: "planar", permutle: true, size: 2, fixed: true, noCustom: true,
  width: WORD, height: WORD, topology: "torus",
  title: () => "Permutle",
}];

// whether a link's letters are a grid
export const isGrid = (letters) => typeof letters === "string" && new RegExp(`^[a-zA-Z]{${WORD * WORD}}$`).test(letters);

// the torus, its cells' letters dealt as `spec.letters` (row by row)
export function buildPermutle(spec) {
  const P = buildPlanar({ ...spec, width: WORD, height: WORD, topology: "torus" });
  P.letters = (isGrid(spec.letters) ? spec.letters : "A".repeat(WORD * WORD)).toUpperCase().split(""); // (the page always gives it a grid)
  return P;
}
// what row y spells in state s
export const rowText = (P, s, y) => Array.from({ length: P.W }, (_, x) => P.letters[pieceOf(s[y * P.W + x])]).join("");
// for each row, whether it's a word
export const wordRows = (P, s) => Array.from({ length: P.H }, (_, y) => isWord(rowText(P, s, y)));
export const isPermutleSolved = (P, s) => wordRows(P, s).every(Boolean);

// A new puzzle: five different words, slid apart by a torus scramble until no row is a word
// (tried again till it does), as its letters. words: the ones to use (the tests'); rand: random.
export function newPermutleGrid(rand = Math.random, words5 = null) {
  if (!words5) {
    const pool = words().start.slice();
    words5 = Array.from({ length: WORD }, () => pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  const P = buildPermutle({ letters: words5.join("") });
  for (let tries = 0; ; tries++) {
    const s = Int32Array.from({ length: P.n }, (_, i) => i * 4);
    for (const m of planarScrambleMoves(P, undefined, rand)) applyPlanarMove(P, s, m);
    if (!wordRows(P, s).some(Boolean) || tries > 50) return Array.from({ length: WORD }, (_, y) => rowText(P, s, y)).join("");
  }
}
