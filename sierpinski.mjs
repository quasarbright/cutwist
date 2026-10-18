// The Sierpinski puzzle (issue #26): every triangle of the Sierpinski triangle, L levels down, is a
// piece: the whole one, its three thirds, their ninths, and so on (on 4 levels, 1 + 3 + 9 + 27 = 40).
// Each is drawn with its thirds over it, so what shows of it is its middle (and, drawn with margins, a
// band round the outside). Zooming into a third makes it the whole, and the rest of the puzzle comes
// back in as the smallest triangles: the puzzle holds itself, and zooming into a third L times is
// where it started. No drawing here; sierpinski-view.mjs draws it and index.html takes input.
//
// A triangle's place is its address: a digit per level, the third it's in (0 the top, 1 the bottom
// left, 2 the bottom right); the whole is the empty address. Corner j of a third is toward corner j
// of its triangle, so turning a triangle a third of a turn (corner 0 toward corner 1: counterclockwise)
// adds 1 to every digit below it.
//
// The moves:
//   - a ring (round the middle of the whole or a third, or any triangle two levels above the
//     smallest): the six triangles two levels inside it that touch its middle (p c x, x not c: each
//     third's two facing the middle), everything inside them with them, turned a third about the
//     middle (its thirds stay);
//   - a third, or the whole, turned as a whole (everything inside it with it);
//   - a zoom into a third, in or out. A triangle as a column of L digits mod 3, its address then a 1
//     then 0s (up to sign: scaled so its last nonzero digit is 1); zooming into the top third shifts
//     the column up a place (the top third's triangles each up a level, the rest down into the
//     smallest places), and into another third the same with the puzzle turned. L zooms into a third
//     are nothing.
//
// State: Int32Array, place → the triangle there (its home place's index). Moves are { axis, layer, q }
// as every puzzle's: axis h < holes.length is hole h's triangle, layer 0 its ring and layer 1 (the
// whole and the thirds) its turn, q thirds of a turn (+ counterclockwise); the last three axes are the
// zooms into thirds 0, 1 and 2, q zooms (−: out). Solved: every triangle home, up to turning the whole.

const mod = (a, n) => ((a % n) + n) % n;

// (levels: how many levels of triangles, the whole one the first; zooming in that many times on a
// third comes back round)
export const SIER_LEVELS = { min: 3, max: 4 };
export const SIER_PRESETS = [{
  id: "sierpinski", name: "Sierpinski Zoom", rule: "sierpinski", size: 2, fixed: true, noCustom: true, levels: 4,
  params: [{ key: "levels", label: "levels", min: SIER_LEVELS.min, max: SIER_LEVELS.max, title: "how many levels of triangles, the whole one the first: zooming into a third that many times comes back round" }],
  title: (_, s) => `${s.levels}-level Sierpinski Zoom`,
}];

export function buildSier(spec, L = spec.levels) {
  L = Math.max(SIER_LEVELS.min, Math.min(SIER_LEVELS.max, L | 0));
  const addr = [];
  const walk = (a) => { addr.push(a); if (a.length < L - 1) for (let d = 0; d < 3; d++) walk([...a, d]); };
  walk([]);
  const N = addr.length, key = (a) => a.join(""), at = new Map(addr.map((a, i) => [key(a), i]));
  const index = (a) => at.get(key(a));
  const within = (p, a) => a.length >= p.length && p.every((x, j) => a[j] === x);
  // a turn about triangle p, a third: every digit after p + 1, on the triangles inside p `take` picks
  // (given what's after p)
  const turn = (p, take) => Int32Array.from(addr, (a, i) => (a.length > p.length && within(p, a) && take(a.slice(p.length)) ? index(a.map((x, j) => (j < p.length ? x : (x + 1) % 3))) : i));
  const ring = (p) => turn(p, (r) => r.length >= 2 && r[1] !== r[0]);
  const whole = (p) => turn(p, () => true);
  // zooms: see the top
  const fromColumn = (w) => { let j = w.length - 1; while (!w[j]) j--; const s = w[j] === 1 ? 1 : 2; return w.slice(0, j).map((x) => (x * s) % 3); };
  const zoom0 = (a) => { const v = [...a, 1, ...Array(L - 1 - a.length).fill(0)]; return fromColumn([...v.slice(1), v[0]]); };
  const spin = (a, c) => a.map((x) => mod(x + c, 3));
  const zoomPerm = (c) => Int32Array.from(addr, (a) => index(spin(zoom0(spin(a, -c)), c)));
  // the middles (every triangle with thirds: a tap there zooms in on it), by level, the whole's first;
  // and the turns' triangles: those with a ring, or the whole and the thirds (turned as a whole:
  // axes 0 to 3; a third's ring is empty on 3 levels, ring: false)
  const middles = addr.filter((a) => a.length < L - 1).sort((a, b) => a.length - b.length);
  const holes = middles.filter((a) => a.length <= Math.max(1, L - 3));
  const axes = [
    ...holes.map((p, h) => ({ kind: "hole", p, depth: p.length, order: 3, layers: p.length <= 1 ? 2 : 1, ring: p.length <= L - 3, h })),
    ...[0, 1, 2].map((c) => ({ kind: "zoom", c, order: L, layers: 1 })),
  ];
  const perms = axes.map((ax) => (ax.kind === "zoom" ? [zoomPerm(ax.c)] : [ring(ax.p), ...(ax.layers > 1 ? [whole(ax.p)] : [])]));
  const P = { kind: "sierpinski", spec: { ...spec, levels: L }, L, n: L, N, addr, index, within, middles, holes, axes, perms };
  P.zoomAxes = [0, 1, 2].map((c) => axes.length - 3 + c);
  // each triangle's color (sierpinski-view.mjs's palette of 13): the whole white, the thirds 3, the
  // ninths 9, and smaller ones the color of the third they're the corner of (so each three of them
  // is a copy of the thirds)
  P.colorOf = addr.map((a) => (!a.length ? 0 : a.length === 1 ? 1 + a[0] : a.length === 2 ? 4 + a[0] * 3 + a[1] : 1 + a.at(-1)));
  P.colors = 13;
  // (textures off to start, though there are 13 colors: they're on from 13 elsewhere for colors
  // that look alike, and these were picked not to)
  P.texturesByDefault = false;
  // the places a move carries: a ring's, a turned triangle's (it too, turning in place), or a zoom's (all)
  P.moving = (axis, layer) => {
    const ax = axes[axis];
    if (ax.kind === "zoom") return addr.map((_, i) => i);
    const perm = perms[axis][layer], out = addr.map((_, i) => i).filter((i) => perm[i] !== i);
    return layer ? [index(ax.p), ...out] : out;
  };
  return P;
}

export const solvedSierState = (P) => Int32Array.from({ length: P.N }, (_, i) => i);

// a move applied to a state (in place): the triangle at place i goes to place perm(i), q times
export function applySierMove(P, s, { axis, layer, q }) {
  const ax = P.axes[axis], perm = P.perms[axis][ax.kind === "zoom" ? 0 : layer];
  for (let t = 0; t < mod(q, ax.order); t++) {
    const old = s.slice();
    for (let i = 0; i < P.N; i++) s[perm[i]] = old[i];
  }
  return s;
}
export const inverseSierMove = (P, m) => ({ ...m, q: -m.q });

// solved: every triangle home, the whole turned any way (as a solid's is up to turning it round)
export function isSierSolved(P, s) {
  const want = solvedSierState(P);
  for (let r = 0; r < 3; r++) {
    if (s.every((t, i) => t === want[i])) return true;
    applySierMove(P, want, { axis: 0, layer: 1, q: 1 });
  }
  return false;
}

// random rings, third turns and zooms (the zooms so the rings reach every level); never the same
// axis twice running, nor the whole turned (that's no change)
export function sierScrambleMoves(P, count = 10 + 6 * P.L, rand = Math.random) {
  const moves = [];
  let last = -1;
  while (moves.length < count) {
    const r = rand(), q = rand() < 0.5 ? 1 : -1;
    let m;
    if (r < 0.2) m = { axis: P.zoomAxes[Math.floor(rand() * 3)], layer: 0, q };
    else if (r < 0.4) m = { axis: 1 + Math.floor(rand() * 3), layer: 1, q }; // (the thirds: axes 1 to 3)
    else { const rings = P.axes.filter((a) => a.ring); m = { axis: P.axes.indexOf(rings[Math.floor(rand() * rings.length)]), layer: 0, q }; }
    if (m.axis === last) continue;
    moves.push(m);
    last = m.axis;
  }
  return moves;
}

// how many triangles; how many colors
export const sierStats = (P) => ({ pieces: P.N, colors: P.colors });
