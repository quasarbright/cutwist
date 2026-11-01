// Numbers for comparing how puzzles feel to turn, to find which ones match what's fun.
//
// A turn is one click of one layer. Pieces are the ones that show (stickered). Trivial turns
// are left out of everything: ones that move a single piece (a pyraminx's tips) and ones that
// move every piece (the whole puzzle turning).
//
// - destructiveness: the share of the pieces a turn moves, averaged over the turns.
// - commutativity: for each turn, the share of the other axes' turns that commute with it,
//   averaged. (Turns on one axis always commute, so they aren't counted.)
// - overlap: for each pair of turns that don't commute, the share of the first one's pieces
//   that the second moves too, averaged. Low: they only touch at a few pieces.
// - vastness: the most turns that all commute with each other (one axis's layers count).
// - vulnerability: for each piece, how many axes have a turn that moves it, averaged.
// - variety: the piece types (pieces the puzzle's symmetry carries onto each other), with how
//   many pieces each type has, most first.
//
// Run it for a table of every preset at its usual size, or name some: node metrics.mjs cube
// skewb:3 (id, or id:size).
import { PRESETS, buildPuzzle, solvedState, applyMove, piecesInLayer, pieceTypes } from "./puzzle.mjs";

// the non-trivial turns: { axis, layer, q: 1, pieces (a Set of the shown pieces it moves) }
export function puzzleTurns(P, shown) {
  const S = solvedState(P), n = shown.length, turns = [];
  P.axes.forEach((ax, axis) => {
    for (let layer = 0; layer <= ax.offsets.length; layer++) {
      const pieces = piecesInLayer(P, S, axis, layer).filter((i) => P.pieces[i].stickers.length);
      if (pieces.length > 1 && pieces.length < n) turns.push({ axis, layer, q: 1, pieces: new Set(pieces) });
    }
  });
  return turns;
}

export function puzzleMetrics(P) {
  const shown = P.pieces.map((_, i) => i).filter((i) => P.pieces[i].stickers.length), n = shown.length;
  const turns = puzzleTurns(P, shown), T = turns.length;
  // (do a then b, from solved: the shown pieces' positions)
  const after = (a, b) => { const s = applyMove(P, applyMove(P, solvedState(P), a), b); return shown.map((i) => s[i]); };
  const commutes = turns.map(() => new Array(T).fill(false));
  for (let a = 0; a < T; a++)
    for (let b = a + 1; b < T; b++) {
      const x = after(turns[a], turns[b]), y = after(turns[b], turns[a]);
      commutes[a][b] = commutes[b][a] = x.every((v, k) => v === y[k]);
    }

  const destructiveness = T ? turns.reduce((s, t) => s + t.pieces.size / n, 0) / T : 0;
  let commuting = 0, counted = 0, overlap = 0, pairs = 0;
  turns.forEach((A, a) => {
    let c = 0, k = 0;
    turns.forEach((B, b) => {
      if (A.axis === B.axis) return;
      k++;
      if (commutes[a][b]) { c++; return; }
      let shared = 0;
      for (const i of A.pieces) if (B.pieces.has(i)) shared++;
      overlap += shared / A.pieces.size; pairs++;
    });
    if (k) { commuting += c / k; counted++; }
  });

  // vastness: the biggest clique of the commuting graph (Bron–Kerbosch, pivoting)
  let vastness = 0;
  const grow = (size, cands, done) => {
    if (!cands.length && !done.length) { vastness = Math.max(vastness, size); return; }
    if (size + cands.length <= vastness) return;
    const pivot = [...cands, ...done].reduce((b, u) => (cands.filter((v) => commutes[u][v]).length > cands.filter((v) => commutes[b][v]).length ? u : b));
    for (const v of cands.filter((v) => !commutes[pivot][v])) {
      grow(size + 1, cands.filter((u) => commutes[v][u]), done.filter((u) => commutes[v][u]));
      cands = cands.filter((u) => u !== v); done = [...done, v];
    }
  };
  grow(0, turns.map((_, k) => k), []);

  const vulnerability = shown.reduce((s, i) => s + new Set(turns.filter((t) => t.pieces.has(i)).map((t) => t.axis)).size, 0) / n;

  const types = pieceTypes(P.pieces, P.group), counts = new Map();
  for (const i of shown) counts.set(types[i], (counts.get(types[i]) || 0) + 1);
  const variety = [...counts.values()].sort((a, b) => b - a);

  return { pieces: n, turns: T, destructiveness, commutativity: counted ? commuting / counted : 0, overlap: pairs ? overlap / pairs : 0, vastness, vulnerability, types: variety.length, variety };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const asked = process.argv.slice(2);
  const specs = asked.length
    ? asked.map((a) => { const [id, size] = a.split(":"), spec = PRESETS.find((p) => p.id === id); if (!spec) throw new Error(`no preset ${id}`); return { spec, size: size ? +size : spec.size }; })
    : PRESETS.map((spec) => ({ spec, size: spec.size }));
  const rows = [["puzzle", "pieces", "turns", "destr", "commut", "overlap", "vast", "vuln", "types", "variety"]];
  for (const { spec, size } of specs) {
    let m;
    try { m = puzzleMetrics(buildPuzzle(spec, size)); } catch (e) { rows.push([`${spec.id}:${size}`, `(${e.message})`]); continue; }
    rows.push([`${spec.id}:${size}`, m.pieces, m.turns, m.destructiveness.toFixed(2), m.commutativity.toFixed(2), m.overlap.toFixed(2), m.vastness, m.vulnerability.toFixed(2), m.types, m.variety.join(" ")].map(String));
  }
  const w = rows[0].map((_, k) => Math.max(...rows.map((r) => (r[k] || "").length)));
  for (const r of rows) console.log(r.map((c, k) => (k ? c.padStart(w[k]) : c.padEnd(w[k]))).join("  "));
}
