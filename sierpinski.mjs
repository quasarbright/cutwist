// The Sierpinski puzzle (issue #26): a Sierpinski triangle with no bottom. Every triangle in it,
// however deep, is one of the puzzle's pieces (on L levels, as many as a Sierpinski triangle L
// levels deep has: 1 + 3 + 9 + 27 = 40 on 4), and each piece says which piece is in each of its
// three corners, and turned how. So the picture is what grows from the whole by following those,
// forever, and a piece shows up in many places: wherever it's in some piece's corner. A turn
// changes a piece, so it shows wherever that piece does (as the tori's copies turn together).
// Zooming is the camera only (sierpinski-view.mjs). No drawing here; index.html takes input.
//
// A piece's name is its address at the start: a digit per level (0 the top third, 1 the bottom
// left, 2 the bottom right; the whole the empty address). To start, each piece's corners hold its
// thirds as a Sierpinski triangle's do; the smallest ones' hold the rest of the puzzle round them:
// their two neighbors, and the whole in their own corner (the top third's top ninth's: the whole at
// its top, the ninths left and right of it at theirs). Corner k of a piece is toward its corner k;
// turning a triangle a third of a turn counterclockwise takes corner k to corner k + 1.
//
// The turns, each about a piece's middle, a third of a turn, everywhere it shows:
//   - the piece turned (layer 1): its corners go round, each turned a third with it;
//   - its ring (layer 0): of the pieces in its corners, the two corners of each touching its middle
//     (six), go round it, a third turned. Only when its corners hold three different pieces, none of
//     them itself (else the six aren't six, or the ring changes what it goes round, and turning it
//     back wouldn't undo it).
//
// State: Int32Array, 3 per piece: piece * 3 + corner k → what's there * 3 + how far it's turned
// (thirds, counterclockwise, from the way the piece faces). Moves are { axis, layer, q } as every
// puzzle's: axis h is piece holes[h] (by level: the whole first, then the thirds), q thirds of a
// turn (+ counterclockwise). Solved: every corner as it started.

const mod = (a, n) => ((a % n) + n) % n;

// (levels: how many levels of pieces, the whole one the first)
export const SIER_LEVELS = { min: 2, max: 4 };
export const SIER_PRESETS = [{
  id: "sierpinski", name: "Sierpinski Zoom", rule: "sierpinski", size: 2, fixed: true, noCustom: true, levels: 4,
  params: [{ key: "levels", label: "levels", min: SIER_LEVELS.min, max: SIER_LEVELS.max, title: "how many pieces: as many as a Sierpinski triangle that many levels deep has" }],
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
  // (by level: the whole first, then the thirds, axes 1 to 3)
  const holes = addr.slice().sort((a, b) => a.length - b.length);
  const axes = holes.map((p, h) => ({ kind: "hole", p, depth: p.length, order: 3, layers: 2, ring: true, h }));
  const P = { kind: "sierpinski", spec: { ...spec, levels: L }, L, n: L, N, addr, index, within, holes, axes };
  P.middles = holes;
  P.nodeOf = holes.map((p) => index(p));
  P.axisAt = Int32Array.from(addr, (a) => holes.findIndex((p) => key(p) === key(a)));
  P.home = new Int32Array(3 * N);
  addr.forEach((a, n) => {
    for (let k = 0; k < 3; k++) P.home[3 * n + k] = 3 * (a.length < L - 1 ? index([...a, k]) : k === a.at(-1) ? 0 : index([...a.slice(0, -1), k]));
  });
  // each piece's color (sierpinski-view.mjs's palette of 13): the whole white, the thirds 3, the
  // ninths 9, and smaller ones the color of the third they're the corner of
  P.colorOf = addr.map((a) => (!a.length ? 0 : a.length === 1 ? 1 + a[0] : a.length === 2 ? 4 + a[0] * 3 + a[1] : 1 + a.at(-1)));
  P.colors = L === 2 ? 4 : 13;
  // (textures off to start, though there are 13 colors: they're on from 13 elsewhere for colors
  // that look alike, and these were picked not to)
  P.texturesByDefault = false;
  // whether piece n's ring is a move now
  P.canRing = (s, n) => { const a = Math.floor(s[3 * n] / 3), b = Math.floor(s[3 * n + 1] / 3), c = Math.floor(s[3 * n + 2] / 3); return a !== b && b !== c && a !== c && a !== n && b !== n && c !== n; };
  // the corners a move changes, in state s (a ring that isn't a move: none)
  P.moving = (axis, layer, s) => {
    const n = P.nodeOf[axis];
    if (layer) return [3 * n, 3 * n + 1, 3 * n + 2];
    return P.canRing(s, n) ? ringSlots(s, n).map(([from]) => from) : [];
  };
  return P;
}

// a ring of piece n in state s, a third counterclockwise: [from, to, by] for each of the six
// corners (state indices), the turn added to what's there
function ringSlots(s, n) {
  const kid = [0, 1, 2].map((k) => Math.floor(s[3 * n + k] / 3)), turn = [0, 1, 2].map((k) => s[3 * n + k] % 3), out = [];
  // (the corner of the piece in n's corner k that's at n's corner x, x not k: its own corner x − turn)
  for (let k = 0; k < 3; k++) for (let x = 0; x < 3; x++) {
    if (x === k) continue;
    const k2 = (k + 1) % 3;
    out.push([3 * kid[k] + mod(x - turn[k], 3), 3 * kid[k2] + mod(x + 1 - turn[k2], 3), mod(turn[k] + 1 - turn[k2], 3)]);
  }
  return out;
}
export { ringSlots as sierRingSlots };

export const solvedSierState = (P) => P.home.slice();

const turnedBy = (v, t) => v - (v % 3) + mod((v % 3) + t, 3);
// a move applied to a state (in place), q thirds; a ring that isn't a move now does nothing
export function applySierMove(P, s, { axis, layer, q }) {
  const n = P.nodeOf[axis];
  for (let t = 0; t < mod(q, 3); t++) {
    if (layer) { const a = s[3 * n], b = s[3 * n + 1], c = s[3 * n + 2]; s[3 * n + 1] = turnedBy(a, 1); s[3 * n + 2] = turnedBy(b, 1); s[3 * n] = turnedBy(c, 1); continue; }
    if (!P.canRing(s, n)) return s;
    const moves = ringSlots(s, n), old = moves.map(([from]) => s[from]);
    moves.forEach(([, to, by], i) => { s[to] = turnedBy(old[i], by); });
  }
  return s;
}
export const inverseSierMove = (P, m) => ({ ...m, q: -m.q });

export const isSierSolved = (P, s) => s.every((v, i) => v === P.home[i]);

// random rings and turns from state `from`, never the same piece twice running, a ring only where
// it's a move by then
export function sierScrambleMoves(P, count = 12 + 6 * P.L, rand = Math.random, from = P.home) {
  const moves = [], s = from.slice();
  let last = -1;
  while (moves.length < count) {
    const axis = Math.floor(rand() * P.axes.length), ring = rand() < 0.55 && P.canRing(s, P.nodeOf[axis]);
    if (axis === last) continue;
    const m = { axis, layer: ring ? 0 : 1, q: rand() < 0.5 ? 1 : -1 };
    applySierMove(P, s, m);
    moves.push(m);
    last = axis;
  }
  return moves;
}

export const sierStats = (P) => ({ pieces: P.N, colors: P.colors });
