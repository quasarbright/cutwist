// Intersecting circles puzzles (issue #17): families of concentric circles drawn in the plane,
// overlapping like a Venn diagram. Every point where two circles cross is a sticker, colored
// by the two families that cross there (all of a pair's crossings share a color). A turn
// runs along one circle, moving every sticker on it to the next crossing along. No drawing
// here; circles-view.mjs draws the flat picture and index.html the sphere.
//
// State: one Int32Array, point index → the point whose sticker is there now (its home).
// Solved: every point shows its own color (stickers of a color can't be told apart).
//
// A move is { axis, layer, q }: circle `layer` of family `axis`, moved q crossings clockwise
// as drawn flat (negative: counterclockwise), the same shape as the other puzzles' moves, so
// the undo history and algorithms work unchanged.

const TAU = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;

// The preset: `families` families spaced evenly around a ring, `rings` circles in each.
export const CIRCLES_PRESETS = [{
  id: "circles", name: "Intersecting Circles", rule: "circles", size: 2, fixed: true, noCustom: true,
  families: 3, rings: 2,
  params: [
    { key: "families", label: "families", min: 2, max: 6, title: "how many families of circles overlap" },
    { key: "rings", label: "circles per family", min: 1, max: 5, title: "how many circles each family has, one inside another around the same center" },
  ],
  title: (n, s) => `${s.families} families of ${s.rings} circle${s.rings === 1 ? "" : "s"}`,
}];

// The preset's drawing: family centers on a circle of radius 1, every circle big enough to
// hold the middle (so every two from different families cross). The innermost circles cross
// at right angles, so with one circle each, three families are a cube's three middle slices
// on the sphere. Rings step outward by a gap that keeps neighbors crossing, chosen so no two
// crossings land on (or nearly on) the same spot.
export function presetCircles(families, rings) {
  const N = families, k = rings;
  const r0 = Math.sqrt(1.5), dMin = N === 2 ? 2 : 2 * Math.sin(Math.PI / N);
  const gMax = k > 1 ? Math.min(0.35, (0.8 * dMin) / (k - 1)) : 0;
  const make = (g) => {
    const out = [];
    for (let f = 0; f < N; f++) {
      const a = (TAU * f) / N - Math.PI / 2 - Math.PI / N; // (three: two on top, one under)
      for (let j = 0; j < k; j++) out.push({ family: f, ring: j, c: [Math.cos(a), Math.sin(a)], r: r0 + j * g });
    }
    return out;
  };
  if (k === 1) return make(0);
  let best = null, bestGap = -1;
  for (let t = 0; t < 24; t++) {
    const circles = make(gMax * (1 - t / 48));
    const gap = minPointGap(crossings(circles).map((p) => p.at));
    if (gap > 0.06) return circles;
    if (gap > bestGap) { best = circles; bestGap = gap; }
  }
  return best;
}

function minPointGap(pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  return m;
}

// Where two circles cross: two points, one when they touch, none otherwise.
export function circleCrossings(a, b) {
  const dx = b.c[0] - a.c[0], dy = b.c[1] - a.c[1], d = Math.hypot(dx, dy);
  if (d < 1e-12 || d > a.r + b.r + 1e-12 || d < Math.abs(a.r - b.r) - 1e-12) return [];
  const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d), h2 = a.r * a.r - x * x;
  const mx = a.c[0] + (dx * x) / d, my = a.c[1] + (dy * x) / d;
  if (h2 <= 1e-18) return [[mx, my]];
  const h = Math.sqrt(h2);
  return [[mx - (dy * h) / d, my + (dx * h) / d], [mx + (dy * h) / d, my - (dx * h) / d]];
}

// Every crossing of circles from different families, crossings at the same spot merged:
// [{ at: [x, y], circles: [circle indices] }]
function crossings(circles) {
  const pts = [], eps = 1e-7;
  for (let i = 0; i < circles.length; i++)
    for (let j = i + 1; j < circles.length; j++) {
      if (circles[i].family === circles[j].family) continue;
      for (const at of circleCrossings(circles[i], circles[j])) {
        const same = pts.find((p) => Math.hypot(p.at[0] - at[0], p.at[1] - at[1]) < eps);
        if (!same) pts.push({ at, circles: [i, j] });
        else for (const c of [i, j]) if (!same.circles.includes(c)) same.circles.push(c);
      }
    }
  return pts;
}

// A point's angle around a circle's center, on screen (y down): increasing is clockwise.
const angleOn = (c, at) => Math.atan2(at[1] - c.c[1], at[0] - c.c[0]);

// spec: a preset ({ families, rings }), or one with its own circles ({ circles: [{ family,
// ring, c, r }] }, for drawing your own later)
export function buildCircles(spec) {
  const circles = spec.circles || presetCircles(spec.families, spec.rings);
  const found = crossings(circles);
  const famCount = Math.max(...circles.map((c) => c.family)) + 1;
  // the color of each pair of families, a < b: numbered in order (0,1), (0,2), … (1,2), …
  const pairColor = (a, b) => a * famCount - (a * (a + 1)) / 2 + (b - a - 1);
  const points = found.map((p) => {
    const fams = [...new Set(p.circles.map((c) => circles[c].family))].sort((a, b) => a - b);
    return { at: p.at, circles: p.circles, color: pairColor(fams[0], fams[1]) };
  });
  // each circle's points in order clockwise from its rightmost, and their angles
  const cycles = circles.map((c, ci) => {
    const on = points.flatMap((p, i) => (p.circles.includes(ci) ? [i] : []));
    return on.map((i) => ({ i, a: mod(angleOn(c, points[i].at), TAU) })).sort((x, y) => x.a - y.a);
  });
  // circleOf[family][ring]: the circle's index
  const circleOf = [];
  circles.forEach((c, i) => { (circleOf[c.family] ??= [])[c.ring] = i; });
  return {
    kind: "circles", spec, circles, points, cycles, circleOf, n: points.length,
    families: famCount, colors: (famCount * (famCount - 1)) / 2,
  };
}

export const circleIndex = (P, { axis, layer }) => P.circleOf[axis][layer];

export const solvedCirclesState = (P) => Int32Array.from({ length: P.n }, (_, i) => i);
// solved when every point shows its own color, wherever that sticker came from
export const isCirclesSolved = (P, s) => s.every((v, i) => P.points[v].color === P.points[i].color);
export const inverseCirclesMove = (P, m) => ({ ...m, q: -m.q });

export function applyCirclesMove(P, s, m) {
  const cyc = P.cycles[circleIndex(P, m)], L = cyc.length;
  if (!L) return;
  const old = cyc.map((p) => s[p.i]);
  for (let k = 0; k < L; k++) s[cyc[mod(k + m.q, L)].i] = old[k];
}

// Random turns, never the same circle twice in a row, each 1 to L−1 crossings either way.
export function circlesScrambleMoves(P, count = 10 + 3 * P.circles.length, rand = Math.random) {
  const lines = P.circles.map((c, i) => ({ axis: c.family, layer: c.ring, L: P.cycles[i].length })).filter((l) => l.L > 1);
  const out = [];
  if (!lines.length) return out;
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

// What each point shows partway through a turn: [{ v (the sticker: its home point), at }],
// with the stickers on the turning circle moved p crossings along it (p fractional), each
// along the arc between crossings. place(ci, k, f): where a sticker f of the way from the
// circle's k-th crossing to its next one is (k unwrapped: any whole number).
// Stickers not moving: { v, point } (sitting on that point); moving: { v, at }.
export function stickersDuring(P, s, turn, place) {
  const ci = turn && turn.p ? circleIndex(P, turn) : -1;
  const moving = new Map(ci < 0 ? [] : P.cycles[ci].map((p, k) => [p.i, k]));
  return Array.from(s, (v, i) => {
    if (!moving.has(i)) return { v, point: i, at: null };
    const u = moving.get(i) + turn.p, m = Math.floor(u);
    return { v, point: null, at: place(ci, m, u - m) };
  });
}

// the arc from a circle's k-th crossing to its next, clockwise (k unwrapped), in radians
export function arcAfter(P, ci, k) {
  const cyc = P.cycles[ci], L = cyc.length;
  if (L < 2) return TAU;
  const a = cyc[mod(k, L)].a, b = cyc[mod(k + 1, L)].a;
  return mod(b - a, TAU) || TAU;
}
// Dragging a circle: where an angle around it falls among its crossings, as a fractional
// crossing count (unwrapped: a whole way round adds the crossing count), so the sticker under
// the pointer stays under it however unevenly the crossings are spaced. angles: the crossings'
// angles in turn order, increasing, within one turn of the first.
export function crossingAt(angles, phi) {
  const L = angles.length;
  if (!L) return 0;
  const turns = Math.floor((phi - angles[0]) / TAU), x = phi - turns * TAU;
  let k = L - 1;
  while (k > 0 && angles[k] > x) k--;
  const next = k + 1 < L ? angles[k + 1] : angles[0] + TAU;
  return turns * L + k + (x - angles[k]) / (next - angles[k]);
}
// circle ci's crossings' angles as drawn flat (clockwise from the right, y down)
export const flatAngles = (P, ci) => P.cycles[ci].map((p) => p.a);
// a point's angle around flat circle ci
export const flatAngleOf = (P, ci, [x, y]) => Math.atan2(y - P.circles[ci].c[1], x - P.circles[ci].c[0]);

// a point f of the way along the flat circle from its k-th crossing to the next
export function flatPlace(P, ci, k, f) {
  const c = P.circles[ci], cyc = P.cycles[ci];
  const a = cyc[mod(k, cyc.length)].a + f * arcAfter(P, ci, k);
  return [c.c[0] + c.r * Math.cos(a), c.c[1] + c.r * Math.sin(a)];
}

// ---------- on the sphere ----------
// The flat drawing wrapped onto a sphere by stereographic projection, which takes circles to
// circles and keeps every crossing and the angle it's made at. Then the sphere is turned
// inside out just enough (a Möbius map, which also keeps circles circles) to spread the
// stickers out evenly: until their average is the center (the conformal barycenter, which
// is unique, so a symmetric drawing comes out symmetric). Last, it's turned so the outside
// of the drawing faces away and its middle faces you: seen from the front it looks like the
// flat drawing. Three families of one circle each come out as three great circles at right
// angles, a cube's middle slices.
//
// Returns { points: [[x, y, z]], circles: [{ n, h, sample }] }: each circle is where the
// sphere meets the plane n·x = h, and a turn's clockwise (as drawn flat) is a right-handed
// turn about n.
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => scale(a, 1 / Math.hypot(...a));

// The Möbius map of the ball that takes a to the center (sphere to sphere)
function toCenter(a, x) {
  const xa = sub(x, a), aa = dot(a, a), xx = dot(x, x);
  const den = 1 - 2 * dot(a, x) + aa * xx;
  return scale(sub(scale(xa, 1 - aa), scale(a, dot(xa, xa))), 1 / den);
}
// a rotation taking unit vector a to unit vector b the short way, applied to x (Rodrigues)
function rotateOnto(a, b, x) {
  const v = cross(a, b), s = Math.hypot(...v), c = dot(a, b);
  if (s < 1e-12) return c > 0 ? x : [-x[0], x[1], -x[2]]; // (opposite: a half turn about y)
  const k = scale(v, 1 / s), th = Math.atan2(s, c);
  return rotateAbout(k, th, x);
}
export function rotateAbout(k, th, x) {
  const cs = Math.cos(th), sn = Math.sin(th), kx = cross(k, x), kd = dot(k, x);
  return [0, 1, 2].map((i) => x[i] * cs + kx[i] * sn + k[i] * kd * (1 - cs));
}

export function sphereLayout(P) {
  // the flat drawing, centered on its crossings and scaled to about unit size
  const pts = P.points.map((p) => p.at);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const rms = Math.sqrt(pts.reduce((s, p) => s + (p[0] - cx) ** 2 + (p[1] - cy) ** 2, 0) / pts.length) || 1;
  // stereographic: flat (u, v), v down the screen, to the sphere seen from +z (+x right, +y up)
  const lift = ([x, y]) => {
    const u = (x - cx) / rms, w = -(y - cy) / rms, q = u * u + w * w;
    return [(2 * u) / (1 + q), (2 * w) / (1 + q), (1 - q) / (1 + q)];
  };
  // three points on each circle, clockwise as drawn: they fix where it goes and which way it turns
  const samples = P.circles.map((c) => [0, 1, 2].map((k) => lift([c.c[0] + c.r * Math.cos((TAU * k) / 3), c.c[1] + c.r * Math.sin((TAU * k) / 3)])));
  let sp = pts.map(lift), far = [0, 0, -1], cs = samples; // far: where the drawing's outside (infinity) is
  for (let it = 0; it < 200; it++) {
    const m = scale(sp.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]), 1 / sp.length);
    if (Math.hypot(...m) < 1e-10) break;
    const a = scale(m, 0.5);
    const map = (x) => normalize(toCenter(a, x));
    sp = sp.map(map); far = map(far); cs = cs.map((s) => s.map(map));
  }
  const turn = (x) => rotateOnto(far, [0, 0, -1], x);
  sp = sp.map(turn); cs = cs.map((s) => s.map(turn));
  const circles = cs.map(([a, b, c]) => {
    const n = normalize(cross(sub(b, a), sub(c, a))); // (a → b → c goes right-handed about n)
    // (e1, e2: square to n, for angles about it, increasing right-handed)
    const e1 = normalize(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(n, e1);
    return { n, h: dot(n, a), e1, e2, sample: [a, b, c] };
  });
  // each crossing's angle about its circles' axes, in the order of the circle's cycle
  return { points: sp, circles };
}

// the angle about circle ci's axis from its k-th crossing to the next, the way a turn goes
export function sphereArcAfter(P, S, ci, k) {
  const cyc = P.cycles[ci], L = cyc.length;
  if (L < 2) return TAU;
  const n = S.circles[ci].n, a = S.points[cyc[mod(k, L)].i], b = S.points[cyc[mod(k + 1, L)].i];
  const pa = sub(a, scale(n, dot(a, n))), pb = sub(b, scale(n, dot(b, n)));
  return mod(Math.atan2(dot(n, cross(pa, pb)), dot(pa, pb)), TAU) || TAU;
}
// a point's angle about sphere circle ci's axis (any point: it's measured square to the axis)
export function sphereAngleOf(S, ci, p) {
  const c = S.circles[ci];
  return Math.atan2(dot(p, c.e2), dot(p, c.e1));
}
// circle ci's crossings' angles about its axis, in turn order, increasing
export function sphereAngles(P, S, ci) {
  const cyc = P.cycles[ci];
  if (!cyc.length) return [];
  const out = [sphereAngleOf(S, ci, S.points[cyc[0].i])];
  for (let k = 1; k < cyc.length; k++) out.push(out[k - 1] + sphereArcAfter(P, S, ci, k - 1));
  return out;
}
export function spherePlace(P, S, ci, k, f) {
  const cyc = P.cycles[ci];
  return rotateAbout(S.circles[ci].n, f * sphereArcAfter(P, S, ci, k), S.points[cyc[mod(k, cyc.length)].i]);
}
