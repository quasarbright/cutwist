// Checks the closed surfaces for the hyperbolic tile puzzles (regular-maps/, built from Marston
// Conder's list of rotary maps by data/build-regular-maps.mjs): every surface's group, rebuilt by
// coset enumeration, must give turns of the right orders and the tile count, genus and sidedness
// stored for it. And against a second source: the maps of genus 2 to 6 transcribed by hand from
// Conder & Dobcsányi's paper (data/conder-dobcsanyi-genus-2-6.json) must check out themselves and
// all be in the built list.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { mapGroup, permOrder, parseRelator, enumerate, wordPerm, generatedSize } from "./todd-coxeter.mjs";
import { isPuzzleSurface } from "./hyper.mjs";

const dir = new URL("./regular-maps/", import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));
const index = read("index.json");
// (every tiling's file; the index lists only those with surfaces for a puzzle)
const tilings = readdirSync(dir).filter((f) => /^\d+-\d+\.json$/.test(f)).map((f) => { const file = read(f); return [`${file.N},${file.M}`, file]; });
const paper = JSON.parse(readFileSync(new URL("./data/conder-dobcsanyi-genus-2-6.json", import.meta.url), "utf8")).maps;

test("the relator notation: powers, brackets, commutators, and Conder's a*b", () => {
  assert.deepEqual(parseRelator("R^3"), [0, 0, 0]);
  assert.deepEqual(parseRelator("(RS^-1)^2"), [0, 3, 0, 3]);
  assert.deepEqual(parseRelator("[R,S]"), [1, 3, 0, 2]); // (R⁻¹S⁻¹RS)
  assert.deepEqual(parseRelator("(a*b)^2", "abc"), parseRelator("(ab)^2", "abc"));
  assert.deepEqual(parseRelator("X^-1*Y^-2", "XY"), [1, 3, 3]);
  // (a few groups everyone knows: the turns of a cube, 24; of a dodecahedron, 60)
  assert.equal(enumerate(2, ["R^4", "S^3", "(RS)^2"].map((r) => parseRelator(r))).size, 24);
  assert.equal(enumerate(2, ["R^5", "S^3", "(RS)^2"].map((r) => parseRelator(r))).size, 60);
});

test("every surface rebuilds: turns of the right orders, and its tiles, genus and sides as stored", () => {
  const wrong = [];
  let n = 0;
  for (const [key, file] of tilings) {
    const [N, M] = key.split(",").map(Number);
    if (file.N !== N || file.M !== M) wrong.push(`${key}: file says {${file.N},${file.M}}`);
    const built = file.groups.map((g) => enumerate(g.letters.length, g.relators.map((r) => parseRelator(r, g.letters)), 2000000));
    file.groups.forEach((g, i) => { if (built[i].size !== g.order) wrong.push(`${key} group ${i}: ${built[i].size}, stored ${g.order}`); });
    let last = 0;
    for (const s of file.surfaces) {
      n++;
      const g = built[s.group], letters = file.groups[s.group].letters, flagged = letters === "abc";
      const R = wordPerm(g.gens, parseRelator(s.tile, letters)), S = wordPerm(g.gens, parseRelator(s.corner, letters));
      const per = flagged ? 2 : 1, tiles = g.size / (per * N), corners = g.size / (per * M), edges = g.size / (2 * per);
      const orientable = flagged ? generatedSize([R, S]) === g.size / 2 : true, chi = corners - edges + tiles;
      const genus = orientable ? (2 - chi) / 2 : 2 - chi;
      if (permOrder(R) !== N || permOrder(S) !== M || tiles !== s.tiles || genus !== s.genus || orientable !== s.orientable)
        wrong.push(`${key} ${JSON.stringify(s)}: rebuilt as {${permOrder(R)},${permOrder(S)}}, ${tiles} tiles, genus ${genus}, ${orientable ? "orientable" : "one-sided"}`);
      if (s.tiles < last) wrong.push(`${key}: out of order at ${s.tiles} tiles`);
      last = s.tiles;
    }
    const sizes = file.surfaces.filter(isPuzzleSurface).map((s) => s.tiles);
    if (JSON.stringify(index.tilings[key] || []) !== JSON.stringify(sizes)) wrong.push(`${key}: index sizes differ from the file's puzzle surfaces`);
  }
  assert.deepEqual(wrong, []);
  assert.ok(n > 8000, `${n} surfaces`);
});

test("the surfaces we know: 3 heptagons at a corner as 24, 72, 156 (three ways), and a mirror pair of 192", () => {
  const sizes = (k, f = () => true) => read(`${k}.json`).surfaces.filter(f).map((s) => s.tiles);
  assert.deepEqual(sizes("7-3", (s) => s.orientable), [24, 72, 156, 156, 156, 192, 192]);
  assert.equal(read("7-3.json").surfaces.filter((s) => s.tiles === 192 && s.chiral).length, 2);
  // 3 octagons: smallest 6 (genus 2); two different 42s (the paper's R8.1 and R8.2)
  assert.deepEqual(sizes("8-3", (s) => s.orientable).slice(0, 5), [6, 12, 24, 42, 42]);
  // (the dual tilings have the same surfaces, tiles and corners swapped: but 7 triangles at a
  // corner on the 192-heptagon surfaces is 448 triangles, past the 400-tile limit)
  assert.deepEqual(sizes("3-7", (s) => s.orientable), [56, 168, 364, 364, 364]);
});

test("the paper's maps (genus 2 to 6, transcribed by hand): each checks out, and each is in the built list", () => {
  const genusOf = ({ automs: A, type: [p, q] }) => A * (1 / 8 - 1 / (4 * p) - 1 / (4 * q)) + 1;
  const wrong = [];
  for (const row of paper) {
    if (Math.abs(genusOf(row) - row.genus) > 1e-9) { wrong.push(`${row.id}: genus ${row.genus}, its size and type give ${genusOf(row)}`); continue; }
    const g = mapGroup(row), [p, q] = row.type;
    if (g.size !== row.automs / 2 || permOrder(g.gens[0]) !== p || permOrder(g.gens[1]) !== q) wrong.push(`${row.id}: group of ${g.size}, {${permOrder(g.gens[0])},${permOrder(g.gens[1])}}`);
    // (in the built list, both ways round: {p,q} and its dual {q,p}, if within its limits)
    const { maxPolygon, maxTiles } = index.limits;
    for (const [N, M] of [[p, q], [q, p]]) {
      const tiles = row.automs / (2 * N);
      if (N > maxPolygon || M > maxPolygon || tiles > maxTiles || 1 / N + 1 / M >= 1 / 2) continue;
      const file = existsSync(new URL(`${N}-${M}.json`, dir)) ? read(`${N}-${M}.json`) : { surfaces: [] };
      if (!file.surfaces.some((s) => s.tiles === tiles && s.genus === row.genus && s.orientable && !s.chiral)) wrong.push(`${row.id}: no {${N},${M}} surface of ${tiles} tiles, genus ${row.genus}`);
    }
  }
  assert.deepEqual(wrong, []);
  assert.equal(paper.length, 59);
});
