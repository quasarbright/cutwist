// Numbers for comparing how puzzles feel to turn, to find which ones match what's fun.
//
// A turn is one layer moving by the smallest angle it can (on a sliding puzzle, one row sliding
// by one). Pieces are the ones that show (stickered, not blacked out), and a piece whose stickers
// don't all touch counts once for each group that does (see touching). Trivial turns are left out
// of everything: ones that move a single piece (a pyraminx's tips) or none. On a solid or a ball,
// so are middle layers, the ones with the puzzle's center inside (a cube's slices, a crystal's
// middles, a pyraminx's faces), and layers of more than half the pieces: those are the rest of
// the puzzle turning the other way, with the whole puzzle turned. (A cut through the center
// leaves both halves, as on the skewb.) A flat or hyperbolic surface can't be turned as a whole,
// so there every other turn counts.
//
// - destructiveness: the proportion of the pieces a turn moves, averaged over the turns.
// - commutativity: for each turn, the proportion of other turns that commute with it, on
//   average. (Turns on one axis always commute, so they aren't counted.)
// - overlap: for each pair of turns that don't commute, the proportion of the first one's pieces
//   that the second moves too, averaged. Low: they only touch at a few pieces.
// - vastness: the most turns that all commute with each other (one axis's layers count, so more
//   cuts means more vast).
// - vulnerability: for each piece, how many axes have a turn that moves it, averaged.
// - degree: how many turns make 360° (or bring a row back), averaged over the axes that have a
//   turn.
// - variety: the piece types (pieces the puzzle's symmetry carries onto each other), with how
//   many pieces each type has, most first; typeNames names each by how many stickers its pieces
//   have: center (1), edge (2), corner(N) (N, the corner's degree); a sliding puzzle's are all
//   one kind. typePieces lists each one's whole pieces.
//
// Every kind of puzzle is read through its own model (modelOf); the Sierpinski puzzle has none,
// since which turns it has depends on how it's mixed up.
//
// Run it for a table of every solid preset at its usual size, or name some: node metrics.mjs
// cube skewb:3 (id, or id:size).
import { PRESETS, buildPuzzle, solvedState, applyMove, pieceTypes, applyMat } from "./puzzle.mjs";
import { solvedTileState, applyTileMove } from "./tiles.mjs";
import { solvedHyperState, applyHyperMove } from "./hyper.mjs";
import { solvedPlanarState, applyPlanarMove, lineCount } from "./planar.mjs";
import { solvedHSlideState, applyHSlideMove } from "./hslide.mjs";

// A piece's stickers ({ face, points }) in groups that touch (share a corner point), each group
// as its stickers' faces
function touching(stickers) {
  const parent = stickers.map((_, i) => i), root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const near = (p, q) => p.every((x, k) => Math.abs(x - q[k]) < 1e-6);
  for (let a = 0; a < stickers.length; a++)
    for (let b = a + 1; b < stickers.length; b++)
      if (stickers[a].points.some((p) => stickers[b].points.some((q) => near(p, q)))) parent[root(a)] = root(b);
  const groups = new Map();
  stickers.forEach((s, i) => groups.set(root(i), [...(groups.get(root(i)) || []), s.face]));
  return [...groups.values()];
}

// A puzzle as the metrics see it: its solved state (stride numbers a piece), how to turn, the
// turns to try ({ axis, layer }), which pieces show, each piece's type, and its parts: its
// stickers' faces (or tiles) in groups that touch, each counted as a piece of its own.
// null: a puzzle without metrics.
function modelOf(P) {
  const all = P.pieces ? P.pieces.map((_, i) => i) : [];
  const layered = (layers) => P.axes.flatMap((ax, axis) => Array.from({ length: layers(ax) }, (_, layer) => ({ axis, layer })));
  if (!P.kind || P.kind === "sphere") {
    // (a sticker's face and corners: a ball's tile, and its fragment's arcs' ends carried onto the
    // ball; a solid's face by its normal, and its polygon's corners)
    const ball = P.kind === "sphere";
    const ends = (x, f) => P.regions[f].outline.flatMap((loop) => loop.flatMap(({ c, r, a0, a1 }) =>
      [a0, a1].map((a) => applyMat(P.H.mats[x], P.chart.back([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)])))));
    const sticker = (s) => (ball ? { face: s.color, points: ends(s.x, s.f) } : { face: s.normal.map((x) => x.toFixed(4)).join(), points: s.verts });
    return {
      solid: true, stride: 1, solved: solvedState(P), apply: (s, m) => applyMove(P, s, m),
      // (no middle layers: ones whose planes have the center between them)
      tries: layered((ax) => ax.offsets.length + 1).filter(({ axis, layer }) => {
        const o = P.axes[axis].offsets;
        return !((layer === 0 || o[layer - 1] < -1e-9) && (layer === o.length || o[layer] > 1e-9));
      }),
      shown: all.filter((i) => P.pieces[i].stickers.length),
      types: P.types || pieceTypes(P.pieces, P.group),
      parts: (i) => touching(P.pieces[i].stickers.map(sticker)),
    };
  }
  if (P.kind === "tiles" || P.kind === "hyper") {
    const tiles = P.kind === "tiles";
    return {
      stride: tiles ? 3 : 1, solved: tiles ? solvedTileState(P) : solvedHyperState(P),
      apply: (s, m) => { (tiles ? applyTileMove : applyHyperMove)(P, s, m); return s; },
      tries: layered((ax) => ax.radii.length),
      shown: all.filter((i) => !P.pieces[i].black && P.pieces[i].stickers.length),
      types: P.pieces.map((pc) => pc.type),
      // (a sticker a tile; a piece's stickers taken as all touching, as a piece is one region)
      parts: (i) => [P.pieces[i].stickers.map((_, k) => k)],
    };
  }
  if (P.kind === "planar" || P.kind === "hslide") {
    const planar = P.kind === "planar", { n } = P;
    return {
      slide: planar ? (P.letters ? "letter" : "cell") : "square", stride: 1,
      solved: planar ? solvedPlanarState(P) : solvedHSlideState(P),
      apply: (s, m) => { (planar ? applyPlanarMove : applyHSlideMove)(P, s, m); return s; },
      tries: planar ? [0, 1].flatMap((axis) => Array.from({ length: lineCount(P, axis) }, (_, layer) => ({ axis, layer }))) : P.rows.map((_, axis) => ({ axis, layer: 0 })),
      shown: Array.from({ length: n }, (_, i) => i),
      types: new Array(n).fill(0),
      parts: () => [[]],
    };
  }
  return null;
}

// the pieces whose numbers differ between states a and b
function changed(M, a, b) {
  const out = new Set();
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.add(Math.floor(i / M.stride));
  return out;
}

// the non-trivial turns: { axis, layer, q: 1, pieces (a Set of the shown pieces it moves), moved
// (every piece it moves, shown or not), order (how many make a whole turn) }
export function puzzleTurns(P, M = modelOf(P)) {
  if (!M) return [];
  const shown = new Set(M.shown), n = shown.size, turns = [];
  for (const { axis, layer } of M.tries) {
    const move = { axis, layer, q: 1 }, s = M.apply(M.solved.slice(), move), moved = changed(M, M.solved, s);
    const pieces = new Set([...moved].filter((i) => shown.has(i)));
    if (pieces.size < 2 || (M.solid ? pieces.size > n / 2 : pieces.size === n)) continue;
    let order = 1;
    for (const t = s; order < 10000 && changed(M, M.solved, t).size; order++) M.apply(t, move);
    turns.push({ axis, layer, q: 1, pieces, moved, order });
  }
  return turns;
}

// how many pieces show, counted as the metrics count them (one per group of touching stickers),
// or null for a puzzle without metrics
export function pieceCount(P) {
  const M = modelOf(P);
  return M ? M.shown.reduce((s, i) => s + M.parts(i).length, 0) : null;
}

export function puzzleMetrics(P) {
  const M = modelOf(P);
  if (!M) return null;
  const turns = puzzleTurns(P, M), T = turns.length;
  // The pieces as counted: one for each group of a piece's stickers that touch (the corner-turning
  // cube's pieces under its corners are three centers each, its middle six). A turn moves all of
  // a piece's. (Which turns are trivial goes by whole pieces: see puzzleTurns.)
  const units = M.shown.flatMap((i) => M.parts(i).map((faces) => ({ piece: i, faces }))), n = units.length;
  const unitsOf = new Map();
  units.forEach((u, k) => unitsOf.set(u.piece, [...(unitsOf.get(u.piece) || []), k]));
  for (const t of turns) t.units = new Set([...t.pieces].flatMap((i) => unitsOf.get(i)));
  // (turns moving none of the same pieces commute; others, tried: a then b against b then a)
  const after = (a, b) => M.apply(M.apply(M.solved.slice(), a), b);
  const commutes = turns.map(() => new Array(T).fill(false));
  for (let a = 0; a < T; a++)
    for (let b = a + 1; b < T; b++) {
      const A = turns[a], B = turns[b];
      let meet = false;
      for (const i of A.moved) if (B.moved.has(i)) { meet = true; break; }
      commutes[a][b] = commutes[b][a] = !meet || !changed(M, after(A, B), after(B, A)).size;
    }

  const destructiveness = T ? turns.reduce((s, t) => s + t.units.size / n, 0) / T : 0;
  let commuting = 0, counted = 0, overlap = 0, pairs = 0;
  turns.forEach((A, a) => {
    let c = 0, k = 0;
    turns.forEach((B, b) => {
      if (A.axis === B.axis) return;
      k++;
      if (commutes[a][b]) { c++; return; }
      let shared = 0;
      for (const i of A.units) if (B.units.has(i)) shared++;
      overlap += shared / A.units.size; pairs++;
    });
    if (k) { commuting += c / k; counted++; }
  });

  // vastness: the biggest clique of the commuting graph (Bron–Kerbosch, pivoting), from a greedy
  // one (the turns that commute with the most others first). On a big surface, where most turns
  // commute, the search can run for ages: past a time limit the biggest found so far stands, and
  // vastnessExact says it's only a lower bound.
  let vastness = 0, vastnessExact = true;
  const greedy = [];
  for (const v of turns.map((_, k) => k).sort((a, b) => commutes[b].filter(Boolean).length - commutes[a].filter(Boolean).length))
    if (greedy.every((u) => commutes[u][v])) greedy.push(v);
  vastness = greedy.length;
  const end = performance.now() + 300;
  const grow = (size, cands, done) => {
    if (!cands.length && !done.length) { vastness = Math.max(vastness, size); return; }
    if (size + cands.length <= vastness) return;
    if (performance.now() > end) { vastnessExact = false; return; }
    const pivot = [...cands, ...done].reduce((b, u) => (cands.filter((v) => commutes[u][v]).length > cands.filter((v) => commutes[b][v]).length ? u : b));
    for (const v of cands.filter((v) => !commutes[pivot][v])) {
      grow(size + 1, cands.filter((u) => commutes[v][u]), done.filter((u) => commutes[v][u]));
      cands = cands.filter((u) => u !== v); done = [...done, v];
    }
  };
  grow(0, turns.map((_, k) => k), []);

  const vulnerability = n ? units.reduce((s, { piece }) => s + new Set(turns.filter((t) => t.pieces.has(piece)).map((t) => t.axis)).size, 0) / n : 0;

  // (an axis's degree: its turns' average, as a sliding puzzle's rows can differ in length)
  const byAxis = new Map();
  for (const t of turns) byAxis.set(t.axis, [...(byAxis.get(t.axis) || []), t.order]);
  const degree = byAxis.size ? [...byAxis.values()].reduce((s, os) => s + os.reduce((a, b) => a + b, 0) / os.length, 0) / byAxis.size : 0;

  // (a type: the pieces of one type of whole piece with that many stickers; typePieces, the whole
  // pieces, to light up)
  const counts = new Map();
  for (const { piece, faces } of units) {
    const f = new Set(faces).size, key = `${M.types[piece]}:${f}`, c = counts.get(key) || { n: 0, faces: f, pieces: new Set() };
    c.n++; c.pieces.add(piece); counts.set(key, c);
  }
  const sorted = [...counts.values()].sort((a, b) => b.n - a.n);
  const variety = sorted.map((c) => c.n), typePieces = sorted.map((c) => [...c.pieces]);
  const typeNames = sorted.map(({ faces: f }) => (M.slide ? M.slide : f === 1 ? "center" : f === 2 ? "edge" : `corner(${f})`));

  return { pieces: n, turns: T, destructiveness, commutativity: counted ? commuting / counted : 0, overlap: pairs ? overlap / pairs : 0, vastness, vastnessExact, vulnerability, degree, types: variety.length, variety, typeNames, typePieces };
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) { // (run from node, not imported by the page)
  const asked = process.argv.slice(2);
  const specs = asked.length
    ? asked.map((a) => { const [id, size] = a.split(":"), spec = PRESETS.find((p) => p.id === id); if (!spec) throw new Error(`no preset ${id}`); return { spec, size: size ? +size : spec.size }; })
    : PRESETS.map((spec) => ({ spec, size: spec.size }));
  const rows = [["puzzle", "pieces", "turns", "destr", "commut", "overlap", "vast", "vuln", "degree", "types", "variety"]];
  for (const { spec, size } of specs) {
    let m;
    try { m = puzzleMetrics(buildPuzzle(spec, size)); } catch (e) { rows.push([`${spec.id}:${size}`, `(${e.message})`]); continue; }
    rows.push([`${spec.id}:${size}`, m.pieces, m.turns, m.destructiveness.toFixed(2), m.commutativity.toFixed(2), m.overlap.toFixed(2), m.vastness, m.vulnerability.toFixed(2), m.degree.toFixed(2), m.types, m.variety.join(" ")].map(String));
  }
  const w = rows[0].map((_, k) => Math.max(...rows.map((r) => (r[k] || "").length)));
  for (const r of rows) console.log(r.map((c, k) => (k ? c.padStart(w[k]) : c.padEnd(w[k]))).join("  "));
}
