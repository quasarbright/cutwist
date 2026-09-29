// Planar puzzles: a W×H grid of cells whose rows and columns slide, with the rectangle's edges
// glued together (a torus, a Klein bottle, a projective plane). Whatever slides off one edge
// comes back on the edge it's glued to. No drawing here; index.html draws and takes input.
//
// State: one Int32Array, cell index y*W + x → piece*4 + orientation, where piece is the
// cell's home index and orientation is two bits: MX (mirrored left-right) and MY (mirrored
// top-bottom). Both together is a half turn. Solved: every cell home and unflipped.
//
// A move is { axis, layer, q }: axis 0 slides row `layer` by q cells (+ is rightward), axis 1
// slides column `layer` by q (+ is downward), the same shape as the 3D puzzles' moves, so the
// undo history and algorithms work unchanged.

export const MX = 1, MY = 2;
const mod = (a, n) => ((a % n) + n) % n;

// x: the left/right edges are glued mirrored (crossing them flips top-bottom: y → H−1−y, MY).
// y: the top/bottom edges are glued mirrored (crossing flips left-right: x → W−1−x, MX).
export const TOPOLOGIES = {
  torus: { name: "torus", x: false, y: false },
  klein: { name: "Klein bottle", x: false, y: true },
  rp2: { name: "projective plane", x: true, y: true },
};

export const PLANAR_PRESETS = [
  {
    id: "planar", name: "Sliding Grid", rule: "planar", size: 2, fixed: true, noCustom: true,
    width: 5, height: 5, topology: "torus",
    params: [
      { key: "topology", label: "surface", options: Object.entries(TOPOLOGIES).map(([k, t]) => [k, t.name]),
        title: "which edges are glued to which: torus (both straight), Klein bottle (top and bottom mirrored), projective plane (both mirrored)" },
      { key: "width", label: "width", min: 1 },
      { key: "height", label: "height", min: 1 },
    ],
    title: (n, s) => `${s.width}×${s.height} ${TOPOLOGIES[s.topology].name}`,
  },
];

export function buildPlanar(spec) {
  const W = spec.width, H = spec.height, T = TOPOLOGIES[spec.topology];
  const P = { kind: "planar", spec, W, H, n: W * H, topology: spec.topology, T, loops: new Map() };
  return P;
}

// Where grid coordinates (x, y), possibly outside the rectangle, land on it: the cell, and
// the orientation a piece picks up getting there across the seams.
export function wrap(P, x, y) {
  const { W, H, T } = P;
  let flip = 0;
  const kx = Math.floor(x / W);
  x -= kx * W;
  if (T.x && kx % 2) { y = H - 1 - y; flip ^= MY; }
  const ky = Math.floor(y / H);
  y -= ky * H;
  if (T.y && ky % 2) { x = W - 1 - x; flip ^= MX; }
  return { x, y, flip };
}

// The cells a move carries around, in order, and the flip picked up stepping from each to the
// next. A row walks right and a column walks down; on a mirrored seam the walk continues in
// the partner line (row H−1−r, or column W−1−c), the same way on screen. The loop closes when
// the walk is back where it started, which for a line that is its own partner (the middle row
// of an odd-height projective plane) happens flipped: a full trip around turns cells over.
export function loop(P, axis, layer) {
  const key = axis * 1e6 + layer;
  if (P.loops.has(key)) return P.loops.get(key);
  const [dx, dy] = axis === 0 ? [1, 0] : [0, 1];
  const [x0, y0] = axis === 0 ? [0, layer] : [layer, 0];
  const cells = [], flips = [];
  let x = x0, y = y0;
  do {
    cells.push(y * P.W + x);
    const w = wrap(P, x + dx, y + dy);
    flips.push(w.flip);
    x = w.x; y = w.y;
  } while (x !== x0 || y !== y0);
  const L = { cells, flips };
  P.loops.set(key, L);
  return L;
}
// how many lines there are along an axis
export const lineCount = (P, axis) => (axis === 0 ? P.H : P.W);

export const solvedPlanarState = (P) => Int32Array.from({ length: P.n }, (_, i) => i * 4);
export const isPlanarSolved = (P, s) => s.every((v, i) => v === i * 4);
export const inversePlanarMove = (P, m) => ({ ...m, q: -m.q });

export function applyPlanarMove(P, s, { axis, layer, q }) {
  const { cells, flips } = loop(P, axis, layer), L = cells.length;
  const old = cells.map((c) => s[c]);
  for (let i = 0; i < L; i++) {
    let v = old[i], j = i;
    if (q > 0) for (let k = 0; k < q; k++) { v ^= flips[j]; j = (j + 1) % L; }
    else for (let k = 0; k < -q; k++) { j = (j - 1 + L) % L; v ^= flips[j]; }
    s[cells[j]] = v;
  }
}

// Random slides, never the same line twice in a row. Each shifts by 1 to L−1 cells either way.
export function planarScrambleMoves(P, count = 12 + 2 * (P.W + P.H), rand = Math.random) {
  const out = [];
  // lines that carry more than one cell (a 1-wide torus's columns don't move anything)
  const lines = [0, 1].flatMap((axis) => Array.from({ length: lineCount(P, axis) }, (_, layer) => ({ axis, layer, L: loop(P, axis, layer).cells.length })))
    .filter((l) => l.L > 1);
  if (!lines.length) return out; // 1×1: nothing moves
  let last = null;
  while (out.length < count) {
    const l = lines[Math.floor(rand() * lines.length)];
    if (l === last && lines.length > 1) continue;
    const k = 1 + Math.floor(rand() * (l.L - 1));
    out.push({ axis: l.axis, layer: l.layer, q: rand() < 0.5 ? k : -k });
    last = l;
  }
  return out;
}

// the home cell and orientation stored in a state value
export const pieceOf = (v) => v >> 2;
export const orientOf = (v) => v & 3;
