// Drawing and hit-testing for the hyperbolic tile puzzles (hyper.mjs) on a 2D canvas: the surface
// unrolled into the Poincaré disk, every copy of every tile, shrinking toward the rim. The page owns
// the state, the animation queue and input; this lays the disk out, draws it, and says what's under
// a point. Dragging the disk around (pan) slides the hyperbolic plane under it: the view keeps one
// tile (its "start") in disk coordinates and lists the rest outward from it, re-centering on the
// tile nearest the middle as it goes, so nothing piles up at the rim.
//
// A piece is drawn at every visible dart of its current element (where its home dart is now), its
// region's outline carried there by that dart's map: clipped to it, its stickers are the tiles under
// it at home, in their colors. Under the pieces is the solved picture, which shows where no circle
// reaches.
import { mobius as Mb, darts, hdist, diskCircle, tileEdges } from "./hyper.mjs";
import { faceHas } from "./tiles.mjs";
import { PUZZLE_COLORS, vividHex } from "./planar-view.mjs";
import { colorDistance, PUZZLE_PALETTES } from "./puzzle.mjs";

const BODY = "#0a0b0e";
const BLACK = "#1c1f27";
const MIN_PX = 5; // (tiles smaller than this aren't drawn: the rim has thousands of them, slow to draw and too small to see)
const PIECE_PX = 4; // (nor pieces on tiles smaller than this: just the tile's color)
const abs = (z) => Math.hypot(z[0], z[1]);
// the circle through three points ({ c, r }), or null if they're in a line
function circleThrough(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const A = a[0] ** 2 + a[1] ** 2, B = b[0] ** 2 + b[1] ** 2, C = c[0] ** 2 + c[1] ** 2;
  const x = (A * (b[1] - c[1]) + B * (c[1] - a[1]) + C * (a[1] - b[1])) / d, y = (A * (c[0] - b[0]) + B * (a[0] - c[0]) + C * (b[0] - a[0])) / d;
  return { c: [x, y], r: Math.hypot(a[0] - x, a[1] - y) };
}

// The surface's tile colors, from a real twisty puzzle's palette (up to 12, 20, 30; past that hues
// by the golden angle), each tile the one least like its neighbors' (tiles sharing an edge)
const colorSets = new WeakMap();
export function hyperColor(P, f) {
  if (!colorSets.has(P)) colorSets.set(P, hyperColors(P));
  return colorSets.get(P)[f];
}
function hyperColors(P) {
  const { H } = P, n = P.tiles, face = H.coset.face;
  const palette = n <= 12 ? PUZZLE_COLORS : n <= 20 ? PUZZLE_PALETTES[20] : n <= 30 ? PUZZLE_PALETTES[30]
    : Array.from({ length: n }, (_, i) => vividHex((i * 137.508 + 29) % 360));
  // neighbors: across each edge (the dart turned about its corner: x·S)
  const near = Array.from({ length: n }, () => new Set());
  for (let x = 0; x < H.n; x++) { const a = face.of[x], b = face.of[H.right[1][x]]; if (a !== b) { near[a].add(b); near[b].add(a); } }
  // (six tiles, each touching all but one, like a cube's faces: a cube's colors, opposite pairs
  // white–yellow, red–orange, blue–green)
  if (n === 6 && near.every((s) => s.size === 4)) {
    const out = new Array(6), opposite = (i) => [0, 1, 2, 3, 4, 5].find((j) => j !== i && !near[i].has(j));
    [[0, 3], [1, 5], [2, 4]].forEach(([a, b]) => {
      const i = [...out.keys()].find((k) => out[k] === undefined);
      out[i] = PUZZLE_COLORS[a]; out[opposite(i)] = PUZZLE_COLORS[b];
    });
    return out;
  }
  const out = new Array(n), used = new Set();
  for (let i = 0; i < n; i++) {
    let best = -1, score = -Infinity;
    palette.forEach((c, k) => {
      if (used.has(k) && used.size < palette.length) return;
      const d = Math.min(0.18, ...[...near[i]].filter((j) => out[j]).map((j) => colorDistance(c, out[j])));
      if (d - 0.002 * k > score) { score = d - 0.002 * k; best = k; }
    });
    out[i] = palette[best]; used.add(best);
  }
  return out;
}

// Each fragment of tile 0 (hyper.mjs's P.regions: a piece is some of them, on its tiles) as
// polygons, once per puzzle, at a few levels of detail (a small copy needs fewer points):
// shapes[f][lod] = { loops (its outline, to fill even-odd), cuts: [{ pts, p }] (its stretches along
// circles it's inside: each circle line drawn from one side only; p, the circle's middle, sets the
// line's width as the circle's), edges: [{ pts, k }] (its stretches along tile 0's edge k) }. Each
// level samples every arc on its own, so the points where arcs meet (the fragment's corners) are
// always kept: skipping points of the whole outline cut corners off.
const STEPS = [1, 2, 4, 8]; // (as stepFor gives)
const shapeCache = new WeakMap();
const arcPoints = ({ c, r, a0, a1 }, step, end) => {
  const k = Math.max(step > 1 ? 2 : 6, Math.ceil((Math.abs(a1 - a0) * r) / (0.004 * step)));
  return Array.from({ length: k + (end ? 1 : 0) }, (_, i) => { const a = a0 + ((a1 - a0) * i) / k; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
};
export function fragmentShapes(P) {
  if (shapeCache.has(P)) return shapeCache.get(P);
  const circleOf = new Map(P.circles.map((c) => [c.c, c])), edgeOf = new Map(tileEdges(P.G).map((e) => [e.c, e]));
  const out = P.regions.map((region) => STEPS.map((step) => {
    const loops = region.outline.map((loop) => loop.flatMap((arc) => arcPoints(arc, step, false))), cuts = [], edges = [];
    for (const loop of region.outline) for (const arc of loop) {
      const e = edgeOf.get(arc.c), c = circleOf.get(arc.c);
      if (e) edges.push({ pts: arcPoints(arc, step, true), k: e.edge });
      else if (c && abs([region.anchor[0] - c.c[0], region.anchor[1] - c.c[1]]) < c.r) cuts.push({ pts: arcPoints(arc, step, true), p: c.p });
    }
    return { loops, cuts, edges };
  }));
  shapeCache.set(P, out);
  return out;
}

export class HyperView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.P = null;
    this.cx = 0; this.cy = 0; this.R = 100; // the disk on the canvas (CSS px)
    this.origin = { x: 0, y: 0 };
    this.start = null; // the view's start dart: { m (cover → disk), e }
    this.cache = null;
    this.minPx = MIN_PX; // (tiles smaller than this, in px across, aren't drawn)
  }
  heightFor(P, w) { return w; }
  layout(P, safe) {
    // (a new puzzle, even one with the same pieces count and view, is a new picture: the cached one
    // is keyed by view and state, so it goes)
    // (the same surface rebuilt, as while a cut is dragged, keeps where the view is)
    if (this.P !== P) { if (!this.P || this.P.H !== P.H) this.start = { m: Mb.I, e: 0 }; this.P = P; this.visible = null; this.cache = null; this.lines = null; this.ring = null; }
    const w = Math.max(40, safe.right - safe.left), h = Math.max(40, safe.bottom - safe.top);
    this.R = Math.min(w, h) / 2 - 2;
    this.cx = safe.left + w / 2; this.cy = safe.top + h / 2;
  }
  // ---- coordinates (CSS px ↔ disk) ----
  toDisk(px, py) { return [(px - this.cx) / this.R, (this.cy - py) / this.R]; }
  toScreen(z) { return { x: this.cx + z[0] * this.R, y: this.cy - z[1] * this.R }; }
  shows(px, py) { return abs(this.toDisk(px, py)) < 0.999; }

  // The visible darts, outward from the start, while tiles are big enough to see: a list of tiles
  // ({ m, e }: the tile's first dart) and, for every element, where its darts show ({ m } each).
  // Re-centers the start on the tile nearest the middle.
  listVisible() {
    if (this.visible && this.visible.key === this.viewKey()) return this.visible;
    const { P } = this, { G, H } = P;
    const big = (c, d) => { const s = abs(Mb.apply(d.m, G.corners[0]) .map((x, i) => x - c[i])); return s * this.R > this.minPx || abs(c) < 0.2; };
    let tiles = darts(G, H, this.start, big);
    // (re-center: the tile nearest the middle becomes the start)
    const nearest = tiles.reduce((b, d) => (abs(Mb.apply(d.m, [0, 0])) < abs(Mb.apply(b.m, [0, 0])) ? d : b), tiles[0]);
    if (nearest !== tiles[0]) { this.start = { m: Mb.norm(nearest.m), e: nearest.e }; tiles = darts(G, H, this.start, big); }
    const byElement = new Map();
    for (const d of tiles) {
      let m = d.m, e = d.e;
      for (let k = 0; k < G.N; k++) { if (!byElement.has(e)) byElement.set(e, []); byElement.get(e).push(m); m = Mb.mul(m, G.A); e = H.right[0][e]; }
    }
    this.visible = { key: this.viewKey(), tiles, byElement };
    return this.visible;
  }
  viewKey() { return [this.R, this.start.e, ...this.start.m.flat()].join(","); }
  // slide the plane so disk point a goes to b (a pan by the pointer)
  pan(a, b) {
    const T = Mb.mul(Mb.to(b), Mb.inv(Mb.to(a))); // (a to 0, then 0 to b: a translation, near enough for small steps)
    this.start = { m: Mb.norm(Mb.mul(T, this.start.m)), e: this.start.e };
    this.visible = null;
  }
  recenter() { this.start = { m: Mb.I, e: 0 }; this.visible = null; }
  // One tile's picture, for the 3D view's texture: element e's dart at the middle of this (square,
  // offscreen) canvas, the tile out to its corners filling it, and just the tiles big enough to
  // reach into it. Just the colors: the 3D view draws the lines itself (see tileLines). Returns px
  // per disk unit (a point p of e's frame is at the middle + p·that).
  drawTileAt(P, e, state, turn, look) {
    this.atTile(P, e, 6);
    this.bare = true;
    this.draw(state, turn, look);
    return this.R;
  }
  atTile(P, e, fraction) {
    const size = this.canvas.width;
    this.layout(P, { left: 0, top: 0, right: size, bottom: size });
    this.origin = { x: 0, y: 0 };
    this.R = size / 2 / abs(P.G.corners[0]);
    this.minPx = size / fraction;
    this.start = { m: Mb.I, e }; this.visible = null;
  }
  // The lines on element e's tile, in its dart's frame (the disk with that dart at the middle):
  // every circle around every copy of a turning point that reaches the tile ({ c, r }: a circle in
  // the disk), the tiles' edges (each an arc of a circle: { c, r, a, b }, from corner a to b), and
  // every copy of a turning point near it ({ axis, at }), for turning the lines in a turning ring.
  // (The tiles around too, and lines a way past the tile: a turning ring brings what's beside the
  // tile into it.)
  tileLines(P, e) {
    this.atTile(P, e, 60);
    // (as far as the tile's corners and the biggest ring's width past them: all a turn can bring in)
    const { G } = P, ring = Math.max(0, ...["face", "vertex", "edge"].flatMap((k) => P.radii[k]));
    // (near: reaching the tile itself, all a still picture needs; listed first)
    const reach = Math.tanh((G.Rv + 2 * ring) / 2), within = (d) => ({ c, r }) => abs(c) - r < d && r - abs(c) < d;
    const meets = within(reach), near = within(Math.tanh(G.Rv / 2) * 1.02);
    const cuts = [], edges = [], copies = [];
    for (const kind of ["face", "vertex", "edge"]) for (const { axis, at } of this.axisCopies(kind)) {
      copies.push({ axis, at });
      for (const r of P.radii[kind]) { const circle = diskCircle(at, r); if (meets(circle)) cuts.push(circle); }
    }
    // (each tile's edges: the circle through an edge's ends and middle, where the tile is; every
    // seen tile's, the same circle once. Taken from one side of each edge only, as drawing does,
    // the ones whose side is past the tiles seen went missing, and a turned ring brought them in.)
    // (An edge is just its arc, from corner to corner, a and b: past them its circle runs on
    // through other tiles, which a turned ring brings in as stray lines.)
    const seen = new Set();
    for (const d of this.listVisible().tiles) for (let k = 0; k < G.N; k++) {
      const [a, m, b] = [G.corners[k], G.mids[k], G.corners[(k + 1) % G.N]].map((p) => Mb.apply(d.m, p)), circle = circleThrough(a, m, b);
      if (!circle || !meets(circle)) continue;
      const key = [circle.c[0], circle.c[1], circle.r].map((x) => Math.round(x * 1e6)).join();
      if (!seen.has(key)) { seen.add(key); edges.push({ ...circle, a, b }); }
    }
    const first = (list) => [...list.filter(near), ...list.filter((q) => !near(q))];
    return { cuts: first(cuts), edges: first(edges), nearCuts: cuts.filter(near).length, nearEdges: edges.filter(near).length, copies };
  }

  // ---- hit testing (CSS px) ----
  // every visible copy of each axis point: { axis (index), at (disk) }, for one kind
  // (kept with the visible list: every pointer move asks for them)
  axisCopies(kind) {
    const vis = this.listVisible();
    vis.copies ||= {};
    if (vis.copies[kind]) return vis.copies[kind];
    const { P } = this, { G, H } = P, seen = new Set(), out = [];
    for (const [e, ms] of vis.byElement) {
      const c = H.coset[kind].of[e], axis = P.axisIndex.get(`${kind}:${c}`);
      if (axis === undefined) continue;
      for (const m of ms) {
        const at = Mb.apply(m, kind === "face" ? [0, 0] : kind === "vertex" ? G.corners[0] : G.mids[G.edge]);
        // (the same point reached from several darts: one copy. Copies drawn are far further apart
        // than this grid, and float error far under it)
        const key = `${axis}:${Math.round(at[0] * 1e6)}:${Math.round(at[1] * 1e6)}`;
        if (seen.has(key)) continue;
        seen.add(key); out.push({ axis, at });
      }
    }
    return (vis.copies[kind] = out);
  }
  // the circle whose line passes nearest a point, within tol px: { axis, layer, center (disk),
  // px (how far the line is) }
  circleAt(px, py, tol = 10) {
    if (!this.shows(px, py)) return null;
    const { P } = this, z = this.toDisk(px, py), k = ((1 - (z[0] ** 2 + z[1] ** 2)) / 2) * this.R; // (px per hyperbolic unit there: a disk step dz is 2·dz/(1 − |z|²) hyperbolic)
    let best = null, bestD = tol / k;
    for (const kind of ["face", "vertex", "edge"]) {
      if (!P.radii[kind].length) continue;
      for (const { axis, at } of this.axisCopies(kind)) {
        const d = hdist(z, at);
        // (a ring's line grabs the ring just inside it)
        P.radii[kind].forEach((r, layer) => { if (Math.abs(d - r) < bestD) { bestD = Math.abs(d - r); best = { axis, layer, center: at, px: bestD * k }; } });
      }
    }
    return best;
  }
  // The turning point (a tile's, corner's or edge's middle) a point is on, the part a tap turns:
  // its axis, or null. Each point's zone is the same share of the way to the nearest other kind
  // of point (a tile's middle to an edge's, an edge's to a corner), and well inside its first
  // circle; the nearest point wins.
  middleAt(px, py) { const hit = this.middleHit(px, py); return hit ? hit.axis : null; }
  // the same, with how far the point is from it: { axis, px }, or null
  middleHit(px, py) {
    if (!this.shows(px, py)) return null;
    const { P } = this, { G } = P, z = this.toDisk(px, py), zone0 = 0.45 * Math.min(G.Ri, G.edgeLength / 2);
    const k = ((1 - (z[0] ** 2 + z[1] ** 2)) / 2) * this.R; // (px per hyperbolic unit there)
    let best = null;
    for (const kind of ["face", "vertex", "edge"]) {
      if (!P.radii[kind].length) continue;
      const zone = Math.min(zone0, 0.55 * P.radii[kind][0]);
      for (const { axis, at } of this.axisCopies(kind)) { const d = hdist(z, at); if (d < zone && (!best || d < best.d)) best = { axis, d }; }
    }
    return best ? { axis: best.axis, px: best.d * k } : null;
  }
  // the piece under a point, and where that copy is ({ i, m }), or null
  pieceAt(px, py, state) {
    if (!this.shows(px, py)) return null;
    const { P } = this, { G, H } = P, z = this.toDisk(px, py), where = this.whereIs(state);
    // (the tile it's on, then the fragments there, seen from each of its darts)
    for (const d of this.listVisible().tiles) {
      if (!this.inTile(Mb.apply(Mb.inv(d.m), z))) continue;
      let m = d.m, e = d.e;
      for (let k = 0; k < G.N; k++) {
        const local = Mb.apply(Mb.inv(m), z);
        for (const [i, f] of where.get(e) || []) if (faceHas(P.regions[f].face, local)) return i;
        m = Mb.mul(m, G.A); e = H.right[0][e];
      }
      return null;
    }
    return null;
  }
  // which pieces' fragments are at each element now ([piece, fragment]: a piece at g has its
  // fragment (x, f) at g·x)
  whereIs(state) {
    const { P } = this, out = new Map();
    P.pieces.forEach((pc, i) => { for (const { x, f } of pc.frags) { const e = P.H.mul(state[i], x); if (!out.has(e)) out.set(e, []); out.get(e).push([i, f]); } });
    return out;
  }
  // the spot under a point, as (element of the tile it's on, point in that dart's frame), and every
  // visible copy of it (disk points)
  copiesOf(z) {
    const { P } = this, vis = this.listVisible();
    for (const d of vis.tiles) {
      let m = d.m, e = d.e;
      for (let k = 0; k < P.G.N; k++) {
        const local = Mb.apply(Mb.inv(m), z);
        if (k === 0 && !this.inTile(local)) break;
        if (k === 0) return (vis.byElement.get(e) || []).map((mm) => Mb.apply(mm, local));
        m = Mb.mul(m, P.G.A); e = P.H.right[0][e];
      }
    }
    return [];
  }
  inTile(local) { const p = this.P.G.poly; let w = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > local[1]) !== (p[j][1] > local[1]) && local[0] < p[i][0] + ((local[1] - p[i][1]) * (p[j][0] - p[i][0])) / (p[j][1] - p[i][1])) w = !w; return w; }

  // ---- drawing ----
  // state: the puzzle's state. turn: { pieces (Map piece → for each of its fragments, the point in
  // tile 0's frame it turns about), theta (radians, counterclockwise), axis, layer } or null.
  // look: { hover ({ axis, layer }), lit (Set of pieces), litAlpha, pointer ({ at (disk), cursor,
  // real }) }
  //
  // Two cached layers: the colors (tiles, the still fragments, the tiles' edges, blacked-out pieces
  // over those) and the circles' lines. Every line is drawn once, at a width set by where it is,
  // the same still or turning: so a turn neither thickens nor thins one. While a ring turns, its
  // fragments are drawn over the colors, and the cached lines are kept out of the ring, where the
  // turning fragments draw their own (each circle's from the fragment inside it; the ring's inner
  // circle, which has still fragments inside it, from the ring).
  draw(state, turn, look) {
    const { ctx, canvas, P } = this, dpr = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
    const moving = turn ? turn.pieces : null;
    // (a steady light, like blacking out's hovered kind, goes in the cached layer; a pulsing one,
    // an algorithm's, is drawn each frame)
    const steady = look.lit && look.litSteady ? look.lit : null;
    const place = [this.viewKey(), this.cx, this.cy, this.origin.x, this.origin.y, canvas.width, canvas.height].join("|");
    const key = [place, state.join(), moving ? [...moving.keys()].join(".") : "", steady ? [...steady].join(".") : ""].join("|");
    if (!this.cache || this.cache.key !== key) {
      const cx = this.layer("cache");
      const still = (i) => !moving || !moving.has(i);
      this.disk(cx);
      this.paintTiles(cx);
      this.paint(cx, state, (i) => still(i) && !P.pieces[i].black, null, "fill");
      if (!this.bare) this.tileEdges(cx);
      this.paint(cx, state, (i) => still(i) && P.pieces[i].black, null, "fill");
      if (steady) this.paint(cx, state, (i) => steady.has(i) && still(i), null, "light", look.litAlpha ?? 0.34);
      this.cache.key = key;
    }
    if (!this.bare && (!this.lines || this.lines.key !== place)) {
      const cx = this.layer("lines");
      this.clipDisk(cx);
      this.circleLines(cx);
      this.lines.key = place;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.cache.canvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, -this.origin.x * dpr, -this.origin.y * dpr);
    ctx.save();
    this.clipDisk(ctx);
    const blit = (c) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, 0, 0); ctx.restore(); };
    if (moving && this.bare) this.paint(ctx, state, (i) => moving.has(i), turn, "fill");
    else if (moving) {
      this.paint(ctx, state, (i) => moving.has(i), turn, "fill");
      this.paint(ctx, state, (i) => moving.has(i) && !P.pieces[i].black, turn, "edges");
      ctx.save(); this.ringPath(ctx, turn, true); ctx.clip("evenodd"); blit(this.lines.canvas); ctx.restore();
      ctx.save(); this.ringPath(ctx, turn, false); ctx.clip("evenodd");
      this.paint(ctx, state, (i) => moving.has(i), turn, "cuts");
      this.innerRing(ctx, turn);
      ctx.restore();
    } else if (!this.bare) blit(this.lines.canvas);
    if (look.lit && !steady) this.paint(ctx, state, (i) => look.lit.has(i), turn, "light", look.litAlpha ?? 0.34);
    if (look.hover) this.drawRings(ctx, look.hover);
    if (look.pointer) this.drawPointers(ctx, look.pointer);
    ctx.restore();
  }
  // a cached layer (this[name]: { canvas, key }), cleared, with no clip left from last time, set up
  // to draw in page px
  layer(name) {
    const { canvas } = this, dpr = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
    const L = (this[name] ||= { canvas: document.createElement("canvas"), key: null, saved: false });
    if (L.canvas.width !== canvas.width || L.canvas.height !== canvas.height) { L.canvas.width = canvas.width; L.canvas.height = canvas.height; L.saved = false; }
    const cx = L.canvas.getContext("2d");
    if (L.saved) cx.restore();
    cx.save(); L.saved = true;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, L.canvas.width, L.canvas.height);
    cx.setTransform(dpr, 0, 0, dpr, -this.origin.x * dpr, -this.origin.y * dpr); // (page px → this canvas)
    return cx;
  }
  disk(ctx) {
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, 0, 2 * Math.PI); ctx.fillStyle = BODY; ctx.fill();
    this.clipDisk(ctx);
  }
  // A turning ring at every visible copy of its axis (its outer circle, and inner one if it has
  // one), as a path to clip to even-odd: withDisk, the disk outside them (the rest of the picture)
  ringPath(ctx, { axis, layer }, withDisk) {
    const { P } = this, ax = P.axes[axis];
    ctx.beginPath();
    if (withDisk) { ctx.moveTo(this.cx + this.R, this.cy); ctx.arc(this.cx, this.cy, this.R, 0, 2 * Math.PI); }
    for (const { axis: a, at } of this.axisCopies(ax.kind)) {
      if (a !== axis) continue;
      for (const r of layer > 0 ? [ax.radii[layer], ax.radii[layer - 1]] : [ax.radii[layer]]) {
        const { c, r: er } = diskCircle(at, r), p = this.toScreen(c);
        ctx.moveTo(p.x + er * this.R, p.y); ctx.arc(p.x, p.y, er * this.R, 0, 2 * Math.PI);
      }
    }
  }
  // The darts of every tile a turning ring reaches, at each of its circle's copies that shows, by
  // element (as listVisible's byElement): found outward from the visible tile nearest the copy's
  // middle, whether they show or not. Kept while the same ring turns in the same view.
  ringDarts({ axis, layer }) {
    const key = [this.viewKey(), axis, layer].join("|");
    if (this.ring && this.ring.key === key) return this.ring.byElement;
    const { P } = this, { G, H } = P, ax = P.axes[axis], r = ax.radii[layer], tiles = this.listVisible().tiles, byElement = new Map();
    for (const { axis: a, at } of this.axisCopies(ax.kind)) {
      if (a !== axis) continue;
      const start = tiles.reduce((b, d) => (hdist(Mb.apply(d.m, [0, 0]), at) < hdist(Mb.apply(b.m, [0, 0]), at) ? d : b));
      for (const d of darts(G, H, start, (c) => hdist(c, at) < r + G.Rv + 1e-6)) {
        let m = d.m, e = d.e;
        for (let k = 0; k < G.N; k++) { if (!byElement.has(e)) byElement.set(e, []); byElement.get(e).push(m); m = Mb.mul(m, G.A); e = H.right[0][e]; }
      }
    }
    this.ring = { key, byElement };
    return byElement;
  }
  // a turning ring's inner circle (still fragments are inside it, so none of the turning ones draws it)
  innerRing(ctx, { axis, layer }) {
    const { P } = this, ax = P.axes[axis];
    if (!layer) return;
    ctx.strokeStyle = BODY;
    for (const { axis: a, at } of this.axisCopies(ax.kind)) {
      if (a !== axis) continue;
      const { c, r: er } = diskCircle(at, ax.radii[layer - 1]), p = this.toScreen(c);
      ctx.lineWidth = this.circleWidth(at);
      ctx.beginPath(); ctx.arc(p.x, p.y, er * this.R, 0, 2 * Math.PI); ctx.stroke();
    }
  }
  // Lines' widths, from how big a tile is where they are: a circle's from its middle, a tile edge's
  // from its tile (thinner: the circles are the cuts, the edges where colors meet)
  circleWidth(at) { return Math.max(0.35, Math.min(2, 0.035 * diskCircle(at, this.P.G.Rv).r * this.R)); }
  edgeWidth(m) { return 0.6 * this.lineFor(m); }
  // Each tile edge is drawn from one of its two tiles only: the one whose middle comes first (by x,
  // then y) of the two, seen with dart m. (The tile across edge k of tile 0 has its middle at the
  // reflection of 0 in that edge's circle: c/|c|².)
  firstSide(m, k) {
    const e = tileEdges(this.P.G)[k], n = e.c[0] ** 2 + e.c[1] ** 2, a = Mb.apply(m, [0, 0]), b = Mb.apply(m, [e.c[0] / n, e.c[1] / n]);
    return Math.abs(a[0] - b[0]) > 1e-9 ? a[0] < b[0] : a[1] < b[1];
  }
  polyline(ctx, pts, m) {
    pts.forEach((q, j) => { const p = this.toScreen(Mb.apply(m, q)); j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
  }
  clipDisk(ctx) { ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, 0, 2 * Math.PI); ctx.clip(); }
  // a polygon (disk points) as a path on ctx, every step-th point (a small copy needs few)
  trace(ctx, poly, m, step = 1) {
    for (let j = 0; j < poly.length; j += step) { const p = this.toScreen(Mb.apply(m, poly[j])); j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.closePath();
  }
  stepFor(px) { return px > 120 ? 1 : px > 50 ? 2 : px > 20 ? 4 : 8; }
  // a tile's size on screen (for skipping the ones too small to see)
  pxSize(m) { const c = Mb.apply(m, [0, 0]), k = Mb.apply(m, this.P.G.corners[0]); return abs([c[0] - k[0], c[1] - k[1]]) * this.R; }
  lineFor(m) { return Math.max(0.35, Math.min(2, 0.035 * this.pxSize(m))); }
  // the solved picture: every visible tile in its color
  paintTiles(ctx) {
    const { P } = this;
    for (const d of this.listVisible().tiles) {
      const px = this.pxSize(d.m);
      ctx.beginPath();
      // (small ones: their corners will do, the edges' bend is under a pixel)
      if (px < 12) this.trace(ctx, P.G.corners, d.m); else this.trace(ctx, P.G.poly, d.m, this.stepFor(px));
      ctx.fillStyle = hyperColor(P, P.H.coset.face.of[d.e]); ctx.fill();
    }
  }
  // the tiles' edges, each once (see firstSide), over the colors
  tileEdges(ctx) {
    const { P } = this, { G } = P, per = G.poly.length / G.N;
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = BODY;
    for (const d of this.listVisible().tiles) {
      const px = this.pxSize(d.m);
      if (px < MIN_PX) continue;
      const step = px < 12 ? per : this.stepFor(px);
      ctx.lineWidth = this.edgeWidth(d.m);
      ctx.beginPath();
      for (let k = 0; k < G.N; k++) {
        if (!this.firstSide(d.m, k)) continue;
        const pts = [];
        for (let j = 0; j < per; j += step) pts.push(G.poly[k * per + j]);
        pts.push(G.corners[(k + 1) % G.N]);
        this.polyline(ctx, pts, d.m);
      }
      ctx.stroke();
    }
  }
  // every circle at every visible copy of its middle: the pieces' outlines
  circleLines(ctx) {
    const { P } = this;
    ctx.strokeStyle = BODY;
    for (const kind of ["face", "vertex", "edge"]) {
      if (!P.radii[kind].length) continue;
      for (const { at } of this.axisCopies(kind)) {
        if (diskCircle(at, P.G.Rv).r * this.R < PIECE_PX) continue;
        ctx.lineWidth = this.circleWidth(at);
        for (const r of P.radii[kind]) {
          const { c, r: er } = diskCircle(at, r), p = this.toScreen(c);
          ctx.beginPath(); ctx.arc(p.x, p.y, er * this.R, 0, 2 * Math.PI); ctx.stroke();
        }
      }
    }
  }
  // Draw the pieces `which` picks, at every visible copy of each of their fragments. turn: the
  // moving ones' turn, or null. mode: "fill" (each fragment in its tile's color, or black),
  // "light" (a white light, alpha strong), "edges" (the tiles' edges across them), "cuts" (the
  // circles' lines along them, each from the fragment inside it)
  paint(ctx, state, which, turn, mode = "fill", alpha = 1) {
    const { P } = this, { H } = P, vis = this.listVisible(), shapes = fragmentShapes(P);
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = BODY;
    for (let i = 0; i < P.n; i++) {
      if (!which(i)) continue;
      const pc = P.pieces[i], pivots = turn && turn.pieces.get(i);
      // (a turning piece: from every tile its ring reaches, seen or not, as turned they can come
      // into view: half way round, the far side of a ring by the rim comes to its near side)
      const at = pivots ? this.ringDarts(turn) : vis.byElement;
      pc.frags.forEach(({ x, f }, k) => {
        const spin = pivots ? Mb.about(pivots[k], turn.theta) : null;
        for (const m0 of at.get(H.mul(state[i], x)) || []) {
          const m = spin ? Mb.mul(m0, spin) : m0, px = this.pxSize(m);
          if (px < PIECE_PX) continue; // (too small to see: the solved picture under it shows)
          const shape = shapes[f][STEPS.indexOf(this.stepFor(px))];
          if (mode === "edges") {
            ctx.lineWidth = this.edgeWidth(m);
            for (const { pts, k: e } of shape.edges) if (this.firstSide(m, e)) { ctx.beginPath(); this.polyline(ctx, pts, m); ctx.stroke(); }
            continue;
          }
          if (mode === "cuts") {
            for (const { pts, p } of shape.cuts) { ctx.lineWidth = this.circleWidth(Mb.apply(m, p)); ctx.beginPath(); this.polyline(ctx, pts, m); ctx.stroke(); }
            continue;
          }
          ctx.beginPath();
          for (const poly of shape.loops) this.trace(ctx, poly, m);
          if (mode === "light") { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = "#fff"; ctx.fill("evenodd"); ctx.restore(); continue; }
          ctx.fillStyle = pc.black ? BLACK : hyperColor(P, pc.faces[k]); ctx.fill("evenodd");
          // (no lines over the joins, as for the 3D view's texture: each a little wider, so no hairline gap shows between)
          if (this.bare) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = BODY; }
        }
      });
    }
  }
  // the rings of an axis's layer (hover), at every visible copy of it
  drawRings(ctx, { axis, layer }) {
    const { P } = this, ax = P.axes[axis];
    if (!ax) return;
    const r = ax.radii[layer], inner = layer > 0 ? ax.radii[layer - 1] : 0;
    ctx.save();
    for (const { axis: a, at } of this.axisCopies(ax.kind)) {
      if (a !== axis) continue;
      for (const rr of inner ? [r, inner] : [r]) {
        const { c, r: er } = diskCircle(at, rr), p = this.toScreen(c);
        if (er * this.R < 1.5) continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, er * this.R, 0, 2 * Math.PI);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, Math.min(3, er * this.R * 0.04)); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // the pointer's copies: wherever the spot under it shows again, a small mark drawn as the negative
  // of what's under it (the real pointer's own copy left out)
  drawPointers(ctx, { at, real }) {
    ctx.save();
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = "#fff";
    for (const z of this.copiesOf(at)) {
      if (real && abs([z[0] - at[0], z[1] - at[1]]) < 1e-6) continue;
      const p = this.toScreen(z), s = Math.max(1.5, 7 * (1 - (z[0] ** 2 + z[1] ** 2)));
      ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
  }
  // the solved puzzle in a small canvas (the corner card, the gallery's picture)
  drawSolvedCard(P, look = {}, top = 26) {
    const { canvas } = this, w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height, pad = 6;
    this.origin = { x: 0, y: 0 };
    this.layout(P, { left: pad, top, right: w - pad, bottom: h - pad });
    this.draw(new Int32Array(P.n), null, { hover: null, lit: null, ...look });
  }
}
