// The Sierpinski puzzle (issue #26): every triangle of the Sierpinski triangle, L levels down, is a
// piece: the whole one, its three thirds, their ninths, and so on (on 4 levels, 1 + 3 + 9 + 27 = 40).
// Each is drawn with its thirds over it, so what shows of it is a band round them and its middle.
// The puzzle holds itself: each smallest triangle's three corners (its thirds, one level past the
// pieces) each show a copy of some triangle of the puzzle, turned some way (copies, as the tori show
// copies of their patch round it: the same pieces, so every turn shows in every copy), the copies
// holding copies, forever. Solved, on 3 or 4 levels each corner shows the whole; on 2, a third's
// corners show the rest of the puzzle where it is, the whole in its own place (the top third's: the
// whole at its top, the bottom left and right thirds at theirs). Zooming is the camera only
// (sierpinski-view.mjs): in through a copy, the view is that triangle. No drawing here; index.html
// takes input.
//
// A triangle's place is its address: a digit per level, the third it's in (0 the top, 1 the bottom
// left, 2 the bottom right); the whole is the empty address. Corner j of a third is toward corner j
// of its triangle, so turning a triangle a third of a turn (corner 0 toward corner 1: counterclockwise)
// adds 1 to every digit below it. A smallest triangle's corners have addresses one digit longer.
//
// The turns, each about a triangle p's middle, a third of a turn, carrying everything inside what
// it takes with it (so a piece never changes level):
//   - p's ring (the whole's, a third's: any triangle three or more levels above the smallest, whose
//     ring is pieces; and on 2 levels the whole's, whose ring is the corners touching its middle):
//     the six triangles two levels in touching its middle (p c x, x not c); its thirds stay;
//   - p turned whole (any triangle with thirds, and on 2 levels the thirds too): everything in it.
// A corner carried along keeps showing what it showed, turned with it; unless what it shows is
// inside what turned (the whole, when the whole turns), which turned with it too.
//
// State: Int32Array: place → piece * 3 + facing (the piece: its home place's index; the facing
// doesn't show: a smallest one's way shows in its corners), then each smallest place's three corners
// (P.slot(place, corner)) → the place it shows * 3 + how far turned. Moves are { axis, layer, q } as
// every puzzle's: axis h is triangle holes[h], layer 0 its ring, 1 it turned whole, q thirds of a
// turn (+ counterclockwise). Solved: every piece home and every corner as it starts, up to turning
// the whole (as a solid's is up to turning it round).

const mod = (a, n) => ((a % n) + n) % n;

// (levels: how many levels of pieces, the whole one the first)
export const SIER_LEVELS = { min: 2, max: 4 };
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
  const N = addr.length, small = addr.map((_, i) => i).filter((i) => addr[i].length === L - 1);
  // (after the places, the smallest ones' corners, three each)
  const all = [...addr, ...small.flatMap((i) => [0, 1, 2].map((c) => [...addr[i], c]))];
  const key = (a) => a.join(""), at = new Map(all.map((a, i) => [key(a), i]));
  const index = (a) => at.get(key(a));
  const slotOf = new Map(small.map((i, r) => [i, N + 3 * r]));
  const slot = (i, c) => slotOf.get(i) + c;
  const within = (p, a) => a.length >= p.length && p.every((x, j) => a[j] === x);
  // a turn about triangle p, a third: every digit after p + 1, on the places (and corners) inside p
  // `take` picks (given what's after p); self: p too (in place, turning)
  const turn = (p, take, self = false) => {
    const to = Int32Array.from(all, (a, i) => (a.length > p.length && within(p, a) && take(a.slice(p.length)) ? index(a.map((x, j) => (j < p.length ? x : (x + 1) % 3))) : i));
    const turns = Uint8Array.from(all, (a, i) => (to[i] !== i || (self && a.length === p.length && within(p, a)) ? 1 : 0));
    return { to, turns, list: all.map((_, i) => i).filter((i) => turns[i]) };
  };
  // (by level: the whole first, then the thirds, axes 1 to 3; on 2 levels, which would have only the
  // whole turned otherwise, the thirds turn too and the whole's ring takes their corners)
  const holes = addr.filter((a) => a.length < L - 1 || L === 2).sort((a, b) => a.length - b.length);
  const ringAt = (p) => p.length <= Math.max(0, L - 3);
  const axes = holes.map((p, h) => ({ kind: "hole", p, depth: p.length, order: 3, layers: 2, ring: ringAt(p), h }));
  const perms = holes.map((p) => [ringAt(p) ? turn(p, (r) => r.length >= 2 && r[1] !== r[0]) : null, turn(p, () => true, true)]);
  const P = { kind: "sierpinski", spec: { ...spec, levels: L }, L, n: L, N, addr, index, within, slot, holes, axes, perms };
  P.middles = holes;
  P.smallest = Uint8Array.from(addr, (a) => (a.length === L - 1 ? 1 : 0));
  // the solved state: each piece home; each corner the whole, or on 2 levels the rest of the puzzle
  P.home = new Int32Array(all.length);
  for (let i = 0; i < N; i++) P.home[i] = 3 * i;
  for (const i of small) for (let c = 0; c < 3; c++) P.home[slot(i, c)] = L === 2 && c !== addr[i][0] ? 3 * index([c]) : 0;
  // each triangle's color (sierpinski-view.mjs's palette of 13): the whole white, the thirds 3, the
  // ninths 9, and smaller ones the color of the third they're the corner of (so each three of them
  // is a copy of the thirds)
  P.colorOf = addr.map((a) => (!a.length ? 0 : a.length === 1 ? 1 + a[0] : a.length === 2 ? 4 + a[0] * 3 + a[1] : 1 + a.at(-1)));
  P.colors = L === 2 ? 4 : 13;
  // (textures off to start, though there are 13 colors: they're on from 13 elsewhere for colors
  // that look alike, and these were picked not to)
  P.texturesByDefault = false;
  // what a move carries (turning: a ring's, or a triangle's, it too): places, and corners
  P.moving = (axis, layer) => { const m = perms[axis][layer]; return m ? m.list.slice() : []; };
  return P;
}

export const solvedSierState = (P) => P.home.slice();

// a move applied to a state (in place), q times: what's at place i goes to place to[i], a third more
// turned; a corner's copy too, unless it's of a place that turned (then of where that went, as turned
// as it was: they turned together)
export function applySierMove(P, s, { axis, layer, q }) {
  const m = P.perms[axis][layer];
  if (!m) return s;
  for (let t = 0; t < mod(q, 3); t++) {
    const old = s.slice();
    for (const i of m.list) {
      const v = old[i], of = Math.floor(v / 3);
      s[m.to[i]] = i >= P.N && m.turns[of] ? 3 * m.to[of] + (v % 3) : v - (v % 3) + ((v + 1) % 3);
    }
  }
  return s;
}
export const inverseSierMove = (P, m) => ({ ...m, q: -m.q });

// solved: every piece home, and every corner showing what it started with, the way it started (the
// whole turned any way: that leaves the corners as they were)
export function isSierSolved(P, s) {
  let want = solvedSierState(P);
  for (let r = 0; r < 3; r++) {
    if (s.every((v, i) => (i < P.N ? Math.floor(v / 3) === Math.floor(want[i] / 3) : v === want[i]))) return true;
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
