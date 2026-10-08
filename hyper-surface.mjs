// A hyperbolic puzzle's surface in 3D (hyper.mjs's surfaces: closed, two-sided).
//
// The surface itself, as a triangle mesh: each tile sampled in rings about its middle (in its own
// frame, tile 0's coordinates in the disk), the points on its edges and corners shared with the
// tiles around (found through the surface's group: a corner is a corner coset, an edge point an
// edge coset and how far along). Then, for a two-holed surface, laid on a pretzel in space: laid
// flat as a plate's top and bottom (plateLayout), a smooth pretzel fitted to that (pretzel), and
// the tiles moved over it to keep their shapes (implicitShape; kept in regular-maps/shapes/ by
// data/add-shapes.mjs as packShape packs it, and drawn from by implicitSurface). Every vertex keeps
// where it is on its tile (tile, point in the disk), for painting the tiles on.
import { mobius as Mb } from "./hyper.mjs";

const abs = (z) => Math.hypot(z[0], z[1]);
// the point a share t of the way (hyperbolically) from disk point p to q
function along(p, q, t) {
  const to = Mb.to(p), w = Mb.apply(Mb.inv(to), q), r = abs(w);
  if (r < 1e-15) return p;
  const s = Math.tanh(t * Math.atanh(r)) / r;
  return Mb.apply(to, [w[0] * s, w[1] * s]);
}

// A mesh point's name: tile t's point on ring a (0 the middle, `rings` its rim), b of the way round
// (N·perEdge in all, from its first dart's corner 0). Points on edges and corners are named by
// their coset, so every tile there names them the same.
function meshKey(P, rings, perEdge) {
  const { G, H } = P, N = G.N, reps = H.coset.face.reps;
  const rPow = (h, k) => { let y = h; for (let i = 0; i < ((k % N) + N) % N; i++) y = H.right[0][y]; return y; };
  return (t, a, b) => {
    if (a === 0) return `c:${t}`;
    if (a < rings) return `i:${t}:${a}:${b}`;
    const h = reps[t], k = Math.floor(b / perEdge), j = b % perEdge;
    if (j === 0) return `v:${H.coset.vertex.of[rPow(h, k)]}`;
    // (edge k is, seen from dart y = h·R^(k − edge), that dart's own edge; its coset's first
    // dart runs it the same way, the other (y·RS, the half turn about its middle) backwards)
    const y = rPow(h, k - G.edge), E = H.coset.edge.of[y], fwd = H.coset.edge.reps[E] === y;
    return `e:${E}:${fwd ? j : perEdge - j}`;
  };
}

// How finely to sample the tiles for the 3D view (rings and points an edge alike): about 2000
// points in all, so a surface of few tiles gets enough for its rims to have room between them; even,
// and at least 4.
export function meshDetail(P) {
  return Math.max(4, 2 * Math.round(Math.sqrt(2000 / (P.H.coset.face.reps.length * P.G.N)) / 2));
}

// The surface's mesh. P: a built hyperbolic puzzle (its G, H). rings: from a tile's middle out to
// its edge; perEdge: samples along each edge. Returns { verts: [{ key }], tris: [[a, b, c]] (tile
// by tile, the same number each), local (per triangle, its corners' points in the disk), tiles:
// [{ tile, dart, at: [[vertex, a point of it in the disk]] }], index: key → vertex, rings, perEdge }.
// (On a surface of a few tiles, a tile's corners and edges are glued to each other, and one vertex
// is at more than one place round the same tile: a triangle's own points are in local.)
export function surfaceMesh(P, rings = 6, perEdge = 6) {
  const { G, H } = P, N = G.N, reps = H.coset.face.reps, index = new Map(), verts = [], tris = [], local = [], tiles = [];
  const id = (key) => { if (!index.has(key)) { index.set(key, verts.length); verts.push({ key }); } return index.get(key); };
  const B = N * perEdge, name = meshKey(P, rings, perEdge);
  // (tile 0's edge points, in order round it: corner k, then along the edge to corner k + 1)
  const edgePts = [];
  for (let k = 0; k < N; k++) for (let j = 0; j < perEdge; j++) edgePts.push(along(G.corners[k], G.corners[(k + 1) % N], j / perEdge));
  reps.forEach((h, t) => {
    const at = [], key = (a, b) => name(t, a, b);
    const point = (a, b) => (a === 0 ? [0, 0] : along([0, 0], edgePts[b], a / rings));
    const v = (a, b) => { const i = id(key(a, b % B)); at.push([i, point(a, b % B)]); return i; };
    const tri = (...corners) => { tris.push(corners.map(([a, b]) => v(a, b))); local.push(corners.map(([a, b]) => point(a, b % B))); };
    for (let b = 0; b < B; b++) {
      tri([0, 0], [1, b], [1, b + 1]);
      for (let a = 1; a < rings; a++) { tri([a, b], [a + 1, b], [a + 1, b + 1]); tri([a, b], [a + 1, b + 1], [a, b + 1]); }
    }
    tiles.push({ tile: t, dart: h, at: [...new Map(at).entries()] });
  });
  return { verts, tris, local, tiles, index, rings, perEdge };
}

// The surface moved by its symmetry z (an element of the turn group: each dart d to z·d), as a map
// of the mesh's vertices
function movedBy(P, mesh, z) {
  const { G, H } = P, N = G.N, { rings, perEdge, index } = mesh, B = N * perEdge, name = meshKey(P, rings, perEdge);
  const reps = H.coset.face.reps, jOf = new Int32Array(H.n);
  for (const h of reps) for (let j = 0, y = h; j < N; j++, y = H.right[0][y]) jOf[y] = j;
  const map = new Int32Array(mesh.verts.length).fill(-1);
  reps.forEach((h, t) => {
    const y = H.mul(z, h), t2 = H.coset.face.of[y], m = jOf[y];
    for (let a = 0; a <= rings; a++) for (let b = 0; b < (a ? B : 1); b++) map[index.get(name(t, a, b))] = index.get(name(t2, a, (b + m * perEdge) % B));
  });
  return map;
}

// When the half turn's still points are all tile middles (an even number of sides, each tile
// turned half round about its middle): its rims and bridges straight, each a line from a tile's
// middle through an edge's middle to the next tile's middle. Round the still points: rim, bridge,
// rim, bridge, …; at each tile the rim through one pair of opposite edges and the bridge through
// another, as near square to it as there's a way round that comes back. Returns { rims: [way, …],
// bridges: [[way, other half], …] } in order round: rim 0 from tile a to b, bridge 0 from b to c,
// rim 1 from c to d, …, the last bridge back to a; or null.
function squarePlan(P, mesh, still) {
  const N = P.G.N, { rings, perEdge, index } = mesh, name = meshKey(P, rings, perEdge), half = N / 2, quarter = N / 4, tiles = mesh.tiles.length;
  if (N % 4 || perEdge % 2) return null;
  const tileOf = new Map(still.map((v) => [v, /^c:(\d+)$/.exec(mesh.verts[v].key)?.[1]]));
  if ([...tileOf.values()].some((t) => t === undefined)) return null;
  const middle = new Map([...tileOf].map(([v, t]) => [+t, v]));
  // the straight way out of tile t across its edge j, to the next tile's middle: { to, d (its pair of opposite edges there), way }
  const across = (t, j) => {
    const b = j * perEdge + perEdge / 2, way = [index.get(`c:${t}`)];
    for (let a = 1; a <= rings; a++) way.push(index.get(name(t, a, b)));
    const mid = way.at(-1);
    for (let m = 0; m < tiles; m++) for (let k = 0; k < N; k++) {
      const b2 = k * perEdge + perEdge / 2;
      if ((m === t && b2 === b) || index.get(name(m, rings, b2)) !== mid) continue;
      for (let a = rings - 1; a >= 1; a--) way.push(index.get(name(m, a, b2)));
      way.push(index.get(`c:${m}`));
      return middle.has(m) ? { to: m, d: k % half, way } : null;
    }
    return null;
  };
  // (every way round, at each tile turning from the line it came in on to another; the one whose
  // turns are nearest square. Square at every tile can close up too soon: on the six octagons it
  // goes round four tiles and is back.)
  const start = +tileOf.get(still[0]), skew = (a, b) => Math.abs(Math.min((a - b + half) % half, (b - a + half) % half) - quarter);
  let best = null;
  const walk = (t, d, step, seen, ways, cost, d0) => {
    if (cost >= (best?.cost ?? Infinity)) return;
    const go = across(t, d), back = across(t, d + half);
    if (!go || !back || go.to !== back.to) return;
    const next = [...ways, step % 2 ? [go.way, back.way] : go.way];
    if (step === still.length - 1) {
      if (go.to === start && go.d !== d0) { const c = cost + skew(go.d, d0); if (c < (best?.cost ?? Infinity)) best = { cost: c, ways: next }; }
      return;
    }
    if (seen.has(go.to)) return;
    for (let e = 0; e < half; e++) if (e !== go.d) walk(go.to, e, step + 1, new Set([...seen, go.to]), next, cost + skew(go.d, e), d0);
  };
  for (let d0 = 0; d0 < half; d0++) walk(start, d0, 0, new Set([start]), [], 0, d0);
  return best && { rims: best.ways.filter((_, k) => k % 2 === 0), bridges: best.ways.filter((_, k) => k % 2) };
}

// A hyperbolic length between two points of the disk
const hyperbolic = (p, q) => Math.acosh(1 + (2 * ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2)) / ((1 - p[0] ** 2 - p[1] ** 2) * (1 - q[0] ** 2 - q[1] ** 2)));
// Each mesh edge's length on the surface (from a tile it's on), by edge key "p,q" (p < q)
function edgeLengths(mesh) {
  const out = new Map();
  mesh.tris.forEach((t, i) => t.forEach((p, k) => {
    const q = t[(k + 1) % 3];
    out.set(p < q ? `${p},${q}` : `${q},${p}`, hyperbolic(mesh.local[i][k], mesh.local[i][(k + 1) % 3]));
  }));
  return out;
}
// The shortest way (by `cost` of each step) from any of `from` to the first vertex `done` says is
// the end, through vertices `ok` allows: the way, from its start, or null
function shortest(from, nbrs, cost, ok, done) {
  const dist = new Map(from.map((v) => [v, 0])), back = new Map(from.map((v) => [v, -1])), heap = from.map((v) => [0, v]), fixed = new Set();
  const push = (e) => { heap.push(e); for (let i = heap.length - 1; i > 0; ) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; for (let i = 0; ; ) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } }
    return top;
  };
  while (heap.length) {
    const [d, v] = pop();
    if (fixed.has(v)) continue;
    fixed.add(v);
    if (done(v) && !from.includes(v)) { const way = []; for (let x = v; x >= 0; x = back.get(x)) way.unshift(x); return way; }
    for (const w of nbrs(v)) {
      if (fixed.has(w) || !ok(w)) continue;
      const e = d + cost(v, w);
      if (e < (dist.get(w) ?? Infinity)) { dist.set(w, e); back.set(w, v); push([e, w]); }
    }
  }
  return null;
}

// Triangles laid out flat with none turned over, each as near its own shape and size as it can be:
// Garanzha, Kaporin, Kudryavtseva, Protais, Ray and Sokolov's "Foldover-free maps in 50 lines of
// code" (2021). Each triangle's map from its own shape (`ref`: per triangle its corners, any frame)
// to where it is costs (|J|² + λ(det J² + 1)) / χ(det J), with χ(D) = (D + √(ε² + D²))/2 near D for
// D ≫ ε and near 0 but never 0 for D ≤ 0, so a turned-over triangle costs a lot but not forever;
// minimized again and again with ε made smaller, the turned-over ones come right. `xz` (x, z per
// vertex) is moved in place; only vertices `free` says move. Returns how many are turned over.
function untangle(tris, ref, xz, free, { lambda = 1, rounds = 40, steps = 200 } = {}) {
  const T = tris.length, inv = new Float64Array(4 * T), area = new Float64Array(T);
  // (the reference mirrored if most triangles run round the other way to it here)
  const turning = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  let agree = 0;
  tris.forEach(([a, b, c], i) => { agree += Math.sign(turning([xz[2 * a], xz[2 * a + 1]], [xz[2 * b], xz[2 * b + 1]], [xz[2 * c], xz[2 * c + 1]]) * turning(...ref[i])); });
  if (agree < 0) ref = ref.map((t) => t.map(([x, y]) => [x, -y]));
  // (each reference triangle scaled so they cover the same area in all as the triangles do now)
  let now = 0, was = 0;
  tris.forEach(([a, b, c], i) => {
    now += Math.abs(turning([xz[2 * a], xz[2 * a + 1]], [xz[2 * b], xz[2 * b + 1]], [xz[2 * c], xz[2 * c + 1]])) / 2;
    was += Math.abs(turning(...ref[i])) / 2;
  });
  const k = Math.sqrt(now / was);
  tris.forEach((_, i) => {
    const [p, q, r] = ref[i], s00 = k * (q[0] - p[0]), s10 = k * (q[1] - p[1]), s01 = k * (r[0] - p[0]), s11 = k * (r[1] - p[1]), d = s00 * s11 - s01 * s10;
    // (the inverse of S = [q − p, r − p])
    inv.set([s11 / d, -s01 / d, -s10 / d, s00 / d], 4 * i);
    area[i] = Math.abs(d) / 2;
  });
  const jac = (i, X) => {
    const [a, b, c] = tris[i], u0 = X[2 * b] - X[2 * a], u1 = X[2 * b + 1] - X[2 * a + 1], w0 = X[2 * c] - X[2 * a], w1 = X[2 * c + 1] - X[2 * a + 1];
    const m = inv.subarray(4 * i, 4 * i + 4);
    return [u0 * m[0] + w0 * m[2], u0 * m[1] + w0 * m[3], u1 * m[0] + w1 * m[2], u1 * m[1] + w1 * m[3]];
  };
  const minDet = (X) => { let m = Infinity; for (let i = 0; i < T; i++) { const [a, b, c, d] = jac(i, X); m = Math.min(m, a * d - b * c); } return m; };
  const energy = (X, eps, grad) => {
    let E = 0;
    if (grad) grad.fill(0);
    for (let i = 0; i < T; i++) {
      const [a, b, c, d] = jac(i, X), D = a * d - b * c, root = Math.sqrt(eps * eps + D * D), chi = (D + root) / 2;
      const top = a * a + b * b + c * c + d * d + lambda * (D * D + 1);
      E += area[i] * (top / chi);
      if (!grad) continue;
      // ∂f/∂J, then through J = U·S⁻¹ to the corners (U's columns: b − a and c − a)
      const dchi = (1 + D / root) / 2, cof = [d, -c, -b, a], J = [a, b, c, d];
      const g = J.map((x, j) => area[i] * ((2 * x + 2 * lambda * D * cof[j]) / chi - (top * dchi * cof[j]) / (chi * chi)));
      const m = inv.subarray(4 * i, 4 * i + 4);
      const gu0 = g[0] * m[0] + g[1] * m[1], gu1 = g[2] * m[0] + g[3] * m[1], gw0 = g[0] * m[2] + g[1] * m[3], gw1 = g[2] * m[2] + g[3] * m[3];
      const [va, vb, vc] = tris[i];
      grad[2 * vb] += gu0; grad[2 * vb + 1] += gu1; grad[2 * vc] += gw0; grad[2 * vc + 1] += gw1;
      grad[2 * va] -= gu0 + gw0; grad[2 * va + 1] -= gu1 + gw1;
    }
    if (grad) for (let v = 0; v < free.length; v++) if (!free[v]) grad[2 * v] = grad[2 * v + 1] = 0;
    return E;
  };
  const lbfgs = (eps) => minimize((X, g) => energy(X, eps, g), xz, steps);
  // ε as the paper has it: down each round by how much the energy fell, kept near the worst det
  let eps = 1, E = energy(xz, eps);
  for (let r = 0; r < rounds; r++) {
    const D = minDet(xz), E2 = lbfgs(eps), sigma = Math.max(1 - E2 / E, 0.1), D2 = minDet(xz);
    eps = (1 - sigma) * (D2 + Math.sqrt(eps * eps + D2 * D2)) / 2;
    E = E2;
    if (D > 0 && D2 > 0 && r > 2) break;
  }
  let over = 0;
  for (let i = 0; i < T; i++) { const [a, b, c, d] = jac(i, xz); if (a * d - b * c <= 0) over++; }
  return over;
}

// The least of an energy, from x (moved there, in place): L-BFGS (a few pairs) with a backtracking
// line search. f(X, g) returns the energy at X, its gradient into g; project(X), if given, puts a
// tried X back where it may be (on a surface), in place. Returns the energy.
function minimize(f, x, steps, mem = 8, project = null) {
  const L = x.length, X2 = new Float64Array(L), d = new Float64Array(L), g = new Float64Array(L), g2 = new Float64Array(L), S = [], Y = [];
  const dot = (p, q) => { let s = 0; for (let j = 0; j < L; j++) s += p[j] * q[j]; return s; };
  const axpy = (p, a, q) => { for (let j = 0; j < L; j++) p[j] += a * q[j]; };
  let E = f(x, g);
  for (let it = 0; it < steps; it++) {
    const al = [];
    for (let j = 0; j < L; j++) d[j] = -g[j];
    for (let j = S.length - 1; j >= 0; j--) { const a = dot(S[j], d) / dot(Y[j], S[j]); al[j] = a; axpy(d, -a, Y[j]); }
    if (S.length) { const y = Y.at(-1), s = S.at(-1), gam = dot(s, y) / dot(y, y); for (let j = 0; j < L; j++) d[j] *= gam; }
    for (let j = 0; j < S.length; j++) { const b = dot(Y[j], d) / dot(Y[j], S[j]); axpy(d, al[j] - b, S[j]); }
    let slope = dot(g, d);
    if (slope >= 0) { for (let j = 0; j < L; j++) d[j] = -g[j]; slope = dot(g, d); S.length = Y.length = 0; }
    let t = 1, E2;
    for (let tries = 0; tries < 30; tries++, t /= 2) {
      for (let j = 0; j < L; j++) X2[j] = x[j] + t * d[j];
      if (project) project(X2);
      E2 = f(X2, g2);
      if (E2 <= E + 1e-4 * t * slope) break;
    }
    if (!(E2 < E)) break;
    const s = new Float64Array(L), y = new Float64Array(L);
    for (let j = 0; j < L; j++) { s[j] = X2[j] - x[j]; y[j] = g2[j] - g[j]; }
    if (dot(s, y) > 1e-12) { S.push(s); Y.push(y); if (S.length > mem) { S.shift(); Y.shift(); } }
    x.set(X2); g.set(g2);
    const done = E - E2 < 1e-10 * Math.abs(E);
    E = E2;
    if (done) break;
  }
  return E;
}

// The mesh's neighbors of each vertex
function neighbors({ verts, tris }) {
  const nbrs = verts.map(() => new Set());
  for (const t of tris) for (const [p, q] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { nbrs[p].add(q); nbrs[q].add(p); }
  return nbrs.map((s) => [...s]);
}
// the vertices within `hops` steps of some vertex of `from` (with how many steps)
function within(nbrs, from, hops) {
  const d = new Map(from.map((v) => [v, 0])), queue = [...from];
  for (let i = 0; i < queue.length; i++) { const v = queue[i]; if (d.get(v) >= hops) continue; for (const w of nbrs[v]) if (!d.has(w)) { d.set(w, d.get(v) + 1); queue.push(w); } }
  return d;
}

// A two-holed surface laid flat as a plate's top and bottom: { xz (x, z per vertex), top (per
// triangle, 1 if on the top), rims (the outside's and each hole's, as the top runs round them),
// turned (how many triangles came out turned over: 0) }, or throws if the surface has no half turn.
//   - The plate turned half a turn about its long axis is itself, its top onto its bottom; every
//     two-holed surface has a symmetry like that (one only: it commutes with everything), which
//     leaves 6 points where they are, two on each rim of the plate. So: find it, and join its still
//     points in pairs by ways that don't meet, each way and where the half turn takes it a rim.
//     Cut along the rims, the surface is two pieces, the top and the bottom.
//   - The long axis crosses the top from the outside rim to a hole, hole to hole, and the last hole
//     to the outside rim: bridges, between still points. The rims and bridges cut the top into two
//     disks, an upper and a lower.
//   - Each disk laid flat (each vertex the weighed average of its neighbors) with its rim held
//     round a convex outline, so that nothing in it folds (Tutte): half an oval, and along the axis
//     the bridges and each hole flattened to a slit. Then each slit opened into a circle (a map of
//     the plane that's one to one), and every triangle evened out to its own shape with none turned
//     over (untangle). The bottom is the top seen from below: each vertex where the top has its
//     image under the half turn, mirrored.
export function plateLayout(P, mesh, { iterations = 2000, A = 4, B = 1.8, holeScale = 2.5 } = {}) {
  const { H } = P, genus = P.surface.genus, n = mesh.verts.length, nbrs = neighbors(mesh);
  // ---- the half turn
  let turn = null, still = null;
  for (let z = 1; z < H.n && !turn; z++) {
    if (H.mul(z, z) !== 0 || H.mul(z, H.R) !== H.mul(H.R, z) || H.mul(z, H.S) !== H.mul(H.S, z)) continue;
    const map = movedBy(P, mesh, z), fixed = [...map.keys()].filter((v) => map[v] === v);
    if (fixed.length === 2 * genus + 2) { turn = map; still = fixed; }
  }
  if (!turn) throw new Error("this surface has no half turn taking its top to its bottom");
  // ---- the rims: when the still points are tile middles, squarePlan's straight ones; else still
  // points joined in pairs, nearest first, by ways that don't meet each other or (but at their
  // ends) their images; found among pairs {v, its image}, so a way never meets its own image. (By
  // length on the surface: by steps, a way across a tile's rings can stair-step.)
  const lengths = edgeLengths(mesh), len = (p, q) => lengths.get(p < q ? `${p},${q}` : `${q},${p}`);
  const plan = squarePlan(P, mesh, still), rims = plan ? plan.rims.map((way) => [...way, ...way.slice(1, -1).reverse().map((v) => turn[v])]) : [];
  const orbit = (v) => Math.min(v, turn[v]), blocked = new Set(), left = new Set(plan ? [] : still);
  const orbitNbrs = (o) => [...new Set([o, turn[o]].flatMap((v) => nbrs[v].map(orbit)))];
  const orbitCost = (o, p) => Math.min(...[o, turn[o]].flatMap((v) => [p, turn[p]].map((w) => len(v, w) ?? Infinity)));
  while (left.size) {
    let best = null;
    for (const s of left) {
      const way = shortest([s], orbitNbrs, orbitCost, (p) => !blocked.has(p) && (!still.includes(p) || left.has(p)), (p) => left.has(p));
      if (!way) continue;
      const size = way.slice(1).reduce((sum, p, k) => sum + orbitCost(way[k], p), 0);
      if (!best || size < best.size) best = { way, size };
    }
    if (!best) throw new Error("the still points can't be joined in pairs");
    const orbits = best.way;
    // (lifted: each next vertex the one of its pair next to the last)
    const way = [orbits[0]];
    for (const o of orbits.slice(1)) way.push(nbrs[way.at(-1)].includes(o) ? o : turn[o]);
    rims.push([...way, ...way.slice(1, -1).reverse().map((v) => turn[v])]);
    left.delete(orbits[0]); left.delete(orbits.at(-1));
    for (const o of orbits) { blocked.add(o); for (const v of [o, turn[o]]) for (const w of nbrs[v]) blocked.add(orbit(w)); }
  }
  // ---- the top and the bottom: the triangles, with the rims cut
  const ek = (p, q) => (p < q ? `${p},${q}` : `${q},${p}`), cut = new Set();
  for (const rim of rims) rim.forEach((v, k) => cut.add(ek(v, rim[(k + 1) % rim.length])));
  const trisOf = new Map();
  mesh.tris.forEach((t, i) => { for (const [p, q] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const k = ek(p, q); if (!trisOf.has(k)) trisOf.set(k, []); trisOf.get(k).push(i); } });
  const top = new Uint8Array(mesh.tris.length), queue = [0];
  top[0] = 1;
  for (let q = 0; q < queue.length; q++) {
    const t = mesh.tris[queue[q]];
    for (const [p, r] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const k = ek(p, r);
      if (!cut.has(k)) for (const o of trisOf.get(k)) if (!top[o]) { top[o] = 1; queue.push(o); }
    }
  }
  if (2 * queue.length !== mesh.tris.length) throw new Error(`the rims cut off ${queue.length} of ${mesh.tris.length} triangles, not half`);
  // each rim the way the top runs round it (the top on its left), from a still point
  const next = new Map(), has = new Set();
  mesh.tris.forEach((t, i) => { if (top[i]) for (const [p, q] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) has.add(`${p},${q}`); });
  mesh.tris.forEach((t, i) => { if (top[i]) for (const [p, q] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) if (!has.has(`${q},${p}`)) next.set(p, q); });
  const runs = rims.map((rim) => { const run = [rim[0]]; for (let v = next.get(rim[0]); v !== rim[0]; v = next.get(v)) run.push(v); return run; });
  const nb = new Map();
  mesh.tris.forEach((t, i) => {
    if (top[i]) for (const [p, q] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) for (const [a, b] of [[p, q], [q, p]]) { if (!nb.has(a)) nb.set(a, new Set()); nb.get(a).add(b); }
  });
  const topVerts = new Set(nb.keys()), onRim = new Set(runs.flat());
  const outer = plan ? runs[0] : runs.reduce((a, b) => (b.length > a.length ? b : a)), holes = runs.filter((r) => r !== outer);
  // ---- the bridges: from squarePlan (each the half of its line on the top), or else shortest ways
  // for the order of the holes and which still point of each rim faces which way that's shortest
  // in all, each leaving its still points square to the rim (straight on for a few steps) and
  // keeping off the rims after. (A bridge running beside a rim leaves a sliver between them that
  // opens out to half a turn at the still point, and what's in it crushes flat.)
  // (on a small mesh, closer to the rims, if there's no room for that)
  const ends = (run) => run.filter((v) => still.includes(v));
  let gap = 2, nearRim;
  const nbArr = [];
  for (const [v, ws] of nb) nbArr[v] = [...ws];
  const topAt = new Map();
  mesh.tris.forEach((t, i) => { if (top[i]) for (const v of t) { if (!topAt.has(v)) topAt.set(v, []); topAt.get(v).push(t); } });
  // (a vertex's neighbors in order round it on the top; from one rim neighbor to the other if it's on a rim)
  const fan = (v) => {
    const nx = new Map();
    for (const t of topAt.get(v)) { const j = t.indexOf(v); nx.set(t[(j + 1) % 3], t[(j + 2) % 3]); }
    const heads = new Set(nx.values()), start = [...nx.keys()].find((k) => !heads.has(k)) ?? nx.keys().next().value, order = [start];
    while (nx.has(order.at(-1)) && nx.get(order.at(-1)) !== start) order.push(nx.get(order.at(-1)));
    return order;
  };
  const straightFrom = (s) => {
    const f = fan(s), way = [s, f[Math.floor(f.length / 2)]];
    for (let k = 0; k < gap; k++) { const g = fan(way.at(-1)), i = g.indexOf(way.at(-2)); way.push(g[(i + Math.floor(g.length / 2)) % g.length]); }
    return way;
  };
  const bridge = (s, t, avoid) => {
    const a = straightFrom(s), b = straightFrom(t);
    if ([...a.slice(1), ...b.slice(1)].some((v) => onRim.has(v) || avoid.has(v))) return null;
    const mid = shortest([a.at(-1)], (v) => nbArr[v], len, (w) => w === b.at(-1) || (!onRim.has(w) && !avoid.has(w) && !nearRim.has(w)), (w) => w === b.at(-1));
    return mid && [...a, ...mid.slice(1, -1), ...b.reverse()];
  };
  const orders = (xs) => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));
  // (squarePlan's: rim 0 the outside, run from the right end to the left; then bridge, hole,
  // bridge, hole, …, bridge, left to right)
  let best = plan && {
    paths: plan.bridges.map((halves) => halves.find((way) => topVerts.has(way[1]) && !onRim.has(way[1]))),
    sides: [[plan.rims[0].at(-1), plan.rims[0][0]], ...plan.rims.slice(1).map((way) => [way[0], way.at(-1)])],
    chain: holes,
  };
  if (best && best.paths.some((p) => !p)) best = null;
  for (gap = 2; !best && gap >= 0; gap--) {
    nearRim = within(nbArr, [...onRim], gap);
    for (const order of orders(holes.map((_, i) => i))) for (let flips = 0; flips < 2 ** (genus + 1); flips++) {
      const lr = (run, j) => { const [a, b] = ends(run); return (flips >> j) & 1 ? [b, a] : [a, b]; };
      const sides = [lr(outer, 0), ...order.map((i, k) => lr(holes[i], k + 1))], avoid = new Set(), paths = [];
      let total = 0;
      for (let k = 0; k <= order.length; k++) {
        const path = bridge(k ? sides[k][1] : sides[0][0], k < order.length ? sides[k + 1][0] : sides[0][1], avoid);
        if (!path) { total = Infinity; break; }
        paths.push(path); total += path.length;
        for (const v of path) { avoid.add(v); for (const w of nb.get(v)) avoid.add(w); }
      }
      if (total < (best?.total ?? Infinity)) best = { total, paths, sides, chain: order.map((i) => holes[i]) };
    }
  }
  if (!best) throw new Error("no bridges across the top");
  // ---- the two disks; the upper one has the outside rim's half from its left still point
  const cutAlso = new Set(cut);
  for (const path of best.paths) path.forEach((v, k) => { if (k) cutAlso.add(ek(path[k - 1], v)); });
  const disk = new Int32Array(mesh.tris.length).fill(-1);
  mesh.tris.forEach((_, i0) => {
    if (!top[i0] || disk[i0] >= 0) return;
    const q = [i0]; disk[i0] = i0;
    for (let j = 0; j < q.length; j++) {
      const t = mesh.tris[q[j]];
      for (const [p, r] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const k = ek(p, r);
        if (!cutAlso.has(k)) for (const o of trisOf.get(k)) if (top[o] && disk[o] < 0) { disk[o] = i0; q.push(o); }
      }
    }
  });
  const diskOf = (p, q) => disk[trisOf.get(ek(p, q)).find((i) => top[i])];
  // (each rim's halves, each from its left still point to its right)
  const halves = (run, [l, r]) => {
    const from = run.indexOf(l), turned = [...run.slice(from), ...run.slice(0, from)], k = turned.indexOf(r);
    return [turned.slice(0, k + 1), [...turned.slice(k), l].reverse()];
  };
  const [arc] = halves(outer, best.sides[0]), upper = diskOf(arc[0], arc[1]);
  const holeHalves = best.chain.map((run, i) => halves(run, best.sides[i + 1]).find((h) => diskOf(h[0], h[1]) === upper));
  const upperRim = new Set(holeHalves.flat());
  // ---- laid flat. The axis is shared out by length on the surface (bridge, slit, bridge, …), each
  // slit `holeScale` times its share for holes worth seeing.
  const xz = new Float64Array(2 * n), pinned = new Uint8Array(n);
  const lengthOf = (way) => way.slice(1).reduce((s, v, k) => s + len(way[k], v), 0);
  const shares = (way) => { const at = [0]; for (let k = 1; k < way.length; k++) at.push(at[k - 1] + len(way[k - 1], way[k])); return at.map((x) => x / at.at(-1)); };
  const place = (way, at) => shares(way).forEach((s, i) => { const v = way[i]; [xz[2 * v], xz[2 * v + 1]] = at(s); pinned[v] = 1; });
  const pieces = best.paths.flatMap((path, k) => [lengthOf(path), ...(k < holeHalves.length ? [holeScale * lengthOf(holeHalves[k])] : [])]);
  const total = pieces.reduce((a, b) => a + b), stops = [-A];
  for (const l of pieces) stops.push(stops.at(-1) + (2 * A * l) / total);
  const slits = holeHalves.map((_, i) => [stops[2 * i + 1], stops[2 * i + 2]]);
  // Each slit opened into a circle after: ζ = w + r²/w takes the circle |w| = r onto the slit from
  // −2r to 2r and what's outside it onto everything else, one to one; each point taken back through
  // it (the slit's upper side to the circle's upper half). One hole at a time, each slit where the
  // ones before have moved its ends to.
  const sqrt = (re, im) => { const m = Math.hypot(re, im), r = Math.sqrt((m + re) / 2), i = Math.sqrt(Math.max(0, (m - re) / 2)); return [r, im < 0 ? -i : i]; };
  const opened = [];
  for (const slit of slits) {
    const [lo, hi] = slit.map((x) => opened.reduce((p, f) => f(p, false), [x, 0])[0]), mid = (lo + hi) / 2, r = (hi - lo) / 4;
    opened.push(([x, z], up) => {
      const zr = x - mid, [ar, ai] = sqrt(zr - 2 * r, z), [br, bi] = sqrt(zr + 2 * r, z);
      let sr = ar * br - ai * bi, si = ar * bi + ai * br;
      if (Math.abs(z) < 1e-12 && Math.abs(zr) < 2 * r && (si < 0) !== up) { sr = -sr; si = -si; }
      return [mid + (zr + sr) / 2, (z + si) / 2];
    });
  }
  const open = (p, up = false) => opened.reduce((q, f) => f(q, up), p);
  // Every rim and bridge vertex placed where it opens to its share of the way along, so the
  // opening leaves them even. (Opened, what's near a slit's end is spread out, as by a square root:
  // a bridge even along the axis before would come out bunched up there.) A slit's point at
  // middle − half·cos(πs) opens to angle πs round.
  holeHalves.forEach((half, i) => { const [lo, hi] = slits[i]; place(half, (s) => [(lo + hi) / 2 - ((hi - lo) / 2) * Math.cos(Math.PI * s), 0]); });
  // (along the axis, opening only moves points along it, keeping their order: found by halving)
  const onAxis = (x0, x1, s) => {
    const X0 = open([x0, 0])[0], X = X0 + s * (open([x1, 0])[0] - X0);
    let lo = x0, hi = x1;
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (open([m, 0])[0] < X) lo = m; else hi = m; }
    return [(lo + hi) / 2, 0];
  };
  best.paths.forEach((path, k) => place(path, (s) => onAxis(stops[2 * k], stops[2 * k + 1], s)));
  // (round the oval: sampled finely, opened, and each share found along how long that is)
  const oval = Array.from({ length: 721 }, (_, j) => [-A * Math.cos((Math.PI * j) / 720), -B * Math.sin((Math.PI * j) / 720)]);
  const ovalAt = [0];
  oval.forEach((p, j) => { if (j) { const a = open(oval[j - 1]), b = open(p); ovalAt.push(ovalAt[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); } });
  place(arc, (s) => {
    const want = s * ovalAt.at(-1), j = Math.max(1, ovalAt.findIndex((l) => l >= want)), t = (want - ovalAt[j - 1]) / (ovalAt[j] - ovalAt[j - 1] || 1);
    return [oval[j - 1][0] + t * (oval[j][0] - oval[j - 1][0]), oval[j - 1][1] + t * (oval[j][1] - oval[j - 1][1])];
  });
  // (the lower halves: their images, mirrored)
  for (const v of onRim) if (!pinned[v]) { const w = turn[v]; xz[2 * v] = xz[2 * w]; xz[2 * v + 1] = -xz[2 * w + 1]; pinned[v] = 1; }
  // each neighbor weighed by its mean value (meanValueWeights), all moved to their neighbors'
  // weighed average (tutte; all weighed alike, the triangles crush flat against the axis)
  const inside = [...topVerts].filter((v) => !pinned[v]);
  tutte(inside, (v) => [...nb.get(v)], meanValueWeights(mesh, mesh.local), xz, iterations);
  for (const v of topVerts) [xz[2 * v], xz[2 * v + 1]] = open([xz[2 * v], xz[2 * v + 1]], upperRim.has(v));
  // Opened, triangles crushed against the slits turn over, and the tiles near the holes come out
  // small: then all but the rims moved to make each triangle as near its own shape and size as
  // they can be, none turned over.
  const topIndex = mesh.tris.map((_, i) => i).filter((i) => top[i]), free = new Uint8Array(n);
  for (const v of inside) free[v] = 1;
  for (const path of best.paths) for (const v of path) if (!onRim.has(v)) free[v] = 1;
  const turned = untangle(topIndex.map((i) => mesh.tris[i]), topIndex.map((i) => mesh.local[i]), xz, free);
  // the bottom: the top's images, mirrored
  mesh.tris.forEach((t, i) => { if (!top[i]) for (const v of t) if (!topVerts.has(v)) { const w = turn[v]; xz[2 * v] = xz[2 * w]; xz[2 * v + 1] = -xz[2 * w + 1]; } });
  return { xz, top, rims: runs, turned };
}

// ---- any number of holes

const ek = (p, q) => (p < q ? `${p},${q}` : `${q},${p}`);
// a heap of [key, item], least key first
function minHeap() {
  const h = [];
  return {
    get size() { return h.length; },
    push(k, x) { h.push([k, x]); for (let i = h.length - 1; i > 0; ) { const j = (i - 1) >> 1; if (h[j][0] <= h[i][0]) break; [h[i], h[j]] = [h[j], h[i]]; i = j; } },
    pop() {
      const top = h[0], last = h.pop();
      if (h.length) { h[0] = last; for (let i = 0; ; ) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[i], h[m]] = [h[m], h[i]]; i = m; } }
      return top;
    },
  };
}

// Which way round the surface a loop goes, up to adding loops that bound something (homology, mod
// 2): each edge marked with bits, one per way round (2g of them), so that a loop's edges' marks
// added up (xor) are 0 just when the loop cuts the surface in two. (A tree of the vertices, a tree
// of the triangles across the other edges, and the 2g edges in neither each a way round: one bit.
// The triangles' tree's edges, its leaves first, marked so each triangle's sides add up to 0.)
// Returns { edge: "p,q" → index, marks (W words an edge), W }.
function homologyMarks(mesh) {
  const { tris } = mesh, n = mesh.verts.length, edge = new Map(), ends = [], trisOf = [];
  tris.forEach((t, i) => t.forEach((p, k) => {
    const q = t[(k + 1) % 3], key = ek(p, q);
    if (!edge.has(key)) { edge.set(key, ends.length); ends.push([p, q]); trisOf.push([]); }
    trisOf[edge.get(key)].push(i);
  }));
  const E = ends.length, inTree = new Uint8Array(E), at = Array.from({ length: n }, () => []);
  ends.forEach(([p, q], e) => { at[p].push(e); at[q].push(e); });
  const seen = new Uint8Array(n), queue = [0];
  seen[0] = 1;
  for (let i = 0; i < queue.length; i++) for (const e of at[queue[i]]) {
    const w = ends[e][0] === queue[i] ? ends[e][1] : ends[e][0];
    if (!seen[w]) { seen[w] = 1; inTree[e] = 1; queue.push(w); }
  }
  const inCo = new Uint8Array(E), up = new Int32Array(tris.length).fill(-1), order = [0], tSeen = new Uint8Array(tris.length);
  tSeen[0] = 1;
  const sides = (i) => tris[i].map((p, k) => edge.get(ek(p, tris[i][(k + 1) % 3])));
  for (let j = 0; j < order.length; j++) for (const e of sides(order[j])) {
    if (inTree[e] || inCo[e]) continue;
    const o = trisOf[e].find((t) => t !== order[j]);
    if (!tSeen[o]) { tSeen[o] = 1; inCo[e] = 1; up[o] = e; order.push(o); }
  }
  const left = [];
  for (let e = 0; e < E; e++) if (!inTree[e] && !inCo[e]) left.push(e);
  const W = Math.max(1, Math.ceil(left.length / 32)), marks = new Uint32Array(E * W);
  left.forEach((e, k) => { marks[e * W + (k >> 5)] |= 1 << (k & 31); });
  for (let j = order.length - 1; j > 0; j--) {
    const f = order[j], e = up[f];
    for (const o of sides(f)) if (o !== e) for (let w = 0; w < W; w++) marks[e * W + w] ^= marks[o * W + w];
  }
  return { edge, marks, W };
}

// g loops round the handles, each as short as it can be (by length on the surface), none meeting
// another or next to it, and together not cutting the surface apart: cut along them all, it's a
// sphere with 2g holes. (Each the shortest loop through a vertex, over every vertex: two shortest
// ways from it that part at once and an edge joining their ends, going round a way the loops before
// don't, by their marks.) Returns [[vertex, …] round each loop].
function handleLoops(mesh, g, len) {
  const n = mesh.verts.length, nbrs = neighbors(mesh), { edge, marks, W } = homologyMarks(mesh);
  const blocked = new Uint8Array(n), basis = [], loops = [];
  const reduce = (x) => {
    for (const { row, bit } of basis) if ((x[bit >> 5] >>> (bit & 31)) & 1) for (let w = 0; w < W; w++) x[w] ^= row[w];
    return x;
  };
  const dist = new Float64Array(n), parent = new Int32Array(n), branch = new Int32Array(n), cls = new Uint32Array(n * W), done = new Uint8Array(n);
  for (let k = 0; k < g; k++) {
    let best = null;
    for (let s = 0; s < n; s++) {
      if (blocked[s]) continue;
      dist.fill(Infinity); done.fill(0);
      dist[s] = 0; parent[s] = -1; branch[s] = -1; cls.fill(0, s * W, s * W + W);
      const heap = minHeap(), reached = [];
      heap.push(0, s);
      while (heap.size) {
        const [d, v] = heap.pop();
        if (done[v]) continue;
        if (best && 2 * d > best.L) break;
        done[v] = 1; reached.push(v);
        for (const w of nbrs[v]) {
          if (blocked[w] || done[w]) continue;
          const e = d + len(v, w);
          if (e < dist[w]) {
            dist[w] = e; parent[w] = v; branch[w] = v === s ? w : branch[v];
            const m = edge.get(ek(v, w));
            for (let j = 0; j < W; j++) cls[w * W + j] = cls[v * W + j] ^ marks[m * W + j];
            heap.push(e, w);
          }
        }
      }
      for (const u of reached) for (const v of nbrs[u]) {
        if (v < u || !done[v] || parent[v] === u || parent[u] === v || branch[u] === branch[v]) continue;
        const L = dist[u] + dist[v] + len(u, v);
        if (best && L >= best.L) continue;
        const m = edge.get(ek(u, v)), x = new Uint32Array(W);
        for (let j = 0; j < W; j++) x[j] = cls[u * W + j] ^ cls[v * W + j] ^ marks[m * W + j];
        if (!reduce(x).some((w) => w)) continue;
        const way = [];
        for (let a = u; a >= 0; a = parent[a]) way.unshift(a);
        for (let b = v; b !== s; b = parent[b]) way.push(b);
        best = { L, way, x };
      }
    }
    if (!best) throw new Error(`no loop round handle ${k + 1}`);
    const word = best.x.findIndex((w) => w);
    basis.push({ row: best.x, bit: word * 32 + 31 - Math.clz32(best.x[word]) });
    loops.push(best.way);
    for (const v of best.way) { blocked[v] = 1; for (const w of nbrs[v]) blocked[w] = 1; }
  }
  return loops;
}

// The surface cut by its handle loops (a sphere with 2g holes), parted into a top and a bottom,
// each a sphere with g + 1 holes, like a pretzel's above and below its middle: the top grown from
// one side of every loop, the bottom from the other, each joined up first by shortest ways between
// its loops (so each comes out one piece), and every other triangle to whichever is nearer. Where
// they meet is the last rim, the outside's. sides: which side of each loop but the first the top
// takes (0 its left, 1 its right; by default whichever is nearest the top so far). Returns { top
// (per triangle 1 or 0), outer [vertex, …] }.
function splitByLoops(mesh, loops, sides = null) {
  const { tris } = mesh, T = tris.length, pt = (i, v) => mesh.local[i][tris[i].indexOf(v)];
  const cut = new Set(loops.flatMap((l) => l.map((v, k) => ek(v, l[(k + 1) % l.length]))));
  const trisOf = new Map();
  tris.forEach((t, i) => t.forEach((p, k) => { const key = ek(p, t[(k + 1) % 3]); (trisOf.get(key) ?? trisOf.set(key, []).get(key)).push(i); }));
  // (across each edge but the loops', the triangle there and how far: middle to the edge's middle,
  // each in its own tile)
  const mid = (i) => { const p = tris[i].map((v) => pt(i, v)); return [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3]; };
  const across = tris.map((t, i) => t.flatMap((p, k) => {
    const q = t[(k + 1) % 3], key = ek(p, q);
    if (cut.has(key)) return [];
    const o = trisOf.get(key).find((j) => j !== i), half = (j) => along(pt(j, p), pt(j, q), 0.5);
    return [[o, hyperbolic(mid(i), half(i)) + hyperbolic(half(o), mid(o))]];
  }));
  // (each loop's two sides: round each of its vertices, from the next vertex on to the one before,
  // the triangles on its left; the rest on its right)
  const fanOf = new Map();
  tris.forEach((t, i) => t.forEach((v, k) => (fanOf.get(v) ?? fanOf.set(v, new Map()).get(v)).set(t[(k + 1) % 3], [t[(k + 2) % 3], i])));
  const seed = [];
  loops.forEach((l) => {
    const L = [], R = [];
    l.forEach((v, k) => {
      const fan = fanOf.get(v), next = l[(k + 1) % l.length], before = l[(k - 1 + l.length) % l.length];
      let x = next, on = L;
      do { const [y, i] = fan.get(x); if (x === before) on = R; on.push(i); x = y; } while (x !== next);
    });
    seed.push([new Set(L), new Set(R)]);
  });
  // (shortest ways over the triangles from `from`, through those ok says)
  const label = new Int8Array(T), grow = (from, ok) => {
    const d = new Float64Array(T).fill(Infinity), back = new Int32Array(T).fill(-1), heap = minHeap();
    for (const i of from) { d[i] = 0; heap.push(0, i); }
    while (heap.size) {
      const [di, i] = heap.pop();
      if (di > d[i]) continue;
      for (const [o, w] of across[i]) if (di + w < d[o] && ok(o)) { d[o] = di + w; back[o] = i; heap.push(d[o], o); }
    }
    return { d, back };
  };
  const vertsOf = (sets) => { const out = new Set(); for (const s of sets) for (const i of s) for (const v of tris[i]) out.add(v); return out; };
  // the top: one side of each loop (the first's left, then whichever side of a loop is nearest, or
  // `sides` says), joined up by shortest ways keeping off the other sides
  const topSet = new Set(seed[0][0]), botSet = new Set(seed[0][1]), others = seed.slice(1).map((s, j) => [...s, j + 1]);
  while (others.length) {
    const theirs = new Set(others.flatMap(([a, b]) => [...a, ...b])), botV = vertsOf([botSet]);
    const { d, back } = grow([...topSet], (o) => theirs.has(o) || !tris[o].some((v) => botV.has(v)));
    let pick = null;
    others.forEach(([a, b, at], j) => { for (const [s, k] of [[a, 0], [b, 1]]) if (!sides || sides[at] === k) for (const i of s) if (!pick || d[i] < pick.d) pick = { d: d[i], i, j, k }; });
    if (!pick || !isFinite(pick.d)) throw new Error("the top can't be joined up");
    for (let i = back[pick.i]; i >= 0 && !topSet.has(i); i = back[i]) topSet.add(i);
    const [a, b] = others.splice(pick.j, 1)[0];
    for (const i of pick.k ? b : a) topSet.add(i);
    for (const i of pick.k ? a : b) botSet.add(i);
  }
  // the bottom joined up too, keeping off the top
  const botParts = (() => {
    const parts = [], left = new Set(botSet);
    while (left.size) {
      const first = left.values().next().value, part = new Set([first]), q = [first];
      left.delete(first);
      for (let h = 0; h < q.length; h++) for (const [o] of across[q[h]]) if (left.has(o)) { left.delete(o); part.add(o); q.push(o); }
      parts.push(part);
    }
    return parts;
  })();
  const bot = new Set(botParts[0]);
  for (const part of botParts.slice(1)) {
    const topV = vertsOf([topSet]), { d, back } = grow([...bot], (o) => !tris[o].some((v) => topV.has(v)) || part.has(o));
    let end = -1;
    for (const i of part) if (end < 0 || d[i] < d[end]) end = i;
    if (!isFinite(d[end])) throw new Error("the bottom can't be joined up");
    for (let i = end; i >= 0 && !bot.has(i); i = back[i]) bot.add(i);
    for (const i of part) bot.add(i);
  }
  // every other triangle to the nearer
  for (const i of topSet) label[i] = 1;
  for (const i of bot) label[i] = 2;
  {
    const d = new Float64Array(T).fill(Infinity), heap = minHeap();
    for (let i = 0; i < T; i++) if (label[i]) { d[i] = 0; heap.push(0, i); }
    while (heap.size) {
      const [di, i] = heap.pop();
      if (di > d[i]) continue;
      for (const [o, w] of across[i]) if (di + w < d[o]) { d[o] = di + w; label[o] = label[i]; heap.push(d[o], o); }
    }
  }
  // (a vertex where the top and bottom meet more than once round it: its triangles all to one, so
  // where they meet is one line through it; the loops' sides kept)
  const onLoop = new Set(loops.flat()), seeded = new Set(seed.flatMap(([a, b]) => [...a, ...b]));
  const changesAt = (v) => {
    const fan = fanOf.get(v), ring = [], x0 = fan.keys().next().value;
    let x = x0;
    do { const [y, i] = fan.get(x); ring.push(label[i]); x = y; } while (x !== x0);
    return { ring, changes: ring.filter((l, k) => l !== ring[(k + 1) % ring.length]).length };
  };
  for (let pass = 0; pass < 20; pass++) {
    let pinched = 0;
    for (const [v, fan] of fanOf) {
      if (onLoop.has(v)) continue;
      const { ring, changes } = changesAt(v);
      if (changes <= 2) continue;
      pinched++;
      const most = ring.filter((l) => l === 1).length * 2 >= ring.length ? 1 : 2;
      for (const [, [, i]] of fan) if (!seeded.has(i)) label[i] = most;
    }
    if (!pinched) break;
  }
  // (where they meet made shorter: a triangle with two of its three neighbors on the other side
  // goes over, unless that pinches it; the nearest-to rule leaves it a long zigzag, and the halves
  // laid flat from that wind round each other)
  for (let pass = 0; pass < 200; pass++) {
    let moved = 0;
    for (let i = 0; i < T; i++) {
      if (seeded.has(i)) continue;
      const other = 3 - label[i];
      if (across[i].filter(([o]) => label[o] === other).length < 2) continue;
      label[i] = other;
      if (tris[i].some((v) => !onLoop.has(v) && changesAt(v).changes > 2)) label[i] = 3 - other;
      else moved++;
    }
    if (!moved) break;
  }
  // the outside's rim: where they meet, the top on its left
  const top = Uint8Array.from(label, (l) => (l === 1 ? 1 : 0)), next = new Map();
  tris.forEach((t, i) => { if (top[i]) t.forEach((p, k) => {
    const q = t[(k + 1) % 3], key = ek(p, q);
    if (!cut.has(key) && trisOf.get(key).some((j) => !top[j])) next.set(p, q);
  }); });
  if (!next.size) throw new Error("the top is everything");
  const start = next.keys().next().value, outer = [start];
  for (let v = next.get(start); v !== start; v = next.get(v)) { if (v === undefined || outer.length > next.size) throw new Error("the outside's rim isn't one loop"); outer.push(v); }
  if (outer.length !== next.size) throw new Error(`the top and bottom meet in more than one loop (${next.size} edges, ${outer.length} round one)`);
  return { top, outer };
}

// A surface with g ≥ 2 holes laid flat as a plate's top and bottom, like plateLayout but needing no
// symmetry: handleLoops' loops the holes' rims and splitByLoops' meeting the outside's, then each
// half laid out much as plateLayout lays its top (bridges along the axis from the outside to each
// hole and back out, the two disks they leave laid flat round half an oval each with the holes
// slits, the slits opened to circles, untangled). The two halves share their rims, so a rim's
// vertices are put once; each half has its own bridges, between the same points. Returns { xz,
// top, rims (the outside's first, as the top runs round them), turned }.
// (The top takes one side of each handle loop: whichever is nearest first, then every other way,
// until one lays out with nothing turned over; else the one with fewest.)
export function cutLayout(P, mesh, opts = {}) {
  const g = P.surface.genus, lengths = edgeLengths(mesh), len = (p, q) => lengths.get(ek(p, q)), loops = handleLoops(mesh, g, len);
  let best = null, failed = null;
  for (const sides of [null, ...Array.from({ length: 2 ** (g - 1) }, (_, m) => [0, ...Array.from({ length: g - 1 }, (_, j) => (m >> j) & 1)])]) {
    try {
      const got = layHalves(P, mesh, loops, len, splitByLoops(mesh, loops, sides), opts);
      if (!best || got.turned < best.turned) best = got;
      if (!best.turned) break;
    } catch (e) { failed = e; }
  }
  if (!best) throw failed;
  return best;
}
function layHalves(P, mesh, loops, len, { top, outer: outerLoop }, { iterations = 2000, B = 1.8, holeScale = 2.5, untangling = {} }) {
  const g = P.surface.genus, A = 1.4 + 1.3 * g, n = mesh.verts.length, T = mesh.tris.length;
  // each rim the way the top runs round it
  const next = new Map(), has = new Set();
  mesh.tris.forEach((t, i) => { if (top[i]) t.forEach((p, k) => has.add(`${p},${t[(k + 1) % 3]}`)); });
  mesh.tris.forEach((t, i) => { if (top[i]) t.forEach((p, k) => { const q = t[(k + 1) % 3]; if (!has.has(`${q},${p}`)) next.set(p, q); }); });
  const runs = [outerLoop, ...loops].map((rim) => { const run = [rim[0]]; for (let v = next.get(rim[0]); v !== rim[0]; v = next.get(v)) run.push(v); return run; });
  const onRim = new Set(runs.flat()), [outer, ...holes] = runs;
  // ---- each half: its triangles round each vertex, in order, and its neighbors
  const halfOf = (side) => {
    const at = new Map(), nb = [];
    mesh.tris.forEach((t, i) => { if (!!top[i] !== side) return; t.forEach((v, k) => { (at.get(v) ?? at.set(v, []).get(v)).push(t); (nb[v] ??= new Set()).add(t[(k + 1) % 3]).add(t[(k + 2) % 3]); }); });
    const nbArr = [];
    for (const [v] of at) nbArr[v] = [...nb[v]];
    const fan = (v) => {
      const nx = new Map();
      for (const t of at.get(v)) { const j = t.indexOf(v); nx.set(t[(j + 1) % 3], t[(j + 2) % 3]); }
      const heads = new Set(nx.values()), first = [...nx.keys()].find((k) => !heads.has(k)) ?? nx.keys().next().value, order = [first];
      while (nx.has(order.at(-1)) && nx.get(order.at(-1)) !== first) order.push(nx.get(order.at(-1)));
      return order;
    };
    return { side, at, nbArr, fan, verts: new Set(at.keys()), idx: mesh.tris.map((_, i) => i).filter((i) => !!top[i] === side) };
  };
  const halves = [halfOf(true), halfOf(false)];
  // (each half a sphere with g + 1 holes: V − E + F = 1 − g)
  for (const h of halves) {
    const edges = new Set();
    for (const i of h.idx) mesh.tris[i].forEach((p, k) => edges.add(ek(p, mesh.tris[i][(k + 1) % 3])));
    const chi = h.verts.size - edges.size + h.idx.length;
    if (chi !== 1 - g) throw new Error(`the ${h.side ? "top" : "bottom"} isn't a sphere with ${g + 1} holes (V − E + F = ${chi})`);
  }
  // (a way along a rim, by length: where each vertex is along it, from its first)
  const arcAt = (run) => { const at = [0]; for (let k = 1; k <= run.length; k++) at.push(at[k - 1] + len(run[k - 1], run[k % run.length])); return at; };
  const opposite = (run, v) => {
    const at = arcAt(run), i = run.indexOf(v), want = (at[i] + at.at(-1) / 2) % at.at(-1);
    let best = 0;
    for (let k = 0; k < run.length; k++) if (Math.abs(at[k] - want) < Math.abs(at[best] - want)) best = k;
    return run[best];
  };
  // ---- the bridges: from the outside's left end to the nearest hole, out its far side to the next
  // nearest, …, and from the last back to the outside's right end; each leaving its rim straight.
  // On the top and the bottom both, between the same points: each next hole and where on it, the
  // nearest by the two ways together (by the top's alone, the bottom's ways wind round the holes
  // to get there, and its triangles come out laid over them).
  const router = (h, gap) => {
    const nearRim = within(h.nbArr, [...onRim], gap), avoid = new Set(), paths = [];
    const straightFrom = (s) => {
      const f = h.fan(s), way = [s, f[Math.floor(f.length / 2)]];
      for (let k = 0; k < gap; k++) { const f2 = h.fan(way.at(-1)), i = f2.indexOf(way.at(-2)); way.push(f2[(i + Math.floor(f2.length / 2)) % f2.length]); }
      return way;
    };
    const clear = (way) => !way.slice(1).some((v) => onRim.has(v) || avoid.has(v));
    // (every target the shortest way reaches from s: target → { cost, path })
    const reach = (s, targets) => {
      const out = new Map(), a = straightFrom(s);
      if (!clear(a)) return out;
      const stubs = new Map();
      for (const t of targets) { const b = straightFrom(t); if (clear(b)) (stubs.get(b.at(-1)) ?? stubs.set(b.at(-1), []).get(b.at(-1))).push(b); }
      const from = a.at(-1), dist = new Map([[from, 0]]), back = new Map(), heap = minHeap(), done = new Set();
      heap.push(0, from);
      while (heap.size) {
        const [d, v] = heap.pop();
        if (done.has(v)) continue;
        done.add(v);
        for (const b of stubs.get(v) ?? []) {
          const way = [v];
          for (let x = v; back.has(x); x = back.get(x)) way.unshift(back.get(x));
          const path = [...a, ...way.slice(1), ...[...b].reverse().slice(1)], t = b[0];
          if (!out.has(t)) out.set(t, { cost: d + lengthOf(a) + lengthOf(b), path });
        }
        for (const w of h.nbArr[v]) {
          if (done.has(w) || !(stubs.has(w) || (!onRim.has(w) && !avoid.has(w) && !nearRim.has(w)))) continue;
          const e = d + len(v, w);
          if (e < (dist.get(w) ?? Infinity)) { dist.set(w, e); back.set(w, v); heap.push(e, w); }
        }
      }
      return out;
    };
    const commit = (path) => { paths.push(path); for (const v of path) { avoid.add(v); for (const w of h.nbArr[v] ?? []) avoid.add(w); } };
    return { reach, commit, paths };
  };
  const lengthOf = (way) => way.slice(1).reduce((s, v, k) => s + len(way[k], v), 0);
  const at0 = arcAt(outer), round = (c) => {
    const want = (c / 16) * at0.at(-1);
    let k0 = 0;
    for (let k = 0; k < outer.length; k++) if (Math.abs(at0[k] - want) < Math.abs(at0[k0] - want)) k0 = k;
    return outer[k0];
  };
  // (plans from 16 places round the outside, each next hole picked by both halves' ways or by the
  // top's alone: neither always lays out with nothing turned over, so the shortest few are tried.
  // Tried too and dropped: the bottom's own ways, from wherever on each hole suits it, and the
  // bottom then twisted round each rim to meet the top's; it turned more over, not fewer.)
  const plans = [];
  for (let gap = 2; gap >= 0; gap--) for (let c = 0; c < 16; c++) for (const both of [true, false]) {
    const L0 = round(c), R0 = opposite(outer, L0), up = router(halves[0], gap), down = router(halves[1], gap), order = [], sides = [];
    let from = L0, okAll = true, total = 0;
    const left = holes.map((_, i) => i);
    while (left.length && okAll) {
      const targets = left.flatMap((i) => holes[i]), a = up.reach(from, targets), b = down.reach(from, targets);
      let pick = null;
      for (const [t, x] of a) { const y = b.get(t), cost = x.cost + (both ? y?.cost : 0); if (y && (!pick || cost < pick.cost)) pick = { t, cost, x, y }; }
      if (!pick) { okAll = false; break; }
      up.commit(pick.x.path); down.commit(pick.y.path); total += pick.x.cost + pick.y.cost;
      const i = left.find((j) => holes[j].includes(pick.t));
      left.splice(left.indexOf(i), 1); order.push(i);
      sides.push([pick.t, (from = opposite(holes[i], pick.t))]);
    }
    if (!okAll) continue;
    const a = up.reach(from, [R0]).get(R0), b = down.reach(from, [R0]).get(R0);
    if (!a || !b) continue;
    up.commit(a.path); down.commit(b.path); total += a.cost + b.cost;
    plans.push({ total, top: up.paths, bottom: down.paths, order, sides: [[L0, R0], ...sides] });
  }
  if (!plans.length) throw new Error("no bridges across the halves");
  plans.sort((a, b) => a.total - b.total);
  let laid = null;
  for (const plan of plans.slice(0, 16)) {
    for (const slit of [true, false]) {
      let got;
      try { got = layWith(plan, slit); } catch { break; }
      if (!laid || got.turned < laid.turned) laid = got;
      if (!laid.turned) break;
    }
    if (laid && !laid.turned) break;
  }
  if (!laid) throw new Error("no bridges pair the halves' disks alike");
  return { xz: laid.xz, top, rims: runs, turned: laid.turned };
  // (laid out by a plan, each half by itself: Tutte against slits, each disk convex so nothing in it
  // folds; or with the holes round, which can fold where the ways round the holes wind)
  function layWith(plan, slit) {
  // ---- the disks each half's rims and bridges leave; the upper ones: the outside's half from its
  // left end to its right as the top runs, and the hole halves beside the same disk
  const trisOf = new Map();
  mesh.tris.forEach((t, i) => t.forEach((p, k) => { const key = ek(p, t[(k + 1) % 3]); (trisOf.get(key) ?? trisOf.set(key, []).get(key)).push(i); }));
  const diskIds = (h, paths) => {
    const cutAlso = new Set([...runs.flatMap((w) => w.map((v, k) => ek(v, w[(k + 1) % w.length]))), ...paths.flatMap((w) => w.slice(1).map((v, k) => ek(w[k], v)))]);
    const disk = new Int32Array(T).fill(-1);
    for (const i0 of h.idx) {
      if (disk[i0] >= 0) continue;
      const q = [i0]; disk[i0] = i0;
      for (let j = 0; j < q.length; j++) mesh.tris[q[j]].forEach((p, k) => {
        const key = ek(p, mesh.tris[q[j]][(k + 1) % 3]);
        if (!cutAlso.has(key)) for (const o of trisOf.get(key)) if (!!top[o] === h.side && disk[o] < 0) { disk[o] = i0; q.push(o); }
      });
    }
    const of = (p, q) => disk[trisOf.get(ek(p, q)).find((i) => !!top[i] === h.side)];
    return Object.assign(of, { disk });
  };
  const split = (run, [l, r]) => {
    const from = run.indexOf(l), turned = [...run.slice(from), ...run.slice(0, from)], k = turned.indexOf(r);
    return [turned.slice(0, k + 1), [...turned.slice(k), l].reverse()];
  };
  const chain = plan.order.map((i) => holes[i]);
  const sideOf = (h, paths, sides) => {
    const disk = diskIds(h, paths), [arc, arcBelow] = split(outer, sides[0]), holeHalves = chain.map((run, i) => split(run, sides[i + 1]));
    const upperHalves = holeHalves.map((hh) => hh.find((x) => disk(x[0], x[1]) === disk(arc[0], arc[1])));
    if (upperHalves.some((x) => !x)) throw new Error("a hole's halves are both on one disk");
    const lowerHalves = holeHalves.map((hh, i) => hh.find((x) => x !== upperHalves[i]));
    const pieces = new Set(h.idx.map((i) => disk.disk[i])).size;
    if (pieces !== 2) throw new Error(`the bridges cut a half in ${pieces}`);
    // (every edge of each half beside its disk)
    for (const [halvesOf, side] of [[lowerHalves, arcBelow], [upperHalves, arc], [[arc], arc], [[arcBelow], arcBelow]])
      for (const x of halvesOf) for (let k = 1; k < x.length; k++) if (disk(x[k - 1], x[k]) !== disk(side[0], side[1])) throw new Error("a disk misses part of a rim's half");
    return { h, paths, disk, arc, arcBelow, upperHalves, lowerHalves, upperRim: new Set(upperHalves.flat()) };
  };
  const halfPlans = [sideOf(halves[0], plan.top, plan.sides), sideOf(halves[1], plan.bottom, plan.sides)];
  // ---- laid flat: the axis shared out by length (bridge, slit, bridge, …), by the top's, as
  // plateLayout does
  const shares = (way) => { const at = [0]; for (let k = 1; k < way.length; k++) at.push(at[k - 1] + len(way[k - 1], way[k])); return at.map((x) => x / at.at(-1)); };
  const pieces = plan.top.flatMap((path, k) => [lengthOf(path), ...(k < chain.length ? [holeScale * lengthOf(halfPlans[0].upperHalves[k])] : [])]);
  const total = pieces.reduce((a, b) => a + b), stops = [-A];
  for (const l of pieces) stops.push(stops.at(-1) + (2 * A * l) / total);
  const slits = chain.map((_, i) => [stops[2 * i + 1], stops[2 * i + 2]]), open = slitOpener(slits);
  const onAxis = (x0, x1, s) => {
    const X0 = open([x0, 0])[0], X = X0 + s * (open([x1, 0])[0] - X0);
    let lo = x0, hi = x1;
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (open([m, 0])[0] < X) lo = m; else hi = m; }
    return [(lo + hi) / 2, 0];
  };
  const oval = Array.from({ length: 721 }, (_, j) => [-A * Math.cos((Math.PI * j) / 720), -B * Math.sin((Math.PI * j) / 720)]), ovalAt = [0];
  oval.forEach((p, j) => { if (j) { const a = open(oval[j - 1]), b = open(p); ovalAt.push(ovalAt[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); } });
  const onOval = (s, flip) => {
    const want = s * ovalAt.at(-1), j = Math.max(1, ovalAt.findIndex((l) => l >= want)), t = (want - ovalAt[j - 1]) / (ovalAt[j] - ovalAt[j - 1] || 1);
    return [oval[j - 1][0] + t * (oval[j][0] - oval[j - 1][0]), flip * (oval[j - 1][1] + t * (oval[j][1] - oval[j - 1][1]))];
  };
  const local = mesh.local, weight = meanValueWeights(mesh, local);
  // one half: its rims and bridges put, its inside by Tutte (each disk round a circle first, then
  // taken onto its half oval along rays from a point inside it: straight onto the half oval, an
  // edge between two points of the axis crushes everything past it flat onto the axis, and opened
  // that folds over), opened
  const layOne = ({ h, paths, disk: diskOf, arc, arcBelow, upperHalves, lowerHalves, upperRim }) => {
    const X = new Float64Array(2 * n), pinned = new Uint8Array(n), nbrsOf = (v) => h.nbArr[v];
    const place = (way, f) => shares(way).forEach((s, i) => { const v = way[i]; [X[2 * v], X[2 * v + 1]] = f(s); pinned[v] = 1; });
    chain.forEach((_, i) => {
      const [lo, hi] = slits[i], at = (s) => [(lo + hi) / 2 - ((hi - lo) / 2) * Math.cos(Math.PI * s), 0];
      place(upperHalves[i], at); place(lowerHalves[i], at);
    });
    paths.forEach((path, k) => place(path, (s) => onAxis(stops[2 * k], stops[2 * k + 1], s)));
    place(arc, (s) => onOval(s, 1)); place(arcBelow, (s) => onOval(s, -1));
    if (slit) {
      const upper = new Uint8Array(n), upId = diskOf(arc[0], arc[1]), members = new Map();
      for (const i of h.idx) {
        const id = diskOf.disk[i], m = members.get(id) ?? members.set(id, { up: id === upId, verts: new Set() }).get(id);
        for (const v of mesh.tris[i]) { m.verts.add(v); if (m.up) upper[v] = 1; }
      }
      const circle = new Float64Array(2 * n);
      for (const { up, verts } of members.values()) {
        const c = [0, (up ? -B : B) / 3];
        // (where a ray from c at angle a leaves the half oval: the axis, or the oval)
        const edgeAt = (a) => {
          const d = [Math.cos(a), Math.sin(a)], qa = d[0] ** 2 / A ** 2 + d[1] ** 2 / B ** 2, qb = 2 * ((c[0] * d[0]) / A ** 2 + (c[1] * d[1]) / B ** 2), qc = c[0] ** 2 / A ** 2 + c[1] ** 2 / B ** 2 - 1;
          let t = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
          if (d[1] !== 0 && (up ? d[1] > 0 : d[1] < 0)) t = Math.min(t, -c[1] / d[1]);
          return t;
        };
        for (const v of verts) if (pinned[v]) { const a = Math.atan2(X[2 * v + 1] - c[1], X[2 * v] - c[0]); circle[2 * v] = Math.cos(a); circle[2 * v + 1] = Math.sin(a); }
        const inside = [...verts].filter((v) => !pinned[v]);
        tutte(inside, nbrsOf, weight, circle, iterations);
        for (const v of inside) {
          const r = Math.hypot(circle[2 * v], circle[2 * v + 1]), a = Math.atan2(circle[2 * v + 1], circle[2 * v]), t = edgeAt(a) * r;
          X[2 * v] = c[0] + t * Math.cos(a); X[2 * v + 1] = c[1] + t * Math.sin(a);
        }
      }
      for (const v of h.verts) [X[2 * v], X[2 * v + 1]] = open([X[2 * v], X[2 * v + 1]], onRim.has(v) ? upperRim.has(v) : !!upper[v]);
    } else {
      for (const v of h.verts) if (onRim.has(v)) [X[2 * v], X[2 * v + 1]] = open([X[2 * v], X[2 * v + 1]], upperRim.has(v));
      tutte([...h.verts].filter((v) => !onRim.has(v)), nbrsOf, weight, X, iterations);
    }
    return X;
  };
  const XT = layOne(halfPlans[0]), XB = layOne(halfPlans[1]);
  const xz = new Float64Array(2 * n), free = new Uint8Array(n);
  for (const v of halves[1].verts) [xz[2 * v], xz[2 * v + 1]] = [XB[2 * v], XB[2 * v + 1]];
  for (const v of halves[0].verts) [xz[2 * v], xz[2 * v + 1]] = [XT[2 * v], XT[2 * v + 1]];
  let turned = 0;
  for (const h of halves) {
    free.fill(0);
    for (const v of h.verts) if (!onRim.has(v)) free[v] = 1;
    turned += untangle(h.idx.map((i) => mesh.tris[i]), h.idx.map((i) => local[i]), xz, free, untangling);
  }
  return { xz, turned };
  }
}

// (the slits opened to circles one at a time, as plateLayout does: see there)
function slitOpener(slits) {
  const sqrt = (re, im) => { const m = Math.hypot(re, im), r = Math.sqrt((m + re) / 2), i = Math.sqrt(Math.max(0, (m - re) / 2)); return [r, im < 0 ? -i : i]; };
  const opened = [];
  for (const slit of slits) {
    const [lo, hi] = slit.map((x) => opened.reduce((p, f) => f(p, false), [x, 0])[0]), mid = (lo + hi) / 2, r = (hi - lo) / 4;
    opened.push(([x, z], up) => {
      const zr = x - mid, [ar, ai] = sqrt(zr - 2 * r, z), [br, bi] = sqrt(zr + 2 * r, z);
      let sr = ar * br - ai * bi, si = ar * bi + ai * br;
      if (Math.abs(z) < 1e-12 && Math.abs(zr) < 2 * r && (si < 0) !== up) { sr = -sr; si = -si; }
      return [mid + (zr + sr) / 2, (z + si) / 2];
    });
  }
  return (p, up = false) => opened.reduce((q, f) => f(q, up), p);
}
// each edge (as "v,w") weighed by its mean value from v: the tangents of half the angles beside it
// over its length, from the triangles' own shapes on their tiles
function meanValueWeights(mesh, local) {
  const weight = new Map();
  mesh.tris.forEach((t, i) => {
    const pts = local[i];
    for (let k = 0; k < 3; k++) {
      const [a, b, c] = [0, 1, 2].map((j) => (k + j) % 3), u = [pts[b][0] - pts[a][0], pts[b][1] - pts[a][1]], w = [pts[c][0] - pts[a][0], pts[c][1] - pts[a][1]];
      const half = Math.tan(Math.abs(Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1])) / 2);
      for (const o of [b, c]) { const key = `${t[a]},${t[o]}`; weight.set(key, (weight.get(key) ?? 0) + half / hyperbolic(pts[a], pts[o])); }
    }
  });
  return weight;
}
// every vertex of `inside` moved to its neighbors' weighed average, over and over (the rest held)
function tutte(inside, nbrsOf, weight, xz, iterations) {
  const start = new Int32Array(inside.length + 1), near = [], share = [];
  inside.forEach((v, i) => {
    const ws = nbrsOf(v), ks = ws.map((w) => weight.get(`${v},${w}`)), sum = ks.reduce((a, b) => a + b);
    ws.forEach((w, j) => { near.push(w); share.push(ks[j] / sum); });
    start[i + 1] = near.length;
  });
  const nearA = Int32Array.from(near), shareA = Float64Array.from(share);
  for (let it = 0; it < iterations; it++) for (let i = 0; i < inside.length; i++) {
    const v = inside[i];
    let x = 0, z = 0;
    for (let j = start[i]; j < start[i + 1]; j++) { const w = nearA[j], k = shareA[j]; x += k * xz[2 * w]; z += k * xz[2 * w + 1]; }
    xz[2 * v] += 1.8 * (x - xz[2 * v]); xz[2 * v + 1] += 1.8 * (z - xz[2 * v + 1]);
  }
}

// A surface with holes in space, smooth by its making: a pretzel given by an equation,
// y² = s·e(x, z)·h₁(x, z)·h₂(x, z)…, e > 0 inside an oval and each hᵢ > 0 outside a hole's circle
// (the plate's top and bottom: y = ±√(s·…), meeting where the product is 0, round over at the rims),
// and the tiles laid on it. Laid out flat then lifted by a height, the tiles carried every kink of
// the layout into the curves on the surface, and every crease of the height into dents; here the
// shape is fixed and smooth, and only where each vertex sits on it is worked out:
//   - start: a plate (layout: "plate", plateLayout's, by the half turn; "cut", cutLayout's), the
//     oval and the holes fitted to its rims, each vertex lifted onto the top or bottom at its place
//     (and the rims' onto the rims);
//   - then every vertex moved over the surface (put back onto it after each step) to the least of
//     the same energy untangle uses, on the surface: each triangle as near its own shape, angles
//     and size, as it can be, none turned over (here, run round against the way out of the surface).
// Returns { pos (x y z per vertex), shape (the pretzel's numbers: see pretzel) }.
export function implicitPlate(P, mesh, { thick = 0.6, lambda = 0.3, rounds = 30, steps = 300, layout = "plate" } = {}) {
  const { xz, top, rims, turned } = (layout === "plate" ? plateLayout : cutLayout)(P, mesh), n = mesh.verts.length;
  if (turned) throw new Error(`${turned} triangles turned over laid flat`);
  // ---- the shape: the oval and holes fitted to the layout's rims (the outside's the one reaching
  // furthest out)
  const reach = (r) => Math.max(...r.map((v) => Math.hypot(xz[2 * v], xz[2 * v + 1])));
  const outer = rims.reduce((a, b) => (reach(b) > reach(a) ? b : a)), holes = rims.filter((r) => r !== outer);
  const A = Math.max(...outer.map((v) => Math.abs(xz[2 * v]))), B = Math.max(...outer.map((v) => Math.abs(xz[2 * v + 1])));
  const circles = holes.map((r) => {
    const cx = r.reduce((s, v) => s + xz[2 * v], 0) / r.length, cz = r.reduce((s, v) => s + xz[2 * v + 1], 0) / r.length;
    return [cx, cz, r.reduce((s, v) => s + Math.hypot(xz[2 * v] - cx, xz[2 * v + 1] - cz), 0) / r.length];
  });
  const shape = { A, B, circles, s: 1 }, { F } = pretzel(shape);
  let most = 0;
  for (let i = 0; i <= 200; i++) for (let j = 0; j <= 100; j++) most = Math.max(most, F(-A + (2 * A * i) / 200, -B + (2 * B * j) / 100)[0]);
  shape.s = (thick * thick) / most;
  const { out, project } = pretzel(shape);
  // ---- the start: each vertex up or down by the surface's height where it is
  const side = new Int8Array(n), onRim = new Set(rims.flat()), x = new Float64Array(3 * n);
  mesh.tris.forEach((t, i) => t.forEach((v) => { if (!onRim.has(v)) side[v] = top[i] ? 1 : -1; }));
  for (let v = 0; v < n; v++) x.set([xz[2 * v], side[v] * Math.sqrt(Math.max(0, shape.s * F(xz[2 * v], xz[2 * v + 1])[0])), xz[2 * v + 1]], 3 * v);
  project(x);
  settleOnSurface(mesh.tris, mesh.local, x, out, project, { lambda, rounds, steps });
  return { pos: x, shape };
}

// The pretzel from its numbers ({ A, B: the oval's half widths; circles: [x, z, r] each hole; s }):
// F(x, z) = e·h₁·h₂… and its slopes in x and z; out(x, y, z): the equation's value, y² − s·F, and
// its slope (the way out of the surface); onto(p): a point moved onto the surface (Newton's way);
// project(X): every point of X (x y z each) moved onto it, in place.
export function pretzel({ A, B, circles, s }) {
  const F = (x, z) => {
    let f = 1 - (x / A) ** 2 - (z / B) ** 2, fx = (-2 * x) / (A * A), fz = (-2 * z) / (B * B);
    for (const [cx, cz, r] of circles) {
      // (1 − r²/d²: 0 on the hole's circle, and levelling off to 1 away from it, so a small hole
      // doesn't leave the rest of the plate crushed thin)
      const d2 = Math.max((x - cx) ** 2 + (z - cz) ** 2, 1e-12), q = 1 - (r * r) / d2, k = (2 * r * r) / (d2 * d2), qx = k * (x - cx), qz = k * (z - cz);
      [f, fx, fz] = [f * q, fx * q + f * qx, fz * q + f * qz];
    }
    return [f, fx, fz];
  };
  const out = (x, y, z) => { const [f, fx, fz] = F(x, z); return [y * y - s * f, -s * fx, 2 * y, -s * fz]; };
  const onto = (p) => {
    for (let k = 0; k < 8; k++) { const [f, gx, gy, gz] = out(...p), g2 = gx * gx + gy * gy + gz * gz || 1; p = [p[0] - (f * gx) / g2, p[1] - (f * gy) / g2, p[2] - (f * gz) / g2]; }
    return p;
  };
  const project = (X) => { for (let v = 0; v < X.length / 3; v++) X.set(onto([X[3 * v], X[3 * v + 1], X[3 * v + 2]]), 3 * v); };
  return { F, out, onto, project };
}

// Every vertex (x: x y z each, on the surface, moved in place) moved over a surface (out: its
// equation's value and slope at a point; project: points back onto it) to the least of the energy
// untangle uses, there: each triangle (tris; local: its corners in the disk, its own shape) as near
// its own angles and size as it can be, none turned over (run round against the way out).
function settleOnSurface(tris, local, x, out, project, { lambda, rounds, steps }) {
  const n = x.length / 3, T = tris.length;
  // ---- the triangles' own shapes: their angles' cotangents (the disk keeps angles), their areas
  // (hyperbolic), all scaled to cover the surface
  const cot = new Float64Array(3 * T), own = new Float64Array(T);
  const area3 = (X, [a, b, c]) => {
    const u = [X[3 * b] - X[3 * a], X[3 * b + 1] - X[3 * a + 1], X[3 * b + 2] - X[3 * a + 2]], w = [X[3 * c] - X[3 * a], X[3 * c + 1] - X[3 * a + 1], X[3 * c + 2] - X[3 * a + 2]];
    return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
  };
  let ownAll = 0, now = 0;
  tris.forEach((t, i) => {
    const p = local[i];
    for (let k = 0; k < 3; k++) {
      const a = p[k], b = p[(k + 1) % 3], c = p[(k + 2) % 3], u = [b[0] - a[0], b[1] - a[1]], w = [c[0] - a[0], c[1] - a[1]];
      cot[3 * i + k] = (u[0] * w[0] + u[1] * w[1]) / Math.abs(u[0] * w[1] - u[1] * w[0]);
    }
    const m = [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3], flat = Math.abs((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0])) / 2;
    own[i] = (flat * 4) / (1 - m[0] ** 2 - m[1] ** 2) ** 2;
    ownAll += own[i]; now += area3(x, t);
  });
  for (let i = 0; i < T; i++) own[i] *= now / ownAll;
  // (which way the triangles run round, seen from outside: most of them, at the start)
  const runs = (X, i) => {
    const [a, b, c] = tris[i], m = [0, 1, 2].map((j) => (X[3 * a + j] + X[3 * b + j] + X[3 * c + j]) / 3), [, gx, gy, gz] = out(...m);
    const u = [0, 1, 2].map((j) => X[3 * b + j] - X[3 * a + j]), w = [0, 1, 2].map((j) => X[3 * c + j] - X[3 * a + j]);
    return (u[1] * w[2] - u[2] * w[1]) * gx + (u[2] * w[0] - u[0] * w[2]) * gy + (u[0] * w[1] - u[1] * w[0]) * gz;
  };
  let agree = 0;
  for (let i = 0; i < T; i++) agree += Math.sign(runs(x, i));
  const way = agree < 0 ? -1 : 1;
  // ---- the energy (as untangle's): per triangle its own area times (|J|² + λ(det² + 1)) / χ(det),
  // |J|² = D / its own area, det = its signed area (by the way out) over its own
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const energy = (X, g, eps) => {
    if (g) g.fill(0);
    let E = 0;
    for (let i = 0; i < T; i++) {
      const [a, b, c] = tris[i], P0 = [X[3 * a], X[3 * a + 1], X[3 * a + 2]], P1 = [X[3 * b], X[3 * b + 1], X[3 * b + 2]], P2 = [X[3 * c], X[3 * c + 1], X[3 * c + 2]];
      const e0 = [0, 1, 2].map((j) => P2[j] - P1[j]), e1 = [0, 1, 2].map((j) => P0[j] - P2[j]), e2 = [0, 1, 2].map((j) => P1[j] - P0[j]);
      const m = [0, 1, 2].map((j) => (P0[j] + P1[j] + P2[j]) / 3), [, gx, gy, gz] = out(...m), gl = way / (Math.hypot(gx, gy, gz) || 1), nn = [gx * gl, gy * gl, gz * gl];
      const N = cross(e2, [-e1[0], -e1[1], -e1[2]]), As = 0.5 * (N[0] * nn[0] + N[1] * nn[1] + N[2] * nn[2]);
      const c0 = cot[3 * i], c1 = cot[3 * i + 1], c2 = cot[3 * i + 2], sq = (e) => e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
      const Ar = own[i], J2 = (0.5 * (c0 * sq(e0) + c1 * sq(e1) + c2 * sq(e2))) / Ar, det = As / Ar;
      const root = Math.sqrt(eps * eps + det * det), chi = (det + root) / 2, topE = J2 + lambda * (det * det + 1);
      E += Ar * (topE / chi);
      if (!g) continue;
      // ∂/∂J², ∂/∂det, then each to the corners (J² by its sides, det by ½ n × the side across)
      const kJ = Ar / chi / Ar, kd = (Ar * ((2 * lambda * det) / chi - (topE * (1 + det / root)) / 2 / (chi * chi))) / Ar;
      const d0 = cross(nn, e0), d1 = cross(nn, e1), d2 = cross(nn, e2);
      for (let j = 0; j < 3; j++) {
        g[3 * a + j] += kJ * (c1 * e1[j] - c2 * e2[j]) + kd * 0.5 * d0[j];
        g[3 * b + j] += kJ * (c2 * e2[j] - c0 * e0[j]) + kd * 0.5 * d1[j];
        g[3 * c + j] += kJ * (c0 * e0[j] - c1 * e1[j]) + kd * 0.5 * d2[j];
      }
    }
    // (only along the surface: each vertex's push less its part along the way out)
    if (g) for (let v = 0; v < n; v++) {
      const [, gx, gy, gz] = out(X[3 * v], X[3 * v + 1], X[3 * v + 2]), g2 = gx * gx + gy * gy + gz * gz || 1, k = (g[3 * v] * gx + g[3 * v + 1] * gy + g[3 * v + 2] * gz) / g2;
      g[3 * v] -= k * gx; g[3 * v + 1] -= k * gy; g[3 * v + 2] -= k * gz;
    }
    return E;
  };
  const worst = (X) => { let m = Infinity; for (let i = 0; i < T; i++) m = Math.min(m, (way * runs(X, i)) / 2 / own[i]); return m; };
  let eps = 1, E = energy(x, null, eps);
  for (let r = 0; r < rounds; r++) {
    const D = worst(x), E2 = minimize((X, g) => energy(X, g, eps), x, steps, 8, project), sigma = Math.max(1 - E2 / E, 0.1), D2 = worst(x);
    eps = (1 - sigma) * (D2 + Math.sqrt(eps * eps + D2 * D2)) / 2;
    E = E2;
    if (D > 0 && D2 > 0 && r > 2) break;
  }
}

// A closed mesh in space made finer and smooth for drawing: each triangle split in four, `levels`
// times, the points moved by Loop's rule (a new point on an edge 3/8 each of its ends and 1/8 each
// of the two across; an old one pulled toward its neighbors' average). Returns { pos, tris, tile
// (per triangle), local (per triangle, its corners' points on that tile, in the disk: a new one
// halfway along the hyperbolic line between, so tiles' edges stay on their curved edges) }.
// (mesh: surfaceMesh's, or one split already, { tris, tile, local }. smooth false: no Loop, each
// new point halfway along its edge and the old ones where they were, so the map from the disk stays
// what it was: Loop moves points in space and not on their tiles, and lines on the tiles kink.)
export function loopSurface(mesh, pos, levels = 2, smooth = true) {
  let X = Float64Array.from(pos), tris = mesh.tris.map((t) => [...t]), tile, local;
  if (mesh.tiles) {
    const per = mesh.tris.length / mesh.tiles.length;
    tile = tris.map((_, i) => Math.floor(i / per)); local = mesh.local;
  } else ({ tile, local } = mesh);
  const ek = (p, q) => (p < q ? `${p},${q}` : `${q},${p}`);
  for (let l = 0; l < levels; l++) {
    const n = X.length / 3, nbrs = Array.from({ length: n }, () => new Set()), across = new Map(), made = new Map(), out = [];
    for (const [a, b, c] of tris) for (const [p, q, o] of [[a, b, c], [b, c, a], [c, a, b]]) {
      nbrs[p].add(q); nbrs[q].add(p);
      const k = ek(p, q);
      if (!across.has(k)) across.set(k, []);
      across.get(k).push(o);
    }
    for (let v = 0; v < n; v++) {
      const k = nbrs[v].size, beta = !smooth ? 0 : k === 3 ? 3 / 16 : 3 / (8 * k);
      for (let j = 0; j < 3; j++) { let s = 0; for (const w of nbrs[v]) s += X[3 * w + j]; out.push((1 - k * beta) * X[3 * v + j] + beta * s); }
    }
    const mid = (p, q) => {
      const k = ek(p, q);
      if (!made.has(k)) {
        const [c, d] = across.get(k);
        made.set(k, out.length / 3);
        for (let j = 0; j < 3; j++) out.push(smooth ? (3 / 8) * (X[3 * p + j] + X[3 * q + j]) + (1 / 8) * (X[3 * c + j] + X[3 * d + j]) : (X[3 * p + j] + X[3 * q + j]) / 2);
      }
      return made.get(k);
    };
    const half = (u, w) => along(u, w, 0.5), next = [], nextTile = [], nextLocal = [];
    tris.forEach(([a, b, c], i) => {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a), [la, lb, lc] = local[i], lab = half(la, lb), lbc = half(lb, lc), lca = half(lc, la);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      nextLocal.push([la, lab, lca], [lab, lb, lbc], [lca, lbc, lc], [lab, lbc, lca]);
      for (let k = 0; k < 4; k++) nextTile.push(tile[i]);
    });
    X = Float64Array.from(out); tris = next; tile = nextTile; local = nextLocal;
  }
  return { pos: X, tris, tile, local };
}

// implicitPlate's surface, finer for drawing: the mesh split twice (each new point halfway along
// its edge, put back on the pretzel), the tiles moved over it again after each split. (Split
// without moving them again, each old triangle's edges stay creases in the map from the disk:
// lines drawn on the tiles kink there. Laid out with Loop's split instead, the points move in space
// and not on their tiles, and the lines kink worse.) Most of a minute: the data keeps it, see
// data/add-shapes.mjs. Returns { at (the twice-split mesh's vertices' places), shape }.
export function implicitShape(P, mesh, { lambda = 0.3, ...opts } = {}) {
  let { pos, shape } = implicitPlate(P, mesh, { lambda, ...opts }), at = mesh;
  const { out, project } = pretzel(shape);
  for (let k = 0; k < 2; k++) {
    at = loopSurface(at, pos, 1, false);
    ({ pos } = at);
    project(pos);
    settleOnSurface(at.tris, at.local, pos, out, project, { lambda, rounds: 30, steps: opts.fineSteps ?? 200 });
  }
  return { at: pos, shape };
}
// implicitShape's places, kept: as whole numbers (16 bits, of the most any place is from 0 in x, y
// or z), base64. Back on the pretzel after, they're off along it by about 1/30000 of that.
export function packShape({ at, shape }) {
  const most = at.reduce((m, x) => Math.max(m, Math.abs(x)), 0), q = Int16Array.from(at, (x) => Math.round((x / most) * 32767)), bytes = new Uint8Array(q.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { shape, most, vertices: at.length / 3, at: btoa(s) };
}
export function unpackShape({ shape, most, at }) {
  const bytes = Uint8Array.from(atob(at), (c) => c.charCodeAt(0)), q = new Int16Array(bytes.buffer);
  return { shape, at: Float64Array.from(q, (x) => (x / 32767) * most) };
}
// The surface to draw from implicitShape's (kept) result: the mesh split twice, its points at their
// places on the pretzel. Returns { pos, normals (the surface's own, from its equation's slope: from
// the triangles' they shade the mesh's unevenness in as dents), tris, tile, local }.
export function implicitSurface(mesh, { at, shape }) {
  const fine = loopSurface(mesh, new Float64Array(3 * mesh.verts.length), 2, false);
  if (fine.pos.length !== at.length) throw new Error("the kept shape is for another mesh");
  const { project, out, onto } = pretzel(shape);
  fine.pos = Float64Array.from(at);
  project(fine.pos);
  splitLong(fine, onto);
  fine.normals = new Float64Array(fine.pos.length);
  for (let v = 0; v < fine.pos.length / 3; v++) {
    const [, gx, gy, gz] = out(fine.pos[3 * v], fine.pos[3 * v + 1], fine.pos[3 * v + 2]), l = Math.hypot(gx, gy, gz) || 1;
    fine.normals.set([gx / l, gy / l, gz / l], 3 * v);
  }
  return fine;
}

// The triangles much longer in space than most (where the tiles are stretched thin over the
// pretzel, as round the end of the tube from one corner) split in two across their longest side,
// again and again, the triangle on the other side of it split there too (first split across its
// own longest side, if that's another: Rivara's, so the mesh stays whole and the triangles don't
// get thinner); each new point on the pretzel (onto) and halfway along the side on its tile.
// (Drawn flat, a stretched triangle is a facet on the silhouette and a kink in the lines.) In
// place on { pos, tris, tile, local }.
function splitLong(S, onto, factor = 3) {
  const P = Array.from(S.pos), { tris, tile, local } = S, at = (v) => [P[3 * v], P[3 * v + 1], P[3 * v + 2]];
  const len = (a, b) => Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]);
  const lengths = [];
  for (const t of tris) for (let k = 0; k < 3; k++) lengths.push(len(t[k], t[(k + 1) % 3]));
  lengths.sort((a, b) => a - b);
  const most = factor * lengths[lengths.length >> 1], sides = new Map();
  const side = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const index = (i) => tris[i].forEach((a, k) => { const key = side(a, tris[i][(k + 1) % 3]); (sides.get(key) ?? sides.set(key, new Set()).get(key)).add(i); });
  const unindex = (i) => tris[i].forEach((a, k) => sides.get(side(a, tris[i][(k + 1) % 3])).delete(i));
  tris.forEach((_, i) => index(i));
  const longest = (i) => { const t = tris[i]; let k = 0; for (let j = 1; j < 3; j++) if (len(t[j], t[(j + 1) % 3]) > len(t[k], t[(k + 1) % 3])) k = j; return k; };
  // (triangle i cut from the corner across its side k, at the new point m: its two halves)
  const halve = (i, k, m, lm) => {
    const t = tris[i], L = local[i], [a, b, c] = [t[k], t[(k + 1) % 3], t[(k + 2) % 3]], [la, lb, lc] = [L[k], L[(k + 1) % 3], L[(k + 2) % 3]];
    unindex(i);
    tris[i] = [a, m, c]; local[i] = [la, lm, lc]; index(i);
    tris.push([m, b, c]); local.push([lm, lb, lc]); tile.push(tile[i]); index(tris.length - 1);
  };
  const split = (i, depth = 0) => {
    const k = longest(i), a = tris[i][k], b = tris[i][(k + 1) % 3], j = [...sides.get(side(a, b))].find((o) => o !== i);
    if (depth < 50 && j !== undefined) { const kj = longest(j); if (side(tris[j][kj], tris[j][(kj + 1) % 3]) !== side(a, b)) { split(j, depth + 1); return split(i, depth + 1); } }
    const m = P.length / 3, p = onto(at(a).map((x, d) => (x + at(b)[d]) / 2));
    P.push(...p);
    for (const o of j === undefined ? [i] : [i, j]) {
      const t = tris[o], ko = t.findIndex((v, q) => side(v, t[(q + 1) % 3]) === side(a, b));
      halve(o, ko, m, along(local[o][ko], local[o][(ko + 1) % 3], 0.5));
    }
  };
  for (let i = 0; i < tris.length; i++) while (len(tris[i][longest(i)], tris[i][(longest(i) + 1) % 3]) > most) split(i);
  S.pos = Float64Array.from(P);
}

// How many triangles of a surface on the pretzel run round the other way to most (turned over),
// seen from outside it
export function turnedOver({ pos, tris }, shape) {
  const { out } = pretzel(shape), signs = tris.map(([a, b, c]) => {
    const u = [0, 1, 2].map((j) => pos[3 * b + j] - pos[3 * a + j]), w = [0, 1, 2].map((j) => pos[3 * c + j] - pos[3 * a + j]);
    const [, gx, gy, gz] = out(...[0, 1, 2].map((j) => (pos[3 * a + j] + pos[3 * b + j] + pos[3 * c + j]) / 3));
    return Math.sign((u[1] * w[2] - u[2] * w[1]) * gx + (u[2] * w[0] - u[0] * w[2]) * gy + (u[0] * w[1] - u[1] * w[0]) * gz);
  });
  const up = signs.filter((s) => s > 0).length;
  return Math.min(up, signs.length - up);
}

// V − E + F of a mesh
export function eulerOf({ verts, tris }) {
  const edges = new Set();
  for (const [a, b, c] of tris) for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.add(p < q ? `${p},${q}` : `${q},${p}`);
  return verts.length - edges.size + tris.length;
}
