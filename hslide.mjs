// Hyperbolic sliding squares: a tiling by squares, M of them at each corner (M ≥ 5, so the tiling is
// hyperbolic), wrapped onto a closed surface where every square is alike (regular-maps/4-M.json, the
// same surfaces as the hyperbolic turning puzzles), and slid like the sliding torus's rows. A row is
// what you get going straight through a square's opposite edges, square after square: it follows a
// straight line of the hyperbolic plane and, on the closed surface, comes back around to where it
// started. Every square sits on two rows, one across the other. (On every surface in the data a
// row never crosses itself, so its squares are all different.)
//
// The surface is its turning group H (hyper.mjs): an element is a "dart", square 0 with its
// corner 0 marked, moved somewhere on the surface. Squares are the cosets h⟨R⟩. One step along a
// row, from dart x, is x·T with T = R³S: turn to the opposite edge (R²), cross it (RS). So a row is
// the darts x, xT, xT², … and a slide of the row by one is left multiplication by ρ = x·T·x⁻¹ (the
// same element for every dart of the row) on every piece in it: a piece's position is an element of
// H, where its home dart is now, so how it's turned comes along too. Pieces do come back turned:
// rows don't split into "rows" and "columns" the way the torus's do.
//
// Solved: every piece home and unturned. What's home is shown by a picture painted across a
// fundamental domain: one copy of each square, the copy of it nearest the middle square. The page
// turns the view 45° (VIEW) so the middle square sits square to the screen.
//
// Moves are { axis: a row, layer: 0, q: steps forward (or back, q < 0) }, as every puzzle's.
// No drawing here (hslide-view.mjs draws the disk).
import { geometry, turnGroup, hyperSurfaces, mobius as Mb } from "./hyper.mjs";

const mod = (a, n) => ((a % n) + n) % n;
export const VIEW_TURN = Math.PI / 4; // (the page's view, turned so the middle square is square to the screen)

export const HSLIDE_PARAMS = [
  { key: "M", label: "at a corner", min: 5, max: 12, title: "how many squares meet at each corner" },
  { key: "surface", label: "size", min: 0, title: "which closed surface the squares wrap onto: a tiling has only a few, fewest squares first" },
];
export const HSLIDE_PRESETS = [{
  id: "sliding-hyperbolic", name: "Sliding Hyperbolic Squares", rule: "hslide", size: 2, fixed: true, noCustom: true,
  N: 4, M: 5, surface: 0, params: HSLIDE_PARAMS,
  title: (_, s) => `sliding squares, ${s.M} at a corner`,
}];

// ---- which surfaces: the hyperbolic puzzles' (hyperSurfaces), but only ones whose domain stays
// near enough the middle to draw. A long thin surface (rows of 50 squares, say) has squares many
// steps out, and the squares within that many steps grow exponentially: too many to search, and
// too near the disk's rim to place accurately.
const MAX_COVER = 40000; // (squares within the farthest square's reach, at most)
const groups = new WeakMap(); // a surface → its group (worked out once)
const groupOf = (file, s) => { if (!groups.has(s)) groups.set(s, turnGroup(file, s)); return groups.get(s); };
// how many squares the farthest is from a square, on the surface (they're all alike)
function reachOf(H) {
  const face = H.coset.face.of, n = H.coset.face.reps.length, near = Array.from({ length: n }, () => []);
  for (let x = 0; x < H.n; x++) near[face[x]].push(face[H.right[1][H.right[0][x]]]);
  const d = new Int32Array(n).fill(-1);
  d[0] = 0;
  let far = 0;
  for (let q = [0], i = 0; i < q.length; i++) for (const g of near[q[i]]) if (d[g] < 0) { d[g] = d[q[i]] + 1; far = d[g]; q.push(g); }
  return far;
}
// squares within r steps of one, in the tiling (unrolled: in the plane), for r = 0, 1, …
const balls = new Map();
function coverBall(M_) {
  if (balls.has(M_)) return balls.get(M_);
  const G = geometry(4, M_), key = (m) => Mb.apply(m, [0, 0]).map((v) => Math.round(v * 1e6)).join(",");
  const out = [1], seen = new Set([key(Mb.I)]);
  for (let front = [Mb.I]; out.at(-1) < MAX_COVER;) {
    const next = [];
    for (const m of front) for (let k = 0, t = m; k < 4; k++, t = Mb.mul(t, G.A)) { const nb = Mb.norm(Mb.mul(t, Mb.mul(G.A, G.B))), kk = key(nb); if (!seen.has(kk)) { seen.add(kk); next.push(nb); } }
    out.push(out.at(-1) + next.length);
    front = next;
  }
  balls.set(M_, out);
  return out;
}
const lists = new WeakMap();
export function hslideSurfaces(file) {
  if (lists.has(file)) return lists.get(file);
  const ball = coverBall(file.M);
  const list = hyperSurfaces(file).filter((s) => { const r = reachOf(groupOf(file, s)); return r + 1 < ball.length && ball[r + 1] <= MAX_COVER; });
  lists.set(file, list);
  return list;
}

// ---- building one: spec { M, surface }, file: regular-maps/4-M.json
export function buildHSlide(spec, file) {
  const M_ = spec.M, G = geometry(4, M_);
  const list = hslideSurfaces(file), surface = list[Math.max(0, Math.min(list.length - 1, spec.surface | 0))];
  const H = groupOf(file, surface), face = H.coset.face.of, reps = H.coset.face.reps, n = reps.length;
  const R = (x) => H.right[0][x], S = (x) => H.right[1][x], T = (x) => S(R(R(R(x))));
  const P = { kind: "hslide", spec: { ...spec, surface: list.indexOf(surface) }, G, H, surface, N: 4, M: M_, n, tiles: n, reps, face };
  // rows: each dart's row, and whether it points along it (+1) or back (−1: the dart turned half way)
  P.rowOf = new Int32Array(H.n).fill(-1);
  P.fwd = new Int8Array(H.n);
  P.rows = [];
  for (let x = 0; x < H.n; x++) {
    if (P.rowOf[x] >= 0) continue;
    const r = P.rows.length, tiles = [];
    let y = x;
    do { P.rowOf[y] = r; P.fwd[y] = 1; const b = R(R(y)); P.rowOf[b] = r; P.fwd[b] = -1; tiles.push(face[y]); y = T(y); } while (y !== x);
    const inRow = new Uint8Array(n);
    for (const f of tiles) inRow[f] = 1;
    P.rows.push({ b0: x, tiles, L: tiles.length, inRow, rho: H.mul(H.mul(x, T(0)), H.inv[x]), perm: null });
  }
  P.axes = P.rows.map((r) => ({ kind: "row", order: r.L, layers: 1 }));
  // the step along a row, in square 0's frame (A³B: turn to the opposite edge, cross it): a
  // translation along the line through the middle
  P.Tg = Mb.norm(Mb.mul(Mb.mul(Mb.mul(G.A, G.A), G.A), G.B));
  domain(P);
  return P;
}

// The fundamental domain: each square's copy the fewest steps (squares, edge to edge) out from the
// middle square, ties to the nearer (true distance), then the smaller angle; as darts of the disk
// ({ m, e }), the middle square's dart 0 at the middle, unturned. That many steps is the square's
// ring. Its angle is on the turned view (degrees, 0 to the right, counterclockwise, as in math).
// The darts whose marked edge (edge G.edge) is the domain's edge (boundary: copies of it run along
// those edges too).
// (Squares far out crowd against the disk's rim, so a square of the plane is keyed by its middle on
// the hyperboloid, 2·b·d̄ for the dart's map [a, b, c, d], which doesn't crowd.)
const hkey = (m) => { const b = m[1], d = m[3]; return `${Math.round((b[0] * d[0] + b[1] * d[1]) * 2e6)},${Math.round((b[1] * d[0] - b[0] * d[1]) * 2e6)}`; };
const cosh = (m) => m[0][0] ** 2 + m[0][1] ** 2 + m[1][0] ** 2 + m[1][1] ** 2; // (|a|² + |b|²: grows with distance from the middle)
function domain(P) {
  const { G, H, face, n } = P;
  const ang = (m) => { const c = Mb.apply(m, [0, 0]); return mod(Math.atan2(c[1], c[0]), 2 * Math.PI); };
  // a square's neighbor across the marked edge of each of its darts, and the same square turned
  const across = (d) => ({ m: Mb.norm(Mb.mul(d.m, Mb.mul(G.A, G.B))), e: H.right[1][H.right[0][d.e]] });
  const turned = (d) => ({ m: Mb.mul(d.m, G.A), e: H.right[0][d.e] });
  const dom = new Array(n).fill(null);
  P.ring = new Int32Array(n).fill(-1);
  const start = { m: Mb.I, e: 0 }, seen = new Set([hkey(start.m)]);
  dom[face[0]] = start; P.ring[face[0]] = 0;
  let left = n - 1;
  // (ring by ring; the ring where the last square turns up is finished, for its ties)
  for (let front = [start], r = 1; front.length && left > 0; r++) {
    const next = [];
    for (let d of front) for (let k = 0; k < 4; k++, d = turned(d)) {
      const nb = across(d), kk = hkey(nb.m);
      if (seen.has(kk)) continue;
      seen.add(kk); next.push(nb);
      const f = face[nb.e], o = dom[f];
      if (!o) { dom[f] = nb; P.ring[f] = r; left--; }
      else if (P.ring[f] === r && (cosh(nb.m) < cosh(o.m) - 1e-9 || (Math.abs(cosh(nb.m) - cosh(o.m)) < 1e-9 && ang(nb.m) < ang(o.m)))) dom[f] = nb;
    }
    front = next;
  }
  P.dom = dom;
  const homeKeys = new Set(dom.map((d) => hkey(d.m)));
  const inDom = (d) => homeKeys.has(hkey(d.m));
  const view = Mb.rot(VIEW_TURN);
  P.degrees = dom.map((d) => { const c = Mb.apply(view, Mb.apply(d.m, [0, 0])); return Math.round(mod((Math.atan2(c[1], c[0]) * 180) / Math.PI, 360)) % 360; });
  P.boundary = new Set();
  for (let d of dom) for (let k = 0; k < 4; k++, d = turned(d)) {
    const nb = across(d);
    if (!inDom(nb)) { P.boundary.add(d.e); P.boundary.add(nb.e); }
  }
  // how far the domain reaches (the disk radius of its farthest corner), for painting across it
  P.domainRadius = Math.max(...dom.flatMap((d) => G.poly.map((p) => Math.hypot(...Mb.apply(d.m, p)))));
}
// a dart's frame in the domain: the domain copy of its square, turned to match it
export function domainFrame(P, e) {
  const d = P.dom[P.face[e]];
  let x = d.e, m = d.m;
  for (let j = 0; j < 4 && x !== e; j++) { x = P.H.right[0][x]; m = Mb.mul(m, P.G.A); }
  return m;
}

// ---- the state: each piece's position (an element of H: where its home dart is now)
export const solvedHSlideState = (P) => Int32Array.from(P.reps);
export const isHSlideSolved = (P, s) => s.every((g, i) => g === P.reps[i]);
export const inverseHSlideMove = (P, m) => ({ ...m, q: -m.q });
// (a row's slide by one, as a permutation of the darts: ρ·x for each)
function rowPerm(P, r) {
  if (!r.perm) r.perm = Int32Array.from({ length: P.H.n }, (_, x) => P.H.mul(r.rho, x));
  return r.perm;
}
export function applyHSlideMove(P, s, { axis, q }) {
  const r = P.rows[axis], k = mod(q, r.L), perm = rowPerm(P, r);
  for (let i = 0; i < s.length; i++) if (r.inRow[P.face[s[i]]]) for (let j = 0; j < k; j++) s[i] = perm[s[i]];
  return s;
}
// the pieces a slide of row `axis` moves, in state s
export const hslidePiecesInLayer = (P, s, axis) => { const r = P.rows[axis]; return [...s.keys()].filter((i) => r.inRow[P.face[s[i]]]); };
// random slides, never the same row twice running, each 1 to L−1 steps either way
export function hslideScrambleMoves(P, count = Math.min(60, 10 + P.n), rand = Math.random) {
  const out = [];
  let last = -1;
  while (out.length < count) {
    const axis = Math.floor(rand() * P.rows.length), L = P.rows[axis].L;
    if ((axis === last && P.rows.length > 1) || L < 2) continue;
    const k = 1 + Math.floor(rand() * (L - 1));
    out.push({ axis, layer: 0, q: rand() < 0.5 ? k : -k });
    last = axis;
  }
  return out;
}
export const hslideStats = (P) => ({ pieces: P.n, rows: P.rows.length });

// ---- sliding, drawn: the band model of the disk, where the row's line through the middle square
// is the real axis and a slide along it is a sideways shift. The row is narrower at its squares'
// corners than at their middles, so squares moved rigidly would leave gaps: each is stretched
// across to the row's width where it lands (exact squares again at every whole step).
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const bands = new WeakMap();
function band(P) {
  if (bands.has(P.G)) return bands.get(P.G);
  const step = Mb.apply(P.Tg, [0, 0]), dir = [step[0] / Math.hypot(...step), step[1] / Math.hypot(...step)];
  const toBand = (z) => { const u = cmul(z, [dir[0], -dir[1]]), q = cdiv([1 + u[0], u[1]], [1 - u[0], -u[1]]); return [Math.log(Math.hypot(...q)) / Math.PI, Math.atan2(q[1], q[0]) / Math.PI]; };
  const fromBand = (w) => { const r = Math.exp(w[0] * Math.PI), e = [r * Math.cos(w[1] * Math.PI), r * Math.sin(w[1] * Math.PI)]; return cmul(cdiv([e[0] - 1, e[1]], [e[0] + 1, e[1]]), dir); };
  const X = toBand(step)[0];
  // the row's half width along it: the square's sides (the two edges the row doesn't cross), as
  // |y| against x in the band model, over one step
  const along = [0, 1, 2, 3].map((k) => Math.abs(Math.cos(Math.atan2(P.G.mids[k][1], P.G.mids[k][0]) - Math.atan2(dir[1], dir[0])))), sideK = along.indexOf(Math.min(...along));
  // (finely: the side is a straight line of the hyperbolic plane, from corner to corner)
  const p = P.G.corners[sideK], q = P.G.corners[(sideK + 1) % 4], w = Mb.apply(Mb.inv(Mb.to(p)), q);
  const side = Array.from({ length: 401 }, (_, i) => Mb.apply(Mb.to(p), [(w[0] * i) / 400, (w[1] * i) / 400])).map(toBand).map(([x, y]) => [x, Math.abs(y)]).sort((a, b) => a[0] - b[0]);
  const halfWidth = (x) => {
    x = mod(x + X / 2, X) - X / 2;
    for (let i = 1; i < side.length; i++) if (side[i][0] >= x) { const a = side[i - 1], b = side[i], f = (x - a[0]) / (b[0] - a[0] || 1); return a[1] + f * (b[1] - a[1]); }
    return side.at(-1)[1];
  };
  const b = { toBand, fromBand, X, halfWidth };
  bands.set(P.G, b);
  return b;
}
// a point of square 0's frame (on the row through it along the step), slid t steps along the row
export function slidePoint(P, w, t) {
  const { toBand, fromBand, X, halfWidth } = band(P), [x, y] = toBand(w), x2 = x + t * X;
  return fromBand([x2, (y * halfWidth(x2)) / halfWidth(x)]);
}
