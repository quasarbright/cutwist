// Where the planar puzzles' grids sit in 3D. Each surface takes a point of the flat grid,
// (s, t) in [0, 1]² (s across the columns, t down the rows), to a point in space, so that
// the edges the flat grid glues together land on the same place:
//   torus         f(0, t) = f(1, t),  f(s, 0) = f(s, 1)
//   Klein bottle  f(0, t) = f(1, t),  f(s, 1) = f(1 − s, 0)
//   cross-cap     f(1, t) = f(0, 1 − t),  f(s, 1) = f(1 − s, 0)   (the projective plane)
// The Klein bottle and projective plane can't sit in 3D without passing through themselves,
// so these shapes do (the bottle's neck, the cross-cap's crease). Every shape is centered and
// scaled to fit a unit sphere, like the 3D puzzles.

const TAU = Math.PI * 2;

// A torus: rows go around the tube, columns around the hole.
function torus(s, t) {
  const R = 1, r = 0.42, a = TAU * s, b = TAU * t;
  return [(R + r * Math.cos(a)) * Math.cos(b), r * Math.sin(a), (R + r * Math.cos(a)) * Math.sin(b)];
}

// A glass Klein bottle, like the blown ones, in two pieces (t < 1/2, then t ≥ 1/2), v around:
//   the pottery (t < 1/2): one profile curve spun about the upright axis, so it's round like a
//   thrown pot. From the base joint (a short upright tube, neck-wide, on the axis inside the
//   bulb) down the punt, around the floor, up the bulb's outer wall, in through the shoulder,
//   and up the upper joint (another upright neck-wide tube, on top);
//   the neck (t ≥ 1/2): a bendy tube, even thickness, circles square to its spine (a curve in
//   the x-y plane). It leaves the upper joint straight up, arcs over, comes down outside,
//   passes in through the bulb's wall, and turns to come straight down into the base joint.
// The neck meets both joints head on, upright and at their width, so the joins are smooth.
// Coming down into the base joint, the neck's circle runs the other way round from the
// pottery's there (its frame turned over going around the arc): the same circle, with v glued
// to π − v, a reflection. Taking v = 2πs − π/2 makes that the flat grid's s → 1 − s.
const R_NECK = 0.72;
// The profile, (radius, height) points with tangents (Hermite), from the base joint to the top.
const PROFILE = [
  [[R_NECK, -1.2], [0, -1.2]], // base joint: upright, heading down into the punt
  [[R_NECK, -2.0], [0.15, -1.0]],
  [[1.25, -3.05], [1.0, -0.6]], // the punt flaring into the floor
  [[2.05, -3.35], [1.2, 0]], // the floor's lowest ring
  [[2.95, -2.55], [0.5, 1.4]],
  [[3.15, -1.1], [0, 1.6]], // widest
  [[2.45, 0.7], [-0.95, 1.6]], // the shoulder
  [[1.2, 2.05], [-0.8, 1.2]],
  [[R_NECK, 3.0], [0, 1.0]], // upper joint: upright, neck-wide
  [[R_NECK, 3.6], [0, 0.6]],
];
// The neck's spine, (x, y) points with tangents, from the top of the upper joint to the base joint.
const NECK = [
  [[0, 3.6], [0, 1.6]],
  [[-0.7, 5.6], [-1.6, 1.3]],
  [[-2.6, 6.3], [-1.8, -0.3]], // a wide arc over the top
  [[-4.3, 4.3], [-0.2, -2.4]],
  [[-3.7, 0.9], [0.9, -2.3]], // down outside, heading in
  [[-1.5, -0.2], [1.8, -0.9]], // through the wall
  [[0, -1.2], [0, -1.4]], // straight down into the base joint
];
function hermite(pts, w) { // a point and unit tangent along Hermite segments, w in [0, 1]
  const n = pts.length - 1, k = Math.min(n - 1, Math.floor(w * n)), f = w * n - k;
  const [p0, m0] = pts[k], [p1, m1] = pts[k + 1];
  const h = [2 * f ** 3 - 3 * f ** 2 + 1, f ** 3 - 2 * f ** 2 + f, -2 * f ** 3 + 3 * f ** 2, f ** 3 - f ** 2];
  const d = [6 * f ** 2 - 6 * f, 3 * f ** 2 - 4 * f + 1, -6 * f ** 2 + 6 * f, 3 * f ** 2 - 2 * f];
  const p = [0, 1].map((i) => h[0] * p0[i] + h[1] * m0[i] + h[2] * p1[i] + h[3] * m1[i]);
  const dp = [0, 1].map((i) => d[0] * p0[i] + d[1] * m0[i] + d[2] * p1[i] + d[3] * m1[i]), l = Math.hypot(dp[0], dp[1]);
  return [p, [dp[0] / l, dp[1] / l]];
}
function klein(s, t) {
  const v = TAU * s - Math.PI / 2;
  if (t < 0.5) {
    const [[rho, y]] = hermite(PROFILE, t / 0.5);
    return [rho * Math.cos(v), y, rho * Math.sin(v)];
  }
  const [[x, y], [tx, ty]] = hermite(NECK, (t - 0.5) / 0.5);
  const nx = ty, ny = -tx; // the spine's normal in its plane: +x leaving the top, −x coming into the base
  return [x + R_NECK * nx * Math.cos(v), y + R_NECK * ny * Math.cos(v), R_NECK * Math.sin(v)];
}

// The cross-cap. The flat grid's projective-plane gluing is the square's boundary with
// opposite points identified. Stretch the square onto a disk (keeping opposite points
// opposite), lift the disk onto a hemisphere, and apply (x, y, z) → (yz, 2xy, x² − y²), which
// sends opposite points of the sphere to the same place, so the rim folds onto itself as the
// gluing says. It pinches to a point in two places.
function crossCap(s, t) {
  const X = 2 * s - 1, Y = 2 * t - 1;
  const x = X * Math.sqrt(Math.max(0, 1 - (Y * Y) / 2)), y = Y * Math.sqrt(Math.max(0, 1 - (X * X) / 2));
  const h = 1 - x * x - y * y, z = h > 1e-12 ? Math.sqrt(h) : 0; // (on the rim: exactly 0)
  return [y * z, 2 * x * y, x * x - y * y];
}

const SHAPES = { torus, klein, rp2: crossCap };

// center and scale each shape into the unit sphere, from a sample of its points
const FIT = {};
for (const [name, f] of Object.entries(SHAPES)) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i <= 80; i++)
    for (let j = 0; j <= 80; j++) {
      const p = f(i / 80, j / 80);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    }
  const c = lo.map((l, k) => (l + hi[k]) / 2);
  let r = 0;
  for (let i = 0; i <= 80; i++)
    for (let j = 0; j <= 80; j++) {
      const p = f(i / 80, j / 80);
      r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
    }
  FIT[name] = { c, r };
}

// Which way the grid runs on each shape: reversing s keeps every gluing (both edges it
// joins swap together) but turns the texture over. Chosen so the torus and most of the
// bottle's outside read the right way round; the one-sided shapes can't read right everywhere.
const FLIP_S = { torus: true, klein: true, rp2: false };
// Reversing t keeps the gluings too. Reversing both s and t turns the texture a half turn
// (upright instead of upside down, still not mirrored): the bottle's rows run up its wall.
const FLIP_T = { torus: false, klein: true, rp2: false };

// the point of `topology`'s surface at flat coordinates (s, t)
export function surfacePoint(topology, s, t) {
  const p = SHAPES[topology](FLIP_S[topology] ? 1 - s : s, FLIP_T[topology] ? 1 - t : t), { c, r } = FIT[topology];
  return [(p[0] - c[0]) / r, (p[1] - c[1]) / r, (p[2] - c[2]) / r];
}
