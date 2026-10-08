// Unit tests for the hyperbolic surfaces in 3D (hyper-surface.mjs).
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHyper } from "./hyper.mjs";
import { surfaceMesh, plateLayout, implicitSurface, pretzel, turnedOver, eulerOf } from "./hyper-surface.mjs";

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

test("a surface with no half turn (the Klein quartic) has no plate", () => {
  const P = build(7, 3);
  assert.throws(() => plateLayout(P, surfaceMesh(P)), /no half turn/);
});

// (the shapes kept in regular-maps/shapes/, as the page draws them)
const kept = (N, M, k = 0) => JSON.parse(readFileSync(new URL(`./regular-maps/shapes/${N}-${M}-${k}.json`, import.meta.url), "utf8"));
const unpack = ({ mid, shape }) => ({ mid: Float64Array.from(new Float32Array(Uint8Array.from(Buffer.from(mid, "base64")).buffer)), shape });

test("the kept shapes draw on the pretzel, smooth, with nothing turned over", () => {
  for (const [N, M] of [[8, 3], [3, 8], [4, 6], [6, 4]]) {
    const P = build(N, M), mesh = surfaceMesh(P), drawn = implicitSurface(mesh, unpack(kept(N, M)));
    assert.equal(turnedOver(drawn, kept(N, M).shape), 0, `{${N},${M}}`);
    const { out } = pretzel(kept(N, M).shape);
    let worst = 0;
    for (let v = 0; v < drawn.pos.length / 3; v++) { const [f, gx, gy, gz] = out(drawn.pos[3 * v], drawn.pos[3 * v + 1], drawn.pos[3 * v + 2]); worst = Math.max(worst, Math.abs(f) / (Math.hypot(gx, gy, gz) || 1)); }
    assert.ok(worst < 1e-6, `{${N},${M}}: every point on the pretzel (off by ${worst})`);
    assert.equal(eulerOf({ verts: { length: drawn.pos.length / 3 }, tris: drawn.tris }), -2, `{${N},${M}}: still two-holed`);
  }
});

test("a kept shape for another mesh is refused", () => {
  const P = build(4, 6);
  assert.throws(() => implicitSurface(surfaceMesh(P), unpack(kept(8, 3))), /another mesh/);
});
