// Tile-turning puzzles: a flat torus tiled with hexagons, squares or triangles, with a cut
// circle around every tile. A turn rotates everything inside one tile's circle about the
// tile's center, by a sixth, a quarter or a third. The tiling looks the same turned that way
// about any tile's center, so every circle lands on circles and the puzzle never jumbles.
// No drawing here; tile-view.mjs draws the flat picture and index.html the torus.
//
// Geometry lives in two coordinate systems:
//   internal: integer coordinates on a lattice holding every tile center (a triangle's
//     center is a third of the way along, so triangles count in thirds), where a turn is an
//     integer matrix and a piece's position is exact, with no drift however long you play;
//   plane: the flat picture, y down, edge-neighbor tiles' centers 1 apart.
// The torus is the plane with points a whole number of steps A and B apart glued together.
// For the presets the steps come from two numbers (a, b): A is a tiles one way plus b after
// turning 60° (90° for squares), and B is A turned the same way, so the torus looks the same
// around every tile (Coxeter's {6,3}(a,b), {4,4}(a,b), {3,6}(a,b)).
//
// The pieces are the regions the circles cut the torus into, found by sampling. Each keeps
// its home shape and an exact position: turned k steps, then moved by t (internal). State:
// an Int32Array, per piece [k, tx, ty]. Solved: every sticker on a tile of its own color.
//
// A move is { axis, layer, q }: turn tile `axis`'s circle q steps clockwise on screen
// (negative: counterclockwise); layer is always 0. The same shape as the other puzzles'
// moves, so the undo history and algorithms work unchanged.

const SQ3 = Math.sqrt(3);
const mod = (a, n) => ((a % n) + n) % n;
const floorDiv = (a, b) => Math.floor(a / b);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

// rotation by 60° on the hexagonal lattice's integer coordinates (x along, y down-right)
const rot60 = ([x, y]) => [-y, x + y];
const rot90 = ([x, y]) => [-y, x];

// Each tiling: its turn's order, the plane position of internal unit steps, which internal
// points are tile centers, the tile's corners around its center (plane), the lattice turn
// that makes the torus's second step from its first, and the cut circle's radius.
//   hex: centers on every lattice point; the circle reaches a third of the way into each
//     neighbor, like a 3×3×3's face turn into its sides (r = 2/3: 4/3 of the inradius 1/2).
//   square: the same reach would miss the square's own corners, so the circle just covers
//     them, and the four circles at each corner overlap there (a corner piece of 4 tiles).
//   triangle: a triangle's corners are as far from its center as its neighbors' centers are,
//     so a circle around the corners also takes in its three neighbors' middles: deep cuts.
export const TILINGS = {
  hex: {
    name: "hexagon", order: 6, units: [[1, 0], [0.5, SQ3 / 2]], latticeTurn: rot60,
    isCenter: () => true, steps: (a, b) => [a, b],
    corners: () => Array.from({ length: 6 }, (_, k) => polar(1 / SQ3, (Math.PI / 3) * k + Math.PI / 6)),
    r: 2 / 3,
  },
  square: {
    name: "square", order: 4, units: [[1, 0], [0, 1]], latticeTurn: rot90,
    isCenter: () => true, steps: (a, b) => [a, b],
    corners: () => [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
    r: 0.85,
  },
  triangle: {
    // internal: thirds of the triangle lattice's steps; up triangles' centers at (1, 1) mod 3,
    // down triangles' at (2, 2)
    name: "triangle", order: 3, units: [[1 / 3, 0], [1 / 6, SQ3 / 6]], latticeTurn: rot60,
    isCenter: ([x, y]) => (mod(x, 3) === 1 && mod(y, 3) === 1) || (mod(x, 3) === 2 && mod(y, 3) === 2),
    steps: (a, b) => [3 * a, 3 * b],
    corners: ([x]) => {
      // (side 1; the (1, 1) kind has its point down on screen, the plane's y being down)
      const down = mod(x, 3) === 1, R = 1 / SQ3;
      return [0, 1, 2].map((k) => polar(R, (2 * Math.PI / 3) * k + (down ? Math.PI / 2 : -Math.PI / 2)));
    },
    r: 0.72,
  },
};
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

// One puzzle per tiling, each with its (a, b).
const NAMES = { hex: "Hexagon Torus", square: "Square Torus", triangle: "Triangle Torus" };
export const TILE_PRESETS = ["hex", "square", "triangle"].map((tiling) => ({
  id: `tiles-${tiling}`, name: NAMES[tiling], rule: "tiles", size: 2, fixed: true, noCustom: true,
  tiling, a: tiling === "triangle" ? 2 : 3, b: 0,
  ...(tiling === "hex" ? { a: 2, b: 2 } : {}), // (hexagons: 12, roomy enough for turns that don't touch)
  params: [
    { key: "a", label: "size", min: 1, max: 8, title: "how many tiles a step takes from a tile to its next copy around the torus" },
    { key: "b", label: "skew", min: 0, max: 8, title: "how many more tiles the step takes after turning (0: straight across; otherwise the torus twists, and swapping size and skew mirrors it)" },
  ],
  title: (n, s) => `${tileCount(s)} ${TILINGS[s.tiling].name}s on a torus`,
}));
// how many tiles (a, b) makes
export const tileCount = ({ tiling, a, b }) => (tiling === "triangle" ? 2 : 1) * (tiling === "square" ? a * a + b * b : a * a + a * b + b * b);
// Whether a turn's circle fits on the torus without reaching around to overlap itself: the
// step to a tile's next copy is longer than the circle is wide. (The smallest that fit: 3
// hexagons, 4 squares, 6 triangles.)
export function tilesFit(spec) {
  const K = TILINGS[spec.tiling], step = toPlane(K, K.steps(spec.a, spec.b));
  return Math.hypot(...step) > 2 * (spec.r ?? K.r) + 0.05;
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

export function buildTiles(spec) {
  const K = TILINGS[spec.tiling];
  let A = K.steps(spec.a, spec.b), B = K.latticeTurn(A);
  if (cross(A, B) < 0) [A, B] = [B, A];
  const D = cross(A, B);
  const P = { kind: "tiles", spec, K, order: K.order, A, B, D, r: spec.r ?? K.r };
  P.toPlane = (v) => toPlane(K, v);
  const fromPlane = inverse2(K.units);
  P.fromPlane = ([x, y]) => [x * fromPlane[0][0] + y * fromPlane[1][0], x * fromPlane[0][1] + y * fromPlane[1][1]];
  P.Ap = P.toPlane(A); P.Bp = P.toPlane(B);
  // the turn: one step clockwise on screen (plane y down), as an integer matrix on internal
  // coordinates, and its powers
  const th = (2 * Math.PI) / K.order, c = Math.cos(th), s = Math.sin(th);
  const turnPlane = (v) => [c * v[0] - s * v[1], s * v[0] + c * v[1]];
  const col = (v) => P.fromPlane(turnPlane(P.toPlane(v))).map((x) => {
    if (Math.abs(x - Math.round(x)) > 1e-9) throw new Error("a turn that isn't a lattice symmetry");
    return Math.round(x);
  });
  const R1 = [col([1, 0]), col([0, 1])]; // columns
  P.R = [[[1, 0], [0, 1]]];
  for (let k = 1; k < K.order; k++) P.R.push(mulM(R1, P.R[k - 1]));
  P.step = th;
  P.reduce = (t) => reduce(P, t);
  P.tiles = findTiles(P);
  P.tileIndex = new Map(P.tiles.map((tl, i) => [key(P.reduce(tl.home)), i]));
  P.tileAt = (v) => P.tileIndex.get(key(P.reduce(v))); // the tile whose center is internal point v
  findPieces(P);
  P.n = P.pieces.length;
  return P;
}
const key = (v) => v[0] + "," + v[1];
const mulM = (a, b) => [apply(a, b[0]), apply(a, b[1])]; // matrices as columns
const apply = (m, v) => [m[0][0] * v[0] + m[1][0] * v[1], m[0][1] * v[0] + m[1][1] * v[1]];

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

// The tiles: one per tile center on the torus. Each keeps its center's copy in the patch the
// flat view draws in full (the copies nearest the origin: a flower of tiles around the first),
// ordered outward from the middle, which also orders their colors.
function findTiles(P) {
  const { K, A, B } = P, seen = new Map();
  const xs = [0, A[0], B[0], A[0] + B[0]], ys = [0, A[1], B[1], A[1] + B[1]];
  for (let x = Math.min(...xs) - 3; x <= Math.max(...xs) + 3; x++)
    for (let y = Math.min(...ys) - 3; y <= Math.max(...ys) + 3; y++) {
      if (!K.isCenter([x, y])) continue;
      const t = P.reduce([x, y]), k = key(t);
      if (!seen.has(k)) seen.set(k, t);
    }
  // each center's copy nearest the origin (ties: a fixed small nudge decides, so the patch is
  // one whole flower)
  const nudge = [0.0131, 0.0071];
  const tiles = [...seen.values()].map((t) => {
    const p = P.toPlane(t), n = nearestCopy(P, p, nudge);
    const home = [t[0] - n.u * A[0] - n.v * B[0], t[1] - n.u * A[1] - n.v * B[1]];
    return { home, center: P.toPlane(home) };
  });
  tiles.sort((a, b) => Math.hypot(...a.center) - Math.hypot(...b.center) || Math.atan2(a.center[1], a.center[0]) - Math.atan2(b.center[1], b.center[0]));
  for (const tl of tiles) tl.corners = K.corners(tl.home).map(([x, y]) => [tl.center[0] + x, tl.center[1] + y]);
  return tiles;
}

// every tile center (internal) within plane distance d of plane point p
function centersNear(P, p, d) {
  const { K } = P, x = P.fromPlane(p), out = [];
  const reach = Math.ceil(d / Math.min(Math.hypot(...P.toPlane([1, 0])), Math.hypot(...P.toPlane([0, 1])), Math.hypot(...P.toPlane([1, -1])))) + 1;
  for (let i = Math.floor(x[0]) - reach; i <= Math.ceil(x[0]) + reach; i++)
    for (let j = Math.floor(x[1]) - reach; j <= Math.ceil(x[1]) + reach; j++) {
      if (!K.isCenter([i, j])) continue;
      const c = P.toPlane([i, j]);
      if (Math.hypot(c[0] - p[0], c[1] - p[1]) < d) out.push([i, j]);
    }
  return out;
}
// the tile (its center, internal) a plane point is on
function tileOf(P, p) {
  const v = P.fromPlane(p);
  if (P.K === TILINGS.square) return v.map(Math.round);
  if (P.K === TILINGS.hex) { // the nearest center, by rounding cube coordinates (x, y, −x−y)
    let x = Math.round(v[0]), y = Math.round(v[1]);
    const z = Math.round(-v[0] - v[1]), dx = Math.abs(x - v[0]), dy = Math.abs(y - v[1]), dz = Math.abs(z + v[0] + v[1]);
    if (dx > dy && dx > dz) x = -y - z; else if (dy > dz) y = -x - z;
    return [x, y];
  }
  // triangles: which half of its lattice rhombus the point is in
  const q = Math.floor(v[0] / 3), r = Math.floor(v[1] / 3);
  return v[0] / 3 - q + (v[1] / 3 - r) < 1 ? [3 * q + 1, 3 * r + 1] : [3 * q + 2, 3 * r + 2];
}

// The pieces. Every tile of a kind looks the same (hexagons and squares are all one kind,
// triangles point up or down), so the pieces come from the infinite tiling once per tiling
// and circle size, then a copy goes on every tile of the torus. The circles' pattern repeats
// with the tiling, so the torus's pieces are just the tiling's, glued.
// For each kind of tile: sample the plane around it on a fine grid, give each sample the set
// of circles it's inside, and flood-fill neighbors with the same set: each region is a piece.
// A tile owns the pieces whose middle is on it. Each piece gets an anchor (the sample deepest
// inside it, for telling which circles it's in), the circles that cut it out (in: it's inside
// them; out: it's outside them, near enough to matter) and its stickers (the tiles it covers),
// all relative to its tile's center.
const SAMPLE = 0.007; // sample spacing, in plane units (neighbor centers are 1 apart)
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const KINDS = { hex: [[0, 0]], square: [[0, 0]], triangle: [[1, 1], [2, 2]] }; // a center of each kind of tile
const kindOf = (P, c) => (P.K === TILINGS.triangle && mod(c[0], 3) === 2 ? 1 : 0);
const patterns = new Map(); // tiling and circle size → each kind's pieces
// a fixed random sequence (the same pieces, in the same order, every time)
let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
function tilePattern(P) {
  const id = P.spec.tiling + ":" + P.r;
  if (patterns.has(id)) return patterns.get(id);
  const { r } = P, homes = KINDS[P.spec.tiling].map((c) => P.toPlane(c));
  // a square of samples holding the tiles and every piece they own
  const mid = [(homes[0][0] + homes.at(-1)[0]) / 2, (homes[0][1] + homes.at(-1)[1]) / 2], half = 1 + r;
  const n = Math.ceil((2 * half) / SAMPLE), x0 = mid[0] - half, y0 = mid[1] - half;
  const at = (s) => [x0 + ((s % n) + 0.5) * SAMPLE, y0 + (Math.floor(s / n) + 0.5) * SAMPLE];
  // The circles that reach the square, and for each r-sized cell of it the ones that reach
  // that cell. A sample's set of circles is labeled by two random hashes XORed over the set
  // (fast, and two different sets agreeing on both is a 1-in-2⁵² chance).
  const circles = centersNear(P, mid, half * Math.SQRT2 + r).map((c) => ({ c, p: P.toPlane(c), h1: (rand() * 2 ** 31) | 0, h2: (rand() * 2 ** 21) | 0 }));
  const nb = Math.ceil((2 * half) / r), bucket = Array.from({ length: nb * nb }, (_, b) => {
    const bx = x0 + ((b % nb) + 0.5) * r, by = y0 + (Math.floor(b / nb) + 0.5) * r;
    return circles.filter(({ p }) => Math.hypot(p[0] - bx, p[1] - by) < r * (1 + Math.SQRT1_2) + 1e-9);
  });
  const near = (p) => bucket[Math.min(nb - 1, Math.floor((p[1] - y0) / r)) * nb + Math.min(nb - 1, Math.floor((p[0] - x0) / r))];
  const label = new Float64Array(n * n);
  for (let s = 0; s < n * n; s++) {
    const p = at(s);
    let h1 = 0, h2 = 0;
    for (const c of near(p)) if ((c.p[0] - p[0]) ** 2 + (c.p[1] - p[1]) ** 2 < r * r) { h1 ^= c.h1; h2 ^= c.h2; }
    label[s] = (h1 >>> 0) * 2 ** 21 + (h2 & 0x1fffff);
  }
  // flood fill, corner neighbors too: a sample at a piece's sharp tip can touch the rest of it
  // only diagonally. (Two different pieces that touch at a point never share a set of circles:
  // where two circles cross, the four corners around the crossing are each inside a different
  // pair.)
  const comp = new Int32Array(n * n).fill(-1), out = homes.map(() => []);
  for (let s = 0; s < n * n; s++) {
    if (comp[s] >= 0) continue;
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
    if (edge) continue; // (cut off by the sampled square: some other tile's)
    // its middle, nudged off the tiles' edges and corners (an edge piece's middle is on an edge, a
    // corner's on a corner) at 17°, clear of every edge's direction, picks its tile
    const pts = members.map(at), mean = [0, 1].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length + (k ? 0.0088 : 0.0287));
    const kind = homes.findIndex((h, k) => key(tileOf(P, mean)) === key(KINDS[P.spec.tiling][k]));
    if (kind < 0) continue;
    // the anchor: the sample farthest from every circle
    const depth = (p) => Math.min(...near(p).map(({ p: q }) => Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1]) - r)));
    let anchor = null, best = -1;
    for (let k = 0; k < pts.length; k += 3) { const d = depth(pts[k]); if (d > best) { best = d; anchor = pts[k]; } }
    let extent = 0;
    const stickers = new Map();
    for (const p of pts) {
      extent = Math.max(extent, Math.hypot(p[0] - anchor[0], p[1] - anchor[1]));
      const c = tileOf(P, p);
      stickers.set(key(c), c);
    }
    const cutBy = centersNear(P, anchor, r + extent + 4 * SAMPLE);
    const inside = (c) => { const q = P.toPlane(c); return Math.hypot(q[0] - anchor[0], q[1] - anchor[1]) < r; };
    const ins = cutBy.filter(inside), outs = cutBy.filter((c) => !inside(c));
    out[kind].push({
      anchor, extent, area: members.length * SAMPLE * SAMPLE, in: ins, out: outs, stickers: [...stickers.values()],
      outline: outline([...ins.map((c) => ({ c: P.toPlane(c), in: true })), ...outs.map((c) => ({ c: P.toPlane(c), in: false }))], r),
    });
  }
  patterns.set(id, out);
  return out;
}
// A piece's edge, exactly: the arcs of its circles where every other circle's rule holds
// (inside the ones it's inside, outside the rest), chained end to end into closed loops.
// cuts: [{ c (plane), in }]. Returns loops of arcs { c, a0, a1 }, each running from angle a0
// to a1 (either way round), for drawing and for the area (outlineArea).
export function outline(cuts, r) {
  const ok = (p, skip) => cuts.every((k, j) => j === skip || (Math.hypot(p[0] - k.c[0], p[1] - k.c[1]) < r) === k.in);
  const pt = (k, a) => [k.c[0] + r * Math.cos(a), k.c[1] + r * Math.sin(a)];
  const arcs = [], N = 720;
  cuts.forEach((k, j) => {
    const on = Array.from({ length: N }, (_, i) => ok(pt(k, (2 * Math.PI * i) / N), j));
    if (on.every(Boolean)) { arcs.push({ c: k.c, a0: 0, a1: 2 * Math.PI }); return; }
    // where a run of points on the edge starts and ends, found exactly by bisection
    const edge = (i, starting) => {
      let lo = (2 * Math.PI * (i - 1)) / N, hi = (2 * Math.PI * i) / N; // (on[i − 1] and on[i] differ)
      for (let s = 0; s < 40; s++) { const m = (lo + hi) / 2; if (ok(pt(k, m), j) === starting) hi = m; else lo = m; }
      return (lo + hi) / 2;
    };
    for (let i = 0; i < N; i++) {
      if (!on[i] || on[(i - 1 + N) % N]) continue; // (a run starts at i)
      let e = i;
      while (on[(e + 1) % N]) e++;
      const a0 = edge(i, true), a1 = edge(e + 1, false);
      arcs.push({ c: k.c, a0, a1: a1 < a0 ? a1 + 2 * Math.PI : a1 });
    }
  });
  // chain them: each arc's end is the next one's start (or end: then run it backwards)
  const loops = [], left = arcs.slice(), end = (a, at) => pt({ c: a.c }, at), near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
  while (left.length) {
    const loop = [left.shift()];
    for (;;) {
      const p = end(loop.at(-1), loop.at(-1).a1);
      const i = left.findIndex((a) => near(end(a, a.a0), p) || near(end(a, a.a1), p));
      if (i < 0) break;
      const a = left.splice(i, 1)[0];
      loop.push(near(end(a, a.a0), p) ? a : { c: a.c, a0: a.a1, a1: a.a0 });
    }
    loops.push(loop);
  }
  return loops;
}
// the area inside an outline (Green's theorem along each arc)
export function outlineArea(loops, r) {
  let s = 0;
  for (const loop of loops)
    for (const { c, a0, a1 } of loop) s += r * r * (a1 - a0) + c[0] * r * (Math.sin(a1) - Math.sin(a0)) - c[1] * r * (Math.cos(a1) - Math.cos(a0));
  return Math.abs(s) / 2;
}

// every tile's copy of its kind's pieces: positions in plane coordinates, at the copy near the
// tile's home in the flat view
function findPieces(P) {
  const pattern = tilePattern(P), shift = (v, d) => [v[0] + d[0], v[1] + d[1]];
  P.pieces = P.tiles.flatMap((tl) => {
    const kind = kindOf(P, tl.home), d = [tl.home[0] - KINDS[P.spec.tiling][kind][0], tl.home[1] - KINDS[P.spec.tiling][kind][1]], dp = P.toPlane(d);
    return pattern[kind].map((pc) => {
      const anchor = shift(pc.anchor, dp);
      return {
        anchor, anchorInt: P.fromPlane(anchor), extent: pc.extent, area: pc.area,
        outline: pc.outline, offset: dp, // (its edge, shared with its kind's other copies: draw it moved by offset)
        in: pc.in.map((c) => P.toPlane(shift(c, d))), out: pc.out.map((c) => P.toPlane(shift(c, d))),
        // a piece's kind: how many tiles it covers (1: a center, 2: an edge, 3 or more: a corner)
        kind: pc.stickers.length,
        stickers: pc.stickers.map((c0) => {
          const c = shift(c0, d), q = P.toPlane(c);
          return { home: c, tile: P.tileAt(c), center: q, corners: P.K.corners(c).map(([x, y]) => [q[0] + x, q[1] + y]) };
        }),
      };
    });
  });
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
// The pieces a turn of tile `axis` moves, each with the copy of the tile's center it turns
// about (internal; the one nearest it): Map piece → center
export function piecesInCircle(P, s, axis) {
  const c = P.tiles[axis].home, cp = P.toPlane(c), out = new Map();
  for (let i = 0; i < P.n; i++) {
    const { anchor } = piecePose(P, s, i), n = nearestCopy(P, cp, anchor);
    if (Math.sqrt(n.dd) < P.r) out.set(i, [c[0] - n.u * P.A[0] - n.v * P.B[0], c[1] - n.u * P.A[1] - n.v * P.B[1]]);
  }
  return out;
}
export function applyTileMove(P, s, { axis, q }) {
  const n = P.order, k = mod(q, n), R = P.R[k];
  if (!k) return s;
  for (const [i, c] of piecesInCircle(P, s, axis)) {
    // turned about c: x → R (x − c) + c, after its pose x → R_k x + t
    const t = [s[3 * i + 1] - c[0], s[3 * i + 2] - c[1]];
    const t2 = P.reduce([R[0][0] * t[0] + R[1][0] * t[1] + c[0], R[0][1] * t[0] + R[1][1] * t[1] + c[1]]);
    s[3 * i] = mod(s[3 * i] + k, n); s[3 * i + 1] = t2[0]; s[3 * i + 2] = t2[1];
  }
  return s;
}
// Solved: every sticker is on a tile of its own color, which is its own tile (every tile has
// its own color). A center turned in place is still solved.
export function isTileSolved(P, s) {
  for (let i = 0; i < P.n; i++) {
    const k = s[3 * i], t = [s[3 * i + 1], s[3 * i + 2]], R = P.R[k];
    if (!k && !t[0] && !t[1]) continue;
    for (const st of P.pieces[i].stickers) {
      const h = st.home, x = [R[0][0] * h[0] + R[1][0] * h[1] + t[0], R[0][1] * h[0] + R[1][1] * h[1] + t[1]];
      if (P.tileAt(x) !== st.tile) return false;
    }
  }
  return true;
}
// random turns, never the same tile twice in a row
export function tileScrambleMoves(P, count = 12 + 4 * P.tiles.length, rand = Math.random) {
  const out = [], n = P.order, T = P.tiles.length;
  let last = -1;
  while (out.length < count) {
    const axis = Math.floor(rand() * T);
    if (axis === last && T > 1) continue;
    const k = 1 + Math.floor(rand() * Math.floor(n / 2));
    out.push({ axis, layer: 0, q: k === n / 2 || rand() < 0.5 ? k : -k });
    last = axis;
  }
  return out;
}
// a turn's q as the fewest steps: from −n/2 (exclusive) to n/2
export const signedTurn = (P, q) => { const k = mod(q, P.order); return k > P.order / 2 ? k - P.order : k; };
