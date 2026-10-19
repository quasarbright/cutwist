// Builds permutle-words.mjs, Permutle's words. A puzzle starts from Wordle's answers (2,315
// everyday five-letter words, no plurals). A row counts as a word when it's one of those, or a
// Scrabble word (Collins) that's common in English: used at least a million times in Peter
// Norvig's word counts from Google's web corpus (that lets in plurals and the like, VOTES, CARDS,
// and keeps out ALATE and LADDY). None of the three lists is in the repo; get them with
//   curl -o wordle-answers.txt https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt
//   curl -o count_1w.txt https://norvig.com/ngrams/count_1w.txt
// Run: node data/build-permutle-words.mjs wordle-answers.txt "Collins Scrabble Words (2019).txt" count_1w.txt
import { readFileSync, writeFileSync } from "node:fs";

const COMMON = 1e6; // (uses in the counts, for a Scrabble word to count)
const fives = (file) => new Set(readFileSync(file, "utf8").split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]{5}$/.test(w)));
const [answersFile, collinsFile, countsFile] = process.argv.slice(2);
const answers = fives(answersFile), collins = fives(collinsFile);
const counts = new Map(readFileSync(countsFile, "utf8").split("\n").map((l) => l.split("\t")).map(([w, c]) => [w, Number(c)]));
const start = [...answers].sort();
const also = [...collins].filter((w) => !answers.has(w) && (counts.get(w) || 0) >= COMMON).sort();
writeFileSync(new URL("../permutle-words.mjs", import.meta.url),
  `// Permutle's words (made by data/build-permutle-words.mjs), five letters each, in order, run\n` +
  `// together: Wordle's answers, which a puzzle starts from, and the common words that count too.\n` +
  `export const WORDS = "${start.join("")}";\n` +
  `export const ALSO = "${also.join("")}";\n`);
console.log(`${start.length} words to start from, ${also.length} more that count`);
