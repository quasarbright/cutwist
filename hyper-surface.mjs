// A hyperbolic puzzle's surface in 3D (hyper.mjs's surfaces: closed, two-sided).
//
// The surface itself, as a triangle mesh: each tile sampled in rings about its middle (in its own
// frame, tile 0's coordinates in the disk), the points on its edges and corners shared with the
// tiles around (found through the surface's group: a corner is a corner coset, an edge point an
// edge coset and how far along). Then, for a two-holed surface, laid on a pretzel in space: laid
// flat as a plate's top and bottom (plateLayout), a smooth pretzel fitted to that (pretzel), and
// the tiles moved over it to keep their shapes (implicitShape; kept in regular-maps/shapes/ by
// data/add-shapes.mjs, and drawn from by implicitSurface). Every vertex keeps where it is on its
// tile (tile, point in the disk), for painting the tiles on.
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

// The surface's mesh. P: a built hyperbolic puzzle (its G, H). rings: from a tile's middle out to
// its edge; perEdge: samples along each edge. Returns { verts: [{ key }], tris: [[a, b, c]] (tile
// by tile, the same number each), tiles: [{ tile, dart, at: [[vertex, its point in the disk]] }],
// index: key → vertex, rings, perEdge }.
export function surfaceMesh(P, rings = 6, perEdge = 6) {
  const { G, H } = P, N = G.N, reps = H.coset.face.reps, index = new Map(), verts = [], tris = [], tiles = [];
  const id = (key) => { if (!index.has(key)) { index.set(key, verts.length); verts.push({ key }); } return index.get(key); };
  const B = N * perEdge, name = meshKey(P, rings, perEdge);
  // (tile 0's edge points, in order round it: corner k, then along the edge to corner k + 1)
  const edgePts = [];
  for (let k = 0; k < N; k++) for (let j = 0; j < perEdge; j++) edgePts.push(along(G.corners[k], G.corners[(k + 1) % N], j / perEdge));
  reps.forEach((h, t) => {
    const at = [], key = (a, b) => name(t, a, b);
    const point = (a, b) => (a === 0 ? [0, 0] : along([0, 0], edgePts[b], a / rings));
    const v = (a, b) => { const i = id(key(a, b % B)); at.push([i, point(a, b % B)]); return i; };
    for (let b = 0; b < B; b++) {
      tris.push([v(0, 0), v(1, b), v(1, b + 1)]);
      for (let a = 1; a < rings; a++) tris.push([v(a, b), v(a + 1, b), v(a + 1, b + 1)], [v(a, b), v(a + 1, b + 1), v(a, b + 1)]);
    }
    tiles.push({ tile: t, dart: h, at: [...new Map(at).entries()] });
  });
  return { verts, tris, tiles, index, rings, perEdge };
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
  const per = mesh.tris.length / mesh.tiles.length, local = mesh.tiles.map((t) => new Map(t.at)), out = new Map();
  mesh.tris.forEach((t, i) => {
    const at = local[Math.floor(i / per)];
    for (const [p, q] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) out.set(p < q ? `${p},${q}` : `${q},${p}`, hyperbolic(at.get(p), at.get(q)));
  });
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
  // each neighbor weighed by its mean value: the tangents of half the angles beside the edge, over
  // its length, from the triangles' own shapes on their tiles (all weighed alike, the triangles
  // crush flat against the axis)
  const per = mesh.tris.length / mesh.tiles.length, local = mesh.tiles.map((t) => new Map(t.at)), weight = new Map();
  mesh.tris.forEach((t, i) => {
    if (!top[i]) return;
    const pts = t.map((v) => local[Math.floor(i / per)].get(v));
    for (let k = 0; k < 3; k++) {
      const [a, b, c] = [0, 1, 2].map((j) => (k + j) % 3), u = [pts[b][0] - pts[a][0], pts[b][1] - pts[a][1]], w = [pts[c][0] - pts[a][0], pts[c][1] - pts[a][1]];
      const half = Math.tan(Math.abs(Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1])) / 2);
      for (const o of [b, c]) { const key = `${t[a]},${t[o]}`; weight.set(key, (weight.get(key) ?? 0) + half / hyperbolic(pts[a], pts[o])); }
    }
  });
  const inside = [...topVerts].filter((v) => !pinned[v]);
  // (each inside vertex's neighbors and their shares of it, flat, for speed)
  const start = new Int32Array(inside.length + 1), near = [], share = [];
  inside.forEach((v, i) => {
    const ws = [...nb.get(v)], ks = ws.map((w) => weight.get(`${v},${w}`)), sum = ks.reduce((a, b) => a + b);
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
  for (const v of topVerts) [xz[2 * v], xz[2 * v + 1]] = open([xz[2 * v], xz[2 * v + 1]], upperRim.has(v));
  // Opened, triangles crushed against the slits turn over, and the tiles near the holes come out
  // small: then all but the rims moved to make each triangle as near its own shape and size as
  // they can be, none turned over.
  const topIndex = mesh.tris.map((_, i) => i).filter((i) => top[i]), free = new Uint8Array(n);
  for (const v of inside) free[v] = 1;
  for (const path of best.paths) for (const v of path) if (!onRim.has(v)) free[v] = 1;
  const turned = untangle(topIndex.map((i) => mesh.tris[i]), topIndex.map((i) => mesh.tris[i].map((v) => local[Math.floor(i / per)].get(v))), xz, free);
  // the bottom: the top's images, mirrored
  mesh.tris.forEach((t, i) => { if (!top[i]) for (const v of t) if (!topVerts.has(v)) { const w = turn[v]; xz[2 * v] = xz[2 * w]; xz[2 * v + 1] = -xz[2 * w + 1]; } });
  return { xz, top, rims: runs, turned };
}

// A two-holed surface in space, smooth by its making: a pretzel given by an equation,
// y² = s·e(x, z)·h₁(x, z)·h₂(x, z), e > 0 inside an oval and each hᵢ > 0 outside a hole's circle
// (the plate's top and bottom: y = ±√(s·…), meeting where the product is 0, round over at the rims),
// and the tiles laid on it. Laid out flat then lifted by a height, the tiles carried every kink of
// the layout into the curves on the surface, and every crease of the height into dents; here the
// shape is fixed and smooth, and only where each vertex sits on it is worked out:
//   - start: plateLayout's plate, the oval and the holes fitted to its rims, each vertex lifted onto
//     the top or bottom at its place (and the rims' onto the rims);
//   - then every vertex moved over the surface (put back onto it after each step) to the least of
//     the same energy untangle uses, on the surface: each triangle as near its own shape, angles
//     and size, as it can be, none turned over (here, run round against the way out of the surface).
// Returns { pos (x y z per vertex), shape (the pretzel's numbers: see pretzel) }.
export function implicitPlate(P, mesh, { thick = 0.6, lambda = 0.3, rounds = 30, steps = 300 } = {}) {
  const { xz, top, rims } = plateLayout(P, mesh), n = mesh.verts.length, T = mesh.tris.length;
  // ---- the shape: the oval and holes fitted to the layout's rims (the outside's the longest round)
  const len = (r) => r.reduce((s, v, k) => s + Math.hypot(xz[2 * v] - xz[2 * r[(k + 1) % r.length]], xz[2 * v + 1] - xz[2 * r[(k + 1) % r.length] + 1]), 0);
  const outer = rims.reduce((a, b) => (len(b) > len(a) ? b : a)), holes = rims.filter((r) => r !== outer);
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
  const per = T / mesh.tiles.length, at = mesh.tiles.map((t) => new Map(t.at)), local = mesh.tris.map((t, i) => t.map((v) => at[Math.floor(i / per)].get(v)));
  settleOnSurface(mesh.tris, local, x, out, project, { lambda, rounds, steps });
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
      const q = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r) - 1, qx = (2 * (x - cx)) / (r * r), qz = (2 * (z - cz)) / (r * r);
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
// (mesh: surfaceMesh's, or one split already, { tris, tile, local })
export function loopSurface(mesh, pos, levels = 2) {
  let X = Float64Array.from(pos), tris = mesh.tris.map((t) => [...t]), tile, local;
  if (mesh.tiles) {
    const per = mesh.tris.length / mesh.tiles.length, at = mesh.tiles.map((t) => new Map(t.at));
    tile = tris.map((_, i) => Math.floor(i / per)); local = tris.map((t, i) => t.map((v) => at[tile[i]].get(v)));
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
      const k = nbrs[v].size, beta = k === 3 ? 3 / 16 : 3 / (8 * k);
      for (let j = 0; j < 3; j++) { let s = 0; for (const w of nbrs[v]) s += X[3 * w + j]; out.push((1 - k * beta) * X[3 * v + j] + beta * s); }
    }
    const mid = (p, q) => {
      const k = ek(p, q);
      if (!made.has(k)) {
        const [c, d] = across.get(k);
        made.set(k, out.length / 3);
        for (let j = 0; j < 3; j++) out.push((3 / 8) * (X[3 * p + j] + X[3 * q + j]) + (1 / 8) * (X[3 * c + j] + X[3 * d + j]));
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

// implicitPlate's surface, finer for drawing: Loop's split twice, every point then put back on the
// pretzel's equation (so the shape stays exactly the smooth one). Returns { pos, tris, tile, local }.
// (Laid out twice: on the mesh, then on it split once, as the split's straight-in-the-disk new
// points bend the map where it crosses the old triangles' edges. Some seconds: the data keeps it,
// see data/add-shapes.mjs. Returns { mid (the once-split vertices' places), shape }.)
export function implicitShape(P, mesh, { lambda = 0.3, ...opts } = {}) {
  const { pos, shape } = implicitPlate(P, mesh, { lambda, ...opts }), { out, project } = pretzel(shape), mid = loopSurface(mesh, pos, 1);
  project(mid.pos);
  settleOnSurface(mid.tris, mid.local, mid.pos, out, project, { lambda, rounds: 30, steps: opts.fineSteps ?? 200 });
  return { mid: mid.pos, shape };
}
// The surface to draw from implicitShape's (kept) result: the mesh split once (where mid's places
// go), then once more, every point onto the pretzel. Returns { pos, tris, tile, local }.
export function implicitSurface(mesh, { mid, shape }) {
  const half = { ...loopSurface(mesh, new Float64Array(3 * mesh.verts.length), 1) };
  if (half.pos.length !== mid.length) throw new Error("the kept shape is for another mesh");
  const fine = loopSurface(half, mid, 1);
  pretzel(shape).project(fine.pos);
  return fine;
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
