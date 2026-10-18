// The Sierpinski puzzle (issue #26): the triangle cut n levels down into 3^n small ones, and the
// whole puzzle again inside each small one, so zooming in n times comes back to where it started.
// No drawing here; sierpinski-view.mjs draws it and index.html takes input.
//
// A small triangle's place is its address: n digits, each the third it's in at that level (0 the
// top, 1 the bottom left, 2 the bottom right). Corner j of a third is toward corner j of the
// triangle it's in, so turning a triangle a third of a turn (corner 0 to corner 1: counterclockwise)
// adds 1 to every digit below it.
//
// The moves, round each hole (the hole of the triangle at address p, k = p.length digits, any
// triangle but the smallest):
//   - its ring: the small triangles touching the hole (the third c, then no later digit c: along
//     that third's edge facing the hole), turned a third about the hole's middle;
//   - its whole triangle, turned the same way.
// And the zoom: every small triangle down a level, the smallest back to the top (the address
// shifted: d1 d2 … dn → d2 … dn d1). Zooming into any third is the same rearrangement (every third
// grows at once, sharing the smallest triangles), so it's one move; zooming n times is nothing.
//
// State: Int32Array, place → the small triangle there (its home address as a number). Moves are
// { axis, layer, q } as every puzzle's: axis i < holes.length is hole i, layer 0 its ring and 1 its
// triangle, q thirds of a turn (+ counterclockwise); the last axis is the zoom, q zooms in (−: out).
// Solved: as it started, up to zooming and turning the whole thing (as a solid's is up to turning
// it round), by colors: the small triangles two levels down are each a color, and the ones of a
// color can trade places.

const mod = (a, n) => ((a % n) + n) % n;

// (levels: how many levels down the small triangles are, and so how far down the puzzle holds
// itself: a stepper, as the sliding puzzles' width and height are)
export const SIER_LEVELS = { min: 2, max: 4 };
export const SIER_PRESETS = [{
  id: "sierpinski", name: "Sierpinski Zoom", rule: "sierpinski", size: 2, fixed: true, noCustom: true, levels: 3,
  params: [{ key: "levels", label: "levels", min: SIER_LEVELS.min, max: SIER_LEVELS.max, title: "how many levels down the small triangles are: the puzzle holds itself that far down, so zooming in that many times comes back round" }],
  title: (_, s) => `${s.levels}-level Sierpinski Zoom`,
}];

export function buildSier(spec, n = spec.levels) {
  n = Math.max(SIER_LEVELS.min, Math.min(SIER_LEVELS.max, n | 0));
  const N = 3 ** n, digits = (i) => { const d = []; for (let k = n - 1; k >= 0; k--) d.push(Math.floor(i / 3 ** k) % 3); return d; };
  const index = (d) => d.reduce((s, x) => s * 3 + x, 0);
  const addr = Array.from({ length: N }, (_, i) => digits(i));
  // every hole: the triangle's address (every triangle with thirds: k < n)
  const holes = [];
  for (let k = 0; k < n; k++) for (let i = 0; i < 3 ** k; i++) holes.push(digits(i).slice(n - k));
  const within = (p, d) => p.every((x, j) => d[j] === x);
  const inRing = (p, d) => { const c = d[p.length]; return within(p, d) && d.slice(p.length + 1).every((x) => x !== c); };
  // a turn of hole h's ring (layer 0) or triangle (1) by a third: place → place
  const turnPerm = (h, layer) => {
    const p = holes[h];
    return Int32Array.from({ length: N }, (_, i) => {
      const d = addr[i];
      if (!(layer ? within(p, d) : inRing(p, d))) return i;
      return index(d.map((x, j) => (j < p.length ? x : (x + 1) % 3)));
    });
  };
  const perms = holes.map((_, h) => [turnPerm(h, 0), turnPerm(h, 1)]);
  const zoom = Int32Array.from({ length: N }, (_, i) => index([...addr[i].slice(1), addr[i][0]]));
  // the axes: the holes, then the zoom
  const axes = [...holes.map((p, h) => ({ kind: "hole", p, depth: p.length, order: 3, layers: 2, h })), { kind: "zoom", order: n, layers: 1 }];
  const P = { kind: "sierpinski", spec: { ...spec, levels: n }, n, N, addr, index, holes, axes, perms, zoom, inRing, within };
  P.zoomAxis = axes.length - 1;
  // each small triangle's color: the triangle two levels down it's in (9 colors; on 2 levels, its own)
  P.colorOf = addr.map((d) => d[0] * 3 + d[1]);
  P.colors = 9;
  // the places a move carries (a set of places), for drawing a turn and lighting it
  P.moving = (axis, layer) => {
    const ax = axes[axis];
    if (ax.kind === "zoom") return addr.map((_, i) => i);
    const perm = perms[ax.h][layer];
    return addr.map((_, i) => i).filter((i) => perm[i] !== i);
  };
  return P;
}

export const solvedSierState = (P) => Int32Array.from({ length: P.N }, (_, i) => i);

// a move applied to a state (in place): the triangle at place i goes to place perm(i), q times
export function applySierMove(P, s, { axis, layer, q }) {
  const ax = P.axes[axis], perm = ax.kind === "zoom" ? P.zoom : P.perms[ax.h][layer];
  const times = mod(q, ax.order);
  for (let t = 0; t < times; t++) {
    const old = s.slice();
    for (let i = 0; i < P.N; i++) s[perm[i]] = old[i];
  }
  return s;
}
export const inverseSierMove = (P, m) => ({ ...m, q: -m.q });

// solved: by colors, as some zoom of the start turned some way as a whole
export function isSierSolved(P, s) {
  const want = solvedSierState(P);
  for (let z = 0; z < P.n; z++) {
    for (let r = 0; r < 3; r++) {
      if (s.every((t, i) => P.colorOf[t] === P.colorOf[want[i]])) return true;
      applySierMove(P, want, { axis: 0, layer: 1, q: 1 }); // (hole 0's triangle: the whole thing)
    }
    applySierMove(P, want, { axis: P.zoomAxis, layer: 0, q: 1 });
  }
  return false;
}

// random turns, rings and triangles both, every so often a zoom (so the turns reach every depth's
// copies); never the same hole twice running, nor the whole thing turned (that's no change)
export function sierScrambleMoves(P, count = 12 + 6 * P.n, rand = Math.random) {
  const moves = [];
  let last = -1;
  while (moves.length < count) {
    if (moves.length && rand() < 0.2) { moves.push({ axis: P.zoomAxis, layer: 0, q: rand() < 0.5 ? 1 : -1 }); last = -1; continue; }
    const h = Math.floor(rand() * P.holes.length), layer = h === 0 ? 0 : rand() < 0.5 ? 0 : 1;
    if (h === last) continue;
    moves.push({ axis: h, layer, q: rand() < 0.5 ? 1 : -1 });
    last = h;
  }
  return moves;
}

// the places a move carries (an animation turns these)
export const sierPiecesInLayer = (P, axis, layer) => P.moving(axis, layer);

// how many triangles; how many colors
export const sierStats = (P) => ({ pieces: P.N, colors: P.colors });
