// Unit tests for the hyperbolic surfaces in 3D (hyper-surface.mjs).
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHyper } from "./hyper.mjs";
import { surfaceMesh, plateLayout, cutLayout, implicitSurface, unpackShape, pretzel, turnedOver, eulerOf } from "./hyper-surface.mjs";

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

test("every two-holed surface lies flat with none turned over, by its half turn or cut along loops", () => {
  for (const [N, M] of [[3, 8], [4, 6], [4, 8], [5, 10], [6, 4], [6, 6], [8, 3], [8, 4]]) {
    const P = build(N, M), { layout, rings } = JSON.parse(readFileSync(new URL(`./regular-maps/shapes/${N}-${M}-0.json`, import.meta.url), "utf8"));
    assert.equal(P.surface.genus, 2, `{${N},${M}}`);
    assert.equal((layout === "plate" ? plateLayout : cutLayout)(P, surfaceMesh(P, rings, rings)).turned, 0, `{${N},${M}} (${layout} at ${rings})`);
  }
});

test("a surface with no half turn (the Klein quartic) has no plate", () => {
  const P = build(7, 3);
  assert.throws(() => plateLayout(P, surfaceMesh(P)), /no half turn/);
});

test("on a surface of two tiles, a triangle's corners are its own points on its tile (a vertex is at more than one place round a tile)", () => {
  const P = build(8, 4), mesh = surfaceMesh(P, 12, 12);
  let longest = 0;
  mesh.tris.forEach((t, i) => t.forEach((_, k) => {
    const [p, q] = [mesh.local[i][k], mesh.local[i][(k + 1) % 3]];
    longest = Math.max(longest, Math.acosh(1 + (2 * ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2)) / ((1 - p[0] ** 2 - p[1] ** 2) * (1 - q[0] ** 2 - q[1] ** 2))));
  }));
  // (by one point per vertex per tile, edges came out 2.9 long)
  assert.ok(longest < 0.6, `the longest edge ${longest.toFixed(2)}`);
});

test("laid out without the half turn, cut along loops round the handles: nothing turned over", () => {
  for (const [N, M, k, r] of [[8, 4, 0, 12], [8, 3, 0, 6]]) {
    const P = build(N, M, k), { turned, rims } = cutLayout(P, surfaceMesh(P, r, r));
    assert.equal(turned, 0, `{${N},${M}}`);
    assert.equal(rims.length, P.surface.genus + 1, `{${N},${M}}: the outside's rim and one a hole`);
  }
});

// (the shapes kept in regular-maps/shapes/, as the page draws them: every one index.json lists)
const keptKeys = JSON.parse(readFileSync(new URL("./regular-maps/shapes/index.json", import.meta.url), "utf8"));
const keptOf = (key) => {
  const [N, M, k] = key.split("-").map(Number), kept = JSON.parse(readFileSync(new URL(`./regular-maps/shapes/${key}.json`, import.meta.url), "utf8"));
  const P = build(N, M, k);
  return { P, kept, drawn: implicitSurface(surfaceMesh(P, kept.rings, kept.perEdge), unpackShape(kept)) };
};
const kept = (N, M, k = 0) => JSON.parse(readFileSync(new URL(`./regular-maps/shapes/${N}-${M}-${k}.json`, import.meta.url), "utf8"));

test("every two-holed surface has a shape kept", () => {
  for (const [N, M] of [[3, 8], [4, 6], [4, 8], [5, 10], [6, 4], [6, 6], [8, 3], [8, 4]]) assert.ok(keptKeys.includes(`${N}-${M}-0`), `{${N},${M}}`);
});

test("the kept shapes draw on the pretzel, smooth, with nothing turned over", () => {
  for (const key of keptKeys) {
    const { P, kept, drawn } = keptOf(key);
    assert.equal(turnedOver(drawn, kept.shape), 0, key);
    const { out } = pretzel(kept.shape);
    let worst = 0;
    for (let v = 0; v < drawn.pos.length / 3; v++) { const [f, gx, gy, gz] = out(drawn.pos[3 * v], drawn.pos[3 * v + 1], drawn.pos[3 * v + 2]); worst = Math.max(worst, Math.abs(f) / (Math.hypot(gx, gy, gz) || 1)); }
    assert.ok(worst < 1e-6, `${key}: every point on the pretzel (off by ${worst})`);
    assert.equal(eulerOf({ verts: { length: drawn.pos.length / 3 }, tris: drawn.tris }), 2 - 2 * P.surface.genus, `${key}: as many holes`);
    assert.equal(kept.shape.circles.length, P.surface.genus, `${key}: a hole in the pretzel each`);
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
  for (const key of keptKeys) {
    const b = bends(keptOf(key).drawn), at = (f) => b[Math.floor(f * (b.length - 1))];
    // (split with Loop's rule after laying out, 1 in 100 turned 134° on the octagons; now 9° to 36°
    // laid out by the half turn, 15° to 72° cut along loops, the most where tiles bunch up at the end
    // of a long pretzel)
    assert.ok(at(0.5) < 3, `${key}: half turn ${at(0.5).toFixed(1)}° or more`);
    assert.ok(at(0.99) < (kept(...key.split("-").map(Number)).layout === "plate" ? 40 : 75), `${key}: 1 in 100 turn ${at(0.99).toFixed(1)}°`);
  }
});

test("a kept shape for another mesh is refused", () => {
  const P = build(4, 6);
  assert.throws(() => implicitSurface(surfaceMesh(P), unpackShape(kept(8, 3))), /another mesh/);
});
