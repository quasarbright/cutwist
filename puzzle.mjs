// Twisty puzzles as a solid plus a set of cut planes.
//
// A piece is a convex polyhedron: a list of polygons, each tagged with the face it
// came from (a sticker, color >= 0) or -1 for plastic exposed by a cut. One routine,
// splitPiece, builds everything: clipping a big box by the face planes gives the
// solid, and clipping the solid by the cut planes gives the pieces.
//
// Pieces are never rotated in place. Each piece keeps its home geometry plus an index
// into the solid's rotation group (12, 24 or 60 rotations for the Platonic solids),
// so the whole puzzle state is an integer array and moves are table lookups: no drift.

export const EPS = 1e-6;
export const PHI = (1 + Math.sqrt(5)) / 2;
const TAU = Math.PI * 2;

// ---------- vectors (plain [x, y, z] arrays) ----------
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.sqrt(dot(a, a));
export const normalize = (a) => scale(a, 1 / len(a));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const close = (a, b, eps = EPS) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;
const mod = (a, n) => ((a % n) + n) % n;

// Two unit vectors u, v in the plane perpendicular to n, with u × v = n.
export function basis(n) {
  const u = normalize(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  return [u, cross(n, u)];
}

function uniqueDirs(vs) {
  const out = [];
  for (const v of vs) {
    const d = normalize(v);
    if (!out.some((o) => close(o, d, 1e-6))) out.push(d);
  }
  return out;
}

// ---------- 3x3 matrices (flat, row-major) ----------
export const applyMat = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
export function mulMat(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
// Rotation by angle t about unit axis a (right-handed).
export function rotMat(a, t) {
  const c = Math.cos(t), s = Math.sin(t), k = 1 - c, [x, y, z] = a;
  return [
    c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k,
  ];
}
const matClose = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-5);

// ---------- solids ----------
function signs(v) {
  let out = [[]];
  for (const x of v) out = out.flatMap((p) => (x === 0 ? [[...p, 0]] : [[...p, x], [...p, -x]]));
  return out;
}
const cyclic = (vs) => vs.flatMap(([a, b, c]) => [[a, b, c], [c, a, b], [b, c, a]]);

// The standard megaminx scheme: white on face 0, then blue, red, green, purple, yellow
// clockwise around it (seen from outside), and every face opposite its partner:
// white/gray, blue/light blue, red/orange, green/light green, purple/pink, yellow/beige.
function megaminxColors(raw) {
  const ns = raw.map(normalize), w = ns[0];
  const ring = ns.map((n, i) => i).filter((i) => Math.abs(dot(ns[i], w) - 1 / Math.sqrt(5)) < 1e-6);
  const [u, v] = basis(w);
  const ang = (i) => Math.atan2(dot(ns[i], v), dot(ns[i], u));
  ring.sort((a, b) => ang(b) - ang(a)); // decreasing angle about w = clockwise from outside
  const pairs = [["#f4f4ee", "#5c6068"], ["#0051ba", "#5ab4ff"], ["#c8102e", "#ff6a13"],
                 ["#009e60", "#8ed142"], ["#7b3fb3", "#ff7eb6"], ["#ffe600", "#d6c298"]];
  const out = new Array(12);
  const opposite = (i) => ns.findIndex((n) => close(n, scale(ns[i], -1)));
  [0, ...ring].forEach((f, k) => { out[f] = pairs[k][0]; out[opposite(f)] = pairs[k][1]; });
  return out;
}

// The icosahedron scheme the FTO Discord voted on as the unofficial standard, as adopted by
// cubing.js (src/cubing/puzzle-geometry/colors.ts, nets in PuzzleGeometry.ts). NET rows are
// [face, neighbors clockwise seen from outside], each starting from a face already placed
// ("" skips a neighbor). Placing R on face 0 and C on its first neighbor fixes the rest;
// any choice gives the same scheme turned, since rotations reach every (face, edge) pair.
const ICOSA_NET = [
  ["R", "C", "F", "E"], ["F", "R", "L", "U"], ["L", "F", "A", ""], ["E", "R", "G", "I"],
  ["I", "E", "S", "H"], ["S", "I", "J", "B"], ["B", "S", "K", "D"], ["K", "B", "M", "O"],
  ["O", "K", "P", "N"], ["P", "O", "Q", ""],
];
const ICOSA_COLORS = {
  R: "#f4f400", C: "#d41f69", F: "#008800", E: "#5c5c5c", L: "#8800dd", // yellow, cerise, dark green, dark gray, purple
  U: "#ffffff", A: "#007a89", G: "#ff0000", I: "#7d3b11", S: "#b9a1ff", // white, teal, red, brown, lavender
  H: "#3399ff", J: "#5ec4b6", B: "#44ee00", K: "#d8b87c", D: "#aaaaaa", // aqua, sea green, green, cream, light gray
  M: "#ff66cc", O: "#292929", P: "#ff8000", N: "#980000", Q: "#0000ff", // pink, charcoal, orange, burgundy, bold blue
};
function icosahedronColors(raw) {
  const ns = raw.map(normalize);
  const edgeDot = Math.max(...ns.slice(1).map((n) => dot(n, ns[0])));
  // each face's edge neighbors, clockwise seen from outside (decreasing angle about n)
  const around = ns.map((n, i) => {
    const [u, v] = basis(n);
    const ang = (j) => Math.atan2(dot(ns[j], v), dot(ns[j], u));
    return ns.map((_, j) => j).filter((j) => Math.abs(dot(ns[j], n) - edgeDot) < 1e-6).sort((a, b) => ang(b) - ang(a));
  });
  const face = { R: 0, C: around[0][0] };
  for (const [x, first, ...rest] of ICOSA_NET) {
    const ring = around[face[x]], k = ring.indexOf(face[first]);
    rest.forEach((name, i) => { if (name) face[name] = ring[(k + 1 + i) % 3]; });
  }
  const out = new Array(20);
  for (const [name, i] of Object.entries(face)) out[i] = ICOSA_COLORS[name];
  return out;
}

// Give each pair of opposite faces a pair of related colors, in face order.
function pairedColors(raw, pairs) {
  const ns = raw.map(normalize), out = new Array(ns.length);
  let k = 0;
  ns.forEach((n, i) => {
    if (out[i]) return;
    out[i] = pairs[k][0];
    out[ns.findIndex((m) => close(m, scale(n, -1)))] = pairs[k][1];
    k++;
  });
  return out;
}
const RHOMBIC_DODECA = cyclic(signs([1, 1, 0])); // cube edge directions
const RHOMBIC_TRIACONTA = [...cyclic(signs([1, 0, 0])), ...cyclic(signs([1, PHI, 1 / PHI]))]; // icosahedron edge directions
const PAIRS_6 = [["#f4f4ee", "#5c6068"], ["#0051ba", "#5ab4ff"], ["#c8102e", "#ff6a13"],
                 ["#009e60", "#8ed142"], ["#7b3fb3", "#ff7eb6"], ["#ffe600", "#d6c298"]];
const PAIRS_15 = [
  ["#ffffff", "#aaaaaa"], ["#f4f400", "#d8b87c"], ["#ff0000", "#980000"], ["#ff8000", "#7d3b11"],
  ["#44ee00", "#008800"], ["#0000ff", "#3399ff"], ["#8800dd", "#b9a1ff"], ["#ff66cc", "#d41f69"],
  ["#007a89", "#5ec4b6"], ["#5c5c5c", "#292929"], ["#1e3a5f", "#8fc7ff"], ["#6b7a1f", "#c9c27a"],
  ["#d4a017", "#ffc49b"], ["#3f2a8c", "#8c8cff"], ["#1f8f5f", "#9ff0c8"],
]; // the icosahedron's 10 pairs, plus navy/sky, olive/khaki, gold/peach, indigo/periwinkle, jade/mint

// Face normals, and a sticker color per face (index-aligned).
export const SOLIDS = {
  tetrahedron: {
    normals: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
    colors: ["#d7263d", "#1b998b", "#2e5fd8", "#f5c518"],
  },
  cube: {
    normals: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    // R L U D F B in the standard scheme
    colors: ["#c8102e", "#ff6a13", "#f4f4ee", "#ffe600", "#009e60", "#0051ba"],
  },
  octahedron: {
    normals: signs([1, 1, 1]),
    // face i is opposite face 7 - i: white/yellow, red/orange, green/blue, gray/purple
    colors: ["#f4f4ee", "#c8102e", "#009e60", "#5c6068", "#7b3fb3", "#0051ba", "#ff6a13", "#ffe600"],
  },
  dodecahedron: {
    normals: cyclic(signs([0, 1, PHI])),
    colors: megaminxColors(cyclic(signs([0, 1, PHI]))),
  },
  icosahedron: {
    normals: [...signs([1, 1, 1]), ...cyclic(signs([0, 1 / PHI, PHI]))],
    colors: icosahedronColors([...signs([1, 1, 1]), ...cyclic(signs([0, 1 / PHI, PHI]))]),
  },
  rhombicDodecahedron: { normals: RHOMBIC_DODECA, colors: pairedColors(RHOMBIC_DODECA, PAIRS_6) },
  rhombicTriacontahedron: { normals: RHOMBIC_TRIACONTA, colors: pairedColors(RHOMBIC_TRIACONTA, PAIRS_15) },
};

// Cuboids and prisms are families of solids, built from the spec's own numbers.
// A cuboid a×b×c: a box with sides in proportion to its layer counts, so every layer has
// the same thickness. Cube colors, in the cube's face order.
// A prism with n sides: a regular n-gon (apothem 1), `rows` layers tall, each layer as
// tall as a side face's columns are wide, so stickers on the sides are square. A crystal
// prism's rows are half a side face's width each, so 2 makes square side faces. Sides go around from red; the caps are white and yellow.
// Past 12 sides the colors go around the hue wheel by the golden angle (the textures keep
// them apart).
const PRISM_SIDE_COLORS = ["#c8102e", "#0051ba", "#ff6a13", "#009e60", "#7b3fb3", "#ff7eb6",
  "#007a89", "#7d3b11", "#8ed142", "#5c6068", "#5ab4ff", "#d4a017"];
const prismSideColor = (k) => PRISM_SIDE_COLORS[k] || `hsl(${Math.round((k * 137.508) % 360)}, 55%, ${k % 2 ? 42 : 60}%)`;
export const cuboidDims = (spec) => [spec.a, spec.b, spec.c];
// columns on each side face: `cuts` cuts per side reach its neighbors' middles from both edges
const prismColumns = (spec) => Math.max(1, 2 * spec.cuts);
function familySolid(spec) {
  if (spec.rule === "cuboid") {
    const dims = cuboidDims(spec), top = Math.max(...dims);
    const normals = SOLIDS.cube.normals.map(normalize);
    const dists = normals.map((n) => dims[n.findIndex((x) => Math.abs(x) > 0.5)] / top);
    return { normals, dists, colors: SOLIDS.cube.colors, labels: dists.map((d) => d.toFixed(6)) };
  }
  const n = spec.sides, width = 2 * Math.tan(Math.PI / n);
  const half = (spec.rows * width) / (spec.crystal ? 2 : prismColumns(spec)) / 2;
  const normals = [...Array.from({ length: n }, (_, k) => [Math.cos((TAU * k) / n), Math.sin((TAU * k) / n), 0]), [0, 0, 1], [0, 0, -1]];
  const dists = normals.map((v) => (v[2] ? half : 1));
  return { normals, dists, colors: [...Array.from({ length: n }, (_, k) => prismSideColor(k)), "#f4f4ee", "#ffe600"], labels: dists.map((d) => d.toFixed(6)) };
}

// ---------- clipping ----------
function boxPiece(s) {
  const polys = [];
  for (const n of SOLIDS.cube.normals) {
    const [u, v] = basis(n), c = scale(n, s);
    const verts = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => add(c, add(scale(u, a * s), scale(v, b * s))));
    polys.push({ verts, normal: n, color: -2 });
  }
  return { polys };
}

// Split a convex piece by the plane n·x = d. Returns [below, above] (n·x < d, n·x > d);
// either is null when the plane misses the piece. The new face on each side is tagged capColor.
export function splitPiece(piece, n, d, capColor) {
  let minS = Infinity, maxS = -Infinity;
  for (const p of piece.polys)
    for (const v of p.verts) {
      const s = dot(n, v) - d;
      if (s < minS) minS = s;
      if (s > maxS) maxS = s;
    }
  if (maxS <= EPS) return [piece, null];
  if (minS >= -EPS) return [null, piece];

  const below = [], above = [], onPlane = [];
  for (const p of piece.polys) {
    const vs = p.verts, m = vs.length;
    const s = vs.map((v) => dot(n, v) - d);
    const c = s.map((x) => (x > EPS ? 1 : x < -EPS ? -1 : 0));
    const b = [], a = [];
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      if (c[i] <= 0) b.push(vs[i]);
      if (c[i] >= 0) a.push(vs[i]);
      if (c[i] === 0) onPlane.push(vs[i]);
      if (c[i] * c[j] === -1) {
        const x = lerp(vs[i], vs[j], s[i] / (s[i] - s[j]));
        b.push(x); a.push(x); onPlane.push(x);
      }
    }
    if (b.length >= 3) below.push({ ...p, verts: b });
    if (a.length >= 3) above.push({ ...p, verts: a });
  }

  const pts = [];
  for (const q of onPlane) if (!pts.some((o) => close(o, q, 1e-7))) pts.push(q);
  if (pts.length >= 3) {
    const cen = scale(pts.reduce(add, [0, 0, 0]), 1 / pts.length);
    const [u, v] = basis(n);
    const ang = (q) => Math.atan2(dot(sub(q, cen), v), dot(sub(q, cen), u));
    pts.sort((p, q) => ang(p) - ang(q)); // counterclockwise about n
    below.push({ verts: pts, normal: n, color: capColor });
    above.push({ verts: [...pts].reverse(), normal: scale(n, -1), color: capColor });
  }
  return [{ polys: below }, { polys: above }];
}

// dists: each face's distance from the center (default 1)
export function buildSolid(normals, dists = null) {
  let piece = boxPiece(8);
  normals.forEach((n, i) => { piece = splitPiece(piece, n, dists ? dists[i] : 1, i)[0]; });
  if (piece.polys.some((p) => p.color < 0)) throw new Error("solid is unbounded");
  return piece;
}

// ---------- symmetry ----------
// All rotations that map the set of face normals onto itself. Any rotation is pinned down
// by where it sends two non-parallel normals, so try every pair with the right angle.
// labels (optional): a kind per face, like "face" or "vertex" for faces made by trimming the
// corners; rotations only map faces onto faces of the same kind. (A tetrahedron with trimmed
// corners has face directions like a cube's corners, which a cube's extra rotations would
// otherwise swap.)
export function rotationGroup(normals, labels = null) {
  const kind = (i) => (labels ? labels[i] : 0);
  const i1 = normals.findIndex((x) => Math.abs(dot(x, normals[0])) < 1 - 1e-6);
  const n0 = normals[0], n1 = normals[i1];
  const c01 = dot(n0, n1);
  const frame = (a, b) => { const e2 = normalize(sub(b, scale(a, dot(a, b)))); return [a, e2, cross(a, e2)]; };
  const F = frame(n0, n1);
  const mats = [];
  normals.forEach((a, ia) => normals.forEach((b, ib) => {
    if (kind(ia) !== kind(0) || kind(ib) !== kind(i1) || Math.abs(dot(a, b) - c01) > 1e-6) return;
    const G = frame(a, b), R = new Array(9).fill(0);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] += G[k][i] * F[k][j];
    const maps = normals.every((x, ix) => { const y = applyMat(R, x); return normals.some((z, iz) => kind(iz) === kind(ix) && close(y, z, 1e-5)); });
    if (maps && !mats.some((m) => matClose(m, R))) mats.push(R);
  }));
  const id = mats.findIndex((m) => matClose(m, [1, 0, 0, 0, 1, 0, 0, 0, 1]));
  [mats[0], mats[id]] = [mats[id], mats[0]];
  const find = (M) => mats.findIndex((m) => matClose(m, M));
  const mul = mats.map((a) => mats.map((b) => find(mulMat(a, b))));
  // facePerm[g][f]: the face that face f's direction points at after rotation g
  const facePerm = mats.map((m) => normals.map((n) => { const y = applyMat(m, n); return normals.findIndex((z) => close(y, z, 1e-5)); }));
  return { mats, mul, find, facePerm };
}

// ---------- puzzles ----------
// A family is a solid, which directions get cut, and how N (the size) places the cuts:
//   "layers": N equal layers along each axis, from one end of the solid to the other
//             (cube N×N×N, octahedron, skewb, pyraminx).
//   "minx":   shallow cuts near each face, so the middle of every face stays one piece
//             (megaminx 3, gigaminx 5). Face-parallel cuts always make an odd number of
//             layers, so an even size N is size N + 1 with the innermost cuts pushed almost
//             to the face's center, and the thin middle strips (center and middle edges)
//             blacked out. Size 2 is a kilominx: corners meeting at the middle of each face.
// Size 1 is the uncut solid and size 0 is nothing at all.
const MINX_NAMES = { 2: "Kilominx", 3: "Megaminx", 4: "Master Kilominx", 5: "Gigaminx", 7: "Teraminx", 9: "Petaminx", 11: "Examinx", 13: "Zettaminx", 15: "Yottaminx" };
// How deep the innermost cut of an even minx can go (t, with 0 = through the neighbors'
// centers) while the pieces stay the ones a size N + 1 minx has. Any deeper and neighboring
// corners meet at each edge's midpoint and the cuts carve out extra pieces there. Found by
// bisection on the piece count, once per solid: 1/φ (t ≈ 0.309) for the dodecahedron, the
// very center for the icosahedron.
const thinnestCache = {};
function minxLimitT(solidName, normals) {
  if (solidName in thinnestCache) return thinnestCache[solidName];
  const c0 = minxCenterDepth(normals, normals[0]);
  const count = (t) => {
    let ps = [buildSolid(normals)];
    for (const n of normals) ps = ps.flatMap((p) => splitPiece(p, n, c0 + (1 - c0) * t, -1).filter(Boolean));
    return ps.length;
  };
  const target = count(0.5);
  let lo = 0, hi = 0.5;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (count(mid) === target) hi = mid; else lo = mid; }
  return (thinnestCache[solidName] = hi);
}
// even minxes put their innermost cut just shy of the limit, so corners barely don't meet
const minxEvenT = (solidName, normals) => minxLimitT(solidName, normals) + 0.005;
const PRISM_SIDES = { key: "sides", label: "sides", min: 3 };
const PRISM_ROWS = { key: "rows", label: "height", min: 1, title: "layers top to bottom" };
const prismName = (s) => PRISM_NAMES[s.sides] || `${s.sides}-sided`;
const PRISM_NAMES = { 3: "Triangular", 5: "Pentagonal", 6: "Hexagonal", 7: "Heptagonal", 8: "Octagonal", 9: "Nonagonal", 10: "Decagonal", 11: "Hendecagonal", 12: "Dodecagonal" };
export const PRESETS = [
  { id: "cube", name: "Cube", solid: "cube", on: "face", rule: "layers", size: 3, title: (n) => `${n}×${n}×${n} cube` },
  // fixed: the size control is hidden (other sizes of these aren't puzzles people know)
  // Skewb family: N evenly spaced layers per corner, so each face is a grid of squares
  // (see cutDepths).
  { id: "skewb", name: "Skewb", solid: "cube", on: "vertex", rule: "skewb", size: 2, names: { 2: "Skewb", 3: "Master Skewb", 4: "Professor Skewb" } },
  // Deep corner cuts, through the corners next to each one: only edge pieces show.
  { id: "dino", name: "Dino Cube", solid: "cube", on: "vertex", rule: "neighbor-corners", size: 2, names: { 2: "Dino Cube" } },
  // Edge turning, cuts through the centers of the two faces at each edge. The real puzzle
  // also turns by odd angles that jumble it; here only half turns (the cube's symmetry).
  { id: "helicopter", name: "Helicopter Cube", solid: "cube", on: "edge", rule: "depths", depths: [Math.SQRT1_2], size: 2, fixed: true, names: { 2: "Helicopter Cube" } },
  // A cuboid a×b×c, each length set on its own. Faces that aren't square turn in halves.
  { id: "cuboid", name: "Cuboid", rule: "cuboid", on: "face", size: 3, fixed: true, a: 2, b: 3, c: 4, noCustom: true,
    params: [{ key: "a", label: "length", min: 1 }, { key: "b", label: "height", min: 1 }, { key: "c", label: "width", min: 1 }],
    title: (n, s) => `${s.a}×${s.b}×${s.c} cuboid` },
  // Prisms with n sides. The caps turn in n-ths, the sides in halves.
  // Prism: size cuts per side, down to the neighbors' centers; height is the layers top to
  // bottom. Prism Crystal: one cut per side through the prism's middle, and height layers.
  { id: "prism", name: "Prism", rule: "prism", on: "face", size: 2, fixed: true, sides: 6, cuts: 1, rows: 3, noCustom: true,
    params: [PRISM_SIDES, { key: "cuts", label: "size", min: 0, title: "cuts on each side face, down to the middle of the side faces next to it" }, PRISM_ROWS],
    title: (n, s) => `${prismName(s)} prism, size ${s.cuts}, height ${s.rows}` },
  { id: "prism-crystal", name: "Prism Crystal", rule: "prism", crystal: true, on: "face", size: 2, fixed: true, sides: 6, rows: 2, noCustom: true,
    params: [PRISM_SIDES, { key: "rows", label: "height", min: 1, title: "layers top to bottom, each half a side face wide" }],
    title: (n, s) => `${prismName(s)} prism crystal, height ${s.rows}` },
  { id: "pyraminx", name: "Pyraminx", solid: "tetrahedron", on: "vertex", rule: "layers", size: 3, names: { 3: "Pyraminx", 4: "Master Pyraminx", 5: "Professor Pyraminx" } },
  // Deep face turning on a tetrahedron: each cut a third of the way past the center, away
  // from its face. The cuts meet, so no face centers are left: 4 corners and 6 edges.
  { id: "pyraminx-crystal", name: "Pyraminx Crystal", solid: "tetrahedron", on: "face", rule: "depths", depths: [-1 / 3], size: 2, fixed: true },
  { id: "ftt", name: "Face-Turning Tetrahedron", solid: "tetrahedron", on: "face", rule: "steps", size: 3, names: { 3: "Face-Turning Tetrahedron" } },
  { id: "octahedron", name: "Octahedron", solid: "octahedron", on: "face", rule: "layers", size: 3, names: { 2: "Skewb Diamond", 3: "Face-Turning Octahedron" } },
  // Corner turning like a pyraminx: cuts at k/N of the way from each corner down to the
  // center (the plane through its neighboring corners), so every face is a grid of N² triangles.
  { id: "octa-corner", name: "Corner-Turning Octahedron", solid: "octahedron", on: "vertex", rule: "grid", size: 3 },
  { id: "octa-shallow", name: "Shallow Octahedron", solid: "octahedron", on: "face", rule: "steps", size: 3, center: 1.5 },
  { id: "megaminx", name: "Megaminx", solid: "dodecahedron", on: "face", rule: "minx", size: 3, names: MINX_NAMES },
  // Megaminx Crystal: megaminx-style face turning cut all the way to the neighbors' centers.
  { id: "megaminx-crystal", name: "Megaminx Crystal", solid: "dodecahedron", on: "face", rule: "neighbor-centers", size: 2, fixed: true, names: { 2: "Megaminx Crystal" } },
  { id: "pentultimate", name: "Pentultimate", solid: "dodecahedron", on: "face", rule: "layers", size: 2, fixed: true, names: { 2: "Pentultimate" } },
  // Corner turning, cut through the corners next to each one (a dino dodecahedron).
  // (size 2 is the Chopasaurus; the id stays for old links)
  { id: "chopasaurus", name: "Corner-Turning Megaminx", solid: "dodecahedron", on: "vertex", rule: "neighbor-corners", size: 2 },
  // Shallow minx-style cuts. Each face is also crossed by the cuts of the 6 faces that only
  // share a corner with it, and no shallow depth lines those up with the edge neighbors'
  // cuts (only 1/φ does), so they leave small extra pieces around each corner. Those get
  // blacked out (blackOutStrays).
  { id: "icosahedron", name: "Icosahedron", solid: "icosahedron", on: "face", rule: "minx", size: 3, blackOutStrays: true, oddOnly: true },
  // Every face plane at depth 1/φ: the one depth where the corner-sharing faces' cuts cross
  // the edges at exactly the same points as the edge neighbors' cuts, so there are no slivers.
  { id: "golden-icosahedron", name: "Golden Icosahedron", solid: "icosahedron", on: "face", rule: "depths", depths: [1 / PHI], size: 2, fixed: true },
  // Deep face turning: each cut a third of the way from the center to the face. 12 corners,
  // 90 edges and 60 face pieces, with no slivers to black out.
  { id: "icosahedron-crystal", name: "Icosahedron Crystal", solid: "icosahedron", on: "face", rule: "depths", depths: [1 / 3], size: 2, fixed: true },
  { id: "icosa-pyraminx", name: "Corner-Turning Icosahedron", solid: "icosahedron", on: "vertex", rule: "grid", size: 3 },
  // Face-turning (half turns: a rhombus only has 2-fold symmetry). Each face is cut through
  // the centers of its neighbors, 0.5; that depth lines the cuts up, any shallower one
  // leaves slivers.
  { id: "rhombic-dodeca", name: "Rhombic Dodecahedron", solid: "rhombicDodecahedron", on: "face", rule: "neighbor-centers", size: 2, fixed: true },
  // Face-turning, half turns. Five faces meet at its 12 sharpest corners, so (like the
  // icosahedron) the cuts of faces that only share a corner leave small extra pieces there;
  // those are blacked out, leaving each rhombus a 3×3-like face: a center, 4 edges, 4
  // corners. At 0.875 an edge piece is about as wide as the gap from its side to the corner.
  { id: "rhombic-triaconta", name: "Rhombic Triacontahedron", solid: "rhombicTriacontahedron", on: "face", rule: "depths", depths: [0.875], size: 2, fixed: true, blackOutStrays: true },
  // The Tuttminx: an icosahedron with its corners truncated a third of the way along each
  // edge (regular hexagons, a soccer ball), face-turning around all 32 faces. At size 3 the
  // cut is where the face cuts line up (found by snapping): 32 centers, 90 edges, 60
  // corners. Bigger sizes add evenly spaced rows above it (faceRowDepths); there are no
  // clean depths up there, so they leave small slivers (0.8% of a face at size 5). Even
  // sizes are the next odd size with the middle strips blacked out, like an even minx.
  { id: "soccer", name: "Soccer Ball", solid: "icosahedron", rule: "custom", size: 3, names: { 3: "Soccer Ball" },
    truncate: { vertex: 1 - (1 - 1 / Math.sqrt(5)) / 3 }, faceRows: 0.88705799822366727 },
];

// The nearest size this family has, stepping in direction dir (+1 or −1) past gaps.
// The shallow face-turning tetrahedron and octahedron only have odd sizes: an even one
// needs cut lines to cross. The icosahedron (oddOnly) skips even sizes by choice.
export function snapSize(spec, n, dir = 1) {
  n = Math.max(0, Math.floor(n));
  if ((spec.rule === "steps" || spec.oddOnly) && n > 1 && n % 2 === 0) n += dir >= 0 ? 1 : -1;
  return n;
}

export function puzzleTitle(spec, n) {
  if (spec.title) return spec.title(n, spec);
  if (spec.fixed && !spec.names) return spec.name;
  return (spec.names && spec.names[n]) || `${spec.name}, size ${n}`;
}

// Directions of the solid's faces, vertices or edge midpoints.
function directions(solid, normals, on) {
  if (on === "face") return normals;
  const pts = [];
  for (const p of solid.polys)
    p.verts.forEach((v, i) => pts.push(on === "vertex" ? v : lerp(v, p.verts[(i + 1) % p.verts.length], 0.5)));
  return uniqueDirs(pts);
}

// Cut depths along direction n (planes n·x = d) for size N.
function cutDepths(spec, solid, normals, n, N) {
  const out = [];
  if (spec.rule === "cuboid" || (spec.rule === "prism" && Math.abs(n[2]) > 0.5)) {
    // cuboid: its own layer count along each axis. prism caps: `rows` layers top to bottom.
    // Size 1 is still uncut.
    const k = N < 2 ? 1 : spec.rule === "cuboid" ? cuboidDims(spec)[n.findIndex((x) => Math.abs(x) > 0.5)] : spec.rows;
    const ds = solid.polys.flatMap((p) => p.verts.map((v) => dot(n, v)));
    const lo = Math.min(...ds), hi = Math.max(...ds);
    for (let j = 1; j < k; j++) out.push(lo + ((hi - lo) * j) / k);
  } else if (spec.rule === "prism" && spec.crystal) {
    // Crystal prism sides: one cut per side, through the middle of the whole prism.
    if (N > 1) out.push(0);
  } else if (spec.rule === "prism") {
    // Deep prism sides: `cuts` cuts per side, evenly spaced down to the centers of the side
    // faces next to it (like a megaminx crystal's). Each neighbor gets them from both of its
    // edges, so it's split into 2 × cuts equal columns.
    const deepest = Math.cos(TAU / spec.sides);
    if (N > 1) for (let k = 1; k <= spec.cuts; k++) out.push(1 - (k * (1 - deepest)) / spec.cuts);
  } else if (spec.rule === "skewb") {
    // N layers per corner axis: N − 1 planes x + y + z = k (for the corner (1, 1, 1)), spaced
    // w = 2/(N − 1) apart and centered on the middle. On the face z = 1, the plane k draws
    // the line x + y = k − 1, and the opposite-ish corner (1, 1, −1)'s draws x + y = k + 1;
    // together they're lines at odd multiples of w/2, parallel to both diagonals. So every
    // face is a grid of equal squares, with half squares at the edges and corners: the skewb
    // (N = 2) is its center diamond, the master skewb (N = 3) is 3 squares corner to corner,
    // the professor (N = 4) is 5.
    const w = 2 / (N - 1);
    for (let j = 0; j < N - 1; j++) out.push((w * (j - (N - 2) / 2)) / Math.sqrt(3));
  } else if (spec.rule === "neighbor-corners") {
    // N − 1 cuts per corner, evenly spaced from the plane through the corners next to it (the
    // dino cube's and chopasaurus's one cut) out toward the corner: size 3 on a cube is 1/3
    // and 2/3 of the way from the center to the corner.
    const ds = solid.polys.flatMap((p) => p.verts.map((v) => dot(n, v)));
    const hi = Math.max(...ds), ring = Math.max(...ds.filter((d) => d < hi - 1e-6));
    for (let j = 0; j < N - 1; j++) out.push(ring + ((hi - ring) * j) / (N - 1));
  } else if (spec.rule === "neighbor-centers") {
    // one cut per face, through the centers of the faces next to it
    if (N > 1) out.push(minxCenterDepth(normals, n));
  } else if (spec.rule === "depths") {
    // one fixed set of cuts, planes n·x = d (a fixed-size puzzle; size 1 and 0 still work)
    if (N > 1) out.push(...spec.depths);
  } else if (spec.rule === "steps") {
    // Shallow face turning on a triangle-faced solid (tetrahedron, octahedron), odd
    // N = 2m + 1 (m cuts per face). Each cut shows on the neighboring faces as a line
    // parallel to an edge, at height h (0 at the edge, 1 at the neighbor's far corner, which
    // is where n·x is lowest on both solids). Lines from the three edges must stay under
    // h = 1/3 or they cross each other. Along an edge, corner-to-first-cut and cut-to-cut are
    // the same step a; the middle is a bit longer, leaving a small center triangle of
    // height CENTER·a:   1 − 3ma = CENTER·a. Bigger CENTER = shallower cuts.
    const CENTER = spec.center ?? 0.6;
    const m = (N - 1) / 2, a = 1 / (3 * m + CENTER);
    const ds = solid.polys.flatMap((p) => p.verts.map((v) => dot(n, v)));
    const lo = Math.min(...ds), hi = Math.max(...ds); // hi: the face
    for (let k = 1; k <= m; k++) out.push(hi - (hi - lo) * k * a);
  } else if (spec.rule === "grid") {
    // Corner turning, like a pyraminx: cuts perpendicular to a corner's direction, spaced so
    // every face around that corner gets lines at heights k/N from the corner (a triangular
    // grid of N rows once all three corners' cuts are in). Heights run from the corner
    // (h = 0) to the plane through its neighboring corners (h = 1), so no cut reaches past
    // the faces around its own corner.
    const ds = solid.polys.flatMap((p) => p.verts.map((v) => dot(n, v)));
    const hi = Math.max(...ds), ring = Math.max(...ds.filter((d) => d < hi - 1e-6));
    for (let k = 1; k < N; k++) out.push(hi - ((hi - ring) * k) / N);
  } else if (spec.rule === "layers") {
    const ds = solid.polys.flatMap((p) => p.verts.map((v) => dot(n, v)));
    const lo = Math.min(...ds), hi = Math.max(...ds);
    for (let k = 1; k < N; k++) out.push(lo + ((hi - lo) * k) / N);
  } else {
    // t runs from the face's center (t = 0, where neighboring faces' cuts would meet)
    // to its edge (t = 1).
    const c0 = minxCenterDepth(normals, n);
    const m = Math.ceil((N - 1) / 2);
    // Every cut has to stay shallower than the limit, or it crosses faces beyond its
    // neighbors. Odd N: m evenly spaced rows between the edge and the limit, plus half a row
    // of margin for the center. Even N: the innermost cut just shy of the limit.
    const limit = minxLimitT(spec.solid, normals);
    const w = (1 - limit) / (m + 0.5);
    const tIn = minxEvenT(spec.solid, normals);
    const ts = N % 2
      ? Array.from({ length: m }, (_, k) => 1 - (k + 1) * w)
      : Array.from({ length: m }, (_, k) => tIn + (1 - tIn) * (1 - (k + 1) / m));
    for (const t of ts) out.push(c0 + (1 - c0) * t);
  }
  return out;
}

// n·x at the center of an adjacent face: where a cut parallel to face n crosses the
// middle of its neighbors (t = 0 above).
const minxCenterDepth = (normals, n) => Math.max(...normals.filter((m) => dot(m, n) < 1 - 1e-6).map((m) => dot(m, n)));

// Even minx: black out stickers in the thin strips through each face's middle. A sticker
// on face F is in a strip when its middle is past at most one of F's neighbors' innermost
// cut lines (the center is past none, a middle edge past one, a corner past two).
// Black out stickers made only by faces that share a corner with the sticker's face. On a
// face F, the regions that matter are the ones the cuts of F's edge neighbors make; each
// such region should be one sticker. On the icosahedron, cuts from the faces that only share
// a corner with F also slice through near F's corners, splitting some regions into a main
// sticker plus small extras that no other puzzle has. Group F's stickers by which side of
// every edge-neighbor cut they're on, keep one per group, black out the rest. The one kept
// is on the piece touching the most faces (near a corner the real corner piece is a small
// tip touching all 5 faces there, and the extra beside it is bigger), then the biggest.
// A cut's own face is +dir when its offset is positive, −dir when negative.
function blackOutStrays(pieces, normals, axes, solid) {
  // edge neighbors: faces whose polygons share an edge (two corners) on the solid. (Not
  // "the nearest angle": a soccer ball's hexagon has hexagon and pentagon neighbors at
  // different angles.)
  const polyOf = new Map(solid.polys.map((p) => [p.color, p]));
  const shares = (a, b) => a.verts.filter((v) => b.verts.some((w) => close(v, w, 1e-6))).length >= 2;
  const neighbors = new Map([...polyOf].map(([c, p]) => [c, solid.polys.filter((q) => q !== p && shares(p, q)).map((q) => normals[q.color])]));
  const cuts = axes.flatMap((ax) => ax.offsets.map((off) => ({ dir: ax.dir, off, face: off > 0 ? ax.dir : scale(ax.dir, -1) })));
  const cutsBy = new Map([...neighbors].map(([c, ns]) => [c, cuts.filter((cut) => ns.some((n) => close(n, cut.face, 1e-6)))]));
  const area = (vs) => { let a = [0, 0, 0]; for (let i = 1; i + 1 < vs.length; i++) a = add(a, cross(sub(vs[i], vs[0]), sub(vs[i + 1], vs[0]))); return len(a) / 2; };
  const best = new Map(), entries = [];
  const better = (x, y) => x.faces > y.faces || (x.faces === y.faces && x.a > y.a);
  pieces.forEach((p, pi) => {
    const faces = p.polys.filter((s) => s.color >= 0).length;
    p.polys.forEach((s, si) => {
      if (s.color < 0) return;
      const mid = scale(s.verts.reduce(add, [0, 0, 0]), 1 / s.verts.length);
      const sig = (cutsBy.get(s.color) || []).map((c) => (dot(c.dir, mid) > c.off ? 1 : 0)).join("");
      const e = { pi, si, key: s.color + ":" + sig, a: area(s.verts), faces };
      entries.push(e);
      if (!best.has(e.key) || better(e, best.get(e.key))) best.set(e.key, e);
    });
  });
  for (const { pi, si, key } of entries) {
    const b = best.get(key);
    if (b.pi === pi && b.si === si) continue;
    pieces[pi].polys = pieces[pi].polys.map((s, i) => (i === si ? { ...s, color: -1 } : s)); // copy: polys can be shared
  }
}

function blackOutMiddleStrips(pieces, normals, solidName) {
  const c0 = minxCenterDepth(normals, normals[0]);
  const inner = c0 + (1 - c0) * minxEvenT(solidName, normals);
  const inStrip = (s) => {
    const f = normals[s.color];
    const mid = scale(s.verts.reduce(add, [0, 0, 0]), 1 / s.verts.length);
    const neighbors = normals.filter((g) => Math.abs(dot(g, f) - c0) < 1e-6);
    return neighbors.filter((g) => dot(g, mid) > inner).length <= 1;
  };
  // copies, not mutation: an uncut polygon can be shared with the solid
  for (const p of pieces) p.polys = p.polys.map((s) => (s.color >= 0 && inStrip(s) ? { ...s, color: -1 } : s));
}

// spec: a PRESETS entry. size: the N above.
// Face cuts for a sized design of odd size N = 2m + 1 (m cuts per face): the innermost at
// `inner`, a depth where the cuts line up, and the rest evenly spaced between it and the
// surface. Used by the soccer ball, which has no clean depths above its inner one; spacing
// the outer rows evenly keeps the slivers they leave small.
// Even N works like an even minx: size N + 1's rows with the innermost cut nudged just
// shallower than `inner`, so the middle strips come out thin, and blacked out
// (blackOutFaceStrips).
const FACE_ROW_NUDGE = 0.005;
export const faceRowDepths = (inner, N) => {
  if (N > 1 && N % 2 === 0) {
    const m = N / 2, tIn = inner + FACE_ROW_NUDGE;
    return Array.from({ length: m }, (_, k) => tIn + (1 - tIn) * (1 - (k + 1) / m));
  }
  const m = Math.max(0, (N - 1) / 2);
  return Array.from({ length: Math.floor(m) }, (_, k) => 1 - ((k + 1) * (1 - inner)) / m);
};

// Even sized custom design: the minx rule on any solid. A sticker on face F is in a middle
// strip when its middle is past at most one of F's edge neighbors' innermost cuts.
function blackOutFaceStrips(pieces, normals, solid, f) {
  const polyOf = new Map(solid.polys.map((p) => [p.color, p]));
  const shares = (a, b) => a.verts.filter((v) => b.verts.some((w) => close(v, w, 1e-6))).length >= 2;
  const inner = new Map([...polyOf].map(([c, p]) => [c, solid.polys.filter((q) => q !== p && shares(p, q))
    .map((q) => { const n = normals[q.color]; return { n, d: f * surfaceAlong(solid, n) }; })]));
  const inStrip = (s) => {
    const mid = scale(s.verts.reduce(add, [0, 0, 0]), 1 / s.verts.length);
    return inner.get(s.color).filter(({ n, d }) => dot(n, mid) > d).length <= 1;
  };
  for (const p of pieces) p.polys = p.polys.map((s) => (s.color >= 0 && inStrip(s) ? { ...s, color: -1 } : s));
}

// ---------- custom solids ----------
const surfaceAlong = (solid, n) => Math.max(...solid.polys.flatMap((p) => p.verts.map((v) => dot(n, v))));

// A custom puzzle's cut sets, as [{ on, depths }] (an older declaration has one on/depths).
export const cutSets = (spec) => spec.cuts || (spec.on ? [{ on: spec.on, depths: spec.depths || [] }] : []);

// Trim faces: made by cutting off the base solid's corners or edges. Colors are spread
// around the hue circle, pale for corners and deeper for edges, so they read as their own
// family next to the base faces.
const trimColor = (kind, k, n) => `hsl(${Math.round((k * 360) / n + (kind === "vertex" ? 15 : 195))}, ${kind === "vertex" ? 45 : 40}%, ${kind === "vertex" ? 72 : 48}%)`;

// A custom puzzle's solid: the base solid, then optionally its corners and/or edges truncated
// (cut off flat) at spec.truncate.vertex / .edge, a fraction of the way from the center to
// the base solid's corner or edge. Truncating adds faces, with their own stickers.
export function customSolid(spec) {
  const { normals: raw, colors: baseColors } = SOLIDS[spec.solid];
  const baseNormals = raw.map(normalize);
  const baseSolid = buildSolid(baseNormals);
  const normals = baseNormals.slice(), colors = baseColors.slice(), labels = baseNormals.map(() => "face");
  let solid = baseSolid;
  for (const kind of ["vertex", "edge"]) {
    const f = spec.truncate && spec.truncate[kind];
    if (f === null || f === undefined) continue;
    const dirs = directions(baseSolid, baseNormals, kind);
    dirs.forEach((n, k) => {
      const face = normals.length;
      normals.push(n);
      labels.push(kind);
      colors.push(trimColor(kind, k, dirs.length));
      const [below] = splitPiece(solid, n, f * surfaceAlong(baseSolid, n), face);
      if (below) solid = below;
    });
  }
  return { baseNormals, baseSolid, normals, colors, labels, solid };
}

export function buildPuzzle(spec, size = spec.size) {
  const custom = spec.rule === "custom";
  let normals, colors, solid, baseSolid, baseNormals, labels = null;
  if (custom) ({ normals, colors, solid, baseSolid, baseNormals, labels } = customSolid(spec));
  else if (spec.rule === "cuboid" || spec.rule === "prism") {
    let dists;
    ({ normals, dists, colors, labels } = familySolid(spec));
    baseSolid = solid = buildSolid(normals, dists);
    baseNormals = normals;
  } else {
    normals = SOLIDS[spec.solid].normals.map(normalize);
    colors = SOLIDS[spec.solid].colors;
    baseSolid = solid = buildSolid(normals);
    baseNormals = normals;
  }
  const R = Math.max(...solid.polys.flatMap((p) => p.verts.map(len)));

  // Every cut plane, as (direction, depth). A custom puzzle gives its depths directly, each a
  // fraction of the way from the center (0) out to the surface (1) along the direction;
  // negative goes past the center. Cuts go around the truncated solid's faces, corners or
  // edges, so a face cut also cuts the faces a truncation made. Every depth applies to all
  // directions of its kind, a set the solid's rotations map onto itself, so every turn stays
  // legal. (A truncated solid's corners don't all sit on a rotation axis; cuts around those
  // split pieces but never turn.)
  const planes = [];
  // A sized custom design (faceRows) derives its face cuts from the size; see faceRowDepths.
  const cuts = custom ? (spec.faceRows !== undefined ? [{ on: "face", depths: faceRowDepths(spec.faceRows, size) }] : cutSets(spec)) : null;
  if (custom) {
    if (size > 1)
      for (const set of cuts)
        for (const n of cutDirections(solid, normals, set.on)) {
          const hi = surfaceAlong(solid, n);
          for (const f of set.depths) planes.push([n, f * hi]);
        }
  } else {
    for (const n of directions(solid, normals, spec.on))
      for (const d of cutDepths(spec, solid, normals, n, size)) planes.push([n, d]);
  }

  // Group planes into axes: parallel planes (either sign) share one axis.
  const axes = [];
  for (const [n, d] of planes) {
    let ax = axes.find((a) => Math.abs(Math.abs(dot(a.dir, n)) - 1) < 1e-6);
    if (!ax) axes.push((ax = { dir: n, offsets: [] }));
    const off = dot(ax.dir, n) > 0 ? d : -d;
    if (!ax.offsets.some((o) => Math.abs(o - off) < 1e-6)) ax.offsets.push(off);
  }

  let pieces = size > 0 ? [solid] : [];
  for (const ax of axes)
    for (const off of ax.offsets)
      pieces = pieces.flatMap((p) => splitPiece(p, ax.dir, off, -1).filter(Boolean));

  const group = rotationGroup(normals, labels);
  for (const ax of axes) {
    ax.offsets.sort((a, b) => a - b);
    ax.layers = ax.offsets.length + 1;
    ax.order = group.mats.filter((m) => close(applyMat(m, ax.dir), ax.dir, 1e-5)).length;
    ax.rot = Array.from({ length: ax.order }, (_, q) => group.find(rotMat(ax.dir, (q * TAU) / ax.order)));
    // faces nearest each end of the axis: what you'd grab to turn from that end
    const ends = (e) => { const best = Math.max(...normals.map((n) => dot(n, e))); return normals.map((n, i) => i).filter((i) => dot(normals[i], e) > best - 1e-3); };
    ax.posFaces = ends(ax.dir);
    ax.negFaces = ends(scale(ax.dir, -1));
  }

  if (spec.rule === "minx" && size > 1 && size % 2 === 0) blackOutMiddleStrips(pieces, normals, spec.solid);
  if (spec.faceRows !== undefined && size > 1 && size % 2 === 0) blackOutFaceStrips(pieces, normals, solid, spec.faceRows + FACE_ROW_NUDGE);
  if (spec.blackOutStrays) blackOutStrays(pieces, normals, axes, solid);

  for (const p of pieces) {
    const vs = p.polys.flatMap((q) => q.verts);
    p.centroid = scale(vs.reduce(add, [0, 0, 0]), 1 / vs.length);
    p.stickers = p.polys.filter((q) => q.color >= 0);
    p.onAxis = len(p.centroid) > 1e-6 && axes.some((a) => a.order > 1 && len(cross(a.dir, p.centroid)) < 1e-6);
  }

  const types = pieceTypes(pieces, group);
  if (spec.blackout && spec.blackout.length) {
    const off = new Set(spec.blackout);
    pieces.forEach((p, i) => {
      if (!off.has(types[i])) return;
      p.polys = p.polys.map((s) => (s.color >= 0 ? { ...s, color: -1 } : s)); // copies: polys can be shared
      p.stickers = [];
    });
  }

  // A layer is empty when none of its pieces shows a sticker (all blacked out, or all
  // hidden inside). Turning it changes nothing you can see, so the controls leave it out.
  // It stays empty in every state: turns only move pieces between positions of the same
  // type, so whether a layer's positions hold sticker-less pieces never changes.
  const turning = axes.filter((a) => a.order > 1);
  for (const ax of turning) {
    ax.empty = Array.from({ length: ax.layers }, () => true);
    for (const p of pieces) {
      if (!p.stickers.length) continue;
      const t = dot(ax.dir, p.centroid);
      let L = 0;
      while (L < ax.offsets.length && ax.offsets[L] < t) L++;
      ax.empty[L] = false;
    }
  }

  return { spec, size, normals, colors, textures: faceTextures(colors), texturesByDefault: colors.length >= TEXTURE_MIN_FACES, solid, R, axes: turning, pieces, group, types, cuts };
}

// A piece's type: the set of pieces the solid's rotations carry it onto (all the corners,
// all the tips...). The cuts share the solid's symmetry, so rotating a piece always lands
// exactly on another piece; match them by centroid. Types are numbered in order of their
// first piece, which is stable for a given declaration (so a shared link can name them).
export function pieceTypes(pieces, group) {
  const key = (v) => v.map((x) => Math.round(x * 1e5)).join(",");
  const at = new Map(pieces.map((p, i) => [key(p.centroid), i]));
  const parent = pieces.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const m of group.mats)
    pieces.forEach((p, i) => {
      const j = at.get(key(applyMat(m, p.centroid)));
      if (j !== undefined) parent[find(i)] = find(j);
    });
  const number = new Map();
  return pieces.map((_, i) => {
    const r = find(i);
    if (!number.has(r)) number.set(r, number.size);
    return number.get(r);
  });
}

// For the puzzle builder: how many pieces show, and how small the smallest sticker is as a
// fraction of its face (slivers show up as tiny values).
export function puzzleStats(P) {
  const area = (vs) => { let a = [0, 0, 0]; for (let i = 1; i + 1 < vs.length; i++) a = add(a, cross(sub(vs[i], vs[0]), sub(vs[i + 1], vs[0]))); return len(a) / 2; };
  const faceArea = {};
  for (const f of P.solid.polys) faceArea[f.color] = area(f.verts);
  let smallest = Infinity;
  for (const p of P.pieces) for (const s of p.stickers) smallest = Math.min(smallest, area(s.verts) / faceArea[s.color]);
  return { pieces: P.pieces.filter((p) => p.stickers.length).length, smallest: Number.isFinite(smallest) ? smallest : 0 };
}

// Look up a piece by its centroid, to within 1e-6. Centroids go in a grid of 1e-4 cells;
// a lookup checks the neighboring cells too, so a point near a cell edge still matches.
export function pieceFinder(pieces) {
  const cell = (v) => v.map((x) => Math.floor(x * 1e4));
  const grid = new Map();
  for (const p of pieces) {
    const k = cell(p.centroid).join(",");
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  return (v) => {
    const [a, b, c] = cell(v);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++)
      for (const p of grid.get(`${a + i},${b + j},${c + k}`) || []) if (close(p.centroid, v, 1e-6)) return p;
    return null;
  };
}

// ---------- presets as custom puzzles ----------
// Any built puzzle as a custom declaration that builds the same pieces and stickers: its cut
// depths along one axis as fractions of the surface distance, and the kinds of piece it
// blacks out. On solids where every direction's opposite is cut too, a negative depth is
// the opposite direction's positive one, so only depths ≥ 0 are kept.
export function toCustom(P) {
  if (P.spec.rule === "custom") {
    const out = { name: "Custom", rule: "custom", size: 2, fixed: true, solid: P.spec.solid, truncate: { ...(P.spec.truncate || {}) },
      cuts: (P.size > 1 ? P.cuts : []).map((c) => ({ on: c.on, depths: c.depths.slice() })), blackout: (P.spec.blackout || []).slice() };
    // an even sized design blacks out its middle strips too: find their kinds by comparing
    if (P.spec.faceRows === undefined || P.size < 2 || P.size % 2) return out;
    const plain = buildPuzzle({ ...out, blackout: [] });
    const at = pieceFinder(P.pieces), blackout = new Set();
    plain.pieces.forEach((q, i) => {
      const r = at(q.centroid);
      if (r && q.stickers.length && !r.stickers.length) blackout.add(plain.types[i]);
    });
    return { ...out, blackout: [...blackout].sort((a, b) => a - b) };
  }
  const { solid, on } = P.spec;
  const base = { name: "Custom", rule: "custom", size: 2, fixed: true, solid, cuts: [{ on, depths: [] }], truncate: {}, blackout: [] };
  if (!P.axes.length) return base;
  const dirs = directions(P.solid, P.normals, on);
  const symmetric = dirs.some((n) => close(n, scale(dirs[0], -1)));
  const ax = P.axes[0];
  const hi = Math.max(...P.solid.polys.flatMap((q) => q.verts.map((v) => dot(ax.dir, v))));
  let depths = ax.offsets.map((o) => o / hi);
  if (symmetric) depths = depths.filter((f) => f > -1e-9).map((f) => Math.abs(f));
  depths = depths.filter((f, i) => !depths.slice(0, i).some((g) => Math.abs(g - f) < 1e-9)).sort((a, b) => a - b);
  // black out every kind whose pieces show stickers in the plain cut but not in P
  const plain = buildPuzzle({ ...base, cuts: [{ on, depths }] });
  const at = pieceFinder(P.pieces);
  const blackout = new Set();
  plain.pieces.forEach((q, i) => {
    const r = at(q.centroid);
    if (r && q.stickers.length && !r.stickers.length) blackout.add(plain.types[i]);
  });
  return { ...base, cuts: [{ on, depths }], blackout: [...blackout].sort((a, b) => a - b) };
}

// ---------- textures ----------
// Past 12 faces there are more colors than can all look clearly different, so every face
// also gets a texture by default, drawn as ink over its color (see the sticker shader in
// index.html). Smaller puzzles get them too, off by default (the textures button).
// The texture is fixed to the screen, not the sticker ("unmoving plaid"): stickers are
// windows onto it, so a turned piece's pattern never looks turned.
export const TEXTURES = ["plain", "stripes", "grid", "dots", "checker", "wavy", "honeycomb"];
export const TEXTURE_MIN_FACES = 13;

// "#rrggbb", "hsl(h, s%, l%)" or "oklch(l c h)" to OKLab, where distance tracks how
// different colors look
function oklab(css) {
  const lch = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(css);
  if (lch) { const [l, c, h] = [+lch[1], +lch[2], (+lch[3] * Math.PI) / 180]; return [l, c * Math.cos(h), c * Math.sin(h)]; }
  let rgb;
  const hsl = /hsl\(\s*([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%/.exec(css);
  if (hsl) {
    const [h, sa, l] = [+hsl[1], hsl[2] / 100, hsl[3] / 100];
    const f = (k) => { const m = (k + h / 30) % 12; return l - sa * Math.min(l, 1 - l) * Math.max(-1, Math.min(m - 3, 9 - m, 1)); };
    rgb = [f(0), f(8), f(4)];
  } else rgb = [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * q, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * q, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * q];
}
export const colorDistance = (a, b) => len(sub(oklab(a), oklab(b)));

// A texture index per face. Faces sharing a texture should
// have colors far apart, so the closest pairs of colors get told apart by texture. Greedy
// first: take faces in order of how close their nearest look-alike is, and give each the
// texture whose faces so far are farthest from it in color (ties to the least used texture).
// Then swaps, to push the closest same-texture pair apart.
export function faceTextures(colors) {
  const n = colors.length, T = TEXTURES.length;
  const d = colors.map((a) => colors.map((b) => colorDistance(a, b)));
  const nearest = (i) => Math.min(...d[i].filter((_, j) => j !== i));
  const order = colors.map((_, i) => i).sort((a, b) => nearest(a) - nearest(b) || a - b);
  const out = new Array(n), members = Array.from({ length: T }, () => []);
  for (const i of order) {
    let best = 0, bestScore = -Infinity;
    for (let t = 0; t < T; t++) {
      const sep = Math.min(Infinity, ...members[t].map((j) => d[i][j]));
      const score = Math.min(sep, 10) - members[t].length * 1e-3;
      if (score > bestScore) { best = t; bestScore = score; }
    }
    out[i] = best;
    members[best].push(i);
  }
  // Then swap: take the closest pair sharing a texture and trade one of them with another
  // face, as long as that pushes the closest same-texture pair farther apart.
  const worst = () => {
    let w = Infinity, pair = null;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (out[i] === out[j] && d[i][j] < w) { w = d[i][j]; pair = [i, j]; }
    return [w, pair];
  };
  for (let round = 0; round < 4 * n; round++) {
    const [w, pair] = worst();
    if (!pair) break;
    let bestGain = w, swap = null;
    for (const a of pair)
      for (let b = 0; b < n; b++) {
        if (out[b] === out[a]) continue;
        [out[a], out[b]] = [out[b], out[a]];
        const [w2] = worst();
        [out[a], out[b]] = [out[b], out[a]];
        if (w2 > bestGain + 1e-9) { bestGain = w2; swap = [a, b]; }
      }
    if (!swap) break;
    const [a, b] = swap;
    [out[a], out[b]] = [out[b], out[a]];
  }
  return out;
}

// ---------- snapping custom depths ----------
// Slivers come from near misses: planes crossing close to something without reaching it.
// An aligned depth is one where a near miss becomes exact:
//   1. a plane passes through a corner of the solid
//   2. two different planes cross an edge at the same point
//   3. three planes meet at one point on a face
// One depth f is unknown and every other plane is fixed, so each is a linear solve. The
// unknown planes are n·x = f·h, where h is the surface distance along n (it can differ
// between directions of one kind, like a truncated cube's squares and triangles). The
// solid's rotations make faces of one kind alike, and their edges alike, so one face of each
// kind and its edges are enough to check.
//
// planes: [{ n, h, d }] with d null for the unknown ones. Returns candidate values of f.
function alignments(solid, normals, labels, planes) {
  const out = [];
  const unknown = planes.filter((p) => p.d === null);
  // 1. through a corner
  for (const p of unknown) for (const v of solid.polys.flatMap((q) => q.verts)) out.push(dot(p.n, v) / p.h);
  const kinds = [...new Set(solid.polys.map((q) => labels[q.color]))];
  for (const kind of kinds) checkFace(solid.polys.find((q) => labels[q.color] === kind));
  return out;

  function checkFace(face) {
    const vs = face.verts, nF = normals[face.color], dF = dot(nF, vs[0]); // the face's plane: nF·x = dF
    // fixed planes only matter where they cross this face
    const crosses = (p) => { const s = vs.map((v) => dot(p.n, v) - p.d); return Math.min(...s) < -1e-9 && Math.max(...s) > 1e-9; };
    const here = planes.filter((p) => Math.abs(Math.abs(dot(p.n, nF)) - 1) > 1e-9 && (p.d === null || crosses(p)));
    // 2. two planes crossing one of this face's edges at the same point, at parameter t
    vs.forEach((A, k) => {
      const D = sub(vs[(k + 1) % vs.length], A);
      const cs = here.map((p) => { const s = dot(p.n, D); return Math.abs(s) < 1e-9 ? null : { ...p, a: dot(p.n, A), s }; }).filter(Boolean);
      for (let x = 0; x < cs.length; x++)
        for (let y = x + 1; y < cs.length; y++) {
          const p = cs[x], q = cs[y];
          if (p.d !== null && q.d !== null) continue;
          let f, t;
          if (p.d === null && q.d === null) {
            // (f·hp − ap)/sp = (f·hq − aq)/sq
            const k2 = p.h / p.s - q.h / q.s;
            if (Math.abs(k2) < 1e-12) continue;
            f = (p.a / p.s - q.a / q.s) / k2;
            t = (f * p.h - p.a) / p.s;
          } else {
            const [u, w] = p.d === null ? [p, q] : [q, p];
            t = (w.d - w.a) / w.s;
            f = (u.a + t * u.s) / u.h;
          }
          if (t > 1e-6 && t < 1 - 1e-6) out.push(f);
        }
    });
    // 3. three planes meeting at a point strictly inside this face (solve for it and f)
    for (let x = 0; x < here.length; x++)
      for (let y = x + 1; y < here.length; y++)
        for (let z = y + 1; z < here.length; z++) {
          const tri = [here[x], here[y], here[z]];
          if (tri.every((p) => p.d !== null)) continue;
          const rows = tri.map((p) => (p.d === null ? [...p.n, -p.h, 0] : [...p.n, 0, p.d]));
          const sol = solve4([...rows, [...nF, 0, dF]]);
          if (!sol) continue;
          const pt = sol.slice(0, 3);
          const inside = vs.every((a, k) => dot(cross(sub(vs[(k + 1) % vs.length], a), sub(pt, a)), nF) > 1e-7);
          if (inside) out.push(sol[3]);
        }
  }
}

// the directions a cut set goes around, on the (possibly truncated) solid: every face that
// exists, and every corner or edge
function cutDirections(solid, normals, on) {
  if (on === "face") return [...new Set(solid.polys.map((p) => p.color))].map((c) => normals[c]);
  return directions(solid, normals, on);
}

// What a snap target is: { cut: s, i } (cut i of cut set s) or { trim: "vertex" | "edge" }.
export const CUT_RANGE = [-0.95, 0.99], TRIM_RANGE = [0.34, 0.99];

export function alignedDepthCandidates(spec, target) {
  const uniq = (fs, [lo, hi], skip = () => false) => {
    const out = [];
    for (const f of fs) if (f > lo && f < hi && !skip(f) && !out.some((g) => Math.abs(g - f) < 1e-7)) out.push(f);
    return out.sort((a, b) => a - b);
  };
  if (target.trim) {
    // a truncation's planes against the solid without it (the other truncation stays)
    const truncate = { ...(spec.truncate || {}) };
    delete truncate[target.trim];
    const g = customSolid({ ...spec, truncate });
    const planes = directions(g.baseSolid, g.baseNormals, target.trim).map((n) => ({ n, h: surfaceAlong(g.baseSolid, n), d: null }));
    return uniq(alignments(g.solid, g.normals, g.labels, planes), TRIM_RANGE);
  }
  const { s, i } = target;
  const g = customSolid(spec), sets = cutSets(spec);
  const planes = sets.flatMap((set, si) => cutDirections(g.solid, g.normals, set.on).flatMap((n) => {
    const h = surfaceAlong(g.solid, n);
    return set.depths.map((f, j) => ({ n, h, d: si === s && j === i ? null : f * h }));
  }));
  // landing exactly on another cut of the same kind (or, when opposite directions are both
  // cut, its mirror) just merges the two cuts, so those don't count
  const dirs = cutDirections(g.solid, g.normals, sets[s].on);
  const symmetric = dirs.some((n) => close(n, scale(dirs[0], -1)));
  const others = sets.flatMap((set, si) => (set.on === sets[s].on ? set.depths.filter((_, j) => !(si === s && j === i)) : []));
  const merges = (f) => others.some((o) => Math.abs(f - o) < 1e-6 || (symmetric && Math.abs(f + o) < 1e-6));
  return uniq(alignments(g.solid, g.normals, g.labels, planes), CUT_RANGE, merges);
}

// Solve a 4×4 system given as rows [a, b, c, e, rhs]. Null if singular.
function solve4(rows) {
  const M = rows.map((r) => [...r]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-10) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, k) => r[4] / r[k]);
}

// A candidate is worth snapping to when the near miss's leftover is clearly bigger at the
// exact depth than just to either side (it vanishes there). For a cut that's the smallest
// sticker; for a truncation, the shortest edge of the solid (a near miss leaves a sliver of
// an edge). maxPieces skips candidates too big to build quickly. One candidate per call, so
// a page can spread the work out.
export function isGoodSnap(spec, target, f, maxPieces = 6000) {
  const at = (v) => {
    if (target.trim) return shortestEdge(customSolid({ ...spec, truncate: { ...(spec.truncate || {}), [target.trim]: v } }).solid);
    const cuts = cutSets(spec).map((set, si) => (si === target.s ? { ...set, depths: set.depths.map((d, j) => (j === target.i ? v : d)) } : set));
    const P = buildPuzzle({ ...spec, cuts, blackout: [] });
    return P.pieces.length > maxPieces ? null : puzzleStats(P).smallest;
  };
  const here = at(f);
  if (here === null || here <= 0) return false;
  const lo = at(f - 0.002), hi = at(f + 0.002);
  return lo !== null && hi !== null && here > 1.3 * Math.min(lo, hi);
}
export const snapDepths = (spec, target, maxPieces) => alignedDepthCandidates(spec, target).filter((f) => isGoodSnap(spec, target, f, maxPieces));

function shortestEdge(solid) {
  let m = Infinity;
  for (const p of solid.polys)
    p.verts.forEach((v, k) => { const l = len(sub(p.verts[(k + 1) % p.verts.length], v)); if (l > 1e-7 && l < m) m = l; });
  return m;
}

// ---------- state and moves ----------
// A move is { axis, layer, q }: turn layer `layer` of axis `axis` by q × (360° / order),
// counterclockwise looking down the axis from its + end.

export const solvedState = (P) => new Int32Array(P.pieces.length);

export function layerOf(P, state, i, axis) {
  const ax = P.axes[axis];
  const t = dot(ax.dir, applyMat(P.group.mats[state[i]], P.pieces[i].centroid));
  let L = 0;
  while (L < ax.offsets.length && ax.offsets[L] < t) L++;
  return L;
}

export function piecesInLayer(P, state, axis, layer) {
  const out = [];
  for (let i = 0; i < P.pieces.length; i++) if (layerOf(P, state, i, axis) === layer) out.push(i);
  return out;
}

export function applyMove(P, state, { axis, layer, q }) {
  const ax = P.axes[axis], r = ax.rot[mod(q, ax.order)];
  for (const i of piecesInLayer(P, state, axis, layer)) state[i] = P.group.mul[r][state[i]];
  return state;
}

export const inverseMove = (P, m) => ({ ...m, q: mod(-m.q, P.axes[m.axis].order) });

// Solved means every face shows one color, which ignores whole-puzzle rotations and
// pieces that look identical (like a rotated center).
export function isSolved(P, state) {
  const seen = new Array(P.normals.length).fill(-1);
  for (let i = 0; i < P.pieces.length; i++) {
    const perm = P.group.facePerm[state[i]];
    for (const s of P.pieces[i].stickers) {
      const f = perm[s.color];
      if (seen[f] === -1) seen[f] = s.color;
      else if (seen[f] !== s.color) return false;
    }
  }
  return true;
}

// The whole-puzzle rotation g of the solved puzzle that best matches the current state (the
// solved card shows the puzzle turned by it). On a cube, middle-slice turns move the
// centers, so "solved" can mean any of 24 orientations. In order, ties going to the next:
//  1. Pieces sitting on a turning axis (a 3×3's centers, and hidden ones) that are where g
//     puts them, since that's how people read a cube's orientation. By where they sit, not
//     which way they're twisted: a pyraminx tip twisted in place is still where g puts it.
//     (Not on puzzles whose scrambles hold one corner still: there the pieces on axes are
//     corners that move about.)
//  2. A group of pieces that fit g: every sticker on the face g puts its color on (with two
//     or more stickers, that's the right spot and the right twist). Pieces solved relative
//     to each other fit the same g (it's the number they share), so this follows real
//     progress, like a finished layer or a block, where a plain sticker count can be swayed
//     by scattered stickers that happen to agree with some other orientation (a 2×2's solved
//     layer, or a crystal prism's white face shown turned). Only once it's a face's worth.
//     Between groups the same size: the one with more white in it (white is where people
//     start).
//  3. On puzzles whose scrambles hold one corner still (2×2, skewb, pentultimate: see
//     scrambleLayers), that corner being where g puts it: a fresh scramble keeps showing the
//     orientation it started in, until a group takes over.
//  4. Stickers on the face g puts them on.
// Full ties keep `prefer`, so the answer doesn't flicker between equal orientations.
export function closestOrientation(P, state, prefer = 0) {
  scrambleLayers(P);
  const G = P.group;
  const pieces = P.pieces.map((piece, i) => ({ piece, at: applyMat(G.mats[state[i]], piece.centroid), perm: G.facePerm[state[i]] }));
  // Groups count pieces with two or more stickers (a one-sticker piece fits just by being on
  // the right face, so they pad out chance matches), and only once they're real progress,
  // not a scramble's coincidence: a face's worth, the fewest such pieces showing any one
  // color (a 2×2's four corners per face, a hexagonal crystal prism's six wedges)
  const multi = (piece) => piece.stickers.length >= 2;
  if (P.faceWorth === undefined) {
    const per = new Array(P.normals.length).fill(0);
    for (const piece of P.pieces) if (multi(piece)) for (const c of new Set(piece.stickers.map((s) => s.color))) per[c]++;
    const counts = per.filter((n) => n > 0);
    P.faceWorth = counts.length ? Math.max(2, Math.min(...counts)) : Infinity;
  }
  const anchored = P.anchor !== null && P.pieces.length;
  const WHITE = P.colors.findIndex((c) => c.toLowerCase() === "#f4f4ee");
  // the group: [size, white pieces in it], or zeros if it's too small to count. Then
  // anchored: [group…, the anchor fits, stickers]; otherwise
  // [on-axis pieces in place, group…, stickers] (compared in order)
  const score = (g) => {
    const ref = G.facePerm[g], M = G.mats[g];
    let axis = 0, fit = 0, white = 0, stickers = 0;
    for (const { piece, at, perm } of pieces) {
      if (!anchored && piece.onAxis && close(at, applyMat(M, piece.centroid), 1e-6)) axis++;
      if (!piece.stickers.length) continue;
      let all = true;
      for (const s of piece.stickers) if (perm[s.color] === ref[s.color]) stickers++; else all = false;
      if (!all || !multi(piece)) continue;
      fit++;
      if (piece.stickers.some((s) => s.color === WHITE)) white++;
    }
    const group = fit >= P.faceWorth ? [fit, white] : [0, 0];
    return anchored ? [...group, state[P.anchor] === g ? 1 : 0, stickers] : [axis, ...group, stickers];
  };
  const better = (a, b) => { for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k]; return false; };
  let best = prefer, bestScore = score(prefer);
  for (let g = 0; g < G.mats.length; g++) {
    const c = score(g);
    if (better(c, bestScore)) { best = g; bestScore = c; }
  }
  return best;
}

export function randomMoves(P, count, rand = Math.random) {
  const out = [];
  if (!P.axes.length) return out; // size 0 or 1: nothing turns
  let last = -1;
  while (out.length < count) {
    const axis = Math.floor(rand() * P.axes.length);
    if (axis === last && P.axes.length > 1) continue;
    const ax = P.axes[axis];
    out.push({ axis, layer: Math.floor(rand() * ax.layers), q: 1 + Math.floor(rand() * (ax.order - 1)) });
    last = axis;
  }
  return out;
}

// The layers a scramble may turn so the puzzle keeps its orientation, as a list of
// { axis, layer }. Like a speedcubing scramble: pieces sitting on a turning axis (a 3×3's
// centers, a pyraminx's tips) may spin in place but never leave their axis, so a 3×3 gets
// face turns and no slices. Where every layer would carry some other axis's piece (skewb,
// pentultimate), keep one piece fixed instead, the way a 2×2 scramble only turns R, U, F.
export function scrambleLayers(P) {
  if (P.scrambleLayers) return P.scrambleLayers;
  const s = solvedState(P);
  const layers = P.axes.flatMap((ax, axis) => Array.from({ length: ax.layers }, (_, layer) => ({ axis, layer })))
    .filter(({ axis, layer }) => !P.axes[axis].empty[layer]); // turning an empty layer shows nothing
  const axisOf = (i) => P.axes.findIndex((a) => len(cross(a.dir, P.pieces[i].centroid)) < 1e-6);
  const keep = (bad) => layers.filter(({ axis, layer }) => !piecesInLayer(P, s, axis, layer).some((i) => bad(i, axis)));
  const offAxis = keep((i, axis) => P.pieces[i].onAxis && axisOf(i) !== axis);
  P.anchor = null;
  // on-axis pieces only pin the orientation if they sit on two different axes: a 2-layer
  // hexagonal prism's only ones are its cap centers, which leave it free to spin about them
  const pinning = new Set(P.pieces.map((p, i) => (p.onAxis ? axisOf(i) : -1)).filter((a) => a >= 0));
  // and the layers left have to reach every axis (an odd prism's side axes each run
  // through a piece on the far edge, which would leave only the caps to turn)
  const reach = new Set(offAxis.map((l) => l.axis)), all = new Set(layers.map((l) => l.axis));
  // and they can leave out at most one layer per axis: turning the one left out is the same as
  // turning the rest the other way and the whole puzzle, but with two left out (a 4×4×4
  // octahedron's centers sit in both inner layers) turning just one of them is never reached,
  // and the scramble leaves a quarter of the pieces home
  const oneOut = [...all].every((a) => layers.filter((l) => l.axis === a).length - offAxis.filter((l) => l.axis === a).length <= 1);
  if (pinning.size >= 2 && reach.size === all.size && oneOut) return (P.scrambleLayers = offAxis);
  // Otherwise (no pieces on an axis, like even cubes, or no layer free of them): the piece
  // with the most stickers (a corner), held still. It also defines the orientation for
  // closestOrientation.
  P.anchor = P.pieces.reduce((b, p, i) => (p.stickers.length > P.pieces[b].stickers.length ? i : b), 0);
  return (P.scrambleLayers = keep((i) => i === P.anchor));
}

// count random turns of the scrambleLayers, never the same axis twice in a row
export function scrambleMoves(P, count, rand = Math.random) {
  const slots = scrambleLayers(P), out = [];
  if (!slots.length) return out; // size 0 or 1: nothing turns
  const axes = new Set(slots.map((s) => s.axis));
  let last = -1;
  while (out.length < count) {
    const { axis, layer } = slots[Math.floor(rand() * slots.length)];
    if (axis === last && axes.size > 1) continue;
    out.push({ axis, layer, q: 1 + Math.floor(rand() * (P.axes[axis].order - 1)) });
    last = axis;
  }
  return out;
}

// Label a move from whichever end of its axis is nearer the turning layer, in cubing
// style: depth prefix (omitted for the outer layer), then "" / ' / 2 / 2' for the turn,
// counted clockwise as seen looking at that end.
export function moveLabel(P, { axis, layer, q }) {
  const ax = P.axes[axis], n = ax.order;
  const posDepth = ax.layers - layer, negDepth = layer + 1;
  const fromPos = posDepth <= negDepth;
  const depth = fromPos ? posDepth : negDepth;
  const cw = mod(fromPos ? -q : q, n);
  const k = cw <= n / 2 ? cw : n - cw;
  const suffix = (k === 1 ? "" : String(k)) + (cw > n / 2 ? "'" : "");
  return {
    colors: (fromPos ? ax.posFaces : ax.negFaces).map((f) => P.colors[f]),
    depth: depth > 1 ? depth : null,
    suffix,
  };
}
