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

// A glass Klein bottle, like the blown ones: a round bulb whose neck leaves its floor, rises
// inside it at a slant, passes out through the left wall, arcs over the top and comes down to
// open into the bulb's upper right. Two pieces, u in [0, 1) along the tube, v around it:
//   the neck (t < 1/2): a tube of circles square to its spine (a smooth curve in the x-y
//   plane), even thickness, widening where it opens into the bulb;
//   the bulb (t ≥ 1/2): horizontal circles on one upright axis. The outer wall swells out,
//   curves under at the floor, and turns back up as the inner tube (like a bottle's punt),
//   which becomes the neck.
// Where they meet at the floor (t = 1 back to t = 0) it's the same circle with v glued to
// π − v, a reflection; taking v = 2πs − π/2 makes that the flat grid's s → 1 − s.
const NECK = [ // the neck's spine: points and tangents (Hermite), from the floor to the bulb's top
  [[0, -1.6], [0, 2.2]],
  [[-2.3, 0.7], [-0.9, 3.0]],
  [[-2.2, 3.7], [1.2, 2.6]],
  [[0, 5.1], [2.6, 0]],
  [[1.8, 4.3], [0.3, -2.0]],
  [[1.3, 2.4], [0, -2.0]],
];
const R_NECK = 0.72, R_MOUTH = 1.0, R_BULB = 2.6, R_FLOOR = 1.25, Y_FLOOR = -3.2, Y_TOP = 2.4;
const smooth = (a) => (a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a));
function neckSpine(w) { // w in [0, 1]: position and unit tangent
  const n = NECK.length - 1, k = Math.min(n - 1, Math.floor(w * n)), f = w * n - k;
  const [p0, m0] = NECK[k], [p1, m1] = NECK[k + 1];
  const h00 = 2 * f ** 3 - 3 * f ** 2 + 1, h10 = f ** 3 - 2 * f ** 2 + f, h01 = -2 * f ** 3 + 3 * f ** 2, h11 = f ** 3 - f ** 2;
  const d00 = 6 * f ** 2 - 6 * f, d10 = 3 * f ** 2 - 4 * f + 1, d01 = -6 * f ** 2 + 6 * f, d11 = 3 * f ** 2 - 2 * f;
  const p = [0, 1].map((i) => h00 * p0[i] + h10 * m0[i] + h01 * p1[i] + h11 * m1[i]);
  const d = [0, 1].map((i) => d00 * p0[i] + d10 * m0[i] + d01 * p1[i] + d11 * m1[i]), l = Math.hypot(d[0], d[1]);
  return [p, [d[0] / l, d[1] / l]];
}
function klein(s, t) {
  const v = TAU * s - Math.PI / 2;
  if (t < 0.5) {
    const w = t / 0.5, [[x, y], [tx, ty]] = neckSpine(w);
    const r = R_NECK + (R_MOUTH - R_NECK) * smooth((w - 0.75) / 0.25);
    const nx = ty, ny = -tx; // the spine's normal in its plane: +x at the floor, −x coming into the top
    return [x + r * nx * Math.cos(v), y + r * ny * Math.cos(v), r * Math.sin(v)];
  }
  const w = (t - 0.5) / 0.5;
  let x, y, r;
  if (w < 0.5) { // the outer wall, from the neck's mouth down to the floor
    const a = w / 0.5;
    y = Y_TOP + (Y_FLOOR - Y_TOP) * (1 - Math.cos(Math.PI * a)) / 2;
    x = NECK.at(-1)[0][0] * (1 - smooth(a / 0.75)); // drifting onto the bulb's axis
    // tapering up into the neck, fullest a little below the middle
    r = R_MOUTH * (1 - a) + R_FLOOR * a + (R_BULB - (R_MOUTH + R_FLOOR) / 2) * Math.sin(Math.PI * a ** 1.4) ** 0.9;
  } else { // the inner tube, from the floor up to where the neck begins
    const b = (w - 0.5) / 0.5;
    y = Y_FLOOR + (NECK[0][0][1] - Y_FLOOR) * (1 - Math.cos((Math.PI * b) / 2));
    x = 0;
    r = R_FLOOR + (R_NECK - R_FLOOR) * smooth(b / 0.6);
  }
  return [x - r * Math.cos(v), y, r * Math.sin(v)];
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
const FLIP_S = { torus: true, klein: false, rp2: false };

// the point of `topology`'s surface at flat coordinates (s, t)
export function surfacePoint(topology, s, t) {
  const p = SHAPES[topology](FLIP_S[topology] ? 1 - s : s, t), { c, r } = FIT[topology];
  return [(p[0] - c[0]) / r, (p[1] - c[1]) / r, (p[2] - c[2]) / r];
}
