// Tile-turning puzzles: a flat torus tiled with hexagons, squares or triangles, cut by circles
// like the solids are cut by planes. A cut set goes around every tile's middle, every corner
// or every edge's middle, at one or more radii; around each such point its circles make
// layers (the disk inside the first, then the rings between), and a layer turns about the
// point by the tiling's turn there: a hexagon's middle a sixth, its corner a third, an edge a
// half. The tiling, and so every cut set, looks the same turned that way about any such point,
// so circles land on circles and nothing jumbles. Truncation, like a solid's, takes the
// tiles' corners or edges off to make faces of their own: it only changes the colors.
// No drawing here; tile-view.mjs draws the flat picture and index.html the torus.
//
// Geometry lives in two coordinate systems:
//   internal: integer coordinates on a fine lattice holding every tile middle, corner and
//     edge middle (sixths of the hexagonal lattice, halves of the square one), where a turn
//     is an integer matrix and a piece's position is exact, with no drift however long you play;
//   plane: the flat picture, y down; hexagons' and squares' middles 1 apart, triangles' sides 1.
// The torus is the plane with points a whole number of steps A and B apart glued together.
// For the presets the steps come from two numbers (a, b): A is a tiles one way plus b after
// turning 60° (90° for squares), and B is A turned the same way, so the torus looks the same
// around every tile (Coxeter's {6,3}(a,b), {4,4}(a,b), {3,6}(a,b)).
//
// The pieces are the regions the circles cut the torus into, found by sampling. Each keeps
// its home shape and an exact position: turned k steps of the tiling's smallest turn, then
// moved by t (internal). State: an Int32Array, per piece [k, tx, ty]. What no circle reaches
// never moves and isn't a piece. Solved: every sticker on a face of its own color.
//
// A move is { axis, layer, q }: turn layer `layer` (0: the disk; then the rings outward) about
// turning point `axis` by q of its turns clockwise on screen (negative: counterclockwise). The
// same shape as the other puzzles' moves, so the undo history and algorithms work unchanged.

import { regularDepths, unionOutline } from "./regular.mjs";

const SQ3 = Math.sqrt(3);
const mod = (a, n) => ((a % n) + n) % n;
const floorDiv = (a, b) => Math.floor(a / b);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// rotation by 60° on the hexagonal lattice's integer coordinates (x along, y down-right)
const rot60 = ([x, y]) => [-y, x + y];
const rot90 = ([x, y]) => [-y, x];

// Each tiling: the plane position of internal unit steps; its smallest turn (base: how many
// make a whole turn) and lattice turn; the fine lattice's points mod `fine`, by kind (face:
// the tiles' middles; vertex: their corners; edge: their edges' middles); the turn's order at
// each kind; the steps of the torus from (a, b); its translations (cell: the steps between
// copies of the whole pattern); and the preset's circle around each tile.
//   hex: the circle reaches a third of the way into each neighbor, like a 3×3×3's face turn
//     into its sides (r = 2/3: 4/3 of the inradius 1/2).
//   square: the same reach would miss the square's own corners, so the circle just covers
//     them, and the four circles at each corner overlap there (a corner piece of 4 tiles).
//   triangle: a triangle's corners are as far from its middle as its neighbors' middles are,
//     so a circle around the corners also takes in its three neighbors' middles: deep cuts.
export const TILINGS = {
  hex: {
    name: "hexagon", units: [[1 / 6, 0], [1 / 12, SQ3 / 12]], base: 6, rot: rot60, fine: 6,
    classes: { face: [[0, 0]], vertex: [[2, 2], [4, 4]], edge: [[3, 0], [0, 3], [3, 3]] },
    order: { face: 6, vertex: 3, edge: 2 }, steps: (a, b) => [6 * a, 6 * b], cell: [[6, 0], [0, 6]], r: 2 / 3,
  },
  square: {
    name: "square", units: [[1 / 2, 0], [0, 1 / 2]], base: 4, rot: rot90, fine: 2,
    classes: { face: [[0, 0]], vertex: [[1, 1]], edge: [[1, 0], [0, 1]] },
    order: { face: 4, vertex: 4, edge: 2 }, steps: (a, b) => [2 * a, 2 * b], cell: [[2, 0], [0, 2]], r: 0.85,
  },
  triangle: {
    // (the hexagonal tiling's dual: its tiles' middles are the hexagons' corners)
    name: "triangle", units: [[1 / 6, 0], [1 / 12, SQ3 / 12]], base: 6, rot: rot60, fine: 6,
    classes: { face: [[2, 2], [4, 4]], vertex: [[0, 0]], edge: [[3, 0], [0, 3], [3, 3]] },
    order: { face: 3, vertex: 6, edge: 2 }, steps: (a, b) => [6 * a, 6 * b], cell: [[6, 0], [0, 6]], r: 0.72,
  },
};
export const KINDS = ["face", "vertex", "edge"];

// The puzzles, by tiling (each tiling is a family, like a solid's), each with its (a, b): a
// circle around every tile, around every corner, a crystal (circles out to the neighbors'
// middles), and a few more.
const NAMES = { hex: "Hexagon Tiling", square: "Square Tiling", triangle: "Triangle Tiling" };
const PARAMS = [
  { key: "a", label: "size", min: 1, max: 8, title: "how many tiles a step takes from a tile to its next copy around the torus" },
  { key: "b", label: "skew", min: 0, max: 8, title: "how many more tiles the step takes after turning (0: straight across; otherwise the torus twists, and swapping size and skew mirrors it)" },
];
// (hexagons: (2, 2), 12 of them, roomy enough for turns that don't touch)
const SIZES = { hex: { a: 2, b: 2 }, square: { a: 3, b: 0 }, triangle: { a: 2, b: 0 } };
const tilePreset = (id, name, tiling, cuts) => ({
  id, name, rule: "tiles", size: 2, fixed: true, tiling, ...SIZES[tiling], truncate: {}, cuts, params: PARAMS,
  title: (n, s) => `${tileCount(s)} ${TILINGS[s.tiling].name}s on a torus`,
});
const CRYSTAL = { hex: 1, square: 1, triangle: 1 / SQ3 }; // (out to the neighbors' middles)
const CORNER = { hex: 0.41, square: 0.6, triangle: 0.54 };
export const TILE_PRESETS = ["hex", "square", "triangle"].flatMap((tiling) => [
  tilePreset(`tiles-${tiling}`, `Face-Turning ${NAMES[tiling]}`, tiling, [{ on: "face", depths: [TILINGS[tiling].r] }]),
  tilePreset(`tiles-${tiling}-corner`, `Corner-Turning ${NAMES[tiling]}`, tiling, [{ on: "vertex", depths: [CORNER[tiling]] }]),
  tilePreset(`tiles-${tiling}-crystal`, `${NAMES[tiling]} Crystal`, tiling, [{ on: "face", depths: [CRYSTAL[tiling]] }]),
  ...(tiling === "triangle" ? [tilePreset("tiles-spiderman", "Spiderman", tiling, [{ on: "face", depths: [1 / (2 * SQ3)] }, { on: "vertex", depths: [0.5] }])] : []),
]);
export const TILE_PARAMS = PARAMS;
// how many tiles (a, b) makes
export const tileCount = ({ tiling, a, b }) => (tiling === "triangle" ? 2 : 1) * (tiling === "square" ? a * a + b * b : a * a + a * b + b * b);
// the radius ranges the customize editor offers (cuts), in plane units
export const TILE_CUT_RANGE = [0.05, 1.6];
const radiiOf = (spec, kind) => [...new Set((spec.cuts || []).filter((c) => c.on === kind).flatMap((c) => c.depths).filter((r) => r > 0))].sort((a, b) => a - b);
const widest = (spec) => Math.max(0, ...KINDS.flatMap((k) => radiiOf(spec, k)));
// Whether every circle fits on the torus without reaching around to overlap itself: the step to
// a point's next copy is longer than the widest circle is across.
export function tilesFit(spec) {
  const K = TILINGS[spec.tiling], step = toPlane(K, K.steps(spec.a, spec.b));
  return Math.hypot(...step) > 2 * widest(spec) + 0.05;
}
// the biggest radius that fits a torus of this size (the editor's cap)
export function tileRadiusCap(spec) {
  const K = TILINGS[spec.tiling];
  return (Math.hypot(...toPlane(K, K.steps(spec.a, spec.b))) - 0.05) / 2 - 1e-6;
}
// the nearest (a, b) that fits, growing a
export function snapTiles(spec) {
  let s = { ...spec };
  while (!tilesFit(s)) s = { ...s, a: s.a + 1 };
  return s;
}

// ---- the lattice ----
const toPlane = (K, [x, y]) => [x * K.units[0][0] + y * K.units[1][0], x * K.units[0][1] + y * K.units[1][1]];
function inverse2(m) { // [[a, c], [b, d]] columns → its inverse, as columns
  const [[a, b], [c, d]] = m, det = a * d - b * c;
  return [[d / det, -b / det], [-c / det, a / det]];
}
const key = (v) => v[0] + "," + v[1];
const mulM = (a, b) => [apply(a, b[0]), apply(a, b[1])]; // matrices as columns
const apply = (m, v) => [m[0][0] * v[0] + m[1][0] * v[1], m[0][1] * v[0] + m[1][1] * v[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
// which kind of point an internal point is (face, vertex or edge), or null
const kindAt = (K, [x, y]) => KINDS.find((k) => K.classes[k].some(([a, b]) => mod(x - a, K.fine) === 0 && mod(y - b, K.fine) === 0)) || null;

// the plane geometry of a tiling, shared by every puzzle on it
function geometry(K) {
  if (K.geo) return K.geo;
  const G = { K };
  G.toPlane = (v) => toPlane(K, v);
  const inv = inverse2(K.units);
  G.fromPlane = ([x, y]) => [x * inv[0][0] + y * inv[1][0], x * inv[0][1] + y * inv[1][1]];
  // the smallest turn, clockwise on screen (plane y down), as an integer matrix, and its powers
  const th = (2 * Math.PI) / K.base, c = Math.cos(th), s = Math.sin(th);
  const col = (v) => G.fromPlane([c * G.toPlane(v)[0] - s * G.toPlane(v)[1], s * G.toPlane(v)[0] + c * G.toPlane(v)[1]]).map((x) => {
    if (Math.abs(x - Math.round(x)) > 1e-9) throw new Error("a turn that isn't a lattice symmetry");
    return Math.round(x);
  });
  const R1 = [col([1, 0]), col([0, 1])];
  G.R = [[[1, 0], [0, 1]]];
  for (let k = 1; k < K.base; k++) G.R.push(mulM(R1, G.R[k - 1]));
  G.step = th;
  // every point of a kind within plane distance d of plane point p (internal)
  G.near = (kind, p, d) => {
    const x = G.fromPlane(p), out = [], unit = Math.min(...[[1, 0], [0, 1], [1, -1]].map((v) => Math.hypot(...G.toPlane(v))));
    const reach = Math.ceil(d / unit) + 1;
    for (let i = Math.floor(x[0]) - reach; i <= Math.ceil(x[0]) + reach; i++)
      for (let j = Math.floor(x[1]) - reach; j <= Math.ceil(x[1]) + reach; j++) {
        if (kindAt(K, [i, j]) !== kind) continue;
        const q = G.toPlane([i, j]);
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < d) out.push([i, j]);
      }
    return out;
  };
  // around each kind of tile (each face class): its corners and edge middles, as offsets
  // (internal), in turn around it
  const ring = (c, kind) => {
    const pc = G.toPlane(c), pts = G.near(kind, pc, 1.2).map((v) => ({ v, d: Math.hypot(...sub(G.toPlane(v), pc)) }));
    const dmin = Math.min(...pts.map((p) => p.d));
    return pts.filter((p) => p.d < dmin + 1e-6).map((p) => sub(p.v, c)).sort((a, b) => Math.atan2(G.toPlane(a)[1], G.toPlane(a)[0]) - Math.atan2(G.toPlane(b)[1], G.toPlane(b)[0]));
  };
  G.shape = new Map(K.classes.face.map((c) => [key(c), { corners: ring(c, "vertex"), edges: ring(c, "edge") }]));
  G.shapeOf = (c) => G.shape.get(key([mod(c[0], K.fine), mod(c[1], K.fine)]));
  // the tile (its middle, internal) a plane point is on
  G.tileOf = (p) => {
    const v = G.fromPlane(p).map((x) => x / K.fine); // (in the tiling's own steps)
    if (K === TILINGS.square) return v.map((x) => Math.round(x) * K.fine);
    if (K === TILINGS.hex) { // the nearest middle, by rounding cube coordinates (x, y, −x−y)
      let x = Math.round(v[0]), y = Math.round(v[1]);
      const z = Math.round(-v[0] - v[1]), dx = Math.abs(x - v[0]), dy = Math.abs(y - v[1]), dz = Math.abs(z + v[0] + v[1]);
      if (dx > dy && dx > dz) x = -y - z; else if (dy > dz) y = -x - z;
      return [x * K.fine, y * K.fine];
    }
    // triangles: which half of its lattice rhombus the point is in
    const q = Math.floor(v[0]), r = Math.floor(v[1]);
    return v[0] - q + (v[1] - r) < 1 ? [K.fine * q + 2, K.fine * r + 2] : [K.fine * q + 4, K.fine * r + 4];
  };
  K.geo = G;
  return G;
}

// ---- faces: the tiles, and with truncation their corners' and edges' faces ----
// A tile's parts, by which face each belongs to: a point belongs to the corner whose cut it's
// furthest past (cut: its distance toward the corner as a fraction of the corner's, past the
// truncation f), else likewise to an edge, else to the tile. Each part is the tile's polygon
// cut down by half-planes, so it's convex. Returns [{ to (the face's point, internal offset
// from the tile's middle), poly (plane, relative to the tile's middle) }].
function tileParts(G, c, truncate) {
  const { corners, edges } = G.shapeOf(c);
  const P0 = corners.map((o) => G.toPlane(o));
  // ratio of point x (plane, relative) toward a corner or edge middle o: (x·o)/(o·o)
  const along = (o) => { const q = G.toPlane(o), l = dot(q, q); return [q[0] / l, q[1] / l]; };
  const half = (poly, n, k, keepBelow) => clip(poly, n, k, keepBelow); // keep n·x ≤ k (or ≥)
  const fv = truncate.vertex, fe = truncate.edge, parts = [];
  const cv = corners.map(along), ce = edges.map(along);
  if (fv !== undefined)
    corners.forEach((o, i) => {
      let poly = half(P0, cv[i], fv, false);
      cv.forEach((w, j) => { if (j !== i) poly = clip(poly, sub(w, cv[i]), 0, true); }); // (furthest past this corner's cut)
      if (poly.length >= 3) parts.push({ to: o, poly });
    });
  if (fe !== undefined)
    edges.forEach((o, i) => {
      let poly = half(P0, ce[i], fe, false);
      ce.forEach((w, j) => { if (j !== i) poly = clip(poly, sub(w, ce[i]), 0, true); });
      if (fv !== undefined) cv.forEach((w) => { poly = clip(poly, w, fv, true); }); // (not a corner's)
      if (poly.length >= 3) parts.push({ to: o, poly });
    });
  let core = P0;
  if (fv !== undefined) cv.forEach((w) => { core = clip(core, w, fv, true); });
  if (fe !== undefined) ce.forEach((w) => { core = clip(core, w, fe, true); });
  if (core.length >= 3) parts.push({ to: [0, 0], poly: core });
  return parts;
}
// a convex polygon cut to n·x ≤ k (below) or n·x ≥ k
function clip(poly, n, k, below) {
  const out = [], val = (p) => (dot(n, p) - k) * (below ? 1 : -1);
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], va = val(a), vb = val(b);
    if (va <= 0) out.push(a);
    if ((va < 0 && vb > 0) || (va > 0 && vb < 0)) { const t = va / (va - vb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  });
  return out;
}
// which face (its point, internal) a plane point belongs to
function faceOf(G, p, truncate) {
  const c = G.tileOf(p), rel = sub(p, G.toPlane(c)), { corners, edges } = G.shapeOf(c);
  const ratio = (o) => { const q = G.toPlane(o); return dot(rel, q) / dot(q, q); };
  if (truncate.vertex !== undefined) {
    const best = corners.map((o) => ({ o, r: ratio(o) })).sort((a, b) => b.r - a.r)[0];
    if (best.r > truncate.vertex) return add(c, best.o);
  }
  if (truncate.edge !== undefined) {
    const best = edges.map((o) => ({ o, r: ratio(o) })).sort((a, b) => b.r - a.r)[0];
    if (best.r > truncate.edge) return add(c, best.o);
  }
  return c;
}

export function buildTiles(spec) {
  const K = TILINGS[spec.tiling], G = geometry(K);
  let A = K.steps(spec.a, spec.b), B = K.rot(A);
  if (cross(A, B) < 0) [A, B] = [B, A];
  const D = cross(A, B);
  const truncate = spec.truncate || {};
  const P = { kind: "tiles", spec, K, G, A, B, D, truncate, base: K.base, R: G.R, step: G.step, toPlane: G.toPlane, fromPlane: G.fromPlane };
  P.Ap = P.toPlane(A); P.Bp = P.toPlane(B);
  P.reduce = (t) => reduce(P, t);
  // every point on the torus, by kind, at its copy nearest the middle of the flat view
  P.points = {};
  for (const kind of KINDS) P.points[kind] = findPoints(P, kind);
  P.tiles = P.points.face.map((t) => ({ ...t, corners: G.shapeOf(t.home).corners.map((o) => P.toPlane(add(t.home, o))) }));
  // the faces: the tiles, then (truncated) the corners' and edges' faces
  P.faces = [...P.points.face.map((t) => ({ ...t, kind: "face" })),
    ...(truncate.vertex !== undefined ? P.points.vertex.map((t) => ({ ...t, kind: "vertex" })) : []),
    ...(truncate.edge !== undefined ? P.points.edge.map((t) => ({ ...t, kind: "edge" })) : [])];
  P.faceIndex = new Map(P.faces.map((f, i) => [key(P.reduce(f.home)), i]));
  P.faceAt = (v) => P.faceIndex.get(key(P.reduce(v))); // the face whose point is internal point v
  P.tileAt = P.faceAt;
  // the turning points: every point of a kind with a cut set, its circles' radii and its turn
  P.axes = KINDS.flatMap((kind) => {
    const radii = radiiOf(spec, kind);
    return radii.length ? P.points[kind].map((pt) => ({ ...pt, kind, radii, order: K.order[kind], step: K.base / K.order[kind] })) : [];
  });
  findPieces(P);
  P.n = P.pieces.length;
  P.order = Math.max(...P.axes.map((a) => a.order), 1);
  return P;
}

// t moved by whole steps into the cell spanned by A and B (exact, integers)
function reduce(P, t) {
  const { A, B, D } = P, fx = floorDiv(cross(t, B), D), fy = floorDiv(cross(A, t), D);
  return [t[0] - fx * A[0] - fy * B[0], t[1] - fx * A[1] - fy * B[1]];
}
// the copy of plane point p (moved by whole steps) nearest to plane point near
export function nearestCopy(P, p, near) {
  const d = [p[0] - near[0], p[1] - near[1]];
  const { Ap, Bp } = P, det = cross(Ap, Bp);
  const fu = Math.round(cross(d, Bp) / det), fv = Math.round(cross(Ap, d) / det);
  let best = null;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const u = fu + i, v = fv + j, q = [p[0] - u * Ap[0] - v * Bp[0], p[1] - u * Ap[1] - v * Bp[1]];
    const dd = (q[0] - near[0]) ** 2 + (q[1] - near[1]) ** 2;
    if (!best || dd < best.dd) best = { q, dd, u, v };
  }
  return best;
}

// Every point of a kind on the torus, each at its copy nearest the origin (ties: a fixed small
// nudge decides, so the tiles there make one whole patch), ordered outward from the middle,
// which also orders the tiles' colors.
// (kind "cell": the copies of the tiling's repeating cell, by their corner)
function findPoints(P, kind) {
  const { K, A, B } = P, seen = new Map();
  const xs = [0, A[0], B[0], A[0] + B[0]], ys = [0, A[1], B[1], A[1] + B[1]];
  const is = kind === "cell" ? ([x, y]) => mod(x, K.fine) === 0 && mod(y, K.fine) === 0 : (v) => kindAt(K, v) === kind;
  for (let x = Math.min(...xs) - K.fine; x <= Math.max(...xs) + K.fine; x++)
    for (let y = Math.min(...ys) - K.fine; y <= Math.max(...ys) + K.fine; y++) {
      if (!is([x, y])) continue;
      const t = P.reduce([x, y]), k = key(t);
      if (!seen.has(k)) seen.set(k, t);
    }
  const nudge = [0.0131, 0.0071];
  const pts = [...seen.values()].map((t) => {
    const n = nearestCopy(P, P.toPlane(t), nudge);
    const home = [t[0] - n.u * A[0] - n.v * B[0], t[1] - n.u * A[1] - n.v * B[1]];
    return { home, center: P.toPlane(home) };
  });
  return pts.sort((a, b) => Math.hypot(...a.center) - Math.hypot(...b.center) || Math.atan2(a.center[1], a.center[0]) - Math.atan2(b.center[1], b.center[0]));
}

// ---- the pieces ----
// The circles' pattern repeats with the tiling, so the pieces come from the infinite tiling
// once per tiling and cut design, then a copy goes on every copy of the tiling's repeating cell
// on the torus. Sample the plane around the cell at the origin on a fine grid, give each
// sample the set of circles it's inside, and flood-fill neighbors with the same set: each
// region is a piece, the cell's if its middle is in it. Each piece gets an anchor (the sample
// deepest inside it, for telling which circles it's in), its exact outline (arcs) and its
// stickers (the faces it covers, each with its parts' polygons), all at its home copy.
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const patterns = new Map(); // tiling, cuts and truncation → the cell's pieces
// a fixed random sequence (the same pieces, in the same order, every time)
let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
function cellPattern(P) {
  const { K, G, spec, truncate } = P;
  const cutsKey = KINDS.map((k) => radiiOf(spec, k).join("/")).join("|");
  const id = `${spec.tiling}:${cutsKey}:${truncate.vertex}:${truncate.edge}`;
  if (patterns.has(id)) return patterns.get(id);
  const rmax = widest(spec), out = [];
  if (!rmax) { patterns.set(id, out); return out; }
  const sample = rmax > 0.9 ? 0.011 : 0.008; // (sample spacing, plane units)
  const cellP = K.cell.map((v) => G.toPlane(v)), mid = [(cellP[0][0] + cellP[1][0]) / 2, (cellP[0][1] + cellP[1][1]) / 2];
  const half = Math.hypot(...cellP[0]) + 2 * rmax + 0.1;
  const n = Math.ceil((2 * half) / sample), x0 = mid[0] - half, y0 = mid[1] - half;
  const at = (s) => [x0 + ((s % n) + 0.5) * sample, y0 + (Math.floor(s / n) + 0.5) * sample];
  // The circles that reach the square, and for each rmax-sized cell of it the ones that reach
  // that cell. A sample's set of circles is labeled by two random hashes XORed over the set
  // (fast, and two different sets agreeing on both is a 1-in-2⁵² chance).
  const circles = KINDS.flatMap((kind) => radiiOf(spec, kind).flatMap((r) =>
    G.near(kind, mid, half * Math.SQRT2 + r).map((c) => ({ c, p: G.toPlane(c), r, h1: (rand() * 2 ** 31) | 0, h2: (rand() * 2 ** 21) | 0 }))));
  const bs = rmax, nb = Math.ceil((2 * half) / bs), bucket = Array.from({ length: nb * nb }, (_, b) => {
    const bx = x0 + ((b % nb) + 0.5) * bs, by = y0 + (Math.floor(b / nb) + 0.5) * bs;
    return circles.filter(({ p, r }) => Math.hypot(p[0] - bx, p[1] - by) < r + bs * Math.SQRT1_2 + 1e-9);
  });
  const near = (p) => bucket[Math.min(nb - 1, Math.floor((p[1] - y0) / bs)) * nb + Math.min(nb - 1, Math.floor((p[0] - x0) / bs))];
  const label = new Float64Array(n * n);
  for (let s = 0; s < n * n; s++) {
    const p = at(s);
    let h1 = 0, h2 = 0;
    for (const c of near(p)) if ((c.p[0] - p[0]) ** 2 + (c.p[1] - p[1]) ** 2 < c.r * c.r) { h1 ^= c.h1; h2 ^= c.h2; }
    label[s] = (h1 >>> 0) * 2 ** 21 + (h2 & 0x1fffff);
  }
  // flood fill, corner neighbors too: a sample at a piece's sharp tip can touch the rest of it
  // only diagonally. (Two different pieces that touch at a point never share a set of circles:
  // where two circles cross, the four corners around the crossing are each inside a different
  // pair.) Outside every circle (label 0) nothing moves: not a piece.
  const comp = new Int32Array(n * n).fill(-1), cellInv = inverse2(K.cell), found = [], biggest = new Map();
  for (let s = 0; s < n * n; s++) {
    if (comp[s] >= 0 || label[s] === 0) { comp[s] = s; continue; }
    const members = [s], stack = [s];
    comp[s] = s;
    let edge = false;
    while (stack.length) {
      const c = stack.pop(), i = c % n, j = (c - i) / n;
      for (const [di, dj] of NEIGHBORS) {
        if (i + di < 0 || j + dj < 0 || i + di >= n || j + dj >= n) { edge = true; continue; }
        const m = (j + dj) * n + i + di;
        if (comp[m] < 0 && label[m] === label[c]) { comp[m] = s; members.push(m); stack.push(m); }
      }
    }
    found.push({ members, edge, label: label[s] });
    biggest.set(label[s], Math.max(biggest.get(label[s]) || 0, members.length));
  }
  for (const { members, edge, label: l } of found) {
    if (edge) continue; // (cut off by the sampled square: another cell's)
    // a speck of a sample or two with the same circles as a bigger piece: a bit of that piece's
    // thin tip (between two circles that nearly touch) the samples landed in apart from the rest
    if (members.length < 4 && biggest.get(l) > members.length) continue;
    // its middle, nudged off points and lines (a piece centered on a corner has its middle
    // there) at 17°, clear of every edge's direction, picks its cell
    const pts = members.map(at), mean = [0, 1].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length + (k ? 0.0088 : 0.0287));
    const f = G.fromPlane(mean), cf = apply(cellInv, f);
    if (Math.floor(cf[0]) !== 0 || Math.floor(cf[1]) !== 0) continue;
    // the anchor: the sample farthest from every circle
    const depth = (p) => Math.min(...near(p).map(({ p: q, r }) => Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1]) - r)));
    let anchor = null, best = -1;
    for (let k = 0; k < pts.length; k += 3) { const d = depth(pts[k]); if (d > best) { best = d; anchor = pts[k]; } }
    let extent = 0;
    const faces = new Map();
    for (const p of pts) {
      extent = Math.max(extent, Math.hypot(p[0] - anchor[0], p[1] - anchor[1]));
      const fc = faceOf(G, p, truncate);
      faces.set(key(fc), fc);
    }
    // (every circle it's inside, even one far around it, and every other one reaching it)
    const cuts = circles.filter(({ p, r }) => Math.hypot(p[0] - anchor[0], p[1] - anchor[1]) - r < extent + 4 * sample)
      .map(({ p, r }) => ({ c: p, r, in: Math.hypot(p[0] - anchor[0], p[1] - anchor[1]) < r }));
    out.push({
      anchor, extent, area: members.length * sample * sample, outline: outline(cuts, anchor),
      stickers: [...faces.values()].map((fc) => ({ home: fc, parts: faceParts(G, fc, truncate) })),
    });
  }
  // a piece's type: pieces alike up to the tiling's turns (the same size, the same number of
  // faces), for blacking out every piece like one
  const types = [];
  for (const pc of out) {
    const sig = `${pc.stickers.length}:${pc.area.toFixed(3)}`;
    let t = types.indexOf(sig);
    if (t < 0) { types.push(sig); t = types.length - 1; }
    pc.type = t;
  }
  patterns.set(id, out);
  return out;
}
// a face's parts (plane polygons): in each tile around its point, the part that's this face's
function faceParts(G, fc, truncate) {
  const pf = G.toPlane(fc), parts = [];
  for (const c of G.near("face", pf, 1.3)) {
    const pc = G.toPlane(c);
    for (const pt of tileParts(G, c, truncate)) if (key(add(c, pt.to)) === key(fc)) parts.push(pt.poly.map(([x, y]) => [x + pc[0], y + pc[1]]));
  }
  return parts;
}
// every tile's parts near plane point p, for the solved picture under the pieces: [{ face
// (point, internal), poly (plane) }]
export function partsNear(P, p, d) {
  const out = [];
  for (const c of P.G.near("face", p, d)) {
    const pc = P.toPlane(c);
    for (const pt of tileParts(P.G, c, P.truncate)) out.push({ face: add(c, pt.to), poly: pt.poly.map(([x, y]) => [x + pc[0], y + pc[1]]) });
  }
  return out;
}

// A piece's edge, exactly: the arcs of its circles where every other circle's rule holds
// (inside the ones it's inside, outside the rest), chained end to end into closed loops.
// cuts: [{ c (plane), r, in }]. Returns loops of arcs { c, r, a0, a1 }, each running from
// angle a0 to a1 (either way round), for drawing and for the area (outlineArea). Those rules
// can hold in more than one place (two separate regions inside and outside the same circles):
// with anchor (a point inside the piece), just the loop around it and the holes in that.
export function outline(cuts, anchor = null) {
  const loops = outlineLoops(cuts);
  if (!anchor || loops.length < 2) return loops;
  const polys = loops.map(loopPolygon), inside = (poly, p) => {
    let w = false;
    poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) w = !w; });
    return w;
  };
  const around = loops.map((_, i) => i).filter((i) => inside(polys[i], anchor));
  if (!around.length) return loops;
  const outer = around.sort((i, j) => Math.abs(polyArea(polys[i])) - Math.abs(polyArea(polys[j])))[0];
  return loops.filter((_, i) => i === outer || (!around.includes(i) && inside(polys[outer], polys[i][0])));
}
// a loop of arcs as a polygon, finely
const loopPolygon = (loop) => loop.flatMap(({ c, r, a0, a1 }) => Array.from({ length: 24 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / 24; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; }));
function outlineLoops(cuts) {
  const ok = (p, skip) => cuts.every((k, j) => j === skip || (Math.hypot(p[0] - k.c[0], p[1] - k.c[1]) < k.r) === k.in);
  const pt = (k, a) => [k.c[0] + k.r * Math.cos(a), k.c[1] + k.r * Math.sin(a)];
  const arcs = [], TAU = 2 * Math.PI;
  cuts.forEach((k, j) => {
    // where the other circles cross this one, exactly (sampling the circle misses an arc
    // shorter than its spacing, and near a radius where circles meet at a point those are
    // everywhere), and between each two crossings, whether the edge runs there
    const at = [];
    cuts.forEach((o, m) => {
      const dx = o.c[0] - k.c[0], dy = o.c[1] - k.c[1], d = Math.hypot(dx, dy);
      if (m === j || d < 1e-12 || d > k.r + o.r || d < Math.abs(k.r - o.r)) return;
      const base = Math.atan2(dy, dx), h = Math.acos(Math.max(-1, Math.min(1, (k.r * k.r + d * d - o.r * o.r) / (2 * k.r * d))));
      at.push((((base - h) % TAU) + TAU) % TAU, (((base + h) % TAU) + TAU) % TAU);
    });
    at.sort((x, y) => x - y);
    if (!at.length) { if (ok(pt(k, 0), j)) arcs.push({ c: k.c, r: k.r, a0: 0, a1: TAU, whole: true }); return; }
    const spans = at.map((a0, i) => ({ a0, a1: i + 1 < at.length ? at[i + 1] : at[0] + TAU })).filter(({ a0, a1 }) => a1 - a0 > 1e-9);
    const on = spans.map(({ a0, a1 }) => ok(pt(k, (a0 + a1) / 2), j));
    if (on.every(Boolean)) { arcs.push({ c: k.c, r: k.r, a0: 0, a1: TAU, whole: true }); return; }
    // runs of spans where it does, joined (across a circle that only touches this one)
    const n = spans.length, first = on.findIndex((v) => !v);
    for (let s = 1; s <= n; s++) {
      const i = (first + s) % n;
      if (!on[i] || on[(i - 1 + n) % n]) continue; // (a run starts at i)
      let e = i, a1 = spans[i].a1;
      while (on[(e + 1) % n]) { e = (e + 1) % n; a1 = spans[e].a1; }
      const a0 = spans[i].a0;
      while (a1 < a0) a1 += TAU;
      arcs.push({ c: k.c, r: k.r, a0, a1 });
    }
  });
  // chain them: each arc's end is the next one's start (or end: then run it backwards). A
  // whole circle is a loop of its own (a disk's edge, or a ring's two).
  const loops = [], left = arcs.filter((a) => !a.whole), end = (a, at) => pt(a, at), near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
  for (const a of arcs) if (a.whole) loops.push([a]);
  while (left.length) {
    const loop = [left.shift()];
    for (;;) {
      const p = end(loop.at(-1), loop.at(-1).a1);
      const i = left.findIndex((a) => near(end(a, a.a0), p) || near(end(a, a.a1), p));
      if (i < 0) break;
      const a = left.splice(i, 1)[0];
      loop.push(near(end(a, a.a0), p) ? a : { c: a.c, r: a.r, a0: a.a1, a1: a.a0 });
    }
    loops.push(loop);
  }
  return loops;
}
// the area inside an outline (Green's theorem along each arc; a ring's inner circle runs the
// other way round from its outer one, so it subtracts)
export function outlineArea(loops) {
  const signed = (loop) => loop.reduce((s, { c, r, a0, a1 }) => s + r * r * (a1 - a0) + c[0] * r * (Math.sin(a1) - Math.sin(a0)) - c[1] * r * (Math.cos(a1) - Math.cos(a0)), 0) / 2;
  const areas = loops.map((l) => Math.abs(signed(l))), big = Math.max(...areas);
  // (loops inside the biggest one are holes)
  return areas.reduce((s, a) => s + (a === big ? a : -a), 0);
}

// every cell's copy of the pattern's pieces, at the copy near the flat view's middle
function findPieces(P) {
  const { G } = P, pattern = cellPattern(P);
  const cells = findPoints(P, "cell");
  P.pieces = [];
  for (const cell of cells) {
    const d = cell.home, dp = G.toPlane(d);
    for (const pc of pattern) {
      const anchor = add(pc.anchor, dp);
      P.pieces.push({
        anchor, anchorInt: G.fromPlane(anchor), extent: pc.extent, area: pc.area, type: pc.type,
        outline: pc.outline, offset: dp, // (its edge, shared with the other cells' copies: draw it moved by offset)
        // a piece's kind: how many faces it covers (1: a center, 2: an edge, 3 or more: a corner)
        kind: pc.stickers.length,
        black: (P.spec.blackout || []).includes(pc.type),
        stickers: pc.stickers.map((st) => {
          const home = add(st.home, d);
          return { home, face: P.faceAt(home), parts: st.parts, offset: dp }; // (parts: at the cell at the origin)
        }),
      });
    }
  }
}

// ---- state and moves ----
export const solvedTileState = (P) => new Int32Array(3 * P.n);
export const inverseTileMove = (P, m) => ({ ...m, q: -m.q });

// where piece i sits now: its turn k, its shift t (internal), and its anchor (plane)
export function piecePose(P, s, i) {
  const k = s[3 * i], t = [s[3 * i + 1], s[3 * i + 2]], a = P.pieces[i].anchorInt, R = P.R[k];
  const x = [R[0][0] * a[0] + R[1][0] * a[1] + t[0], R[0][1] * a[0] + R[1][1] * a[1] + t[1]];
  return { k, t, anchor: P.toPlane(x) };
}
// The pieces in a layer of turning point `axis`, each with the copy of the point it turns
// about (internal; the one nearest it): Map piece → point
export function piecesInLayer(P, s, axis, layer) {
  const ax = P.axes[axis], c = ax.home, cp = P.toPlane(c), out = new Map();
  const r0 = layer ? ax.radii[layer - 1] : 0, r1 = ax.radii[layer];
  for (let i = 0; i < P.n; i++) {
    const { anchor } = piecePose(P, s, i), n = nearestCopy(P, cp, anchor), d = Math.sqrt(n.dd);
    if (d >= r0 && d < r1) out.set(i, [c[0] - n.u * P.A[0] - n.v * P.B[0], c[1] - n.u * P.A[1] - n.v * P.B[1]]);
  }
  return out;
}
export function applyTileMove(P, s, { axis, layer, q }) {
  const ax = P.axes[axis], k = mod(q, ax.order) * ax.step, R = P.R[k];
  if (!k) return s;
  for (const [i, c] of piecesInLayer(P, s, axis, layer)) {
    // turned about c: x → R (x − c) + c, after its pose x → R_k x + t
    const t = [s[3 * i + 1] - c[0], s[3 * i + 2] - c[1]];
    const t2 = P.reduce([R[0][0] * t[0] + R[1][0] * t[1] + c[0], R[0][1] * t[0] + R[1][1] * t[1] + c[1]]);
    s[3 * i] = mod(s[3 * i] + k, P.base); s[3 * i + 1] = t2[0]; s[3 * i + 2] = t2[1];
  }
  return s;
}
// Solved: every sticker is on a face of its own color, which is its own face (every face has
// its own color). A center turned in place is still solved; blacked-out pieces don't count.
export function isTileSolved(P, s) {
  for (let i = 0; i < P.n; i++) {
    const k = s[3 * i], t = [s[3 * i + 1], s[3 * i + 2]], R = P.R[k];
    if ((!k && !t[0] && !t[1]) || P.pieces[i].black) continue;
    for (const st of P.pieces[i].stickers) {
      const h = st.home, x = [R[0][0] * h[0] + R[1][0] * h[1] + t[0], R[0][1] * h[0] + R[1][1] * h[1] + t[1]];
      if (P.faceAt(x) !== st.face) return false;
    }
  }
  return true;
}
// random turns, never the same point twice in a row
export function tileScrambleMoves(P, count = 12 + 4 * P.tiles.length, rand = Math.random) {
  const out = [], N = P.axes.length;
  if (!N) return out;
  let last = -1;
  while (out.length < count) {
    const axis = Math.floor(rand() * N), ax = P.axes[axis];
    if (axis === last && N > 1) continue;
    const n = ax.order, k = 1 + Math.floor(rand() * Math.floor(n / 2));
    out.push({ axis, layer: Math.floor(rand() * ax.radii.length), q: k === n / 2 || rand() < 0.5 ? k : -k });
    last = axis;
  }
  return out;
}
// a turn's q as the fewest of its axis's turns: from −n/2 (exclusive) to n/2
export const signedTurn = (P, q, axis = 0) => { const n = P.axes[axis] ? P.axes[axis].order : P.order, k = mod(q, n); return k > n / 2 ? k - n : k; };

// ---- the editor's snap marks ----
// Radii worth snapping a circle to: every radius where the drawing changes shape, so the
// pieces change (a piece appears or goes, or one shrinks to nothing and comes back the other
// way round, a sliver just to either side). The circle moves with every copy of itself around
// the other points of its kind; the other circles stay. It changes shape where it
//   - touches a copy of itself (half the way to another point of its kind),
//   - touches another circle (inside or out),
//   - passes through where two other circles cross,
//   - meets a copy of itself where they both cross another circle,
//   - meets two copies of itself at one point (the middle of the three points),
// and the stickers change where it passes through a tile's corner or another point.
// target: { kind, i } (the i-th radius of that kind's set), from the design without it.
export function tileSnapCandidates(spec, target) {
  const K = TILINGS[spec.tiling], G = geometry(K), [lo, hi] = TILE_CUT_RANGE;
  const top = Math.min(hi, spec.a ? tileRadiusCap(spec) : hi);
  const c0 = K.classes[target.kind][0], p0 = G.toPlane(c0), out = new Set();
  const own = radiiOf(spec, target.kind).filter((r, i) => i !== target.i); // (landing on one of these just merges the two)
  const addD = (d) => { if (d > lo + 1e-6 && d < top - 1e-6 && !own.some((r) => Math.abs(r - d) < 1e-6)) out.add(Math.round(d * 1e6) / 1e6); };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // through other points: tiles' corners, middles, edges' middles
  for (const kind of KINDS) for (const v of G.near(kind, p0, top)) addD(dist(G.toPlane(v), p0));
  // its copies (the other points of its kind) and the other circles
  const copies = G.near(target.kind, p0, 2 * top).map((v) => G.toPlane(v)).filter((q) => dist(q, p0) > 1e-9);
  const others = KINDS.flatMap((kind) => radiiOf(spec, kind).filter((r, i) => !(kind === target.kind && i === target.i)).flatMap((r) =>
    G.near(kind, p0, top + r + 1e-6).map((v) => ({ p: G.toPlane(v), r }))));
  for (const q of copies) addD(dist(q, p0) / 2);
  for (const o of others) { const d = dist(o.p, p0); addD(d - o.r); addD(d + o.r); addD(o.r - d); }
  for (let i = 0; i < others.length; i++)
    for (let j = i + 1; j < others.length; j++) for (const x of crossings(others[i], others[j])) addD(dist(x, p0));
  for (const q of copies) {
    // where a point as far from p0 as from q (on their bisector) is on another circle
    const m = [(p0[0] + q[0]) / 2, (p0[1] + q[1]) / 2], e = sub(q, p0), l = Math.hypot(...e), u = [-e[1] / l, e[0] / l];
    for (const o of others) {
      const w = sub(m, o.p), b = dot(w, u), c = dot(w, w) - o.r * o.r, disc = b * b - c;
      if (disc < 0) continue;
      for (const t of [-b - Math.sqrt(disc), -b + Math.sqrt(disc)]) addD(dist([m[0] + t * u[0], m[1] + t * u[1]], p0));
    }
  }
  for (let i = 0; i < copies.length; i++)
    for (let j = i + 1; j < copies.length; j++) { const c = circumcenter(p0, copies[i], copies[j]); if (c) addD(dist(c, p0)); }
  return [...out].sort((a, b) => a - b);
}
// The truncations (in range) that make some face regular: a square's corners cut to a regular
// octagon, a hexagon's to a dodecagon, a triangle's to a hexagon, an edge's face to a square.
// The tile's own face is one polygon; a corner's or edge's is pieced from the tiles around it.
export function tileRegularTrims(spec, kind, [lo, hi]) {
  const K = TILINGS[spec.tiling], G = geometry(K);
  const build = (f) => {
    const truncate = { ...(spec.truncate || {}), [kind]: f }, out = new Map();
    for (const c of K.classes.face)
      for (const pt of tileParts(G, c, truncate)) {
        if (pt.to[0] === 0 && pt.to[1] === 0) { out.set(key(c), pt.poly); continue; }
        const fc = add(c, pt.to);
        if (!out.has(key(fc))) out.set(key(fc), unionOutline(faceParts(G, fc, truncate)));
      }
    return out;
  };
  return regularDepths(build, lo, hi);
}
function circumcenter(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const s = (p) => p[0] * p[0] + p[1] * p[1];
  return [(s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d, (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d];
}
function crossings(a, b) {
  const d = Math.hypot(...sub(b.p, a.p));
  if (d < 1e-9 || d > a.r + b.r || d < Math.abs(a.r - b.r)) return [];
  const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d), h = Math.sqrt(Math.max(0, a.r * a.r - x * x));
  const u = [(b.p[0] - a.p[0]) / d, (b.p[1] - a.p[1]) / d], m = [a.p[0] + u[0] * x, a.p[1] + u[1] * x];
  return [[m[0] - u[1] * h, m[1] + u[0] * h], [m[0] + u[1] * h, m[1] - u[0] * h]];
}
// stats for the editor: how many pieces, and the smallest one's area as a share of a tile's
export function tileStats(P) {
  const tileArea = P.pieces.length ? polyArea(P.tiles[0].corners) : 1;
  return { pieces: P.n, smallest: P.n ? Math.min(...P.pieces.map((pc) => pc.area)) / tileArea : 0 };
}
const polyArea = (poly) => Math.abs(poly.reduce((s, a, i) => s + cross(a, poly[(i + 1) % poly.length]), 0)) / 2;
// a preset's design, for the editor
export const tileDesign = (spec) => ({ rule: "tiles", tiling: spec.tiling, a: spec.a, b: spec.b, truncate: { ...(spec.truncate || {}) }, cuts: (spec.cuts || []).map((c) => ({ on: c.on, depths: [...c.depths] })), blackout: [...(spec.blackout || [])] });
