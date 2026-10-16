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
import { regularDepths } from "./regular.mjs";
import { checkPieces } from "./budget.mjs";
import { enumerate, parseRelator, wordPerm } from "./todd-coxeter.mjs";
import { arrangement, faceInner, faceHas } from "./tiles.mjs";

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
// (buckets by column, then row: number keys, not strings, as this is in every search's inner loop)
class PointSet {
  constructor(tol) { this.tol = tol; this.cols = new Map(); }
  find(p) {
    const i = Math.floor(p[0] / this.tol), j = Math.floor(p[1] / this.tol);
    for (let dx = -1; dx <= 1; dx++) {
      const col = this.cols.get(i + dx);
      if (col) for (let dy = -1; dy <= 1; dy++)
        for (const [q, v] of col.get(j + dy) || []) if (Math.abs(q[0] - p[0]) < this.tol && Math.abs(q[1] - p[1]) < this.tol) return v ?? true;
    }
    return undefined;
  }
  has(p) { return this.find(p) !== undefined; }
  add(p, v = true) {
    const i = Math.floor(p[0] / this.tol), j = Math.floor(p[1] / this.tol);
    if (!this.cols.has(i)) this.cols.set(i, new Map());
    const col = this.cols.get(i);
    if (!col.has(j)) col.set(j, []);
    col.get(j).push([p, v]);
  }
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

// ---- a truncated tiling's own corners and edges' middles (cuts round them split pieces, as round a
// truncated solid's or the other tilings'; on no turning point, they don't turn)
// Its corners: the corners of tile 0's truncated faces (tileFaces) where three faces or more meet;
// its edges' middles: the middle of each side between two of those where the faces either side
// differ. Each is named on the surface as a tile, corner or edge is, by an element of the group:
// points alike (carried onto one another by the tiling's turns) are a pattern (a kind: "tvertex",
// "tvertex~1", ...; "tedge", ...), each point of it the pattern's first point carried by an element,
// and as none of them is a turning point, a different element for each (the "point" coset: every
// element its own). One that is a turning point too (a tiling's corner, with only its edges
// truncated) is that point: its circles turn with it (into). Per surface and truncation:
// { kinds, base (kind → "tvertex" or "tedge"), local: [{ kind, base, q (tile 0's frame), h (the
// element carrying the pattern's first point to q), into }] }.
const truncCache = new WeakMap();
export function truncatedKinds(G, H, truncate) {
  if (truncate.vertex === undefined && truncate.edge === undefined) return { kinds: [], base: {}, local: [] };
  if (!truncCache.has(H)) truncCache.set(H, new Map());
  const id = `${truncate.vertex}:${truncate.edge}`, cache = truncCache.get(H);
  if (cache.has(id)) return cache.get(id);
  const faces = tileFaces(G, truncate);
  // (the darts round tile 0, each tile's every turn, for which face a point is in and for patterns)
  const tiles = darts(G, H, { m: M.I, e: 0 }, (c) => hdist(c, cx(0)) < 2 * G.Rv + 0.2), all = [];
  for (const d of tiles) { let m = d.m, e = d.e; for (let j = 0; j < G.N; j++) { all.push({ m, e }); m = M.mul(m, G.A); e = H.right[0][e]; } }
  const inPoly = (poly, k) => { const sides = poly.map((a, j) => { const b = poly[(j + 1) % poly.length]; return (b[0] - a[0]) * (k[1] - a[1]) - (b[1] - a[1]) * (k[0] - a[0]); }); return sides.every((x) => x >= -1e-12) || sides.every((x) => x <= 1e-12); };
  const pointKey = (z) => `${Math.round(z[0] * 1e6)},${Math.round(z[1] * 1e6)}`;
  const faceAt = (z) => {
    for (const t of tiles) {
      const w = M.apply(M.inv(t.m), z);
      if (!inTile0(G, w)) continue;
      const k = toKlein(w), fc = faces.find((f) => inPoly(f.klein, k)) || faces[0];
      return fc.kind + "@" + pointKey(M.apply(t.m, fc.kind === "face" ? cx(0) : fc.kind === "vertex" ? G.corners[fc.i] : G.mids[fc.i]));
    }
    return "?";
  };
  const e = 1e-6, around = (z) => new Set(Array.from({ length: 16 }, (_, j) => { const a = (j * Math.PI) / 8 + 0.1; return faceAt([z[0] + e * Math.cos(a), z[1] + e * Math.sin(a)]); }));
  const corners = new PointSet(1e-8), cornerList = [];
  for (const fc of faces) for (const k of fc.klein) { const z = fromKlein(k); if (!corners.has(z) && around(z).size >= 3) { corners.add(z); cornerList.push(z); } }
  // (a side's middle, along the line from a to b: halfway, hyperbolically)
  const halfway = (a, b) => { const T = M.to(a), w = M.apply(M.inv(T), b), l = abs(w), t = Math.tanh(Math.atanh(l) / 2); return M.apply(T, [(w[0] / l) * t, (w[1] / l) * t]); };
  const mids = new PointSet(1e-8), midList = [];
  for (const fc of faces) fc.klein.forEach((k, j) => {
    const a = fromKlein(k), b = fromKlein(fc.klein[(j + 1) % fc.klein.length]);
    if (!corners.has(a) || !corners.has(b) || abs(sub(a, b)) < 1e-9) return;
    const m = halfway(a, b), n = [-(b[1] - a[1]), b[0] - a[0]], l = abs(n);
    if (faceAt([m[0] + (n[0] / l) * e, m[1] + (n[1] / l) * e]) === faceAt([m[0] - (n[0] / l) * e, m[1] - (n[1] / l) * e])) return;
    if (!mids.has(m)) { mids.add(m); midList.push(m); }
  });
  // (patterns: a point is another's pattern when some turn carries the pattern's first point onto it)
  const out = { kinds: [], base: {}, local: [] }, own = { vertex: G.corners, edge: G.mids, face: [cx(0)] };
  for (const [base, list] of [["tvertex", cornerList], ["tedge", midList]]) {
    const firsts = [];
    for (const q of list) {
      const into = Object.keys(own).find((k) => own[k].some((o) => abs(sub(o, q)) < 1e-7));
      if (into) { out.local.push({ kind: into, base, q, h: 0, into }); continue; }
      let found = null;
      for (const f of firsts) { const d = all.find((d) => abs(sub(M.apply(d.m, f.q), q)) < 1e-7); if (d) { found = { kind: f.kind, h: d.e }; break; } }
      if (!found) { const kind = firsts.length ? `${base}~${firsts.length}` : base; firsts.push({ kind, q }); out.kinds.push(kind); out.base[kind] = base; found = { kind, h: 0 }; }
      out.local.push({ kind: found.kind, base, q, h: found.h });
    }
  }
  cache.set(id, out);
  return out;
}
// every element its own (a point on no turning point: each element carries it somewhere else)
const pointCosets = new WeakMap();
const cosetOf = (H, kind) => {
  if (H.coset[kind]) return H.coset[kind];
  if (!pointCosets.has(H)) { const of = Int32Array.from({ length: H.n }, (_, i) => i); pointCosets.set(H, { of, reps: Array.from(of) }); }
  return pointCosets.get(H);
};
// a dart's points: axisPoints, and (P truncated, with circles round its own corners or edges) those
const pointsOf = (P, d) => {
  const out = axisPoints(P.G, P.H, d);
  if (P.tk) for (const l of P.tk.local) if (!l.into) out.push({ kind: l.kind, p: M.apply(d.m, l.q), e: P.H.mul(d.e, l.h) });
  return out;
};
// the first point of a kind, in tile 0's frame
const homeOf = (P, kind) => (kind === "face" ? cx(0) : kind === "vertex" ? P.G.corners[0] : kind === "edge" ? P.G.mids[P.G.edge] : P.tk.local.find((l) => l.kind === kind && l.h === 0).q);

// ---- presets and parameters
export const HYPER_PARAMS = [
  // (down to 2: few enough tiles round a corner, or sides, make a ball, see sphere.mjs; 2 sides is a
  // beach ball's wedge)
  { key: "N", label: "sides", min: 2, max: 12, title: "how many sides each tile has" },
  { key: "M", label: "at a corner", min: 2, max: 12, title: "how many tiles meet at each corner" },
  { key: "surface", label: "size", min: 0, title: "which closed surface the tiling wraps onto: a tiling has only a few, fewest tiles first" },
];
// (surface: an index into the tiling's two-sided surfaces, fewest tiles first. autoCut: the
// preset's circle is worked out for whatever tiling the steppers pick, see buildHyper)
const hyperPreset = (id, name, N, M_, cuts) => ({
  id, name, rule: "hyper", size: 2, fixed: true, N, M: M_, surface: 0, cuts, autoCut: true, truncate: {}, blackout: [], params: HYPER_PARAMS,
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
// the surfaces a tiling's file offers: two-sided ones of more than one tile (a one-tile surface
// has every circle around the same tile: not much of a puzzle), fewest tiles first
export const isPuzzleSurface = (s) => s.orientable && s.tiles > 1;
export const hyperSurfaces = (file) => file.surfaces.filter(isPuzzleSurface);
// a surface's name in the size menu: "24 tiles · genus 3", and which of a mirror pair
export function surfaceLabel(list, i) {
  const s = list[i], twins = list.filter((t) => t.tiles === s.tiles);
  const k = twins.indexOf(s), mirror = s.chiral ? (s.from.includes("mirror") ? " (mirrored)" : "") : "";
  return `${s.tiles} tiles · genus ${s.genus}${twins.length > 1 ? ` · ${String.fromCharCode(97 + k)}` : ""}${mirror}`;
}
export const isHyperbolic = (N, M_) => N >= 3 && M_ >= 3 && 1 / N + 1 / M_ < 1 / 2;
const radiiOf = (spec, kind) => [...new Set((spec.cuts || []).filter((c) => c.on === kind).flatMap((c) => c.depths).filter((r) => r > 0))].sort((a, b) => a - b);

// ---- building a puzzle: spec { N, M, surface, cuts, blackout }, file: regular-maps/N-M.json
const surfaceCache = new WeakMap();
// (limit: stop with TooManyPieces once there are more pieces than that; see budget.mjs)
export function buildHyper(spec, file, { limit } = {}) {
  const { N } = spec, M_ = spec.M, G = geometry(N, M_);
  const list = hyperSurfaces(file), surface = list[Math.max(0, Math.min(list.length - 1, spec.surface | 0))];
  // (the surface's group and circle limits don't change with the cuts: worked out once, for
  // rebuilding while a cut is dragged)
  const kept = surfaceCache.get(surface) || {};
  surfaceCache.set(surface, kept);
  const H = (kept.H ??= turnGroup(file, surface));
  const P = { kind: "hyper", spec, G, H, surface, N, M: M_, tiles: H.coset.face.reps.length };
  // (the limits are in the data, worked out ahead: see data/add-caps.mjs)
  P.cap = { ...(kept.cap ??= surface.caps || radiusCaps(P)) };
  // (truncated, with circles round its own corners or edges: those points' patterns too, each a kind
  // with its own limit; the ones on a turning point add their circles to that point's)
  // (each pattern's limit is kept with the patterns: the editor asks for it before there's a circle)
  const tCuts = ["tvertex", "tedge"].some((b) => radiiOf(spec, b).length), truncate = truncationOf(spec);
  const tk = truncate.vertex !== undefined || truncate.edge !== undefined ? truncatedKinds(G, H, truncate) : null;
  P.tk = tCuts ? tk : null;
  if (tk) { P.tk = tk; tk.caps ??= pointCaps(P); Object.assign(P.cap, tk.caps); for (const b of ["tvertex", "tedge"]) if (!(b in P.cap)) P.cap[b] = Math.min(5, ...tk.kinds.filter((k) => tk.base[k] === b).map((k) => tk.caps[k])); P.tk = tCuts ? tk : null; }
  P.kinds = [...KINDS, ...(P.tk ? P.tk.kinds : [])];
  const baseOf = (k) => (P.tk && P.tk.base[k]) || k;
  const into = (k) => (P.tk ? [...new Set(P.tk.local.filter((l) => l.into === k).map((l) => l.base))] : []);
  const wanted = (k) => [...new Set([...radiiOf(spec, baseOf(k)), ...(KINDS.includes(k) ? into(k).flatMap((b) => radiiOf(spec, b)) : [])])].sort((a, b) => a - b);

  // A preset's circle on another tiling: around each tile, a bit past its corners, as the presets
  // are (1.15 corner radii), or as big as fits on this surface and still works out
  if (spec.autoCut) {
    const r = Math.min(faceDefault(N, M_), P.cap.face - 0.005, hyperRadiusLimit(P, "face", 0, { face: [], vertex: [], edge: [] }));
    P.spec = spec = { ...spec, cuts: [{ on: "face", depths: [r] }] };
  }
  // Circles that don't fit shrink until they do (P.shrunk, and P.spec has the cuts as built): past
  // the surface's limit, to just under it; then, while the design costs too much, the biggest
  // comes down: to as big as it can be with the others if bringing it down to the next biggest
  // would do, otherwise a step (so the biggest few come down together, not one to nothing).
  // 3 decimals, as a ruler sets them.
  const down = (r) => Math.floor(r * 1000) / 1000;
  P.radii = Object.fromEntries(P.kinds.map((k) => [k, [...new Set(wanted(k).map((r) => (r < P.cap[k] ? r : down(P.cap[k] - 0.005))))].sort((a, b) => a - b)]));
  let shrunk = P.kinds.some((k) => wanted(k).some((r) => r >= P.cap[k]));
  const all = () => P.kinds.flatMap((k) => P.radii[k].map((r, j) => [k, j, r])).sort((a, b) => b[2] - a[2]);
  while (!fits(P, P.radii)) {
    const [[kind, i, r], second] = all(), next = second ? second[2] : 0.05;
    const trial = Object.fromEntries(P.kinds.map((k) => [k, [...P.radii[k]]]));
    trial[kind][i] = next;
    const to = Math.min(down(r - 0.001), fits(P, trial) ? down(hyperRadiusLimit(P, kind, i)) : down(next < r - 1e-9 ? Math.max(next, r - 0.05) : r - 0.05));
    if (to < 0.05) P.radii[kind].splice(i, 1); else P.radii[kind][i] = to;
    P.radii[kind] = [...new Set(P.radii[kind])].sort((a, b) => a - b);
    shrunk = true;
  }
  // (as the design has them: a pattern's circles under their own set's name, the first pattern's)
  if (shrunk) { P.shrunk = true; P.spec = spec = { ...spec, cuts: [...KINDS, "tvertex", "tedge"].map((on) => ({ on, depths: [...(P.radii[on] || radiiOf(spec, on))] })) }; }
  // (a radius within 1e-5 of a snap mark is that mark exactly: a hair off leaves slivers too
  // thin to work out reliably, the lesson of the flat tiles' color popping)
  for (const kind of P.kinds) P.radii[kind].forEach((r, i) => {
    const m = hyperSnapCandidates(P, kind, i, r + 1e-4, r - 1e-4).find((m) => Math.abs(m - r) < 1e-5);
    if (m !== undefined) P.radii[kind][i] = m;
  });
  // (the design's own sets read the built radii: a truncated tiling's corners' as the first pattern's)
  for (const b of ["tvertex", "tedge"]) if (!P.radii[b]) P.radii[b] = [];
  const radii = P.radii;
  // the axes: every tile, corner or edge of the surface with circles around it
  const order = { face: N, vertex: M_, edge: 2 }, step = { face: H.R, vertex: H.S, edge: H.RS };
  P.axes = KINDS.flatMap((kind) => radii[kind].length ? H.coset[kind].reps.map((h, coset) => {
    const rho = H.mul(H.mul(h, step[kind]), H.inv[h]), pow = [0];
    for (let q = 1; q < order[kind]; q++) pow.push(H.mul(rho, pow[q - 1]));
    return { kind, coset, rep: h, order: order[kind], radii: radii[kind], pow };
  }) : []);
  P.axisIndex = new Map(P.axes.map((a, i) => [`${a.kind}:${a.coset}`, i]));
  findPieces(P, limit);
  findStickers(P);
  return P;
}

// ---- truncation, as on the flat tilings (and the balls, sphere.mjs): a tile's corners (or edges)
// cut off by a straight line square to the way from its middle to the corner (the edge's middle), a
// fraction f of the way there, making a face round each corner (edge) with its own color.
// spec.truncate.vertex, .edge: f, in (0, 1). In the Klein model of the hyperbolic plane its straight
// lines are straight, so tile 0 is a regular polygon, and a line square to a line through the middle
// is square to it there too: each kind's faces are the polygon cut by half-planes, as tiles.mjs's
// tileParts (a point at distance d from the middle is tanh d from it in the Klein disk). The cuts
// don't make pieces: they're where the stickers' colors change, so a fragment (a piece's part on a
// tile) is drawn in its tile's color with the corners' and edges' faces over it (hyper-view.mjs).
export const toKlein = ([x, y]) => { const s = 2 / (1 + x * x + y * y); return [x * s, y * s]; };
export const fromKlein = ([x, y]) => { const s = 1 / (1 + Math.sqrt(Math.max(0, 1 - x * x - y * y))); return [x * s, y * s]; };
// a convex polygon cut to n·x ≤ k
function clipBelow(poly, n, k) {
  const out = [], val = (p) => n[0] * p[0] + n[1] * p[1] - k;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], va = val(a), vb = val(b);
    if (va <= 0) out.push(a);
    if ((va < 0 && vb > 0) || (va > 0 && vb < 0)) { const t = va / (va - vb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  });
  return out;
}
const polyArea = (poly) => Math.abs(poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]; return s + a[0] * b[1] - a[1] * b[0]; }, 0)) / 2;
// The truncations that make some face regular (as on the solids and the other tilings): tile 0's
// own face, and the faces round its corner 0 and edge 0's middle (tile 0's part, turned round the
// point into each tile there), their sides measured hyperbolically.
export function hyperRegularTrims(spec, kind, [lo, hi]) {
  const G = geometry(spec.N, spec.M);
  const round = (o, pts) => { const back = M.inv(M.to(o)); return pts.filter((p) => abs(sub(p, o)) > 1e-9).sort((p, q) => { const a = M.apply(back, p), b = M.apply(back, q); return Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]); }); };
  const build = (f) => {
    const truncate = truncationOf({ truncate: { ...(spec.truncate || {}), [kind]: f } }), out = new Map(), faces = tileFaces(G, truncate);
    for (const fc of faces) {
      if (fc.kind === "face") { out.set("face", fc.klein.map(fromKlein)); continue; }
      if (fc.i !== 0) continue;
      const o = fc.kind === "vertex" ? G.corners[0] : G.mids[0], turns = fc.kind === "vertex" ? G.M : 2, pts = [];
      for (let j = 0; j < turns; j++) { const T = M.about(o, (2 * Math.PI * j) / turns); for (const p of fc.klein.map(fromKlein)) { const q = M.apply(T, p); if (!pts.some((r) => abs(sub(r, q)) < 1e-9)) pts.push(q); } }
      if (pts.length >= 3) out.set(fc.kind, round(o, pts));
    }
    return out;
  };
  return regularDepths(build, lo, hi, 120, hdist);
}
export const truncationOf = (spec) => Object.fromEntries(["vertex", "edge"].flatMap((k) => { const f = spec.truncate && spec.truncate[k]; return Number.isFinite(f) && f > 0 && f < 1 ? [[k, f]] : []; }));
// Tile 0's faces: [{ kind ("face" for the tile's own, "vertex", "edge"), i (which corner, or edge's
// middle, of G.corners or G.mids), klein (the convex polygon), disk (the same in the Poincaré disk,
// finely: its sides are arcs there) }], the tile's own first
export function tileFaces(G, truncate) {
  const unit = (p) => { const l = Math.hypot(p[0], p[1]); return [p[0] / l, p[1] / l]; };
  const tile = G.corners.map(toKlein), cs = G.corners.map(unit), ms = G.mids.map(unit);
  const tv = truncate.vertex !== undefined ? Math.tanh(truncate.vertex * G.Rv) : null, te = truncate.edge !== undefined ? Math.tanh(truncate.edge * G.Ri) : null;
  const neg = ([x, y]) => [-x, -y], minus = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const out = [];
  // (each kind's face round point i: past its cut, and further toward it than toward any other)
  const round = (kind, dirs, t, also) => dirs.forEach((u, i) => {
    let poly = clipBelow(tile, neg(u), -t);
    dirs.forEach((w, j) => { if (j !== i) poly = clipBelow(poly, minus(w, u), 0); });
    for (const [n, k] of also) poly = clipBelow(poly, n, k);
    if (poly.length >= 3 && polyArea(poly) > 1e-12) out.push({ kind, i, klein: poly });
  });
  let core = tile;
  if (tv !== null) { round("vertex", cs, tv, []); cs.forEach((u) => { core = clipBelow(core, u, tv); }); }
  if (te !== null) { round("edge", ms, te, tv !== null ? cs.map((u) => [u, tv]) : []); ms.forEach((u) => { core = clipBelow(core, u, te); }); }
  if (core.length >= 3) out.unshift({ kind: "face", i: 0, klein: core });
  // (each side, finely, in the disk: { pts, ends: [a, middle, b] })
  const side = (a, b) => { const pts = Array.from({ length: 25 }, (_, s) => fromKlein([a[0] + ((b[0] - a[0]) * s) / 24, a[1] + ((b[1] - a[1]) * s) / 24])); return { pts, ends: [pts[0], pts[12], pts[24]] }; };
  // (a side along one of the tile's edges isn't a line of its own: there the tile's edge is drawn,
  // where it's drawn at all)
  const onEdge = (a, b) => tile.some((p, k) => { const q = tile[(k + 1) % tile.length], cr = (r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return Math.abs(cr(a)) < 1e-9 && Math.abs(cr(b)) < 1e-9; });
  for (const fc of out) {
    fc.disk = fc.klein.flatMap((a, j) => side(a, fc.klein[(j + 1) % fc.klein.length]).pts.slice(0, 24));
    fc.lines = fc.klein.flatMap((a, j) => { const b = fc.klein[(j + 1) % fc.klein.length]; return onEdge(a, b) ? [] : [side(a, b)]; });
  }
  // The stretch of each of the tile's edges that's drawn: where it borders the tiles' own faces, not
  // inside a corner's or edge's face (which spans both tiles: no line in it, as on the flat tilings).
  // The tile's own face is convex, so it's one stretch: { pts, ends } as a side's, or null.
  out.edges = tile.map((a, k) => {
    const b = tile[(k + 1) % tile.length];
    let s0 = 0, s1 = 1;
    // (k(s) = a + s(b − a) with k·u ≤ t, for each cut)
    const keep = (u, t) => { const ka = a[0] * u[0] + a[1] * u[1], kb = b[0] * u[0] + b[1] * u[1], d = kb - ka; if (Math.abs(d) < 1e-15) { if (ka > t + 1e-12) s1 = -1; return; } const s = (t - ka) / d; if (d > 0) s1 = Math.min(s1, s); else s0 = Math.max(s0, s); };
    if (tv !== null) cs.forEach((u) => keep(u, tv));
    if (te !== null) ms.forEach((u) => keep(u, te));
    if (s1 - s0 < 1e-9) return null;
    const at = (s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
    return side(at(s0), at(s1));
  });
  // (whether a point of the disk, in tile 0's frame, is in the tile's own face: a hair's slack, for
  // points along the cuts)
  out.inCore = (z) => { const k = toKlein(z), dot2 = (u) => k[0] * u[0] + k[1] * u[1]; return (tv === null || cs.every((u) => dot2(u) <= tv + 1e-9)) && (te === null || ms.every((u) => dot2(u) <= te + 1e-9)); };
  return out;
}
// Each fragment's faces (the tile's own and the corners' and edges' it overlaps: P.regions[f].faces,
// indices into P.tileFaces), and each piece's checks for being solved: for each face of each of its
// fragments, the element whose tile (corner, edge) that face is, at home, and which tile (corner,
// edge) that is ({ e, kind, home }: solved when the piece's position g has g·e's the same).
function findStickers(P) {
  const { G, H } = P, N = G.N;
  P.truncate = truncationOf(P.spec);
  P.tileFaces = tileFaces(G, P.truncate);
  const overlap = (poly, convex) => { let p = poly.map(toKlein); for (let j = 0; j < convex.length; j++) { const a = convex[j], b = convex[(j + 1) % convex.length]; p = clipBelow(p, [b[1] - a[1], a[0] - b[0]], (b[1] - a[1]) * a[0] + (a[0] - b[0]) * a[1]); if (p.length < 3) return 0; } return polyArea(p); };
  // (the Klein polygons run counterclockwise: inside is to the left of each side, n·x ≤ k with n the
  // side's outward normal)
  const ccw = (poly) => poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]; return s + a[0] * b[1] - a[1] * b[0]; }, 0) > 0;
  for (const fc of P.tileFaces) if (!ccw(fc.klein)) fc.klein.reverse();
  for (const r of P.regions) {
    if (P.tileFaces.length === 1) { r.faces = [0]; continue; }
    const area = (fc) => overlap(r.poly[0], fc.klein) - r.poly.slice(1).reduce((s, h) => s + overlap(h, fc.klein), 0);
    r.faces = P.tileFaces.map((fc, k) => (area(fc) > 1e-10 ? k : -1)).filter((k) => k >= 0);
  }
  // (the element whose corner, or edge, is tile 0's corner i, or edge's middle i, seen from x)
  const turned = (x, j) => { let e = x; for (let s = 0; s < ((j % N) + N) % N; s++) e = H.right[0][e]; return e; };
  P.faceElement = (x, fc) => (fc.kind === "face" ? x : turned(x, fc.kind === "vertex" ? fc.i : fc.i - G.edge));
  for (const pc of P.pieces) pc.checks = pc.frags.flatMap(({ x, f }) => P.regions[f].faces.map((k) => {
    const fc = P.tileFaces[k], e = P.faceElement(x, fc);
    return { e, kind: fc.kind, home: H.coset[fc.kind].of[e] };
  }));
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
// the radii a kind's circle number i can snap to, up to upTo (P: built as far as its caps and
// radii). The hyperbolic plane's tiles multiply outward fast, so it looks only as far as a mark
// under upTo can come from: a point within upTo, a same-kind circle within 2·upTo (touching it),
// its nearest ring of those (within 1.5 times the nearest, which is under 2 corner radii away),
// and a circle that reaches within upTo. from: marks from there up only (the build looks for one
// within a hair of a radius: only circles reaching that band matter then).
export function hyperSnapCandidates(P, kind, i, upTo = P.cap[kind], from = 0) {
  const { G, H } = P, cap = Math.min(P.cap[kind], upTo), own = P.radii[kind].filter((_, j) => j !== i);
  const rmax = Math.max(0, ...Object.keys(P.radii).flatMap((k) => P.radii[k]));
  const p0 = homeOf(P, kind), P0 = toHyp(p0);
  // (marks from same-kind circles, touching one or meeting among its ring, are at least half the
  // way to the nearest one: a tile's neighbor's middle, along an edge, or two edges round a corner)
  const nearest = kind === "face" ? 2 * G.Ri : kind === "vertex" ? hdist(G.corners[0], G.corners[1]) : kind === "edge" ? hdist(G.mids[0], G.mids[1]) : 2 * (P.cap[kind] + 0.02);
  // (and no further than the circles budget looks: past that the tiles run to millions, and a
  // circle that big gets the marks from what's nearer)
  const reach = Math.min(distancesFor(P).exact, Math.max(cap + rmax, cap < nearest / 2 ? 0 : Math.max(2 * cap, 1.5 * nearest)));
  // every axis point near it, once
  const near = darts(G, H, { m: M.I, e: 0 }, (c) => hdist(c, p0) < reach + G.Rv), seen = new PointSet(1e-9), pts = [];
  for (const d of near) for (const a of pointsOf(P, d)) {
    if (seen.has(a.p) || hdist(a.p, p0) > reach) continue;
    seen.add(a.p); pts.push({ kind: a.kind, p: a.p, X: toHyp(a.p), d: hdist(a.p, p0) });
  }
  const copies = pts.filter((a) => a.kind === kind && a.d > 1e-9 && a.d < 2 * cap);
  // the other circles (every radius but this one), near enough to matter: reaching the band of
  // radii from `from` to the cap
  const fixed = pts.flatMap((a) => (P.radii[a.kind] || []).flatMap((r, j) => (a.kind === kind && j === i ? [] : a.d - r < cap && a.d + r > from ? [{ ...a, r }] : [])));
  // (marks kept once: within 1e-9 is the same, found by its bucket and the ones beside it)
  const out = [], seenD = new Set(), bucket = (d) => Math.round(d * 1e9);
  const add = (d) => {
    if (!(d > Math.max(0.05, from) + 1e-6 && d < cap - 1e-6) || own.some((r) => Math.abs(r - d) < 1e-6)) return;
    const b = bucket(d);
    if (seenD.has(b) || seenD.has(b - 1) || seenD.has(b + 1)) return;
    seenD.add(b); out.push(d);
  };
  for (const a of pts) add(a.d); // (through a point)
  for (const q of copies) add(q.d / 2); // (touching a copy)
  for (const f of fixed) if (f.d > 1e-9) { add(f.d - f.r); add(f.d + f.r); add(f.r - f.d); } // (touching another circle)
  // (through where two other circles cross: as the disk draws them, ordinary circles. For the
  // nearest few hundred: past that the pairs run to millions, far out where nobody needs a mark)
  const discs = fixed.slice().sort((a, b) => a.d - b.d).slice(0, 400).map((f) => diskCircle(f.p, f.r));
  for (let a = 0; a < discs.length; a++) for (let b = a + 1; b < discs.length; b++) {
    const c1 = discs[a], c2 = discs[b], dx = c2.c[0] - c1.c[0], dy = c2.c[1] - c1.c[1], dd = Math.hypot(dx, dy);
    if (dd < 1e-12 || dd > c1.r + c2.r || dd < Math.abs(c1.r - c2.r)) continue;
    const along = (c1.r * c1.r - c2.r * c2.r + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, c1.r * c1.r - along * along));
    for (const s of [-1, 1]) add(hdist(p0, [c1.c[0] + (along * dx - s * h * dy) / dd, c1.c[1] + (along * dy + s * h * dx) / dd]));
  }
  // The events among its copies, for its nearest ring of them (the hyperbolic plane's copies
  // multiply outward fast, and far ones' crowd the ruler with marks nobody wants):
  const closest = copies.reduce((m, q) => Math.min(m, q.d), Infinity), ring = copies.filter((q) => q.d < 1.5 * closest);
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
// a surface's circle limits, from scratch (for storing with it in the data)
export function surfaceCaps(file, surface) {
  const G = geometry(file.N, file.M);
  return radiusCaps({ G, H: turnGroup(file, surface) });
}
// The tiles are visited nearest first, stopping once every kind has a copy nearer than the next
// tile's middle less a corner radius (a nearer copy would be on a nearer tile). It depends only
// on the surface, so it's kept with it.
function radiusCaps(P) {
  const { G, H } = P, at0 = axisPoints(G, H, { m: M.I, e: 0 }), best = { face: Infinity, vertex: Infinity, edge: Infinity };
  const homes = { face: at0[0], vertex: at0[1], edge: at0[2] }, c0 = Object.fromEntries(KINDS.map((k) => [k, H.coset[k].of[homes[k].e]]));
  const heap = new MinHeap(), seen = new PointSet(1e-9);
  // (a tile is queued once: its distance is the same whichever neighbor reaches it)
  heap.push(0, { m: M.I, e: 0 }); seen.add(cx(0));
  while (heap.size) {
    const [dist, d] = heap.pop();
    if (dist > 12 || KINDS.every((k) => best[k] + G.Rv < dist)) break;
    for (const a of axisPoints(G, H, d)) {
      if (H.coset[a.kind].of[a.e] !== c0[a.kind]) continue;
      const r = hdist(a.p, homes[a.kind].p);
      if (r > 1e-6 && r < best[a.kind]) best[a.kind] = r;
    }
    let m = d.m, e = d.e;
    for (let k = 0; k < G.N; k++) {
      for (const next of [{ m: M.norm(M.mul(m, G.B)), e: H.right[1][e] }, { m: M.norm(M.mul(m, G.Bi)), e: H.rightInv[1][e] }]) {
        const p = M.apply(next.m, cx(0));
        if (abs(p) < 1 && !seen.has(p)) { seen.add(p); heap.push(hdist(p, cx(0)), next); }
      }
      m = M.mul(m, G.A); e = H.right[0][e];
    }
  }
  return Object.fromEntries(KINDS.map((k) => [k, best[k] / 2 - 0.02]));
}
// The same for a truncated tiling's own corners' and edges' patterns: less than halfway to the nearest
// other copy of a point (the same element carrying the pattern's first point there)
function pointCaps(P) {
  const { G, H } = P, kinds = P.tk.kinds, best = Object.fromEntries(kinds.map((k) => [k, Infinity])), home = Object.fromEntries(kinds.map((k) => [k, homeOf(P, k)]));
  const heap = new MinHeap(), seen = new PointSet(1e-9);
  heap.push(0, { m: M.I, e: 0 }); seen.add(cx(0));
  while (heap.size) {
    const [dist, d] = heap.pop();
    if (dist > 12 || kinds.every((k) => best[k] + G.Rv < dist)) break;
    for (const a of pointsOf(P, d)) {
      if (!(a.kind in best) || a.e !== 0) continue;
      const r = hdist(a.p, home[a.kind]);
      if (r > 1e-6 && r < best[a.kind]) best[a.kind] = r;
    }
    let m = d.m, e = d.e;
    for (let k = 0; k < G.N; k++) {
      for (const next of [{ m: M.norm(M.mul(m, G.B)), e: H.right[1][e] }, { m: M.norm(M.mul(m, G.Bi)), e: H.rightInv[1][e] }]) {
        const p = M.apply(next.m, cx(0));
        if (abs(p) < 1 && !seen.has(p)) { seen.add(p); heap.push(hdist(p, cx(0)), next); }
      }
      m = M.mul(m, G.A); e = H.right[0][e];
    }
  }
  return Object.fromEntries(kinds.map((k) => [k, Math.min(5, best[k] / 2 - 0.02)]));
}
// (a binary heap of [key, value], smallest key first)
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    for (let i = a.length - 1; i > 0;) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < a.length && a[l][0] < a[s][0]) s = l;
        if (r < a.length && a[r][0] < a[s][0]) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]]; i = s;
      }
    }
    return top;
  }
}

// ---- what a design costs. The pieces are worked out a tile at a time (findPieces), from the
// circles that reach into tile 0 (a circle of radius r whose middle is within Rv + r of tile 0's)
// cutting it into fragments; then every tile of the surface has those fragments. So the cost is
// the circles (their arrangement: at most MAX_CIRCLES) and the fragments over the whole surface
// (each one a little bookkeeping and memory: at most MAX_FRAGMENTS, tiles × fragments of a tile).
// Both are counted without working anything out: the circles from the distances of tile, corner
// and edge middles from tile 0's, the fragments by Euler's count (see fragmentCount).
const MAX_CIRCLES = 200, MAX_FRAGMENTS = 40000;
const fits = (P, radii) => { const n = hyperCircleCount(P, radii); return n <= MAX_CIRCLES && (n === 0 || P.tiles * fragmentCount(P, radii) <= MAX_FRAGMENTS); };
// The tile, corner and edge middles of the plane nearest tile 0's, by kind, nearest first: { exact
// (complete to this distance), dists[kind], points[kind] }. The same on every surface of a tiling
// (it's the plane the surface unrolls onto), kept per tiling as far as more than MAX_CIRCLES of each.
const distanceCache = new WeakMap();
function axisDistances(G, H) {
  if (distanceCache.has(G)) return distanceCache.get(G);
  const out = pointDistances(G, H, KINDS, (d) => axisPoints(G, H, d));
  distanceCache.set(G, out);
  return out;
}
// (and with a truncated tiling's own corners and edges: kept with their patterns)
const distancesFor = (P) => (P.tk ? (P.tk.dist ??= pointDistances(P.G, P.H, P.kinds, (d) => pointsOf(P, d))) : axisDistances(P.G, P.H));
function pointDistances(G, H, kinds, pointsAt) {
  // (tiles nearest first: once the next tile's middle is D away, every point within D − Rv has
  // been seen, so the lists are complete that far)
  const found = Object.fromEntries(kinds.map((k) => [k, []])), points = new PointSet(1e-9), tiles = new PointSet(1e-9), heap = new MinHeap();
  const within = (k, r) => found[k].reduce((n, a) => n + (a.d <= r), 0);
  heap.push(0, { m: M.I, e: 0 }); tiles.add(cx(0));
  let exact = 0;
  while (heap.size) {
    const [dist, d] = heap.pop();
    exact = dist - G.Rv;
    if (dist > 14 || (dist > G.Rv && kinds.every((k) => found[k].length > MAX_CIRCLES && within(k, exact) > MAX_CIRCLES))) break;
    for (const a of pointsAt(d)) if (!points.has(a.p)) { points.add(a.p); found[a.kind].push({ d: hdist(a.p, cx(0)), p: a.p }); }
    let m = d.m, e = d.e;
    for (let k = 0; k < G.N; k++) {
      for (const next of [{ m: M.norm(M.mul(m, G.B)), e: H.right[1][e] }, { m: M.norm(M.mul(m, G.Bi)), e: H.rightInv[1][e] }]) {
        const p = M.apply(next.m, cx(0));
        if (abs(p) < 1 && !tiles.has(p)) { tiles.add(p); heap.push(hdist(p, cx(0)), next); }
      }
      m = M.mul(m, G.A); e = H.right[0][e];
    }
  }
  const out = { exact, dists: {}, points: {} };
  for (const k of kinds) { const l = found[k].filter((a) => a.d <= exact).sort((a, b) => a.d - b.d); out.dists[k] = l.map((a) => a.d); out.points[k] = l.map((a) => a.p); }
  return out;
}
const within = (list, reach) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m] <= reach) lo = m + 1; else hi = m; } return lo; };
// the circles a design with these radii ({ face, vertex, edge: [radius] }) needs (Infinity: more
// than ever fits, as far as anyone needs to know)
export function hyperCircleCount(P, radii) {
  const { exact, dists } = distancesFor(P);
  let n = 0;
  for (const k of Object.keys(radii)) for (const r of radii[k]) {
    if (!dists[k]) continue;
    const reach = reachesTile0(P.G, r);
    if (reach > exact) return Infinity;
    n += within(dists[k], reach);
  }
  return n;
}
// (a circle of radius r can reach into tile 0 when its middle is this close to tile 0's)
const reachesTile0 = (G, r) => G.Rv + r + 1e-9;
// Tile 0's edges, as circles: through its two corners, square to the rim (|c|² = r² + 1); and
// whether a point is inside tile 0 (outside every edge's circle, as its middle is)
const edgeCache = new WeakMap();
export function tileEdges(G) {
  if (!edgeCache.has(G)) edgeCache.set(G, G.corners.map((p, k) => {
    const q = G.corners[(k + 1) % G.N], w = [p[0] + q[0], p[1] + q[1]], l = abs(w), u = [w[0] / l, w[1] / l];
    const s = (p[0] * p[0] + p[1] * p[1] + 1) / (2 * (u[0] * p[0] + u[1] * p[1]));
    return { c: [s * u[0], s * u[1]], r: Math.sqrt(s * s - 1), edge: k };
  }));
  return edgeCache.get(G);
}
const inTile0 = (G, z, slack = 0) => tileEdges(G).every((e) => Math.hypot(z[0] - e.c[0], z[1] - e.c[1]) > e.r - slack);
// where two circles ({ c, r }) cross: 0 or 2 points
function crossings(a, b) {
  const dx = b.c[0] - a.c[0], dy = b.c[1] - a.c[1], dd = Math.hypot(dx, dy);
  if (dd < 1e-12 || dd >= a.r + b.r || dd <= Math.abs(a.r - b.r)) return [];
  const along = (a.r * a.r - b.r * b.r + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, a.r * a.r - along * along));
  return [-1, 1].map((s) => [a.c[0] + (along * dx - s * h * dy) / dd, a.c[1] + (along * dy + s * h * dx) / dd]);
}
// How many fragments circles of these radii cut tile 0 into, by Euler's count for curves in a
// region: one, plus one for each stretch of a circle across it from edge to edge (half the points
// where it crosses the edges), or for a circle wholly inside, plus one for each point inside where
// two circles cross. (Exact but where three lines meet at a point; a budget needs no more.)
export function fragmentCount(P, radii) {
  const { G } = P, { dists, points } = distancesFor(P), edges = tileEdges(G), circles = [];
  for (const k of Object.keys(radii)) if (dists[k]) for (const r of radii[k]) for (let j = 0, n = within(dists[k], reachesTile0(G, r)); j < n; j++) circles.push(diskCircle(points[k][j], r));
  let count = 1;
  for (const c of circles) {
    const across = edges.reduce((s, e) => s + crossings(c, e).filter((z) => inTile0(G, z, 1e-12)).length, 0);
    count += across ? across / 2 : inTile0(G, [c.c[0] + c.r, c.c[1]]) ? 1 : 0;
  }
  for (let a = 0; a < circles.length; a++) for (let b = a + 1; b < circles.length; b++) count += crossings(circles[a], circles[b]).filter((z) => inTile0(G, z)).length;
  return count;
}
// How many pieces there'd be with circle i of a kind at radius r and the rest as they are (-1:
// that doesn't fit), worked out as the build does, without blacking out or snapping.
// (a truncated tiling's corners' patterns are one set of circles: changed together)
const tied = (P, kind) => (P.tk ? P.kinds.filter((k) => (P.tk.base[k] || k) === (P.tk.base[kind] || kind)) : [kind]);
export function hyperPieceCountAt(P, kind, i, r) {
  const radii = Object.fromEntries(Object.keys(P.radii).map((k) => [k, [...P.radii[k]]]));
  for (const k of tied(P, kind)) { radii[k][i] = r; radii[k] = [...new Set(radii[k])].sort((a, b) => a - b); }
  if (r >= P.cap[kind] || !fits(P, radii)) return -1;
  const Q = { G: P.G, H: P.H, tiles: P.tiles, cap: P.cap, spec: { ...P.spec, blackout: [] }, radii, tk: P.tk, kinds: P.kinds };
  findPieces(Q);
  return Q.n;
}
// The radii from lo to hi where circle i's pieces count changes, as marks for its ruler. Counts at
// evenly spaced radii first (so a change that undoes itself between two of them is still seen
// once they're close enough), then each stretch whose ends differ halved, keeping both halves
// that differ, till it's a hair wide. Most changes are at one of the marks worked out from the
// geometry (marks: hyperSnapCandidates's): once a stretch is narrow with one of those in it, and
// the count just either side of it is the stretch's ends', that's the change, at the mark's exact
// radius. A generator, a count per step, for the page to run a little at a time: yields { at }
// for each change found (a change can be found twice), and {} after the other counts.
export function* hyperCountBreaks(P, kind, i, lo, hi, marks = [], samples = 48, hair = 1e-9) {
  const count = (r) => hyperPieceCountAt(P, kind, i, r), xs = [], cs = [];
  for (let k = 0; k <= samples; k++) { xs.push(lo + ((hi - lo) * k) / samples); cs.push(count(xs[k])); yield {}; }
  for (let k = 0; k < samples; k++) {
    if (cs[k] === cs[k + 1]) continue;
    const stack = [[xs[k], cs[k], xs[k + 1], cs[k + 1]]];
    while (stack.length) {
      const [a, ca, b, cb] = stack.pop();
      // (an end where the design doesn't fit, −1: the edge of what fits isn't a mark, but a real
      // change can be between it and the other end, as just under the ruler's top)
      if (b - a < 1e-3 && ca >= 0 && cb >= 0) {
        const inside = marks.filter((m) => m > a && m < b);
        if (inside.length === 1) {
          // (either side by as much as a radius snaps onto a mark: right at one, crossings closer
          // than the arrangement tells apart are one point, so the count changes a hair past it)
          const m = inside[0], below = count(m - 1e-5), above = count(m + 1e-5);
          yield {};
          if (below === ca && above === cb) { yield { at: m }; continue; }
        }
      }
      if (b - a < hair) { if (ca >= 0 && cb >= 0) yield { at: (a + b) / 2 }; continue; }
      const m = (a + b) / 2, cm = count(m);
      yield {};
      if (cm !== cb) stack.push([m, cm, b, cb]);
      if (cm !== ca) stack.push([a, ca, m, cm]);
    }
  }
}
// the biggest radius circle i of a kind (i past the end: a new one) can have and still be worked
// out, given the others: under the surface's limit and the budget
export function hyperRadiusLimit(P, kind, i, radii = P.radii) {
  const at = (r) => { const rs = Object.fromEntries(Object.keys(radii).map((k) => [k, [...radii[k]]])); for (const k of tied(P, kind)) if (rs[k]) rs[k][i] = r; return fits(P, rs); };
  let lo = 0.05, hi = P.cap[kind];
  if (at(hi)) return hi;
  if (!at(lo)) return lo;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (at(m)) lo = m; else hi = m; }
  return lo;
}

// The pieces, a tile at a time. Tile 0 is cut by the circles that reach into it and by its own
// edges (each a circle meeting the rim square on): the cells inside it are its fragments
// (P.regions), each named by the circles it's inside, in tile 0's frame. Every tile of the
// surface is a copy of tile 0 cut the same way, so a fragment anywhere is (a dart x of its tile,
// a fragment f of tile 0 seen from x). A piece is the fragments that join across tiles' edges
// inside the same circles, so one cell of the plane's arrangement however many tiles it spans:
// found by stepping over each fragment's edges into the neighbor's fragment there, once for tile
// 0, and the same steps from every tile. A piece is { frags: [{ x, f }] (at home), name, stickers
// (each fragment's x: its tile), faces, kind, type, black }; it moves by g as g·x for each.
// Fragments inside no circle never move: the tile's color shows there.
function findPieces(P, limit) {
  const { G, H, radii } = P, N = G.N;
  P.regions = []; P.pieces = []; P.n = 0; P.circles = [];
  if (!Object.keys(radii).some((k) => radii[k].length)) return;
  if (!fits(P, radii)) { P.tooBig = true; return; } // (buildHyper shrinks circles so this doesn't happen)
  const edges = tileEdges(G), inTile = (z) => inTile0(G, z);
  // the circles reaching into tile 0
  const rmax = Math.max(...Object.keys(radii).flatMap((k) => radii[k]));
  const near = darts(G, H, { m: M.I, e: 0 }, (c) => hdist(c, cx(0)) < 2 * G.Rv + rmax + 0.05);
  const points = new PointSet(1e-9), axes = [], circles = [];
  for (const d of near) for (const a of pointsOf(P, d)) {
    if (!(radii[a.kind] || []).length || points.has(a.p)) continue;
    points.add(a.p);
    const dist = hdist(a.p, cx(0)), reach = radii[a.kind].map((r, ring) => [r, ring]).filter(([r]) => dist <= reachesTile0(G, r));
    if (!reach.length) continue;
    axes.push({ ...a, coset: cosetOf(H, a.kind).of[a.e] });
    for (const [r, ring] of reach) circles.push({ ...diskCircle(a.p, r), axis: axes.length - 1, ring, p: a.p, radius: r });
  }
  P.circles = circles; P.edges = edges;
  const all = [...circles, ...edges];
  // which circles a point's inside (the cells of tile 0 inside the same ones are usually one)
  const sig = (z) => circles.reduce((s, c, i) => (Math.hypot(z[0] - c.c[0], z[1] - c.c[1]) < c.r ? s + i + "," : s), "");
  for (const f of arrangement(all)) {
    const inner = faceInner(f, all);
    if (!inTile(inner)) continue;
    // its name: for each axis whose circles it's inside, the smallest (its ring)
    const name = new Map();
    for (const c of circles) if (abs(sub(inner, c.c)) < c.r) { const a = axes[c.axis], k = `${a.kind}:${a.coset}`; if (!name.has(k) || name.get(k).ring > c.ring) name.set(k, { ring: c.ring, axis: c.axis }); }
    // the anchor: of points spread over it, the one farthest (hyperbolically) from every line.
    // (Only lines within the box's diagonal of it can be a point's nearest: its own edges are.
    // The hyperbolic weight is the same for every line at a point, so it doesn't change which.)
    const [x0, y0, x1, y1] = f.box, mid = [(x0 + x1) / 2, (y0 + y1) / 2], h = Math.hypot(x1 - x0, y1 - y0) / 2;
    const close = all.filter((c) => { const dc = abs(sub(mid, c.c)); return Math.max(0, dc - h - c.r, c.r - dc - h) <= 2 * h; });
    const depth = (z) => { let m = Infinity; for (const c of close) m = Math.min(m, Math.abs(abs(sub(z, c.c)) - c.r)); return m / (1 - (z[0] * z[0] + z[1] * z[1])); };
    let anchor = inner, best = depth(inner);
    for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
      const z = [x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * j) / 12];
      if (faceHas(f, z) && depth(z) > best) { best = depth(z); anchor = z; }
    }
    // the axes around it: where each of its circles' middles is, for turning it about the right one
    const around = [...name.values()].map(({ ring, axis }) => ({ ring, kind: axes[axis].kind, e: axes[axis].e, p: axes[axis].p }));
    P.regions.push({ face: f, outline: [f.outer, ...f.holes], poly: [f.poly(), ...f.holePolys()], anchor, sig: sig(anchor), moves: name.size > 0, name: [...name.entries()].map(([, v]) => [axes[v.axis].kind, axes[v.axis].e, v.ring]), around });
  }
  const R = P.regions, nR = R.length, T = H.coset.face.reps.length;
  // the fragment a point of tile 0 is in
  const bySig = new Map();
  R.forEach((r, i) => { if (!bySig.has(r.sig)) bySig.set(r.sig, []); bySig.get(r.sig).push(i); });
  const locate = (z) => { const c = bySig.get(sig(z)) || []; return c.length <= 1 ? (c.length ? c[0] : -1) : (c.find((i) => faceHas(R[i].face, z)) ?? c[0]); };
  // A fragment seen from the next dart round its tile (x·R, whose frame is x's turned by A) is the
  // one of tile 0 its anchor turns into; seen from x·R^j, apply that j times. canon: the fragment
  // (x, f) as (its tile, the fragment seen from the tile's first dart), as one number.
  const rotIn = R.map((r) => locate(M.apply(G.A, r.anchor)));
  const rotPow = [R.map((_, i) => i)];
  for (let j = 1; j < N; j++) rotPow.push(rotPow[j - 1].map((f) => rotIn[f]));
  const reps = H.coset.face.reps, jOf = new Int32Array(H.n);
  for (const h of reps) for (let j = 0, y = h; j < N; j++, y = H.right[0][y]) jOf[y] = j;
  const canon = (P.canon = (x, f) => H.coset.face.of[x] * nR + rotPow[jOf[x]][f]);
  // Across tile 0's edges: from the middle of each of a fragment's stretches along an edge, a hair
  // over into the neighbor, then seen from the neighbor's dart: the fragment there.
  const nbrs = near.filter((d) => Math.abs(hdist(M.apply(d.m, cx(0)), cx(0)) - 2 * G.Ri) < 1e-6);
  const edgeOf = new Map(edges.map((e) => [e.c, e])), steps = [];
  R.forEach((r, f) => {
    if (!r.moves) return;
    for (const loop of r.outline) for (const arc of loop) {
      const e = edgeOf.get(arc.c);
      if (!e) continue;
      const t = (arc.a0 + arc.a1) / 2, z = [arc.c[0] + arc.r * Math.cos(t), arc.c[1] + arc.r * Math.sin(t)];
      const d0 = abs(sub(e.c, z)), over = [z[0] + ((e.c[0] - z[0]) / d0) * 1e-7, z[1] + ((e.c[1] - z[1]) / d0) * 1e-7];
      for (const d of nbrs) {
        const q = M.apply(M.inv(d.m), over);
        if (!inTile(q)) continue;
        steps.push([f, d.e, locate(q)]);
        break;
      }
    }
  });
  // the pieces: fragments joined by those steps, from every tile
  const up = new Int32Array(T * nR).map((_, i) => i), root = (i) => (up[i] === i ? i : (up[i] = root(up[i])));
  for (const h of reps) for (const [f, e, g] of steps) if (g >= 0 && R[g].moves) { const a = root(canon(h, f)), b = root(canon(H.mul(h, e), g)); if (a !== b) up[Math.max(a, b)] = Math.min(a, b); }
  const groups = new Map();
  for (let t = 0; t < T; t++) R.forEach((r, f) => {
    if (!r.moves) return;
    const k = t * nR + f, top = root(k);
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top).push({ x: reps[t], f });
  });
  checkPieces(groups.size, limit);
  const pieceOf = new Int32Array(T * nR).fill(-1);
  for (const frags of groups.values()) {
    const i = P.pieces.length, { x, f } = frags[0];
    for (const fr of frags) pieceOf[canon(fr.x, fr.f)] = i;
    const name = new Map(R[f].name.map(([kind, e, ring]) => [`${kind}:${cosetOf(H, kind).of[H.mul(x, e)]}`, ring]));
    const stickers = frags.map((fr) => fr.x), faces = stickers.map((s) => H.coset.face.of[s]);
    P.pieces.push({ frags, name, stickers, faces, kind: new Set(faces).size });
  }
  // A piece's type (for blacking out every piece like one): the pieces a symmetry of the surface
  // carries it onto (every turn about a tile or corner is one, and the circles go with it)
  const typeUp = P.pieces.map((_, i) => i), troot = (i) => (typeUp[i] === i ? i : (typeUp[i] = troot(typeUp[i])));
  P.pieces.forEach((pc, i) => {
    const { x, f } = pc.frags[0];
    for (const g of [H.R, H.S]) { const j = pieceOf[canon(H.mul(g, x), f)], a = troot(i), b = troot(j); if (j >= 0 && a !== b) typeUp[Math.max(a, b)] = Math.min(a, b); }
  });
  const typeIds = new Map(), blackout = new Set(P.spec.blackout || []);
  P.pieces.forEach((pc, i) => { const t = troot(i); if (!typeIds.has(t)) typeIds.set(t, typeIds.size); pc.type = typeIds.get(t); pc.black = blackout.has(pc.type); });
  P.n = P.pieces.length;
}
// ---- state and moves: each piece's position, an element of H (0: home)
// ---- counting, as every puzzle's: the pieces that show (not blacked out), and the smallest sticker
// as a share of its tile (areas hyperbolic: the disk's area element is 4 / (1 − |z|²)², integrated
// round each outline; a tile's area is (N − 2)π − N·2π/M)
const diskAreaOf = (poly) => {
  // (∮ F dy with ∂F/∂x = 4 / (1 − x² − y²)²: for a = 1 − y², F = 4 (x / (2a(a − x²)) + atanh(x / √a) / (2a^{3/2})))
  const F = (x, y) => { const a = 1 - y * y, r = Math.sqrt(a); return 4 * (x / (2 * a * (a - x * x)) + Math.atanh(Math.max(-1 + 1e-15, Math.min(1 - 1e-15, x / r))) / (2 * a * r)); };
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    s += F((x0 + x1) / 2, (y0 + y1) / 2) * (y1 - y0);
  }
  return Math.abs(s);
};
export function hyperRegionArea(P, f) {
  const r = P.regions[f];
  if (r.area === undefined) { const [outer, ...holes] = r.poly; r.area = diskAreaOf(outer) - holes.reduce((t, h) => t + diskAreaOf(h), 0); }
  return r.area;
}
export function hyperStats(P) {
  const { N, M: M_ } = P.G, tile = (N - 2) * Math.PI - (N * 2 * Math.PI) / M_, shown = P.pieces.filter((pc) => !pc.black);
  let smallest = Infinity;
  for (const pc of shown) for (const { f } of pc.frags) smallest = Math.min(smallest, hyperRegionArea(P, f) / tile);
  return { pieces: shown.length, smallest: Number.isFinite(smallest) ? smallest : 0 };
}
export const solvedHyperState = (P) => new Int32Array(P.n);
export const inverseHyperMove = (P, m) => ({ ...m, q: -m.q });
// the pieces in a ring (axis, layer): those whose name, moved where they are, includes it. Returns a
// Map from piece to, for each of its fragments, the point (in tile 0's frame, as the fragment is
// drawn) its turn goes about
export function hyperPiecesInLayer(P, s, axis, layer) {
  const ax = P.axes[axis], { H } = P, out = new Map();
  for (let i = 0; i < P.n; i++) {
    const pc = P.pieces[i], g = s[i];
    // (the axis, seen from the piece's home: g⁻¹ carries it there)
    const there = H.coset[ax.kind].of[H.mul(H.inv[g], ax.rep)];
    if (pc.name.get(`${ax.kind}:${there}`) !== layer) continue;
    out.set(i, pc.frags.map(({ x, f }) => P.regions[f].around.find((a) => a.kind === ax.kind && H.coset[ax.kind].of[H.mul(x, a.e)] === there).p));
  }
  return out;
}
export function applyHyperMove(P, s, { axis, layer, q }) {
  const ax = P.axes[axis], k = ((q % ax.order) + ax.order) % ax.order;
  if (!k) return;
  for (const i of hyperPiecesInLayer(P, s, axis, layer).keys()) s[i] = P.H.mul(ax.pow[k], s[i]);
}
// solved: every sticker on its own tile (and, truncated, its corners' and edges' faces on theirs)
// Solved: every piece home, or the whole surface carried by one of its symmetries (every element a
// carries the surface onto itself, tiles to tiles and circles to circles: a·x for each position x),
// as a solid turned as a whole is still solved. The symmetry, if any, is some piece's position: a
// piece turning onto itself in place (a center) passes whatever it is, so the first dozen are tried.
const solvedUnder = (P, s, a) => P.pieces.every((pc, i) => pc.black || pc.checks.every(({ e, kind }) => P.H.coset[kind].of[P.H.mul(s[i], e)] === P.H.coset[kind].of[P.H.mul(a, e)]));
export const isHyperSolved = (P, s) => {
  if (solvedUnder(P, s, 0)) return true;
  const tried = new Set([0]);
  for (let i = 0; i < P.n && tried.size <= 12; i++) {
    if (P.pieces[i].black || tried.has(s[i])) continue;
    tried.add(s[i]);
    if (solvedUnder(P, s, s[i])) return true;
  }
  return false;
};
// (as the torus's: never the same circle twice running, which would be one turn; as many as it has)
export function hyperScrambleMoves(P, count = 12 + 4 * P.tiles, rand = Math.random) {
  const out = [], N = P.axes.length;
  if (!N) return out;
  let last = -1;
  while (out.length < count) {
    const axis = Math.floor(rand() * N), ax = P.axes[axis];
    if (axis === last && N > 1) continue;
    const k = 1 + Math.floor(rand() * Math.floor(ax.order / 2));
    out.push({ axis, layer: Math.floor(rand() * ax.radii.length), q: k === ax.order / 2 || rand() < 0.5 ? k : -k });
    last = axis;
  }
  return out;
}
