// Builds permutle-words.mjs, Permutle's words: Wordle's answer list, the 2,315 five-letter words
// it picks its puzzles from (everyday words; no plurals). A row counts as a word when it's one of
// them, and a puzzle starts from them too. The list isn't in the repo; get it first with
//   curl -o wordle-answers.txt https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt
// Run: node data/build-permutle-words.mjs wordle-answers.txt
import { readFileSync, writeFileSync } from "node:fs";

const list = readFileSync(process.argv[2], "utf8").split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]{5}$/.test(w));
const words = [...new Set(list)].sort();
writeFileSync(new URL("../permutle-words.mjs", import.meta.url),
  `// Permutle's words (made by data/build-permutle-words.mjs from Wordle's answers): five letters\n` +
  `// each, in order, run together.\n` +
  `export const WORDS = "${words.join("")}";\n`);
console.log(`${words.length} words`);
