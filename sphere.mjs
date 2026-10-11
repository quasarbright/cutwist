// Round tile-turning puzzles: M N-gons at every corner with 1/N + 1/M > 1/2, so the tiling covers
// a sphere: the five Platonic tilings, the beach balls {2,M} (M digons from pole to pole) and their
// duals {M,2} (two hemispheres, M corners round the equator). Cut by circles like the flat and
// hyperbolic tile puzzles (tiles.mjs, hyper.mjs): around tiles' middles, corners or edges' middles,
// with rings, each radius an angle (radians) on the unit sphere.
//
// A circle on the sphere is where a plane cuts it, so the puzzle is a solid like puzzle.mjs's with a
// round surface: a cap {x : x·p > cos r} is the plane x·p = cos r, and the built puzzle has the
// same shape as puzzle.mjs's (axes with plane offsets, pieces with centroids, a rotation group, an
// orientation per piece), so turning, scrambling and solving are puzzle.mjs's. What's new is the
// pieces: regions of the circles' arrangement on the sphere, worked out a tile at a time, as hyper.mjs
// does on the hyperbolic plane. Tile 0 is drawn flat by stereographic projection (circles stay
// circles), cut by the circles that reach into it and by its own edges (arcs of great circles) into
// fragments; every tile is a copy of tile 0, and a piece is the fragments that join across tiles'
// edges without crossing a circle. A fragment anywhere is (x, f): an element x of the group (which
// tile, turned how) and a fragment f of tile 0.
// No drawing here: index.html draws each fragment from regionShape (its outline in the flat
// picture, and the way back onto the sphere).
import { dot, add, sub, scale, cross, len, normalize, applyMat, mulMat, rotMat, SOLIDS, buildSolid, faceTextures, TEXTURE_MIN_FACES } from "./puzzle.mjs";
import { arrangement, faceInner, faceHas } from "./tiles.mjs";
import { HYPER_PARAMS } from "./hyper.mjs";

const TAU = 2 * Math.PI;
const KINDS = ["face", "vertex", "edge"];
const matClose = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-6);
const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

// {N,M} covers a sphere ({2,2}, two digons that are also two hemispheres, is left out: every turn
// is a half turn of half the ball)
export const isSpherical = (N, M) => N >= 2 && M >= 2 && 1 / N + 1 / M > 1 / 2 && !(N === 2 && M === 2);
// the Platonic solid a tiling is, if it's one (its colors are that solid's)
const PLATONIC = { "3,3": "tetrahedron", "4,3": "cube", "3,4": "octahedron", "5,3": "dodecahedron", "3,5": "icosahedron" };
export const sphereSolid = (N, M) => PLATONIC[`${N},${M}`] || null;

// ---- the tiling: tile 0's middle, corners and edges' middles, and the turns R (about tile 0's
// middle by a side) and S (about its corner 0 by a tile), as 3×3 rotations
// (A Platonic tiling sits as puzzle.mjs's solid does, tile k on its face k; a beach ball has its
// poles up and down, and so do the two hemispheres' middles.)
const frame = (a, b) => { const e = normalize(sub(b, scale(a, dot(a, b)))); return [a, e, cross(a, e)]; };
const geometries = new Map();
export function sphereGeometry(N, M) {
  const key = `${N},${M}`;
  if (geometries.has(key)) return geometries.get(key);
  // middle to corner, middle to an edge's middle (angles): cos Rv = cot(π/N) cot(π/M),
  // cos Ri = cos(π/M) / sin(π/N)
  const Rv = Math.acos(Math.min(1, 1 / (Math.tan(Math.PI / N) * Math.tan(Math.PI / M)))), Ri = Math.acos(Math.min(1, Math.cos(Math.PI / M) / Math.sin(Math.PI / N)));
  const at = (k, d) => { const a = Math.PI / 2 + (TAU * k) / N; return [Math.sin(d) * Math.cos(a), Math.sin(d) * Math.sin(a), Math.cos(d)]; };
  let c0 = [0, 0, 1], corners = Array.from({ length: N }, (_, k) => at(k, Rv)), mids = Array.from({ length: N }, (_, k) => at(k + 0.5, Ri));
  // (placed: Q carries the standard frame (middle, corner 0) onto where it goes)
  const solid = sphereSolid(N, M);
  let to = null;
  if (solid) {
    const ns = SOLIDS[solid].normals.map(normalize), face0 = buildSolid(ns).polys.find((p) => p.color === 0);
    to = [ns[0], normalize(face0.verts[0])];
  } else if (M === 2) to = [[0, 1, 0], [0, 0, -1]]; // (the hemispheres' middles up and down)
  if (to) {
    const F = frame(c0, corners[0]), G = frame(...to), Q = new Array(9).fill(0);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Q[i * 3 + j] += G[k][i] * F[k][j];
    c0 = applyMat(Q, c0); corners = corners.map((v) => applyMat(Q, v)); mids = mids.map((v) => applyMat(Q, v));
  }
  const R = rotMat(c0, TAU / N), S = rotMat(corners[0], TAU / M);
  // (RS is a half turn about one of tile 0's edges' middles: that edge is edge 0's kind's home)
  const RS = mulMat(R, S), edge = mids.findIndex((m) => len(sub(applyMat(RS, m), m)) < 1e-9);
  // tile 0's edges: the great circles through each corner and the next edge's middle, as their
  // planes' normals, pointing into the tile; a point is in tile 0 when it's on the inner side of all
  // (a hemisphere's edges are all the equator: one plane)
  const edgeNormals = [];
  for (let k = 0; k < N; k++) {
    let n = normalize(cross(corners[k], mids[k]));
    if (dot(n, c0) < 0) n = scale(n, -1);
    if (!edgeNormals.some((m) => len(sub(m, n)) < 1e-9)) edgeNormals.push(n);
  }
  const g = { N, M, Rv, Ri, c0, corners, mids, R, S, edge, edgeNormals };
  geometries.set(key, g);
  return g;
}
const inTile0 = (G, x, slack = 0) => G.edgeNormals.every((n) => dot(n, x) >= -slack);

// ---- the group: every rotation the tiling has, reached from R and S, numbered from 1 = 0, with
// puzzle.mjs's tables (mats, mul, find, facePerm) and hyper.mjs's (right: x ↦ xR, xS)
const groups = new Map();
export function sphereGroup(N, M) {
  const key = `${N},${M}`;
  if (groups.has(key)) return groups.get(key);
  const G = sphereGeometry(N, M);
  const mats = [[1, 0, 0, 0, 1, 0, 0, 0, 1]], find = (m) => mats.findIndex((x) => matClose(x, m));
  const right = [[], []];
  for (let i = 0; i < mats.length; i++) [G.R, G.S].forEach((X, k) => {
    const y = mulMat(mats[i], X);
    let j = find(y);
    if (j < 0) { j = mats.length; mats.push(y); }
    right[k][i] = j;
  });
  const n = mats.length;
  const mul = mats.map((a) => mats.map((b) => find(mulMat(a, b))));
  const inv = mats.map((_, a) => mul[a].indexOf(0));
  // tiles: their middles, a Platonic tiling's in its solid's face order
  const solid = sphereSolid(N, M);
  const normals = solid ? SOLIDS[solid].normals.map(normalize) : [];
  for (const m of mats) { const c = applyMat(m, G.c0); if (!normals.some((v) => len(sub(v, c)) < 1e-6)) normals.push(c); }
  const which = (list, p) => list.findIndex((v) => len(sub(v, p)) < 1e-6);
  const tileOf = Int32Array.from(mats, (m) => which(normals, applyMat(m, G.c0)));
  const facePerm = mats.map((m) => normals.map((v) => which(normals, applyMat(m, v))));
  // the other kinds' points (corners, edges' middles), each once, and each element's
  const points = { face: normals };
  const ofKind = { face: tileOf };
  for (const [kind, home] of [["vertex", G.corners[0]], ["edge", G.mids[G.edge]]]) {
    const list = [];
    ofKind[kind] = Int32Array.from(mats, (m) => { const p = applyMat(m, home); let i = which(list, p); if (i < 0) { i = list.length; list.push(p); } return i; });
    points[kind] = list;
  }
  // each tile's first element, and how many R's further round each element is
  const reps = normals.map((_, t) => tileOf.indexOf(t)), jOf = new Int32Array(n);
  for (const h of reps) for (let j = 0, y = h; j < N; j++, y = right[0][y]) jOf[y] = j;
  const H = { n, mats, mul, inv, find, facePerm, right, tileOf, reps, jOf, points, ofKind, normals };
  groups.set(key, H);
  return H;
}

// ---- the flat picture of tile 0: stereographic projection from a point q off tile 0 and off every
// circle that crosses it (so every circle draws as a circle, none as a line): q is turned to the
// south pole, then x ↦ (x₀, x₁) / (1 + x₂)
function chart(q) {
  // (a rotation taking q to (0, 0, −1))
  const s = [0, 0, -1], ax = cross(q, s), sn = len(ax), cs = dot(q, s);
  const T = sn < 1e-12 ? (cs > 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, -1, 0, 0, 0, -1]) : rotMat(scale(ax, 1 / sn), Math.atan2(sn, cs));
  const Ti = transpose(T);
  const to = (x) => { const y = applyMat(T, x); return [y[0] / (1 + y[2]), y[1] / (1 + y[2])]; };
  const back = ([u, v]) => { const d = 1 + u * u + v * v; return applyMat(Ti, [(2 * u) / d, (2 * v) / d, (1 - u * u - v * v) / d]); };
  // a circle of the sphere (x·p = c, |c| < 1) in the picture: through three of its points
  const circle = (p, c) => {
    const [u, v] = basisOf(p), r = Math.sqrt(Math.max(0, 1 - c * c));
    const [a, b, d] = [0, 1, 2].map((k) => to(add(scale(p, c), add(scale(u, r * Math.cos((TAU * k) / 3)), scale(v, r * Math.sin((TAU * k) / 3))))));
    return circumcircle(a, b, d);
  };
  return { to, back, circle };
}
function basisOf(n) {
  const u = normalize(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  return [u, cross(n, u)];
}
function circumcircle(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const s = (p) => p[0] * p[0] + p[1] * p[1];
  const x = (s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d, y = (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d;
  return { c: [x, y], r: Math.hypot(a[0] - x, a[1] - y) };
}
// points spread evenly over the sphere (for picking q)
const spread = (n) => Array.from({ length: n }, (_, i) => { const z = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - z * z), a = i * Math.PI * (3 - Math.sqrt(5)); return [r * Math.cos(a), r * Math.sin(a), z]; });
const SPREAD = spread(3000);

// ---- presets and parameters
// The round puzzles are the same family as the hyperbolic ones (hyper.mjs's presets): sides and
// tiles at a corner, set by the same steppers, whose circle is worked out for the tiling picked
// (autoCut, see roundCuts). The beach ball: six wedges from pole to pole.
export const ROUND_PRESETS = [
  { id: "ball-beach", name: "Beach Ball", rule: "hyper", size: 2, fixed: true, N: 2, M: 6, surface: 0, cuts: [], autoCut: true, truncate: {}, blackout: [], params: HYPER_PARAMS, title: () => "Beach Ball" },
];
// A preset's circles on a round tiling: round each tile, a bit past its corners, as on the
// hyperbolic ones. But a beach ball's corners are its poles, a quarter turn from every wedge's
// middle: its circles go round each wedge just past its edges instead, overlapping the next
// wedge's. The two hemispheres get the same circles, round their corners on the equator, where
// those wedges' middles are.
export const roundCuts = (N, M) => (N === 2 ? [{ on: "face", depths: [1.25 * sphereGeometry(N, M).Ri] }] : M === 2 ? [{ on: "vertex", depths: [(1.25 * Math.PI) / N] }]
  : [{ on: "face", depths: [1.15 * sphereGeometry(N, M).Rv] }]);
// how big a circle can be: up to all but a sliver of the sphere (π would be the whole of it)
export const SPHERE_RADIUS_RANGE = [0.05, Math.PI - 0.05];
const radiiOf = (spec, kind) => [...new Set((spec.cuts || []).filter((c) => c.on === kind).flatMap((c) => c.depths).filter((r) => r >= SPHERE_RADIUS_RANGE[0] && r <= SPHERE_RADIUS_RANGE[1]))].sort((a, b) => a - b);
// prism-like colors for the beach balls' wedges (round from red, then by the golden angle)
const WEDGE_COLORS = ["#c8102e", "#0051ba", "#ffe600", "#009e60", "#ff6a13", "#7b3fb3", "#ff7eb6", "#007a89", "#7d3b11", "#8ed142", "#5c6068", "#5ab4ff"];
const tileColors = (N, M, n) => {
  const solid = sphereSolid(N, M);
  if (solid) return SOLIDS[solid].colors;
  if (M === 2) return ["#f4f4ee", "#ffe600"];
  return Array.from({ length: n }, (_, k) => WEDGE_COLORS[k] || `hsl(${Math.round((k * 137.508) % 360)}, 55%, ${k % 2 ? 42 : 60}%)`);
};

// Truncation, as on the flat tilings: a tile's corners (or edges) cut off by a line square to the
// way from its middle to the corner (the edge's middle), a fraction f of the way there (here, of the
// angle), making a face round each corner (edge) with its own color. On the ball, those lines are
// great circles, so it's the flat-faced solid's truncation seen on the ball. f: spec.truncate.vertex,
// .edge, in (0, 1): what the editor's truncation ruler sets.
const truncationOf = (spec) => Object.fromEntries(["vertex", "edge"].flatMap((k) => { const f = spec.truncate && spec.truncate[k]; return Number.isFinite(f) && f > 0 && f < 1 ? [[k, f]] : []; }));
// the corners' and edges' faces' colors, round the hue circle (as the solids' and the flat tilings')
const trimColor = (kind, k, n) => `hsl(${Math.round((k * 360) / n + (kind === "vertex" ? 15 : 195))}, ${kind === "vertex" ? 45 : 40}%, ${kind === "vertex" ? 72 : 48}%)`;

// ---- building a puzzle: spec { N, M, cuts: [{ on, depths: [radius] }], truncate, blackout }
export function buildSphere(spec) {
  const { N, M } = spec, G = sphereGeometry(N, M), H = sphereGroup(N, M);
  const radii = Object.fromEntries(KINDS.map((k) => [k, radiiOf(spec, k)]));
  // the faces: the tiles, then the truncated corners' and edges' (P.faceBase: where each kind's start)
  const truncate = truncationOf(spec), T = H.normals.length;
  const trims = ["vertex", "edge"].filter((k) => truncate[k] !== undefined);
  const normals = [...H.normals, ...trims.flatMap((k) => H.points[k])], faceBase = { face: 0 };
  trims.reduce((at, k) => { faceBase[k] = at; return at + H.points[k].length; }, T);
  const colors = [...tileColors(N, M, T).slice(0, T), ...trims.flatMap((k) => H.points[k].map((_, i, all) => trimColor(k, i, all.length)))];
  const which = (p) => normals.findIndex((v) => len(sub(v, p)) < 1e-6);
  const P = {
    kind: "sphere", spec, N, M, G, H, radii, truncate, faceBase, R: 1, size: 2,
    normals, colors, textures: faceTextures(colors), texturesByDefault: colors.length >= TEXTURE_MIN_FACES,
    // (for the axis stubs, which start just past the surface: the solid's farthest points along
    // them. Every axis goes through a tile's middle, a corner or an edge's middle, all on the ball.)
    solid: { polys: H.normals.map((v, color) => ({ verts: [v, ...H.points.vertex, ...H.points.edge], normal: v, color })) },
    group: { mats: H.mats, mul: H.mul, find: H.find, facePerm: H.mats.map((m) => normals.map((v) => which(applyMat(m, v)))) },
    tiles: T,
  };
  // every circle: a cap { p, r, c: cos r } around every point of a kind, for each of its radii
  const capsOf = () => KINDS.flatMap((kind) => radii[kind].flatMap((r, ring) => H.points[kind].map((p, at) => ({ kind, at, ring, p, r, c: Math.cos(r) }))));
  P.caps = capsOf();
  // (a radius within 1e-5 of a snap mark is that mark exactly: a hair off leaves slivers too thin to
  // work out reliably, the lesson of the flat tiles' color popping)
  let moved = false;
  for (const kind of KINDS) radii[kind].forEach((r, i) => {
    const m = sphereSnapCandidates(P, kind, i).find((m) => Math.abs(m - r) < 1e-5 && m !== r);
    if (m !== undefined) { radii[kind][i] = m; moved = true; }
  });
  if (moved) P.caps = capsOf();
  findPieces(P);
  findAxes(P);
  return P;
}

// The axes: parallel planes (either way round) share one, as in puzzle.mjs: a cap and the cap
// round the opposite point turn about the same line.
function findAxes(P) {
  const { H } = P, axes = [];
  for (const cap of P.caps) {
    let ax = axes.find((a) => Math.abs(Math.abs(dot(a.dir, cap.p)) - 1) < 1e-6);
    if (!ax) axes.push((ax = { dir: cap.p, offsets: [], kinds: new Set() }));
    ax.kinds.add(cap.kind);
    const off = dot(ax.dir, cap.p) > 0 ? cap.c : -cap.c;
    if (!ax.offsets.some((o) => Math.abs(o - off) < 1e-9)) ax.offsets.push(off);
  }
  for (const ax of axes) {
    ax.offsets.sort((a, b) => a - b);
    ax.layers = ax.offsets.length + 1;
    ax.order = H.mats.filter((m) => len(sub(applyMat(m, ax.dir), ax.dir)) < 1e-6).length;
    ax.rot = Array.from({ length: ax.order }, (_, q) => H.find(rotMat(ax.dir, (q * TAU) / ax.order)));
    // the tiles nearest each end (what you'd grab to turn from there)
    const tiles = P.normals.slice(0, P.tiles);
    const ends = (e) => { const best = Math.max(...tiles.map((n) => dot(n, e))); return tiles.map((_, i) => i).filter((i) => dot(tiles[i], e) > best - 1e-3); };
    ax.posFaces = ends(ax.dir);
    ax.negFaces = ends(scale(ax.dir, -1));
    ax.empty = Array.from({ length: ax.layers }, () => true);
    for (const pc of P.pieces) {
      if (!pc.stickers.length) continue;
      const t = dot(ax.dir, pc.centroid);
      let L = 0;
      while (L < ax.offsets.length && ax.offsets[L] < t) L++;
      ax.empty[L] = false;
    }
  }
  P.axes = axes.filter((a) => a.order > 1);
}

// which caps a point of the sphere is inside, as a key
const sigOf = (caps, x) => { let s = ""; for (let i = 0; i < caps.length; i++) if (dot(caps[i].p, x) > caps[i].c) s += i + ","; return s; };

// The pieces (see the top): fragments of tile 0, joined across its edges from every tile.
function findPieces(P) {
  const { G, H, caps } = P, N = G.N;
  // the circles crossing tile 0 (a cap that holds all of it, or none, doesn't cut it): a circle
  // crosses tile 0 if its radius is within Rv of its middle's distance from tile 0's
  const crossing = caps.filter((k) => { const d = Math.acos(Math.max(-1, Math.min(1, dot(k.p, G.c0)))); return Math.abs(d - k.r) < G.Rv + 1e-6; });
  // The truncation (see truncationOf): its lines are great circles, planes through the middle (n·x =
  // 0): each corner's (edge's) cut, and where two neighboring corners' (edges') faces meet. A point
  // of tile 0 is in corner i's face if it's past the cut of the corner it's furthest toward (corners
  // first, then edges, then it's the tile's).
  const toward = (p) => normalize(sub(p, scale(G.c0, dot(p, G.c0))));
  const trimKinds = ["vertex", "edge"].filter((k) => P.truncate[k] !== undefined).map((kind) => {
    const dirs = (kind === "vertex" ? G.corners : G.mids).map(toward), t = P.truncate[kind] * (kind === "vertex" ? G.Rv : G.Ri);
    return { kind, dirs, cut: dirs.map((u) => sub(scale(u, Math.cos(t)), scale(G.c0, Math.sin(t)))) };
  });
  const partOf = (P.partOf = (x) => {
    for (const { kind, dirs, cut } of trimKinds) {
      let i = 0;
      dirs.forEach((u, j) => { if (dot(x, u) > dot(x, dirs[i])) i = j; });
      if (dot(x, cut[i]) > 0) return { kind, i };
    }
    return { kind: "face", i: 0 };
  });
  const trimPlanes = [];
  for (const { dirs, cut } of trimKinds) for (const n of [...cut, ...dirs.map((u, j) => sub(u, dirs[(j + 1) % dirs.length]))]) {
    const u = normalize(n);
    if (!trimPlanes.some((v) => Math.abs(Math.abs(dot(u, v)) - 1) < 1e-9)) trimPlanes.push(u);
  }
  // the picture's pole: off tile 0 (near its opposite point, where the picture of tile 0 is
  // roundest) and as far as can be from every circle crossing it and every great circle there
  const clear = (q) => Math.min(...crossing.map((k) => Math.abs(Math.acos(Math.max(-1, Math.min(1, dot(k.p, q)))) - k.r)), ...[...G.edgeNormals, ...trimPlanes].map((n) => Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(n, q)))))));
  const far = scale(G.c0, -1);
  let q = far, best = -1;
  for (const cone of [0.6, 1.2, Math.PI]) {
    for (const s of SPREAD) if (dot(s, far) > Math.cos(cone) && !inTile0(G, s, 0.05)) { const c = clear(s); if (c > best) { best = c; q = s; } }
    if (best > 0.02) break;
  }
  const ch = chart(q);
  P.chart = ch;
  // the circles in the picture, once each (a cap and the opposite one of the same plane are one
  // circle), and tile 0's edges
  const circles = [];
  for (const k of crossing) {
    const c = ch.circle(k.p, k.c);
    if (!circles.some((o) => Math.hypot(o.c[0] - c.c[0], o.c[1] - c.c[1]) < 1e-9 && Math.abs(o.r - c.r) < 1e-9)) circles.push(c);
  }
  const edges = G.edgeNormals.map((n) => ({ ...ch.circle(n, 0), n }));
  const trimLines = trimPlanes.map((n) => ({ ...ch.circle(n, 0), n }));
  const all = [...circles, ...edges, ...trimLines];
  const sig = (z) => sigOf(caps, ch.back(z));
  // the fragments: the regions of the picture inside tile 0
  P.regions = [];
  for (const f of arrangement(all)) {
    const inner = faceInner(f, all);
    if (!inTile0(G, ch.back(inner))) continue;
    // the anchor: of points spread over it, the one farthest (on the sphere) from every line
    const [x0, y0, x1, y1] = f.box;
    const depth = (z) => { let m = Infinity; for (const c of all) m = Math.min(m, Math.abs(Math.hypot(z[0] - c.c[0], z[1] - c.c[1]) - c.r)); return (2 * m) / (1 + z[0] * z[0] + z[1] * z[1]); };
    let anchor = inner, deepest = depth(inner);
    for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
      const z = [x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * j) / 12];
      if (faceHas(f, z) && depth(z) > deepest) { deepest = depth(z); anchor = z; }
    }
    P.regions.push({ face: f, outline: [f.outer, ...f.holes], anchor, at: ch.back(anchor), sig: sig(anchor), part: partOf(ch.back(anchor)) });
  }
  const R = P.regions, nR = R.length, T = H.reps.length;
  const bySig = new Map();
  R.forEach((r, i) => { if (!bySig.has(r.sig)) bySig.set(r.sig, []); bySig.get(r.sig).push(i); });
  const locate = (z) => { const c = bySig.get(sig(z)) || []; return c.length <= 1 ? (c.length ? c[0] : -1) : (c.find((i) => faceHas(R[i].face, z)) ?? c[0]); };
  // seen from x·R (tile 0's frame turned by R), fragment f is the one its anchor turns into
  const rotIn = R.map((r) => locate(ch.to(applyMat(G.R, r.at))));
  const rotPow = [R.map((_, i) => i)];
  for (let j = 1; j < N; j++) rotPow.push(rotPow[j - 1].map((f) => rotIn[f]));
  const canon = (x, f) => H.tileOf[x] * nR + rotPow[H.jOf[x]][f];
  // across tile 0's edges: from the middle of each of a fragment's stretches along an edge, a hair
  // over into the neighbor tile, seen from that tile's first element: the fragment there. (Not
  // where a circle runs along the edge: a hair either side is then in different circles.)
  const edgeOf = new Map(edges.map((e) => [e.c, e])), steps = [];
  R.forEach((r, f) => {
    for (const loop of r.outline) for (const arc of loop) {
      const e = edgeOf.get(arc.c);
      if (!e) continue;
      const t = (arc.a0 + arc.a1) / 2, x = ch.back([arc.c[0] + arc.r * Math.cos(t), arc.c[1] + arc.r * Math.sin(t)]);
      const over = normalize(sub(x, scale(e.n, 1e-7))), here = normalize(add(x, scale(e.n, 1e-7)));
      if (sigOf(caps, over) !== sigOf(caps, here)) continue;
      for (const d of H.reps) {
        if (H.tileOf[d] === 0) continue;
        const back = applyMat(transpose(H.mats[d]), over);
        if (!inTile0(G, back)) continue;
        steps.push([f, d, locate(ch.to(back))]);
        break;
      }
    }
  });
  // Across the truncation's lines, inside tile 0: they split stickers, not pieces. (A hair over from
  // the middle of each stretch, the fragment there, unless a circle runs along the line.) And the
  // lines drawn between stickers (P.regions[f].lines): its stretches along circles and tile edges,
  // and along the truncation's lines where the face changes (a cut runs on past where its face
  // ends, through the next corner's face).
  const trimOf = new Set(trimLines.map((e) => e.c)), inside = [];
  R.forEach((r, f) => {
    r.lines = [];
    for (const loop of r.outline) for (const arc of loop) {
      if (!trimOf.has(arc.c)) { r.lines.push(arc); continue; }
      const t = (arc.a0 + arc.a1) / 2, z = [arc.c[0] + arc.r * Math.cos(t), arc.c[1] + arc.r * Math.sin(t)], e = 1e-4;
      const [g1, g2] = [1, -1].map((s) => locate([z[0] + s * e * Math.cos(t), z[1] + s * e * Math.sin(t)]));
      const g = g1 === f ? g2 : g1;
      if (g < 0 || g === f) continue;
      const pg = R[g].part, pf = r.part;
      if (pg.kind !== pf.kind || pg.i !== pf.i) r.lines.push(arc);
      if (R[g].sig === r.sig) inside.push([f, g]);
    }
  });
  const up = new Int32Array(T * nR).map((_, i) => i), root = (i) => (up[i] === i ? i : (up[i] = root(up[i])));
  for (const h of H.reps) for (const [f, d, g] of steps) if (g >= 0) { const a = root(canon(h, f)), b = root(canon(H.mul[h][d], g)); if (a !== b) up[Math.max(a, b)] = Math.min(a, b); }
  for (const h of H.reps) for (const [f, g] of inside) { const a = root(canon(h, f)), b = root(canon(h, g)); if (a !== b) up[Math.max(a, b)] = Math.min(a, b); }
  const groupsOf = new Map();
  for (let t = 0; t < T; t++) for (let f = 0; f < nR; f++) {
    const top = root(t * nR + f);
    if (!groupsOf.has(top)) groupsOf.set(top, []);
    groupsOf.get(top).push({ x: H.reps[t], f });
  }
  const pieceOf = new Int32Array(T * nR).fill(-1);
  P.pieces = [];
  for (const frags of groupsOf.values()) {
    const i = P.pieces.length;
    for (const fr of frags) pieceOf[canon(fr.x, fr.f)] = i;
    P.pieces.push({ frags });
  }
  // A piece's middle, for telling which side of each plane it's on and for finding it again turned:
  // the mean of a point in each of its fragments. Any points of it would do for the sides (a piece
  // is inside the same caps all over, and so is any mean of its points), but turned, a piece's
  // middle has to be the middle of the piece it lands on, exactly: so a fragment's point is its
  // anchor averaged with the anchors of its turned copies round tile 0, turned back (R^j carries
  // fragment f onto fragment rotPow[j][f]), and the point of fragment f turned by R is R times f's.
  const mid = R.map((_, f) => {
    let s = [0, 0, 0], back = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let j = 0; j < N; j++) { s = add(s, applyMat(back, R[rotPow[j][f]].at)); back = mulMat(back, transpose(G.R)); }
    return scale(s, 1 / N);
  });
  P.pieces.forEach((pc) => {
    pc.centroid = scale(pc.frags.reduce((s, { x, f }) => add(s, applyMat(H.mats[x], mid[f])), [0, 0, 0]), 1 / pc.frags.length);
    pc.onAxis = len(pc.centroid) > 1e-6 && caps.some((k) => len(cross(k.p, pc.centroid)) < 1e-6);
  });
  // a piece's type (for blacking out every piece like one): the pieces the turns carry it onto
  const typeUp = P.pieces.map((_, i) => i), troot = (i) => (typeUp[i] === i ? i : (typeUp[i] = troot(typeUp[i])));
  P.pieces.forEach((pc, i) => {
    const { x, f } = pc.frags[0];
    for (const g of [H.right[0][0], H.right[1][0]]) { const j = pieceOf[canon(H.mul[g][x], f)], a = troot(i), b = troot(j); if (a !== b) typeUp[Math.max(a, b)] = Math.min(a, b); }
  });
  const typeIds = new Map(), blackout = new Set(P.spec.blackout || []);
  P.types = P.pieces.map((_, i) => { const t = troot(i); if (!typeIds.has(t)) typeIds.set(t, typeIds.size); return typeIds.get(t); });
  // each fragment drawn as a sticker of its tile's color (none if blacked out): polys as
  // puzzle.mjs's, each a fragment (x, f) instead of a flat polygon
  // (a fragment's face: its tile's, or, truncated, the corner's or edge's it's in: that point of
  // tile 0, carried to its tile, among the faces' points)
  const faceOf = ({ kind, i }, x) => (kind === "face" ? H.tileOf[x]
    : P.faceBase[kind] + H.points[kind].findIndex((p) => len(sub(p, applyMat(H.mats[x], (kind === "vertex" ? G.corners : G.mids)[i]))) < 1e-6));
  P.pieces.forEach((pc, i) => {
    const black = blackout.has(P.types[i]);
    pc.polys = pc.frags.map(({ x, f }) => ({ x, f, color: black ? -1 : faceOf(R[f].part, x), normal: applyMat(H.mats[x], R[f].at) }));
    pc.stickers = pc.polys.filter((s) => s.color >= 0);
    pc.kind = new Set(pc.frags.map(({ x }) => H.tileOf[x])).size;
  });
  P.n = P.pieces.length;
}

// A fragment's shape, for drawing it: its outline (and holes) in tile 0's flat picture, each a fine
// polygon, its lines (the stretches of outline drawn between stickers, each as points about every
// `step` on the sphere, ends included), and the way from the picture back onto the sphere (in tile
// 0's frame; a fragment (x, f) is fragment f turned by x)
export function regionShape(P, f, step = 0.04) {
  const r = P.regions[f], back = P.chart.back;
  const lines = r.lines.map(({ c, r: rr, a0, a1 }) => {
    const at = (a) => [c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)];
    const k = Math.max(1, Math.ceil(len(sub(back(at(a0)), back(at((a0 + a1) / 2)))) * 2 / step));
    return Array.from({ length: k + 1 }, (_, i) => at(a0 + ((a1 - a0) * i) / k));
  });
  return { outer: r.face.poly(), holes: r.face.holePolys(), lines, back };
}

// ---- snap marks: the radii where the drawing changes, as on the flat and hyperbolic tilings: a
// kind's circle number i passing through another tile's middle, corner or edge's middle; touching
// one of its copies or another circle (from inside, outside, or round the far side of the ball);
// passing through where two other circles cross; through the point as far from three of its copies;
// or where two of its copies meet on another circle.
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
// the points x of the sphere with x·a = ca and x·b = cb (two circles crossing, or a circle and a
// great circle when one c is 0)
function onTwo(a, ca, b, cb) {
  const k = dot(a, b), d = 1 - k * k;
  if (d < 1e-12) return [];
  const al = (ca - cb * k) / d, be = (cb - ca * k) / d, x0 = add(scale(a, al), scale(b, be)), n = cross(a, b);
  const g2 = (1 - dot(x0, x0)) / dot(n, n);
  if (g2 < 0) return [];
  const g = Math.sqrt(g2);
  return [add(x0, scale(n, g)), sub(x0, scale(n, g))];
}
export function sphereSnapCandidates(P, kind, i) {
  const { H } = P, [lo, hi] = SPHERE_RADIUS_RANGE, p0 = H.points[kind][0], own = P.radii[kind].filter((_, j) => j !== i);
  const out = [], add1 = (d) => {
    if (!(d > lo + 1e-6 && d < hi - 1e-6) || own.some((r) => Math.abs(r - d) < 1e-6) || out.some((m) => Math.abs(m - d) < 1e-9)) return;
    out.push(d);
  };
  const pts = KINDS.flatMap((k) => H.points[k]);
  for (const q of pts) add1(angle(p0, q)); // (through a point)
  const copies = H.points[kind].filter((q) => angle(p0, q) > 1e-9);
  for (const q of copies) { const d = angle(p0, q); add1(d / 2); add1(Math.PI - d / 2); } // (touching a copy)
  // (the other circles: every radius but this one, round every point)
  const others = P.caps.filter((k) => !(k.kind === kind && k.ring === P.radii[kind].indexOf(P.radii[kind][i])));
  for (const k of others) { const d = angle(p0, k.p); add1(d - k.r); add1(d + k.r); add1(k.r - d); add1(TAU - d - k.r); } // (touching it)
  for (let a = 0; a < others.length; a++) for (let b = a + 1; b < others.length; b++) // (through where two cross)
    for (const x of onTwo(others[a].p, others[a].c, others[b].p, others[b].c)) add1(angle(p0, x));
  // (its nearest ring of copies: through the point as far from three of them, and where two of them
  // meet on another circle)
  const near = Math.min(...copies.map((q) => angle(p0, q))), ring = copies.filter((q) => angle(p0, q) < 1.5 * near + 1e-9);
  for (let a = 0; a < ring.length; a++) for (let b = a + 1; b < ring.length; b++) {
    const n = cross(sub(ring[a], p0), sub(ring[b], p0)), l = len(n);
    if (l > 1e-9) { add1(angle(p0, scale(n, 1 / l))); add1(angle(p0, scale(n, -1 / l))); }
  }
  for (const q of ring) { const m = normalize(sub(p0, q)); for (const k of others) for (const x of onTwo(m, 0, k.p, k.c)) add1(angle(p0, x)); }
  return out.sort((a, b) => a - b);
}
// How many pieces there'd be with circle i of a kind at radius r and the rest as they are
export function spherePieceCountAt(P, kind, i, r) {
  const radii = Object.fromEntries(KINDS.map((k) => [k, [...P.radii[k]]]));
  radii[kind][i] = r;
  return buildSphere({ N: P.N, M: P.M, cuts: KINDS.map((on) => ({ on, depths: radii[on] })), blackout: [] }).n;
}
// The radii from lo to hi where circle i's pieces count changes (as hyper.mjs's hyperCountBreaks: a
// generator, for the page to run a little at a time; yields { at } for each change found, {} after
// the other counts). A change found near one of the marks the geometry gives is that mark exactly.
export function* sphereCountBreaks(P, kind, i, lo, hi, marks = [], samples = 48, hair = 1e-9) {
  const count = (r) => spherePieceCountAt(P, kind, i, r), xs = [], cs = [];
  for (let k = 0; k <= samples; k++) { xs.push(lo + ((hi - lo) * k) / samples); cs.push(count(xs[k])); yield {}; }
  for (let k = 0; k < samples; k++) {
    if (cs[k] === cs[k + 1]) continue;
    const stack = [[xs[k], cs[k], xs[k + 1], cs[k + 1]]];
    while (stack.length) {
      const [a, ca, b, cb] = stack.pop();
      if (b - a < 1e-3) {
        const inside = marks.filter((m) => m > a && m < b);
        if (inside.length === 1) {
          const m = inside[0], below = count(m - 1e-5), above = count(m + 1e-5);
          yield {};
          if (below === ca && above === cb) { yield { at: m }; continue; }
        }
      }
      if (b - a < hair) { yield { at: (a + b) / 2 }; continue; }
      const m = (a + b) / 2, cm = count(m);
      yield {};
      if (cm !== cb) stack.push([m, cm, b, cb]);
      if (cm !== ca) stack.push([a, ca, m, cm]);
    }
  }
}

// ---- counting: how many pieces show, and the smallest sticker as a share of its tile (areas on
// the sphere: the picture's area element is 4 / (1 + |z|²)², integrated round each outline)
const sphereAreaOf = (poly) => {
  // (∮ F dy with ∂F/∂x = 4 / (1 + x² + y²)²: for a = 1 + y², F = 2x / (a(a + x²)) + 2 atan(x / √a) / a^{3/2})
  const F = (x, y) => { const a = 1 + y * y; return (2 * x) / (a * (a + x * x)) + (2 * Math.atan(x / Math.sqrt(a))) / a ** 1.5; };
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    s += F((x0 + x1) / 2, (y0 + y1) / 2) * (y1 - y0);
  }
  return s;
};
export function regionArea(P, f) {
  const r = P.regions[f], { face } = r;
  if (r.area === undefined) r.area = Math.abs(sphereAreaOf(face.poly())) - face.holePolys().reduce((s, h) => s + Math.abs(sphereAreaOf(h)), 0);
  return r.area;
}
export function sphereStats(P) {
  const tile = (4 * Math.PI) / P.tiles;
  let smallest = Infinity;
  for (const pc of P.pieces) for (const s of pc.stickers) smallest = Math.min(smallest, regionArea(P, s.f) / tile);
  return { pieces: P.pieces.filter((p) => p.stickers.length).length, smallest: Number.isFinite(smallest) ? smallest : 0 };
}
