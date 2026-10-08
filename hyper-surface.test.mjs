// Unit tests for the hyperbolic surfaces in 3D (hyper-surface.mjs).
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHyper } from "./hyper.mjs";
import { surfaceMesh, plateLayout, implicitSurface, unpackShape, pretzel, turnedOver, eulerOf } from "./hyper-surface.mjs";

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

test("the kept shapes draw on the pretzel, smooth, with nothing turned over", () => {
  for (const [N, M] of [[8, 3], [3, 8], [4, 6], [6, 4]]) {
    const P = build(N, M), mesh = surfaceMesh(P), drawn = implicitSurface(mesh, unpackShape(kept(N, M)));
    assert.equal(turnedOver(drawn, kept(N, M).shape), 0, `{${N},${M}}`);
    const { out } = pretzel(kept(N, M).shape);
    let worst = 0;
    for (let v = 0; v < drawn.pos.length / 3; v++) { const [f, gx, gy, gz] = out(drawn.pos[3 * v], drawn.pos[3 * v + 1], drawn.pos[3 * v + 2]); worst = Math.max(worst, Math.abs(f) / (Math.hypot(gx, gy, gz) || 1)); }
    assert.ok(worst < 1e-6, `{${N},${M}}: every point on the pretzel (off by ${worst})`);
    assert.equal(eulerOf({ verts: { length: drawn.pos.length / 3 }, tris: drawn.tris }), -2, `{${N},${M}}: still two-holed`);
  }
});

// How far a straight line on a tile turns, in space, crossing each edge between two of the drawn
// triangles on that tile (degrees, sorted): each triangle's map from the disk to space, a line
// square to the edge, its way out from the edge in each
function bends({ pos, tris, tile, local }) {
  const X = (v) => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]], sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const way = (i, a, b) => {
    const t = tris[i], c = t.find((v) => v !== a && v !== b), [la, lb, lc] = [a, b, c].map((v) => local[i][t.indexOf(v)]);
    const d1 = sub(lb, la), d2 = sub(lc, la), det = d1[0] * d2[1] - d1[1] * d2[0], e1 = sub(X(b), X(a)), e2 = sub(X(c), X(a));
    const v = [-d1[1], d1[0]], s = (d2[1] * v[0] - d2[0] * v[1]) / det, r = (-d1[1] * v[0] + d1[0] * v[1]) / det, w = e1.map((x, j) => s * x + r * e2[j]);
    const l = Math.hypot(...e1), across = cross(e1, w);
    return Math.atan2((Math.hypot(...across) / l) * Math.sign(dot(across, cross(e1, e2))), dot(w, e1) / l);
  };
  const sides = new Map(), out = [];
  tris.forEach((t, i) => t.forEach((a, k) => { const b = t[(k + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`; (sides.get(key) ?? sides.set(key, []).get(key)).push(i); }));
  for (const [key, [i, j]] of sides) {
    if (tile[i] !== tile[j]) continue;
    const [a, b] = key.split(",").map(Number);
    out.push((Math.abs(Math.abs(way(i, a, b)) - Math.abs(way(j, a, b))) * 180) / Math.PI);
  }
  return out.sort((a, b) => a - b);
}

test("lines on the tiles stay smooth on the kept shapes: no kinks where they cross the triangles", () => {
  for (const [N, M] of [[8, 3], [3, 8], [4, 6], [6, 4]]) {
    const b = bends(implicitSurface(surfaceMesh(build(N, M)), unpackShape(kept(N, M)))), at = (f) => b[Math.floor(f * (b.length - 1))];
    // (split with Loop's rule after laying out, 1 in 100 turned 134° on the octagons)
    assert.ok(at(0.5) < 3, `{${N},${M}}: half turn ${at(0.5).toFixed(1)}° or more`);
    assert.ok(at(0.99) < 32, `{${N},${M}}: 1 in 100 turn ${at(0.99).toFixed(1)}°`);
  }
});

test("a kept shape for another mesh is refused", () => {
  const P = build(4, 6);
  assert.throws(() => implicitSurface(surfaceMesh(P), unpackShape(kept(8, 3))), /another mesh/);
});
