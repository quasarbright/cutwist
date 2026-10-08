// Unit tests for the hyperbolic surfaces in 3D (hyper-surface.mjs).
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHyper } from "./hyper.mjs";
import { surfaceMesh, plateLayout, plateSurface, embedPlate, eulerOf } from "./hyper-surface.mjs";

const file = (N, M) => JSON.parse(readFileSync(new URL(`./regular-maps/${N}-${M}.json`, import.meta.url), "utf8"));
const build = (N, M, surface = 0) => buildHyper({ rule: "hyper", N, M, surface, cuts: [], blackout: [] }, file(N, M));
const turning = (xz, [a, b, c]) => (xz[2 * b] - xz[2 * a]) * (xz[2 * c + 1] - xz[2 * a + 1]) - (xz[2 * b + 1] - xz[2 * a + 1]) * (xz[2 * c] - xz[2 * a]);

test("the mesh is the closed surface: every edge on two triangles, V − E + F = 2 − 2g", () => {
  for (const [N, M] of [[8, 3], [7, 3], [5, 4]]) {
    const P = build(N, M), mesh = surfaceMesh(P), sides = new Map();
    for (const [a, b, c] of mesh.tris) for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = p < q ? `${p},${q}` : `${q},${p}`; sides.set(k, (sides.get(k) ?? 0) + 1); }
    assert.ok([...sides.values()].every((k) => k === 2), `{${N},${M}}: an edge not on exactly two triangles`);
    assert.equal(eulerOf(mesh), 2 - 2 * P.surface.genus, `{${N},${M}}`);
  }
});

test("the six octagons lie flat as a plate's top and bottom, none turned over, the bottom the top mirrored", () => {
  const P = build(8, 3), mesh = surfaceMesh(P), { xz, top, rims, turned } = plateLayout(P, mesh);
  assert.equal(turned, 0);
  assert.equal(rims.length, 3);
  const signs = (side) => new Set(mesh.tris.filter((_, i) => !!top[i] === side).map((t) => Math.sign(turning(xz, t))));
  assert.deepEqual([...signs(true)].length, 1, "the top's triangles all run round one way");
  assert.deepEqual([...signs(false)].length, 1, "and the bottom's");
  assert.notDeepEqual([...signs(true)], [...signs(false)], "the other way to the top's");
  assert.equal(top.reduce((a, b) => a + b, 0) * 2, mesh.tris.length, "half on top");
});

test("every two-holed surface lies flat with none turned over (but {6,6}'s two hexagons)", () => {
  for (const [N, M] of [[3, 8], [4, 6], [4, 8], [5, 10], [6, 4], [8, 3], [8, 4]]) {
    const P = build(N, M);
    assert.equal(P.surface.genus, 2, `{${N},${M}}`);
    assert.equal(plateLayout(P, surfaceMesh(P)).turned, 0, `{${N},${M}}`);
  }
});

test("the finer surface for drawing has nothing turned over either, and its rims sit at the middle height", () => {
  for (const [N, M] of [[8, 3], [4, 6], [3, 8]]) {
    const P = build(N, M), mesh = surfaceMesh(P), { pos, tris } = plateSurface(P, mesh), xz = Float64Array.from({ length: (2 * pos.length) / 3 }, (_, i) => pos[3 * (i >> 1) + (i & 1 ? 2 : 0)]);
    const up = (t) => t.some((v) => pos[3 * v + 1] > 1e-9), signs = (side) => new Set(tris.filter((t) => up(t) === side).map((t) => Math.sign(turning(xz, t))));
    assert.equal(signs(true).size, 1, `{${N},${M}}: the top's triangles all run round one way`);
    assert.equal(signs(false).size, 1, `{${N},${M}}: and the bottom's`);
  }
});

test("a surface with no half turn (the Klein quartic) has no plate", () => {
  const P = build(7, 3);
  assert.throws(() => plateLayout(P, surfaceMesh(P)), /no half turn/);
});

test("in space: the top up, the bottom down, meeting at the rims", () => {
  const P = build(8, 3), mesh = surfaceMesh(P), pos = embedPlate(P, mesh), { top, rims } = plateLayout(P, mesh);
  const onRim = new Set(rims.flat());
  mesh.tris.forEach((t, i) => t.forEach((v) => {
    const y = pos[3 * v + 1];
    if (onRim.has(v)) assert.ok(Math.abs(y) < 1e-9, "a rim vertex sits at the middle height");
    else assert.ok(top[i] ? y > 0 : y < 0, "the top above, the bottom below");
  }));
});
