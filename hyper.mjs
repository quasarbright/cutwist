// Hyperbolic tile-turning puzzles: M N-gons at every corner (1/N + 1/M < 1/2, so the tiling is
// hyperbolic), wrapped onto a closed surface where every tile is alike (regular-maps/N-M.json),
// and cut by circles like the flat tile puzzles: around tiles' middles, corners or edges' middles,
// with rings. Drawn in the Poincaré disk, where hyperbolic circles are ordinary circles.
//
// The surface is its turning group H: R turns a tile about its middle by one side, S turns about a
// corner by one tile, (RS)² = 1, plus the surface's own rules (coset enumeration builds it). An
// element of H is a "dart": tile 0 with its corner 0 marked, moved somewhere on the surface. Tiles
// are the cosets h⟨R⟩, corners h⟨S⟩, edges h⟨RS⟩. The disk (the surface unrolled) has the same
// darts as Möbius maps, so each spot of the disk knows which spot of the surface it is.
//
// A piece is a region of the circles' arrangement; its name on the surface is the set of circles it's
// inside (which axis, which ring). Its position is an element g of H: it sits where g carries its
// home. A turn about an axis by q is the element ρ^q (ρ = h·X·h⁻¹ for the axis's coset hX⁻¹...),
// applied on the left to every piece in the ring: positions stay exact.
// No drawing here (hyper-view.mjs draws the disk).
import { enumerate, parseRelator, wordPerm } from "./todd-coxeter.mjs";
import { arrangement, faceInner, faceHas, inPolygon } from "./tiles.mjs";

// ---- complex numbers and maps of the disk (Möbius, [a, b, c, d]: z → (az + b)/(cz + d))
const cx = (re, im = 0) => [re, im];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const conj = (a) => [a[0], -a[1]], neg = (a) => [-a[0], -a[1]], abs = (a) => Math.hypot(a[0], a[1]);
const expi = (t) => [Math.cos(t), Math.sin(t)];
export const mobius = {
  I: [cx(1), cx(0), cx(0), cx(1)],
  mul: (M, N) => [add(mul(M[0], N[0]), mul(M[1], N[2])), add(mul(M[0], N[1]), mul(M[1], N[3])), add(mul(M[2], N[0]), mul(M[3], N[2])), add(mul(M[2], N[1]), mul(M[3], N[3]))],
  apply: (M, z) => div(add(mul(M[0], z), M[1]), add(mul(M[2], z), M[3])),
  inv: (M) => [M[3], neg(M[1]), neg(M[2]), M[0]],
  // (scaled to determinant 1, so long products don't drift in size)
  norm: (M) => { const d = sub(mul(M[0], M[3]), mul(M[1], M[2])), r = Math.sqrt(abs(d)), t = Math.atan2(d[1], d[0]) / 2, s = div(cx(1), mul(cx(r), expi(t))); return M.map((x) => mul(x, s)); },
  rot: (t) => [expi(t / 2), cx(0), cx(0), expi(-t / 2)], // (a turn about the middle)
  to: (v) => [cx(1), v, conj(v), cx(1)], // (0 to v, the shortest way)
};
mobius.about = (v, t) => mobius.norm(mobius.mul(mobius.mul(mobius.to(v), mobius.rot(t)), mobius.inv(mobius.to(v)))); // (a turn about v)
const M = mobius;
// hyperbolic distance between two points of the disk
export const hdist = (z, w) => 2 * Math.atanh(Math.min(1 - 1e-16, abs(sub(z, w)) / abs(sub(cx(1), mul(conj(w), z)))));
// a hyperbolic circle (middle p, radius rho) as the disk draws it: an ordinary circle { c, r }
export function diskCircle(p, rho) {
  const t = Math.tanh(rho / 2), p2 = p[0] * p[0] + p[1] * p[1], k = 1 - t * t * p2;
  return { c: mul(p, cx((1 - t * t) / k)), r: (t * (1 - p2)) / k };
}

// ---- the tile: an N-gon with M at each corner, centered in the disk, corner 0 straight up
const KINDS = ["face", "vertex", "edge"];
const geometries = new Map();
export function geometry(N, M_) {
  const key = `${N},${M_}`;
  if (geometries.has(key)) return geometries.get(key);
  // middle to corner, and middle to an edge's middle (hyperbolic), and an edge's length
  const Rv = Math.acosh(1 / (Math.tan(Math.PI / N) * Math.tan(Math.PI / M_))), Ri = Math.acosh(Math.cos(Math.PI / M_) / Math.sin(Math.PI / N));
  const at = (k, d) => mul(cx(Math.tanh(d / 2)), expi(Math.PI / 2 + (2 * Math.PI * k) / N));
  const corners = Array.from({ length: N }, (_, k) => at(k, Rv)), mids = Array.from({ length: N }, (_, k) => at(k + 0.5, Ri));
  const A = M.rot((2 * Math.PI) / N), B = M.about(corners[0], (2 * Math.PI) / M_);
  // (which edge's middle the half turn AB turns about: tile 0's edge for dart 0)
  const AB = M.mul(A, B), edge = mids.findIndex((m) => abs(sub(M.apply(AB, m), m)) < 1e-9);
  // the tile's outline, its edges straight lines of the hyperbolic plane (circles meeting the rim
  // square on), finely
  const geodesic = (p, q, n) => { const w = M.apply(M.inv(M.to(p)), q); return Array.from({ length: n }, (_, i) => M.apply(M.to(p), mul(w, cx(i / n)))); };
  const poly = corners.flatMap((p, k) => geodesic(p, corners[(k + 1) % N], 24));
  const g = { N, M: M_, Rv, Ri, edgeLength: 2 * Math.asinh(Math.sinh(Rv) * Math.sin(Math.PI / N)), corners, mids, A, B, Ai: M.inv(A), Bi: M.inv(B), edge, poly };
  geometries.set(key, g);
  return g;
}

// ---- the turning group of a surface (from its entry in regular-maps/N-M.json)
export function turnGroup(file, s) {
  const grp = file.groups[s.group];
  const g = enumerate(grp.letters.length, grp.relators.map((r) => parseRelator(r, grp.letters)), 2000000);
  const Rp = wordPerm(g.gens, parseRelator(s.tile, grp.letters)), Sp = wordPerm(g.gens, parseRelator(s.corner, grp.letters));
  // H: the elements reached from 1 by R and S (half the group when it has reflections), each with
  // its shortest word (0: R, 1: S), numbered from 1 = 0
  const idx = new Map([[0, 0]]), elems = [0], word = [[]];
  for (let i = 0; i < elems.length; i++) for (const [gi, P] of [[0, Rp], [1, Sp]]) {
    const y = P[elems[i]];
    if (!idx.has(y)) { idx.set(y, elems.length); elems.push(y); word.push([...word[i], gi]); }
  }
  const n = elems.length;
  const right = [elems.map((x) => idx.get(Rp[x])), elems.map((x) => idx.get(Sp[x]))]; // x ↦ xR, xS
  const rightInv = right.map((P) => { const out = new Int32Array(n); P.forEach((j, i) => (out[j] = i)); return out; });
  const H = { n, right, rightInv, word };
  H.mul = (x, y) => { let z = x; for (const k of word[y]) z = right[k][z]; return z; }; // x·y
  H.inv = new Int32Array(n);
  for (let y = 0; y < n; y++) { let z = 0; for (let i = word[y].length - 1; i >= 0; i--) z = rightInv[word[y][i]][z]; H.inv[y] = z; }
  H.R = right[0][0]; H.S = right[1][0]; H.RS = right[1][H.R];
  // cosets: tiles (orbits of ·R), corners (·S), edges (·RS)
  const cosets = (step) => {
    const of = new Int32Array(n).fill(-1), reps = [];
    for (let x = 0; x < n; x++) if (of[x] < 0) { for (let y = x; of[y] < 0; y = step(y)) of[y] = reps.length; reps.push(x); }
    return { of, reps };
  };
  H.coset = { face: cosets((x) => right[0][x]), vertex: cosets((x) => right[1][x]), edge: cosets((x) => right[1][right[0][x]]) };
  return H;
}

// ---- the disk: darts (a Möbius map and an element of H), breadth first from a starting dart
// keep(center) says whether to keep going past a tile (and to list it)
export function darts(G, H, start, keep) {
  const tiles = [], seen = new PointSet(1e-9);
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const d = queue[qi], c = M.apply(d.m, cx(0));
    if (abs(c) >= 1 || seen.has(c) || !keep(c, d)) continue;
    seen.add(c);
    tiles.push(d);
    // (the tiles across each corner: turn to the corner, then about it)
    let m = d.m, e = d.e;
    for (let k = 0; k < G.N; k++) {
      queue.push({ m: M.norm(M.mul(m, G.B)), e: H.right[1][e] }, { m: M.norm(M.mul(m, G.Bi)), e: H.rightInv[1][e] });
      m = M.mul(m, G.A); e = H.right[0][e];
    }
  }
  return tiles;
}
// points as keys, matched to within a tolerance (neighboring buckets by index, not by adding a
// width to a coordinate: that rounds)
class PointSet {
  constructor(tol) { this.tol = tol; this.map = new Map(); }
  key([x, y], dx = 0, dy = 0) { return `${Math.floor(x / this.tol) + dx},${Math.floor(y / this.tol) + dy}`; }
  find(p) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const [q, v] of this.map.get(this.key(p, dx, dy)) || []) if (Math.abs(q[0] - p[0]) < this.tol && Math.abs(q[1] - p[1]) < this.tol) return v ?? true;
    return undefined;
  }
  has(p) { return this.find(p) !== undefined; }
  add(p, v = true) { const k = this.key(p); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push([p, v]); }
}
// a tile's axis points: its middle, corners and edges' middles, each with its element (the dart
// turned so that point is its own: tile k's corner j is dart·R^j's corner 0)
function axisPoints(G, H, d) {
  const out = [{ kind: "face", p: M.apply(d.m, cx(0)), e: d.e }];
  let e = d.e;
  for (let j = 0; j < G.N; j++) {
    out.push({ kind: "vertex", p: M.apply(d.m, G.corners[j]), e });
    out.push({ kind: "edge", p: M.apply(d.m, G.mids[(G.edge + j) % G.N]), e });
    e = H.right[0][e];
  }
  return out;
}

// ---- presets and parameters
export const HYPER_PARAMS = [
  { key: "N", label: "sides", min: 3, max: 12, title: "how many sides each tile has" },
  { key: "M", label: "at a corner", min: 3, max: 12, title: "how many tiles meet at each corner" },
  { key: "surface", label: "size", min: 0, title: "which closed surface the tiling wraps onto: a tiling has only a few, fewest tiles first" },
];
// (surface: an index into the tiling's two-sided surfaces, fewest tiles first)
const hyperPreset = (id, name, N, M_, cuts) => ({
  id, name, rule: "hyper", size: 2, fixed: true, N, M: M_, surface: 0, cuts, truncate: {}, blackout: [], params: HYPER_PARAMS,
  title: () => name,
});
// (a circle around each tile's middle, a bit past its corners: like the flat puzzles' default)
const faceDefault = (N, M_) => 1.15 * geometry(N, M_).Rv;
export const HYPER_PRESETS = [
  hyperPreset("hyper-octagons", "Octagon Surface", 8, 3, [{ on: "face", depths: [faceDefault(8, 3)] }]),
  hyperPreset("hyper-klein", "Klein Quartic", 7, 3, [{ on: "face", depths: [faceDefault(7, 3)] }]),
  hyperPreset("hyper-pentagons", "Pentagon Surface", 5, 4, [{ on: "face", depths: [faceDefault(5, 4)] }]),
  hyperPreset("hyper-squares", "Square Surface", 4, 5, [{ on: "face", depths: [faceDefault(4, 5)] }]),
];
// the surfaces a tiling's file offers (two-sided ones), fewest tiles first
export const hyperSurfaces = (file) => file.surfaces.filter((s) => s.orientable);
// a surface's name in the size menu: "24 tiles · genus 3", and which of a mirror pair
export function surfaceLabel(list, i) {
  const s = list[i], twins = list.filter((t) => t.tiles === s.tiles);
  const k = twins.indexOf(s), mirror = s.chiral ? (s.from.includes("mirror") ? " (mirrored)" : "") : "";
  return `${s.tiles} tiles · genus ${s.genus}${twins.length > 1 ? ` · ${String.fromCharCode(97 + k)}` : ""}${mirror}`;
}
export const isHyperbolic = (N, M_) => N >= 3 && M_ >= 3 && 1 / N + 1 / M_ < 1 / 2;
const radiiOf = (spec, kind) => [...new Set((spec.cuts || []).filter((c) => c.on === kind).flatMap((c) => c.depths).filter((r) => r > 0))].sort((a, b) => a - b);

// ---- building a puzzle: spec { N, M, surface, cuts, blackout }, file: regular-maps/N-M.json
export function buildHyper(spec, file) {
  const { N } = spec, M_ = spec.M, G = geometry(N, M_);
  const list = hyperSurfaces(file), surface = list[Math.max(0, Math.min(list.length - 1, spec.surface | 0))];
  const H = turnGroup(file, surface);
  const P = { kind: "hyper", spec, G, H, surface, N, M: M_, tiles: H.coset.face.reps.length };
  P.cap = radiusCaps(P);
  P.radii = Object.fromEntries(KINDS.map((k) => [k, radiiOf(spec, k).filter((r) => r < P.cap[k])]));
  // (a radius within 1e-5 of a snap mark is that mark exactly: a hair off leaves slivers too
  // thin to work out reliably, the lesson of the flat tiles' color popping)
  for (const kind of KINDS) P.radii[kind].forEach((r, i) => {
    const m = hyperSnapCandidates(P, kind, i).find((m) => Math.abs(m - r) < 1e-5);
    if (m !== undefined) P.radii[kind][i] = m;
  });
  const radii = P.radii;
  // the axes: every tile, corner or edge of the surface with circles around it
  const order = { face: N, vertex: M_, edge: 2 }, step = { face: H.R, vertex: H.S, edge: H.RS };
  P.axes = KINDS.flatMap((kind) => radii[kind].length ? H.coset[kind].reps.map((h, coset) => {
    const rho = H.mul(H.mul(h, step[kind]), H.inv[h]), pow = [0];
    for (let q = 1; q < order[kind]; q++) pow.push(H.mul(rho, pow[q - 1]));
    return { kind, coset, rep: h, order: order[kind], radii: radii[kind], pow };
  }) : []);
  P.axisIndex = new Map(P.axes.map((a, i) => [`${a.kind}:${a.coset}`, i]));
  findPieces(P);
  return P;
}

// ---- snap marks: the radii where the drawing changes (as on the flat torus): a circle passing
// through another tile's middle, corner or edge's middle; touching one of its copies or another
// circle; passing through where two other circles cross; through the point as far from three of
// its copies; or where two of its copies meet on another circle. Worked out in the hyperboloid
// model, where a point is a vector X with ⟨X, X⟩ = 1 and the distance d has cosh d = ⟨X, Y⟩
// (⟨a, b⟩ = a₀b₀ − a₁b₁ − a₂b₂), so "as far from p as from q" is the plane ⟨X, p − q⟩ = 0.
const toHyp = ([x, y]) => { const s = 1 - x * x - y * y; return [(1 + x * x + y * y) / s, (2 * x) / s, (2 * y) / s]; };
const mink = (a, b) => a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
const flipJ = (a) => [a[0], -a[1], -a[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const hypDist = (X, Y) => Math.acosh(Math.max(1, mink(X, Y)));
// the points X on the hyperboloid with ⟨X, u⟩ = a and ⟨X, w⟩ = b (two planes and the sheet)
function onTwoPlanes(u, a, w, b) {
  const U = flipJ(u), W = flipJ(w); // (⟨X, u⟩ = X·Ju: ordinary dot products)
  const uu = U[0] * U[0] + U[1] * U[1] + U[2] * U[2], ww = W[0] * W[0] + W[1] * W[1] + W[2] * W[2], uw = U[0] * W[0] + U[1] * W[1] + U[2] * W[2];
  const det = uu * ww - uw * uw;
  if (Math.abs(det) < 1e-14) return [];
  const s = (a * ww - b * uw) / det, t = (b * uu - a * uw) / det, X0 = [s * U[0] + t * W[0], s * U[1] + t * W[1], s * U[2] + t * W[2]];
  const k = cross3(U, W), A = mink(k, k), Bq = 2 * mink(X0, k), C = mink(X0, X0) - 1, disc = Bq * Bq - 4 * A * C;
  if (Math.abs(A) < 1e-14 || disc < 0) return [];
  return [(-Bq - Math.sqrt(disc)) / (2 * A), (-Bq + Math.sqrt(disc)) / (2 * A)].map((t) => [X0[0] + t * k[0], X0[1] + t * k[1], X0[2] + t * k[2]]).filter((X) => X[0] > 0);
}
// the radii a kind's circle number i can snap to (P: built as far as its caps and radii)
export function hyperSnapCandidates(P, kind, i) {
  const { G, H } = P, cap = P.cap[kind], own = P.radii[kind].filter((_, j) => j !== i);
  const rmax = Math.max(cap, ...KINDS.flatMap((k) => P.radii[k]));
  const p0 = kind === "face" ? cx(0) : kind === "vertex" ? G.corners[0] : G.mids[G.edge], P0 = toHyp(p0);
  // every axis point near it, once
  const near = darts(G, H, { m: M.I, e: 0 }, (c) => hdist(c, p0) < 2 * cap + rmax + 2 * G.Rv), seen = new PointSet(1e-9), pts = [];
  for (const d of near) for (const a of axisPoints(G, H, d)) {
    if (seen.has(a.p) || hdist(a.p, p0) > 2 * cap + rmax) continue;
    seen.add(a.p); pts.push({ kind: a.kind, p: a.p, X: toHyp(a.p), d: hdist(a.p, p0) });
  }
  const copies = pts.filter((a) => a.kind === kind && a.d > 1e-9 && a.d < 2 * cap);
  // the other circles (every radius but this one), near enough to matter
  const fixed = pts.flatMap((a) => P.radii[a.kind].flatMap((r, j) => (a.kind === kind && j === i ? [] : a.d - r < cap ? [{ ...a, r }] : [])));
  const out = [], add = (d) => { if (d > 0.05 + 1e-6 && d < cap - 1e-6 && !own.some((r) => Math.abs(r - d) < 1e-6) && !out.some((e) => Math.abs(e - d) < 1e-9)) out.push(d); };
  for (const a of pts) add(a.d); // (through a point)
  for (const q of copies) add(q.d / 2); // (touching a copy)
  for (const f of fixed) if (f.d > 1e-9) { add(f.d - f.r); add(f.d + f.r); add(f.r - f.d); } // (touching another circle)
  // (through where two other circles cross: as the disk draws them, ordinary circles)
  const discs = fixed.map((f) => diskCircle(f.p, f.r));
  for (let a = 0; a < discs.length; a++) for (let b = a + 1; b < discs.length; b++) {
    const c1 = discs[a], c2 = discs[b], dx = c2.c[0] - c1.c[0], dy = c2.c[1] - c1.c[1], dd = Math.hypot(dx, dy);
    if (dd < 1e-12 || dd > c1.r + c2.r || dd < Math.abs(c1.r - c2.r)) continue;
    const along = (c1.r * c1.r - c2.r * c2.r + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, c1.r * c1.r - along * along));
    for (const s of [-1, 1]) add(hdist(p0, [c1.c[0] + (along * dx - s * h * dy) / dd, c1.c[1] + (along * dy + s * h * dx) / dd]));
  }
  // The events among its copies, for its nearest ring of them (the hyperbolic plane's copies
  // multiply outward fast, and far ones' crowd the ruler with marks nobody wants):
  const closest = Math.min(Infinity, ...copies.map((q) => q.d)), ring = copies.filter((q) => q.d < 1.5 * closest);
  // (through the point as far from three of its copies, itself one of them)
  for (let a = 0; a < ring.length; a++) for (let b = a + 1; b < ring.length; b++) {
    const X = cross3(flipJ(sub3(P0, ring[a].X)), flipJ(sub3(P0, ring[b].X))), n = mink(X, X);
    if (n > 1e-12) { const s = (X[0] < 0 ? -1 : 1) / Math.sqrt(n); add(hypDist([X[0] * s, X[1] * s, X[2] * s], P0)); }
  }
  // (where two copies meet on another circle: as far from it as from a copy, on that circle)
  for (const q of ring) for (const f of fixed) for (const X of onTwoPlanes(sub3(P0, q.X), 0, f.X, Math.cosh(f.r))) add(hypDist(X, P0));
  return out.sort((a, b) => a - b);
}

// how big each kind's circles can be: less than halfway to the nearest other copy of the same
// tile (corner, edge) in the disk, or they'd reach around the surface and overlap themselves
function radiusCaps(P) {
  const { G, H } = P, at0 = axisPoints(G, H, { m: M.I, e: 0 }), cap = {};
  const homes = { face: at0[0], vertex: at0[1], edge: at0[2] };
  let reach = 2;
  for (;;) {
    const near = darts(G, H, { m: M.I, e: 0 }, (c) => hdist(c, cx(0)) < reach);
    for (const kind of KINDS) {
      const home = homes[kind], c0 = H.coset[kind].of[home.e];
      let best = Infinity;
      for (const d of near) for (const a of axisPoints(G, H, d))
        if (a.kind === kind && H.coset[kind].of[a.e] === c0 && hdist(a.p, home.p) > 1e-6) best = Math.min(best, hdist(a.p, home.p));
      cap[kind] = best / 2 - 0.02;
    }
    if (KINDS.every((k) => Number.isFinite(cap[k]) && 2 * (cap[k] + 0.02) + G.Rv < reach) || reach > 12) break;
    reach += 1.5;
  }
  return cap;
}

// The pieces: the arrangement of every circle near tile 0, its regions touching tile 0, each named
// by the circles it's inside; then those regions carried onto every tile of the surface, one piece
// per name.
function findPieces(P) {
  const { G, H, radii } = P;
  const rmax = Math.max(0, ...KINDS.flatMap((k) => radii[k]));
  P.regions = []; P.pieces = []; P.n = 0;
  if (!rmax) return;
  // (a region touching tile 0 is inside a circle that reaches it; the circles bounding the region
  // reach that circle)
  const reach = G.Rv + 3 * rmax + 0.05;
  const near = darts(G, H, { m: M.I, e: 0 }, (c) => hdist(c, cx(0)) < reach + G.Rv);
  const points = new PointSet(1e-9), axes = [];
  for (const d of near) for (const a of axisPoints(G, H, d)) {
    if (!radii[a.kind].length || points.has(a.p) || hdist(a.p, cx(0)) > reach) continue;
    points.add(a.p);
    axes.push({ ...a, coset: H.coset[a.kind].of[a.e] });
  }
  const circles = axes.flatMap((a, ai) => radii[a.kind].map((r, ring) => ({ ...diskCircle(a.p, r), axis: ai, ring })));
  // tile 0, and the tiles near it (for the stickers), as polygons in the disk
  const tile0 = G.poly;
  P.near = near.filter((d) => hdist(M.apply(d.m, cx(0)), cx(0)) < G.Rv + 2 * rmax + 2 * G.Rv).map((d) => ({ e: d.e, poly: G.poly.map((z) => M.apply(d.m, z)) }));
  for (const f of arrangement(circles)) {
    const inner = faceInner(f, circles);
    // its name: for each axis whose circles it's inside, the smallest (its ring)
    const name = new Map();
    for (const c of circles) if (abs(sub(inner, c.c)) < c.r) { const a = axes[c.axis], k = `${a.kind}:${a.coset}`; if (!name.has(k) || name.get(k).ring > c.ring) name.set(k, { ring: c.ring, axis: c.axis }); }
    if (!name.size) continue; // (outside every circle: it doesn't move)
    // touching tile 0: its edge passes through it, or it covers tile 0's middle or a corner
    const touches = f.poly().some((z) => inPolygon(tile0, z)) || faceHas(f, cx(0)) || G.corners.some((z) => faceHas(f, z));
    if (!touches) continue;
    // the anchor: of points spread over it, the one farthest (hyperbolically) from every circle
    const depth = (z) => Math.min(...circles.map((c) => Math.abs(abs(sub(z, c.c)) - c.r) / (1 - (z[0] * z[0] + z[1] * z[1]))));
    let anchor = inner, best = depth(inner);
    const [x0, y0, x1, y1] = f.box;
    for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
      const z = [x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * j) / 12];
      if (faceHas(f, z) && depth(z) > best) { best = depth(z); anchor = z; }
    }
    // the tiles it covers some of (its stickers), by the exact test in the Klein model, where a
    // tile is a convex polygon. tiles: those tiles' polygons, for drawing (on a small surface
    // several tiles near tile 0 are copies of one, with the same element: the element alone
    // doesn't say which copy)
    const under = P.near.filter((t) => overlap(f, t.poly) > 1e-9), stickers = under.map((t) => t.e), tiles = under.map((t) => t.poly);
    // the axes near it: where each of its circles' middles is, for turning it about the right one
    const around = [...name.values()].map(({ ring, axis }) => ({ ring, kind: axes[axis].kind, e: axes[axis].e, p: axes[axis].p }));
    P.regions.push({ face: f, outline: [f.outer, ...f.holes], poly: [f.poly(), ...f.holePolys()], anchor, name: [...name.entries()].map(([k, v]) => [axes[v.axis].kind, axes[v.axis].e, v.ring]), around, stickers, tiles });
  }
  // the darts near tile 0, by element: where each element of H shows up near tile 0 (more than
  // once on a small surface)
  const nearBy = new Map();
  for (const d of near) {
    if (hdist(M.apply(d.m, cx(0)), cx(0)) > G.Rv + 2 * rmax + 2 * G.Rv) continue;
    let m = d.m, e = d.e;
    for (let k = 0; k < G.N; k++) { if (!nearBy.has(e)) nearBy.set(e, []); nearBy.get(e).push(m); m = M.mul(m, G.A); e = H.right[0][e]; }
  }
  P.circles = circles; P.nearBy = nearBy;
  // A region's type (for blacking out every piece like one): regions a symmetry of the tiling
  // carries onto each other are alike. The arrangement is the same seen from anywhere, so if a
  // symmetry carries a point of one into the other, it carries the whole region.
  const typeOf = P.regions.map((_, i) => i), root = (i) => (typeOf[i] === i ? i : (typeOf[i] = root(typeOf[i])));
  const maps = [...nearBy.values()].flat();
  P.regions.forEach((b, j) => {
    for (let i = 0; i < j; i++) {
      if (root(i) === root(j) || P.regions[i].stickers.length !== b.stickers.length) continue;
      if (maps.some((m) => faceHas(P.regions[i].face, M.apply(m, b.anchor)))) { typeOf[root(j)] = root(i); break; }
    }
  });
  const typeIds = new Map();
  P.regions.forEach((r, i) => { const t = root(i); if (!typeIds.has(t)) typeIds.set(t, typeIds.size); r.type = typeIds.get(t); });
  const blackout = new Set(P.spec.blackout || []);
  // Carried onto every tile of the surface (tile f's rep h_f · region), one piece per spot. Two of
  // them are the same piece when they're inside the same circles AND one's anchor, carried to the
  // other's frame, is inside the other: on a small surface two different regions can be inside the
  // same circles (a tile meeting the same neighbor along two edges).
  const byName = new Map();
  const same = (a, b) => {
    const u = H.mul(H.inv[a.home], b.home), ra = P.regions[a.region], rb = P.regions[b.region];
    return (nearBy.get(u) || []).some((m) => faceHas(ra.face, M.apply(m, rb.anchor)));
  };
  for (const h of H.coset.face.reps) P.regions.forEach((region, ri) => {
    const key = region.name.map(([kind, e, ring]) => `${kind}:${H.coset[kind].of[H.mul(h, e)]}:${ring}`).sort().join("|");
    const piece = { region: ri, home: h };
    if (!byName.has(key)) byName.set(key, []);
    if (byName.get(key).some((other) => same(other, piece))) return;
    byName.get(key).push(piece);
    const name = new Map(region.name.map(([kind, e, ring]) => [`${kind}:${H.coset[kind].of[H.mul(h, e)]}`, ring]));
    // its stickers: the surface tiles under it at home, as elements (for telling where they are now)
    const stickers = region.stickers.map((e) => H.mul(h, e));
    P.pieces.push({ region: ri, home: h, name, stickers, faces: stickers.map((x) => H.coset.face.of[x]), kind: new Set(stickers.map((x) => H.coset.face.of[x])).size, type: region.type, black: blackout.has(region.type) });
  });
  P.n = P.pieces.length;
}
// (how much of a region a tile covers: both mapped to the Klein model, where the tile's edges are
// straight and it's convex, then the region's polygons clipped to it)
const toKlein = ([x, y]) => { const s = 2 / (1 + x * x + y * y); return [x * s, y * s]; };
function overlap(f, tilePoly) {
  const tile = tilePoly.map(toKlein), cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const sgn = Math.sign(tile.reduce((s, p, i) => s + cross(p, tile[(i + 1) % tile.length]), 0));
  const clip = (poly) => {
    let out = poly.map(toKlein);
    tile.forEach((a, i) => {
      const b = tile[(i + 1) % tile.length], side = (p) => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
      const next = [];
      out.forEach((p, j) => {
        const q = out[(j + 1) % out.length], sp = side(p), sq = side(q);
        if (sp >= 0) next.push(p);
        if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
      });
      out = next;
    });
    return Math.abs(out.reduce((s, p, i) => s + cross(p, out[(i + 1) % out.length]), 0)) / 2;
  };
  return clip(f.poly()) - f.holePolys().reduce((s, h) => s + clip(h), 0);
}

// ---- state and moves: each piece's position, an element of H (0: home)
export const solvedHyperState = (P) => new Int32Array(P.n);
export const inverseHyperMove = (P, m) => ({ ...m, q: -m.q });
// the pieces in a ring (axis, layer): those whose name, moved where they are, includes it. Returns a
// Map from piece to the point (in its region's own coordinates) its turn goes about
export function hyperPiecesInLayer(P, s, axis, layer) {
  const ax = P.axes[axis], { H } = P, out = new Map();
  for (let i = 0; i < P.n; i++) {
    const pc = P.pieces[i], g = s[i];
    // (the axis, seen from the piece's home: g⁻¹ carries it there)
    const there = H.coset[ax.kind].of[H.mul(H.inv[g], ax.rep)];
    if (pc.name.get(`${ax.kind}:${there}`) !== layer) continue;
    const region = P.regions[pc.region], at = region.around.find((a) => a.kind === ax.kind && H.coset[ax.kind].of[H.mul(pc.home, a.e)] === there);
    out.set(i, at.p);
  }
  return out;
}
export function applyHyperMove(P, s, { axis, layer, q }) {
  const ax = P.axes[axis], k = ((q % ax.order) + ax.order) % ax.order;
  if (!k) return;
  for (const i of hyperPiecesInLayer(P, s, axis, layer).keys()) s[i] = P.H.mul(ax.pow[k], s[i]);
}
// solved: every sticker on its own tile
export const isHyperSolved = (P, s) => P.pieces.every((pc, i) => pc.black || pc.stickers.every((x, j) => P.H.coset.face.of[P.H.mul(s[i], x)] === pc.faces[j]));
export function hyperScrambleMoves(P, count = 12 + 3 * P.tiles, rand = Math.random) {
  const out = [];
  if (!P.axes.length) return out;
  for (let i = 0; i < count; i++) {
    const axis = Math.floor(rand() * P.axes.length), ax = P.axes[axis], k = 1 + Math.floor(rand() * Math.floor(ax.order / 2));
    out.push({ axis, layer: Math.floor(rand() * ax.radii.length), q: k === ax.order / 2 || rand() < 0.5 ? k : -k });
  }
  return out;
}
