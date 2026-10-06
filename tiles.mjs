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
// a flower: a circle around every tile, out to its corners, so the circles meet there. (A
// triangle's corners are its neighbors' middles away: its crystal is its flower, one puzzle.)
const FLOWER = { hex: 1 / SQ3, square: Math.SQRT1_2, triangle: 1 / SQ3 };
const same = (tiling) => CRYSTAL[tiling] === FLOWER[tiling];
export const TILE_PRESETS = ["hex", "square", "triangle"].flatMap((tiling) => [
  tilePreset(`tiles-${tiling}`, `Face-Turning ${NAMES[tiling]}`, tiling, [{ on: "face", depths: [TILINGS[tiling].r] }]),
  // (shallower: the circles of triangles a step apart just touch)
  ...(tiling === "triangle" ? [tilePreset("tiles-triangle-shallow", "Shallow Face-Turning Triangle Tiling", tiling, [{ on: "face", depths: [0.5] }])] : []),
  tilePreset(`tiles-${tiling}-crystal`, `${NAMES[tiling]} ${same(tiling) ? "Crystal/Flower" : "Crystal"}`, tiling, [{ on: "face", depths: [CRYSTAL[tiling]] }]),
  ...(same(tiling) ? [] : [tilePreset(`tiles-${tiling}-flower`, `${NAMES[tiling]} Flower`, tiling, [{ on: "face", depths: [FLOWER[tiling]] }])]),
  // (face turners first, then corner turners)
  tilePreset(`tiles-${tiling}-corner`, `Corner-Turning ${NAMES[tiling]}`, tiling, [{ on: "vertex", depths: [CORNER[tiling]] }]),
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
// which face (its point, internal) a plane point belongs to (for the tests: a check on the
// stickers the pieces get from their exact outlines)
export const tileFaceAt = (P, p) => faceOf(P.G, p, P.truncate);
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

// A radius within 1e-5 of one where circles meet (a snap mark) is that radius exactly: a
// rounded one (from a link, or typed) leaves circles a hair from meeting, specks of pieces too
// small to see or to work out reliably.
function exactRadii(spec) {
  const cuts = (spec.cuts || []).map((c) => ({ ...c, depths: [...c.depths] })), out = { ...spec, cuts };
  for (const kind of KINDS) radiiOf(out, kind).forEach((r, i) => {
    const m = tileSnapCandidates(out, { kind, i }).find((m) => Math.abs(m - r) < 1e-5);
    if (m !== undefined && m !== r) for (const c of cuts) if (c.on === kind) c.depths = c.depths.map((d) => (d === r ? m : d));
  });
  return out;
}
export function buildTiles(spec) {
  spec = exactRadii(spec);
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
// on the torus. The circles around the cell at the origin cut the plane into regions, worked
// out exactly (arrangement): each region inside at least one circle is a piece, the cell's if
// its middle is in it. Nothing is sampled, so no piece is too small or too thin to find, even
// at the radii where circles touch or several meet at a point. Each piece gets an anchor (a
// point well inside it, for telling which circles it's in), its outline (arcs) and its
// stickers (the faces it covers, each with its parts' polygons), all at its home copy.
const patterns = new Map(); // tiling, cuts and truncation → the cell's pieces
function cellPattern(P) {
  const { K, G, spec, truncate } = P;
  const cutsKey = KINDS.map((k) => radiiOf(spec, k).join("/")).join("|");
  const id = `${spec.tiling}:${cutsKey}:${truncate.vertex}:${truncate.edge}`;
  if (patterns.has(id)) return patterns.get(id);
  const rmax = widest(spec), out = [];
  if (!rmax) { patterns.set(id, out); return out; }
  const cellP = K.cell.map((v) => G.toPlane(v)), mid = [(cellP[0][0] + cellP[1][0]) / 2, (cellP[0][1] + cellP[1][1]) / 2];
  // (every circle that can bound a piece whose middle is in the cell: a piece is inside some
  // circle, so it's within 2·rmax of its middle, and the circles bounding it reach that circle)
  const half = Math.hypot(...cellP[0]) + 2 * rmax + 0.1;
  const circles = KINDS.flatMap((kind) => radiiOf(spec, kind).flatMap((r) => G.near(kind, mid, half * Math.SQRT2 + r).map((c) => ({ c: G.toPlane(c), r }))));
  const cellInv = inverse2(K.cell);
  // Which copy of a region is the cell's: the one whose middle, nudged off points and lines (a
  // piece centered on a corner has its middle there) at 17°, clear of every edge's direction,
  // is in the cell. Each copy's middle is worked out from its own arcs, so one right on the
  // cell's edge could look inside for two copies, or for none: the copies near the cell are
  // matched up (middles a whole number of cells apart, the same size), and exactly one of
  // each is kept, the one inside (or else the first).
  const nearCell = [];
  for (const f of arrangement(circles)) {
    f.cf = apply(cellInv, G.fromPlane([f.mid[0] + 0.0287, f.mid[1] + 0.0088]));
    if (f.cf.every((v) => v > -0.01 && v < 1.01)) nearCell.push(f);
  }
  const inCell = (f) => f.cf.every((v) => v >= 0 && v < 1), mine = [];
  for (const f of nearCell) {
    const twin = mine.findIndex((g) => Math.abs(g.area - f.area) < 1e-9 && g.cf.every((v, i) => Math.abs(f.cf[i] - v - Math.round(f.cf[i] - v)) < 1e-6));
    if (twin < 0) mine.push(f);
    else if (!inCell(mine[twin]) && inCell(f)) mine[twin] = f;
  }
  for (const f of mine) {
    // (the circles reaching it)
    const reach = Math.max(...f.box.map((v, i) => Math.abs(v - f.mid[i % 2])));
    const near = circles.filter(({ c, r }) => Math.hypot(c[0] - f.mid[0], c[1] - f.mid[1]) < r + reach * Math.SQRT2 + 1e-6);
    // outside every circle, it doesn't move: not a piece
    const inner = faceInner(f, near);
    if (!near.some(({ c, r }) => Math.hypot(inner[0] - c[0], inner[1] - c[1]) < r)) continue;
    // the anchor: of points spread over it, the one farthest from every circle
    const depth = (p) => Math.min(...near.map(({ c, r }) => Math.abs(Math.hypot(c[0] - p[0], c[1] - p[1]) - r)));
    let anchor = inner, best = depth(inner);
    const [x0, y0, x1, y1] = f.box;
    for (let i = 1; i < 16; i++) for (let j = 1; j < 16; j++) {
      const p = [x0 + ((x1 - x0) * i) / 16, y0 + ((y1 - y0) * j) / 16];
      if (!faceHas(f, p)) continue;
      const d = depth(p);
      if (d > best) { best = d; anchor = p; }
    }
    let extent = 0;
    for (const poly of [f.poly(), ...f.holePolys()]) for (const p of poly) extent = Math.max(extent, Math.hypot(p[0] - anchor[0], p[1] - anchor[1]));
    // its stickers: the tiles' parts it covers some of
    const homes = new Map();
    for (const c of G.near("face", f.mid, reach * Math.SQRT2 + 1.2)) {
      const pc = G.toPlane(c);
      for (const pt of tileParts(G, c, truncate)) {
        const part = pt.poly.map(([x, y]) => [x + pc[0], y + pc[1]]);
        if (overlapArea(f, part) > 1e-7) { const fc = add(c, pt.to); homes.set(key(fc), fc); }
      }
    }
    out.push({
      anchor, extent, area: f.area, outline: [f.outer, ...f.holes], mid: f.mid,
      stickers: [...homes.values()].map((fc) => ({ home: fc, parts: faceParts(G, fc, truncate) })),
    });
  }
  // (the same pieces, in the same order, every time: by their middles, top to bottom)
  // (each by its own rounded height, so the order is consistent)
  for (const pc of out) pc.row = Math.round(pc.mid[1] * 1e6);
  out.sort((a, b) => a.row - b.row || a.mid[0] - b.mid[0]);
  // a piece's type: pieces alike up to the tiling's turns (the same size, the same number of
  // faces), for blacking out every piece like one. (Sizes compared to within a hair, not
  // rounded: two copies' sizes can round apart.)
  const types = [];
  for (const pc of out) {
    let t = types.findIndex((u) => u.n === pc.stickers.length && Math.abs(u.area - pc.area) < 1e-7);
    if (t < 0) { types.push({ n: pc.stickers.length, area: pc.area }); t = types.length - 1; }
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

// The regions ("faces") circles cut the plane into, exactly: like tracing a map's borders.
// Every circle is split into arcs at every point where another circle crosses or touches it,
// and each arc borders two regions: the one inside its circle (on its left going round
// counterclockwise) and the one outside (on its left going round clockwise). Walking a
// region's border with it on the left, at each point where arcs meet, the next arc is the
// first one clockwise from the way back. That keeps to the same region even where three,
// four or more arcs meet: circles touching, or several circles through one point, which is
// what happens at the radii where the drawing changes (its snap marks). Arcs are { c, r, a0,
// a1 }, running from angle a0 to a1 (either way round). circles: [{ c (plane), r }]. Returns
// the bounded regions: [{ outer (a loop of arcs), holes (loops), area, mid (its middle), box
// ([x0, y0, x1, y1]), poly() and holePolys() (as fine polygons) }].
const TAU = 2 * Math.PI;
// (crossing points this close are one point: several circles through it. Radii within 1e-5 of
// meeting exactly are made exact (exactRadii), so real points are never this close, only the
// rounding in working out the same point from different circles is: about 1e-15, but where
// two circles touch, the crossing's angle is the arc cosine of nearly 1, which turns that
// into about 1e-8.)
const SAME = 1e-7;
function arrangement(circles) {
  const pt = (k, a) => [k.c[0] + k.r * Math.cos(a), k.c[1] + k.r * Math.sin(a)];
  // (which circles can meet which: buckets as wide as the widest circle)
  // (neighboring buckets by index: adding a bucket's width to a coordinate rounds, and a
  // circle just short of a bucket's edge would look two buckets over and miss its neighbors)
  const bs = 2 * Math.max(...circles.map((k) => k.r)), bucket = new Map(), bk = ([x, y]) => [Math.floor(x / bs), Math.floor(y / bs)];
  circles.forEach((k, i) => { const b = bk(k.c).join(); if (!bucket.has(b)) bucket.set(b, []); bucket.get(b).push(i); });
  const meets = (c) => { const [i, j] = bk(c); return [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dy) => bucket.get(`${i + dx},${j + dy}`) || [])); };
  // Every crossing (or touch) of two circles, then the points: crossings within SAME of each
  // other (chained) are one point, decided once for everything, so splitting the circles and
  // walking the borders agree on which arcs meet where, however near a radius is to circles
  // meeting at a point.
  const xs = []; // { k (circle), a (its angle on k), p }
  circles.forEach((k, j) => {
    for (const m of meets(k.c)) {
      const o = circles[m], dx = o.c[0] - k.c[0], dy = o.c[1] - k.c[1], d = Math.hypot(dx, dy);
      if (m === j || d < 1e-12) continue;
      const cos = (k.r * k.r + d * d - o.r * o.r) / (2 * k.r * d);
      if (Math.abs(cos) > 1 + 1e-9) continue; // (they don't meet)
      const base = Math.atan2(dy, dx), h = Math.acos(Math.max(-1, Math.min(1, cos)));
      // (touching, from outside or inside: one point)
      const touch = h * k.r < SAME || Math.abs(d - k.r - o.r) < 1e-12 || Math.abs(d - Math.abs(k.r - o.r)) < 1e-12;
      for (const a of touch ? [cos > 0 ? base : base + Math.PI] : [base - h, base + h]) xs.push({ k: j, a: ((a % TAU) + TAU) % TAU, p: pt(k, a) });
    }
  });
  const root = xs.map((_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
  const grid = new Map(), gk = (p, dx = 0, dy = 0) => `${Math.floor(p[0] / SAME) + dx},${Math.floor(p[1] / SAME) + dy}`;
  xs.forEach((x, i) => {
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const j of grid.get(gk(x.p, dx, dy)) || [])
      if (Math.hypot(xs[j].p[0] - x.p[0], xs[j].p[1] - x.p[1]) < SAME) root[find(i)] = find(j);
    const g = gk(x.p);
    if (!grid.has(g)) grid.set(g, []);
    grid.get(g).push(i);
  });
  const onCircle = circles.map(() => []);
  xs.forEach((x, i) => onCircle[x.k].push({ a: x.a, v: find(i) }));
  const arcs = [], loops = [];
  circles.forEach((k, j) => {
    // nothing meets it: a whole circle, around the inside and around the outside
    if (!onCircle[j].length) { loops.push([{ c: k.c, r: k.r, a0: 0, a1: TAU }], [{ c: k.c, r: k.r, a0: 0, a1: -TAU }]); return; }
    // its points, by angle, each once
    const cuts = [];
    for (const x of onCircle[j].sort((x, y) => x.a - y.a)) if (!cuts.some((c) => c.v === x.v)) cuts.push(x);
    cuts.forEach(({ a: a0, v: v0 }, i) => {
      const { a, v: v1 } = cuts[(i + 1) % cuts.length], a1 = i + 1 < cuts.length ? a : a + TAU;
      arcs.push({ c: k.c, r: k.r, a0, a1, v0, v1 }, { c: k.c, r: k.r, a0: a1, a1: a0, v0: v1, v1: v0 });
    });
  });
  // Which way an arc leaves its start (its tangent there) and how it bends (its curvature, +
  // to the left), and the same for the way back from its end. Arcs leaving a point the same
  // way (circles touching there) are told apart by their bend: on a tiny circle around the
  // point, the one bending left is further round counterclockwise.
  const leaving = new Map();
  arcs.forEach((e, i) => {
    const sg = Math.sign(e.a1 - e.a0);
    e.out = e.a0 + (sg * Math.PI) / 2; e.bend = sg / e.r;
    e.back = e.a1 + (sg * Math.PI) / 2 + Math.PI; e.backBend = -sg / e.r;
    if (!leaving.has(e.v0)) leaving.set(e.v0, []);
    leaving.get(e.v0).push(i);
  });
  // how far clockwise from the way back an arc leaves: [angle, bend], compared in that order
  const turnOf = (e, f) => {
    let d = (((e.back - f.out) % TAU) + TAU) % TAU;
    if (d > TAU - 1e-9) d -= TAU;
    const s = e.backBend - f.bend;
    if (Math.abs(d) < 1e-9) return s > 1e-12 ? [0, s] : s < -1e-12 ? [TAU, s] : null; // (null: straight back)
    return [d, s];
  };
  const before = (a, b) => (Math.abs(a[0] - b[0]) > 1e-9 ? a[0] < b[0] : a[1] < b[1]);
  const used = new Uint8Array(arcs.length);
  for (let s = 0; s < arcs.length; s++) {
    if (used[s]) continue;
    const loop = [];
    let i = s;
    for (let guard = 0; guard <= arcs.length; guard++) {
      used[i] = 1;
      loop.push(arcs[i]);
      // the next: the first arc leaving this point clockwise from the way back
      // (every arc borders just one region on its left, so the next is never one already walked,
      // other than the first: back round to the start)
      const e = arcs[i];
      let best = -1, bestTurn = null;
      for (const k of leaving.get(e.v1)) {
        const turn = turnOf(e, arcs[k]);
        if (turn && (!bestTurn || before(turn, bestTurn))) { bestTurn = turn; best = k; }
      }
      if (best < 0) best = leaving.get(e.v1).find((k) => !turnOf(e, arcs[k])) ?? -1; // (a dead end: back the way it came)
      if (best < 0 || best === s || used[best]) break;
      i = best;
    }
    loops.push(loop.map(({ c, r, a0, a1 }) => ({ c, r, a0, a1 })));
  }
  // the regions: a loop running counterclockwise is a region's outside edge, clockwise a hole,
  // which belongs to the smallest region around it (or none: the outside of everything)
  const info = loops.map((loop) => ({ loop, area: signedArea(loop), box: loopBox(loop) }));
  const faces = info.filter((l) => l.area > 1e-14).map((l) => {
    const f = { outer: l.loop, holes: [], area: l.area, box: l.box };
    let poly = null, holePolys = null;
    f.poly = () => (poly ??= loopPolygon(f.outer));
    f.holePolys = () => (holePolys ??= f.holes.map(loopPolygon));
    return f;
  });
  for (const h of info.filter((l) => l.area < -1e-14)) {
    const [x0, y0, x1, y1] = h.box, p = pt(h.loop[0], (h.loop[0].a0 + h.loop[0].a1) / 2);
    let owner = null;
    for (const f of faces) {
      const [u0, v0, u1, v1] = f.box;
      if (u0 > x0 + 1e-9 || v0 > y0 + 1e-9 || u1 < x1 - 1e-9 || v1 < y1 - 1e-9 || f.area <= -h.area) continue;
      if ((!owner || f.area < owner.area) && inPolygon(f.poly(), p)) owner = f;
    }
    if (owner) { owner.holes.push(h.loop); owner.area += h.area; }
  }
  for (const f of faces) f.mid = loopsCentroid([f.outer, ...f.holes]);
  return faces;
}
// a point inside a region, for telling which circles it's in: just off the middle of its
// longest edge, less than half as far in as any other circle comes near there
function faceInner(f, circles) {
  const e = f.outer.reduce((b, a) => (Math.abs(a.a1 - a.a0) * a.r > Math.abs(b.a1 - b.a0) * b.r ? a : b));
  const t = (e.a0 + e.a1) / 2, m = [e.c[0] + e.r * Math.cos(t), e.c[1] + e.r * Math.sin(t)];
  let clear = 1e-3;
  for (const { c, r } of circles) {
    if (c === e.c && r === e.r) continue;
    clear = Math.min(clear, Math.abs(Math.hypot(m[0] - c[0], m[1] - c[1]) - r));
  }
  // (going round counterclockwise, the region is inside the arc's circle: in, toward the middle)
  const inward = e.a1 > e.a0 ? -1 : 1, s = (inward * clear) / 2;
  return [m[0] + s * Math.cos(t), m[1] + s * Math.sin(t)];
}
// a loop's box: its ends, and where its arcs pass the circle's far left, right, top or bottom
function loopBox(loop) {
  const b = [Infinity, Infinity, -Infinity, -Infinity], add = (x, y) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); };
  for (const { c, r, a0, a1 } of loop) {
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    add(c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0));
    for (let q = Math.ceil(lo / (Math.PI / 2)); q * (Math.PI / 2) <= hi; q++) add(c[0] + r * Math.cos(q * (Math.PI / 2)), c[1] + r * Math.sin(q * (Math.PI / 2)));
  }
  return b;
}
// the middle (center of area) of loops of arcs, exactly (Green's theorem, holes counting
// against: they run the other way round)
function loopsCentroid(loops) {
  let A = 0, X = 0, Y = 0;
  for (const loop of loops) for (const { c: [cx, cy], r, a0, a1 } of loop) {
    A += signedArea([{ c: [cx, cy], r, a0, a1 }]);
    // ∮ x² dy and ∮ y² dx along the arc x = cx + r cos t, y = cy + r sin t
    const Fx = (t) => r * (cx * cx * Math.sin(t) + 2 * cx * r * (t / 2 + Math.sin(2 * t) / 4) + r * r * (Math.sin(t) - Math.sin(t) ** 3 / 3));
    const Fy = (t) => r * (-cy * cy * Math.cos(t) + 2 * cy * r * (t / 2 - Math.sin(2 * t) / 4) + r * r * (-Math.cos(t) + Math.cos(t) ** 3 / 3));
    X += Fx(a1) - Fx(a0);
    Y += Fy(a1) - Fy(a0);
  }
  return [X / (2 * A), Y / (2 * A)];
}
// how much of a region a convex polygon covers (the region's polygons clipped to it)
function overlapArea(f, convex) {
  const s = Math.sign(convex.reduce((a, p, i) => a + cross(p, convex[(i + 1) % convex.length]), 0));
  const clipTo = (poly) => {
    let out = poly;
    convex.forEach((a, i) => {
      const b = convex[(i + 1) % convex.length], side = (p) => s * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
      const next = [];
      out.forEach((p, j) => {
        const q = out[(j + 1) % out.length], sp = side(p), sq = side(q);
        if (sp >= 0) next.push(p);
        if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
      });
      out = next;
    });
    return Math.abs(out.reduce((a, p, i) => a + cross(p, out[(i + 1) % out.length]), 0)) / 2;
  };
  const [u0, v0, u1, v1] = f.box, xs = convex.map((p) => p[0]), ys = convex.map((p) => p[1]);
  if (Math.max(...xs) < u0 || Math.min(...xs) > u1 || Math.max(...ys) < v0 || Math.min(...ys) > v1) return 0;
  return clipTo(f.poly()) - f.holePolys().reduce((a, h) => a + clipTo(h), 0);
}
const faceHas = (f, p) => inPolygon(f.poly(), p) && !f.holePolys().some((h) => inPolygon(h, p));
// a loop of arcs as a polygon, finely (a point every 0.004 or so)
const loopPolygon = (loop) => loop.flatMap(({ c, r, a0, a1 }) => {
  const k = Math.max(6, Math.ceil((Math.abs(a1 - a0) * r) / 0.004));
  return Array.from({ length: k }, (_, i) => { const a = a0 + ((a1 - a0) * i) / k; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
});
function inPolygon(poly, p) {
  let w = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) w = !w;
  }
  return w;
}
// a loop's area, signed: counterclockwise positive (Green's theorem along each arc)
const signedArea = (loop) => loop.reduce((s, { c, r, a0, a1 }) => s + r * r * (a1 - a0) + c[0] * r * (Math.sin(a1) - Math.sin(a0)) - c[1] * r * (Math.cos(a1) - Math.cos(a0)), 0) / 2;
// the area inside an outline (its regions' edges and holes: a hole runs the other way round,
// so it subtracts)
export const outlineArea = (loops) => Math.abs(loops.reduce((s, l) => s + signedArea(l), 0));

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
  const c0 = K.classes[target.kind][0], p0 = G.toPlane(c0), out = [];
  const own = radiiOf(spec, target.kind).filter((r, i) => i !== target.i); // (landing on one of these just merges the two)
  // (exact: a mark rounded off would put circles a hair from meeting, not meeting)
  const addD = (d) => { if (d > lo + 1e-6 && d < top - 1e-6 && !own.some((r) => Math.abs(r - d) < 1e-6) && !out.some((e) => Math.abs(e - d) < 1e-9)) out.push(d); };
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
  return out.sort((a, b) => a - b);
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
