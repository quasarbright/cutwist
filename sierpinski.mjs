// The Sierpinski puzzle (issue #26): every triangle of the Sierpinski triangle, L levels down, is a
// piece: the whole one, its three thirds, their ninths, and so on (on 4 levels, 1 + 3 + 9 + 27 = 40).
// Each is drawn with its thirds over it, so what shows of it is a band round them and its middle.
// The puzzle holds itself: each smallest triangle's three thirds are the whole puzzle again (copies,
// as the tori show copies of their patch round it: the same pieces, so every turn shows in every
// copy), the copies holding copies, forever. Zooming is the camera only (sierpinski-view.mjs): in
// through a copy, the view is where it started. No drawing here; index.html takes input.
//
// A triangle's place is its address: a digit per level, the third it's in (0 the top, 1 the bottom
// left, 2 the bottom right); the whole is the empty address. Corner j of a third is toward corner j
// of its triangle, so turning a triangle a third of a turn (corner 0 toward corner 1: counterclockwise)
// adds 1 to every digit below it.
//
// The turns, each about a triangle p's middle, a third of a turn, carrying everything inside what
// it takes with it (so a piece never changes level):
//   - p's ring (the whole's, a third's: any triangle three or more levels above the smallest, whose
//     ring is pieces, not copies): the six triangles two levels in touching its middle (p c x, x
//     not c); its thirds stay;
//   - p turned whole (any triangle with thirds): everything in it.
// A piece faces some way (0 to 2: a third of a turn each), which only shows on the smallest: their
// copies are turned that way.
//
// State: Int32Array, place → piece * 3 + facing (the piece: its home place's index). Moves are
// { axis, layer, q } as every puzzle's: axis h is triangle holes[h], layer 0 its ring, 1 it turned
// whole, q thirds of a turn (+ counterclockwise). Solved: every piece home and the smallest facing
// up, up to turning the whole (as a solid's is up to turning it round).

const mod = (a, n) => ((a % n) + n) % n;

// (levels: how many levels of pieces, the whole one the first)
export const SIER_LEVELS = { min: 3, max: 4 };
export const SIER_PRESETS = [{
  id: "sierpinski", name: "Sierpinski Zoom", rule: "sierpinski", size: 2, fixed: true, noCustom: true, levels: 4,
  params: [{ key: "levels", label: "levels", min: SIER_LEVELS.min, max: SIER_LEVELS.max, title: "how many levels of pieces, the whole one the first; past the smallest, the puzzle again" }],
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
  // a turn about triangle p, a third: every digit after p + 1, on the places inside p `take` picks
  // (given what's after p); self: p too (in place, turning)
  const turn = (p, take, self = false) => {
    const to = Int32Array.from(addr, (a, i) => (a.length > p.length && within(p, a) && take(a.slice(p.length)) ? index(a.map((x, j) => (j < p.length ? x : (x + 1) % 3))) : i));
    const turns = Uint8Array.from(addr, (a, i) => (to[i] !== i || (self && a.length === p.length && within(p, a)) ? 1 : 0));
    return { to, turns };
  };
  // (by level: the whole first, then the thirds, axes 1 to 3)
  const holes = addr.filter((a) => a.length < L - 1).sort((a, b) => a.length - b.length);
  const axes = holes.map((p, h) => ({ kind: "hole", p, depth: p.length, order: 3, layers: 2, ring: p.length <= L - 3, h }));
  const perms = holes.map((p) => [p.length <= L - 3 ? turn(p, (r) => r.length >= 2 && r[1] !== r[0]) : null, turn(p, () => true, true)]);
  const P = { kind: "sierpinski", spec: { ...spec, levels: L }, L, n: L, N, addr, index, within, holes, axes, perms };
  P.middles = holes;
  P.smallest = Uint8Array.from(addr, (a) => (a.length === L - 1 ? 1 : 0));
  // each triangle's color (sierpinski-view.mjs's palette of 13): the whole white, the thirds 3, the
  // ninths 9, and smaller ones the color of the third they're the corner of (so each three of them
  // is a copy of the thirds)
  P.colorOf = addr.map((a) => (!a.length ? 0 : a.length === 1 ? 1 + a[0] : a.length === 2 ? 4 + a[0] * 3 + a[1] : 1 + a.at(-1)));
  P.colors = 13;
  // (textures off to start, though there are 13 colors: they're on from 13 elsewhere for colors
  // that look alike, and these were picked not to)
  P.texturesByDefault = false;
  // the places a move carries (turning: a ring's, or a triangle's, it too)
  P.moving = (axis, layer) => { const m = perms[axis][layer]; return m ? addr.map((_, i) => i).filter((i) => m.turns[i]) : []; };
  return P;
}

export const solvedSierState = (P) => Int32Array.from({ length: P.N }, (_, i) => 3 * i);

// a move applied to a state (in place): what's at place i goes to place to[i], a third more turned, q times
export function applySierMove(P, s, { axis, layer, q }) {
  const m = P.perms[axis][layer];
  if (!m) return s;
  for (let t = 0; t < mod(q, 3); t++) {
    const old = s.slice();
    for (let i = 0; i < P.N; i++) if (m.turns[i]) s[m.to[i]] = old[i] - (old[i] % 3) + ((old[i] + 1) % 3);
  }
  return s;
}
export const inverseSierMove = (P, m) => ({ ...m, q: -m.q });

// solved: every piece home, and the smallest facing the way the whole does (copies the right way
// up), the whole turned any way
export function isSierSolved(P, s) {
  let want = solvedSierState(P);
  for (let r = 0; r < 3; r++) {
    if (s.every((v, i) => Math.floor(v / 3) === Math.floor(want[i] / 3) && (!P.smallest[i] || v % 3 === want[i] % 3))) return true;
    want = applySierMove(P, want, { axis: 0, layer: 1, q: 1 });
  }
  return false;
}

// random rings and turns, never the same triangle twice running, nor the whole turned (that's no change)
export function sierScrambleMoves(P, count = 12 + 6 * P.L, rand = Math.random) {
  const moves = [], rings = P.axes.filter((a) => a.ring).map((a) => a.h), turns = P.axes.filter((a) => a.depth > 0).map((a) => a.h);
  let last = -1;
  while (moves.length < count) {
    const ring = rand() < 0.55, list = ring ? rings : turns, axis = list[Math.floor(rand() * list.length)];
    if (axis === last) continue;
    moves.push({ axis, layer: ring ? 0 : 1, q: rand() < 0.5 ? 1 : -1 });
    last = axis;
  }
  return moves;
}

export const sierStats = (P) => ({ pieces: P.N, colors: P.colors });
