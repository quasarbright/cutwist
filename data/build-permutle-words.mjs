// Builds permutle-words.mjs, Permutle's words, for each size (3, 4 and 5 letters). A puzzle
// starts from everyday words: for 5, Wordle's answers (2,315, no plurals); for 3 and 4, the lists
// picked by hand in data/permutle-start-3.txt and -4.txt (each must be a Scrabble word). A row
// counts as a word when it's one of those, or a Scrabble word (Collins) that's common in English:
// used at least a million times in Peter Norvig's word counts from Google's web corpus (that lets
// in plurals and the like, VOTES, CARDS, and keeps out ALATE and LADDY). The three outside lists
// aren't in the repo; get them with
//   curl -o wordle-answers.txt https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt
//   curl -o count_1w.txt https://norvig.com/ngrams/count_1w.txt
// Run: node data/build-permutle-words.mjs wordle-answers.txt "Collins Scrabble Words (2019).txt" count_1w.txt
import { readFileSync, writeFileSync } from "node:fs";

const COMMON = 1e6; // (uses in the counts, for a Scrabble word to count)
const SIZES = [3, 4, 5];
const words = (file, n) => new Set(readFileSync(file, "utf8").split(/\s+/).map((w) => w.trim().toLowerCase()).filter((w) => w.length === n && /^[a-z]+$/.test(w)));
const [answersFile, collinsFile, countsFile] = process.argv.slice(2);
const counts = new Map(readFileSync(countsFile, "utf8").split("\n").map((l) => l.split("\t")).map(([w, c]) => [w, Number(c)]));
const start = {}, also = {};
for (const n of SIZES) {
  const collins = words(collinsFile, n);
  const picked = n === 5 ? words(answersFile, 5) : words(new URL(`./permutle-start-${n}.txt`, import.meta.url), n);
  const missing = [...picked].filter((w) => !collins.has(w));
  if (n !== 5 && missing.length) throw new Error(`${n} letters, not Scrabble words: ${missing.join(" ")}`);
  start[n] = [...picked].sort();
  also[n] = [...collins].filter((w) => !picked.has(w) && (counts.get(w) || 0) >= COMMON).sort();
  console.log(`${n} letters: ${start[n].length} to start from, ${also[n].length} more that count`);
}
const obj = (m) => `{ ${SIZES.map((n) => `${n}: "${m[n].join("")}"`).join(",\n  ")} }`;
writeFileSync(new URL("../permutle-words.mjs", import.meta.url),
  `// Permutle's words (made by data/build-permutle-words.mjs), by length, each length's run\n` +
  `// together in order: the everyday ones a puzzle starts from, and the common ones that count too.\n` +
  `export const WORDS = ${obj(start)};\n` +
  `export const ALSO = ${obj(also)};\n`);
