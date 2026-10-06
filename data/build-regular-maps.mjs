// Builds regular-maps.json, the closed surfaces the hyperbolic tile puzzles can wrap onto, from
// Marston Conder's list of all rotary maps with up to 1000 edges
// (data/RotaryMapsWithUpTo1000Edges.txt, from http://www.math.auckland.ac.nz/~conder/).
// Run: node data/build-regular-maps.mjs (the list isn't in the repo; get it first with
//   curl -o data/RotaryMapsWithUpTo1000Edges.txt http://www.math.auckland.ac.nz/~conder/RotaryMapsWithUpTo1000Edges.txt)
//
// A rotary map is a tiling of a closed surface where every tile is alike: its symmetries
// include a turn about any tile and about any corner. Each entry of the list gives the map's
// symmetry group by generators and relations, and stands for a few related maps (the same group,
// with other words for "turn about a tile" and "turn about a corner"):
// - fully regular maps (with reflections) use reflections a, b, c: the tile turn is ab, the corner
//   turn bc. Their images under Wilson's operators fix b and permute a, c and ac: duality D swaps
//   a and c, Petrie duality P swaps a and ac, Opp swaps c and ac, DP and PD cycle all three.
// - chiral maps (no reflections) use the turns X and Y themselves; the mirror image is (X⁻¹, Y⁻¹),
//   the dual (Y, X), the mirror-dual (Y⁻¹, X⁻¹).
// Every surface kept is rebuilt by coset enumeration: its group must have the size the list
// says, and its tile count, genus and sidedness are read off the group, not taken on trust.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { parseRelator, enumerate, permOrder, wordPerm, generatedSize } from "../todd-coxeter.mjs";

// the surfaces worth a puzzle: hyperbolic, tiles and corners up to MAX, and not too many tiles
const MAX = 12, MAX_TILES = 400;

const text = readFileSync(new URL("./RotaryMapsWithUpTo1000Edges.txt", import.meta.url), "utf8");
const lines = text.split("\n");

// ---- the entries
const entries = [];
let edges = 0;
for (let i = 0; i < lines.length; i++) {
  const section = /^Rotary maps with (\d+) edges?$/.exec(lines[i].trim());
  if (section) { edges = Number(section[1]); continue; }
  const head = /^(Orientable|Non-orientable|Chiral) map of genus (\d+) and type \{(\d+),(\d+)\}_(\d+)(.*)$/.exec(lines[i]);
  if (!head) continue;
  const [, kind, genus, p, q, r, rest] = head;
  const order = Number(/order (\d+)/.exec(lines[i + 1])[1]);
  // (the relations: from "[" to "]", maybe over several lines)
  let rel = "", j = i + 2;
  for (; !rel.includes("]"); j++) rel += lines[j];
  const relators = rel.replace(/^\s*\[|\]\s*$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  entries.push({
    line: i + 1, edges, kind: kind === "Chiral" ? "chiral" : kind === "Orientable" ? "regular" : "nonorientable",
    genus: Number(genus), p: Number(p), q: Number(q), r: Number(r), rest: rest.trim(), order, relators,
  });
  i = j - 1;
}

// ---- the surfaces each entry stands for: [name, tile-turn word, corner-turn word]
function variants(e) {
  if (e.kind === "chiral") {
    const all = { I: ["X", "Y"], mirror: ["X^-1", "Y^-1"], dual: ["Y", "X"], "mirror-dual": ["Y^-1", "X^-1"] };
    // (isomorphic to its dual: the dual is itself, the mirror-dual its mirror; to its mirror-dual:
    // the mirror-dual is itself, the dual its mirror)
    const names = /not isomorphic/.test(e.rest) ? ["I", "mirror", "dual", "mirror-dual"] : ["I", "mirror"];
    return names.map((n) => [n, ...all[n]]);
  }
  // (a', c') for each operator, as words in a, b, c; then the tile turn a'b and corner turn bc'
  const ops = { I: ["a", "c"], D: ["c", "a"], P: ["a*c", "c"], Opp: ["a", "a*c"], DP: ["a*c", "a"], PD: ["c", "a*c"] };
  const listed = /invariant under all six/.test(e.rest) ? [] : (/\[([^\]]*)\]/.exec(e.rest)?.[1] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return ["I", ...listed].map((n) => [n, `${ops[n][0]}*b`, `b*${ops[n][1]}`]);
}
// the types an entry's surfaces can have, from the header alone (to skip whole entries early):
// the operators permute the face size p, valency q and Petrie length r
const possibleTypes = (e) => e.kind === "chiral" ? [[e.p, e.q], [e.q, e.p]]
  : [[e.p, e.q], [e.q, e.p], [e.r, e.q], [e.q, e.r], [e.p, e.r], [e.r, e.p]];
const wanted = ([N, M]) => N >= 3 && M >= 3 && N <= MAX && M <= MAX && 1 / N + 1 / M < 1 / 2;

// ---- rebuild and keep
const groups = [], surfaces = {}, problems = [], slowest = { ms: 0 };
let built = 0;
for (const e of entries) {
  if (!possibleTypes(e).some(wanted)) continue;
  // (tiles = 2·edges / N: skip if every possible type has too many)
  if (!possibleTypes(e).some(([N, M]) => wanted([N, M]) && (2 * e.edges) / N <= MAX_TILES)) continue;
  const letters = e.kind === "chiral" ? "XY" : "abc";
  let g;
  const t0 = performance.now();
  try { g = enumerate(letters.length, e.relators.map((r) => parseRelator(r, letters)), 2000000); } catch (err) { problems.push(`line ${e.line}: ${err.message}`); continue; }
  built++;
  const ms = performance.now() - t0;
  if (ms > slowest.ms) Object.assign(slowest, { ms, line: e.line, order: e.order, peak: g.peak });
  if (g.size !== e.order) { problems.push(`line ${e.line}: group of ${g.size}, the list says ${e.order}`); continue; }
  const flagged = e.kind !== "chiral"; // (the group acts on flags: twice as many elements as its turns)
  let groupIndex = -1;
  for (const [name, Rw, Sw] of variants(e)) {
    const R = wordPerm(g.gens, parseRelator(Rw, letters)), S = wordPerm(g.gens, parseRelator(Sw, letters));
    const N = permOrder(R), M = permOrder(S);
    if (!wanted([N, M])) continue;
    // faces: the group's elements over a tile's stabilizer (its turns, and with reflections, its flips)
    const per = flagged ? 2 : 1, tiles = g.size / (per * N), corners = g.size / (per * M), edgeCount = g.size / (2 * per);
    if (edgeCount !== e.edges) problems.push(`line ${e.line} ${name}: ${edgeCount} edges, the list says ${e.edges}`);
    if (tiles > MAX_TILES) continue;
    // orientable when the turns alone are half the group (or the whole of a chiral one's)
    const turns = generatedSize([R, S]), orientable = flagged ? turns === g.size / 2 : true;
    const chi = corners - edgeCount + tiles, genus = orientable ? (2 - chi) / 2 : 2 - chi;
    if (name === "I" && (genus !== e.genus || orientable !== (e.kind !== "nonorientable"))) problems.push(`line ${e.line}: genus ${genus} ${orientable ? "orientable" : "non-orientable"}, the list says ${e.genus} ${e.kind}`);
    if (groupIndex < 0) { groupIndex = groups.length; groups.push({ line: e.line, letters, order: e.order, relators: e.relators }); }
    const key = `${N},${M}`;
    (surfaces[key] ??= []).push({ group: groupIndex, from: name, tile: Rw, corner: Sw, tiles, genus, orientable, chiral: e.kind === "chiral", ms: Math.round(ms) });
  }
}
for (const list of Object.values(surfaces)) list.sort((x, y) => x.tiles - y.tiles || x.genus - y.genus);

console.log(`${entries.length} entries read, ${built} groups rebuilt, ${groups.length} kept`);
console.log(`${Object.values(surfaces).flat().length} surfaces over ${Object.keys(surfaces).length} tilings`);
console.log(`slowest group: ${slowest.ms.toFixed(0)} ms (line ${slowest.line}, order ${slowest.order}, ${slowest.peak} cosets on the way)`);
if (problems.length) { console.log(`${problems.length} problems:`); for (const p of problems.slice(0, 30)) console.log("  " + p); process.exitCode = 1; }

// One file per tiling (fetched when that tiling is picked: nothing loads with the page), each
// with just the groups its surfaces use, and an index of the tilings and their sizes.
const SOURCE = "Marston Conder, rotary maps with up to 1000 edges (http://www.math.auckland.ac.nz/~conder/RotaryMapsWithUpTo1000Edges.txt), expanded under the Wilson operators (regular maps) and mirror image and duality (chiral maps). Built by data/build-regular-maps.mjs.";
const dir = new URL("../regular-maps/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (f.endsWith(".json")) rmSync(new URL(f, dir));
const index = {};
for (const [key, list] of Object.entries(surfaces)) {
  const [N, M] = key.split(",").map(Number), used = [...new Set(list.map((s) => s.group))];
  writeFileSync(new URL(`${N}-${M}.json`, dir), JSON.stringify({
    source: SOURCE, N, M,
    how: "surfaces: tiled by N-gons, M at each corner, fewest tiles first. Each: its group (groups[group]: generator letters and relators), words in those letters for a turn about a tile (order N) and about a corner (order M), its tile count and genus, whether it's orientable and whether it's chiral (its mirror image a different surface), and ms: how long its group took to build here.",
    groups: used.map((i) => groups[i]),
    surfaces: list.map(({ group, ...s }) => ({ group: used.indexOf(group), ...s })),
  }));
  index[key] = list.map((s) => s.tiles);
}
writeFileSync(new URL("index.json", dir), JSON.stringify({ source: SOURCE, limits: { maxPolygon: MAX, maxPerCorner: MAX, maxTiles: MAX_TILES }, tilings: index }));
