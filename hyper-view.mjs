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
import { mobius as Mb, darts, hdist, diskCircle } from "./hyper.mjs";
import { faceHas } from "./tiles.mjs";
import { PUZZLE_COLORS, vividHex } from "./planar-view.mjs";
import { colorDistance, PUZZLE_PALETTES } from "./puzzle.mjs";

const BODY = "#0a0b0e";
const BLACK = "#1c1f27";
const MIN_PX = 5; // (tiles smaller than this aren't drawn: the rim has thousands of them, slow to draw and too small to see)
const PIECE_PX = 4; // (nor pieces on tiles smaller than this: just the tile's color)
const abs = (z) => Math.hypot(z[0], z[1]);

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

// Each region's outline and its stickers cut to their tiles, once per puzzle, at a few levels of
// detail (a small copy needs fewer points): shapes[r][lod] = { loops, stickers }, where loops are
// the outline's (disk points, home frame) and stickers[j] the loops of its part on its j-th tile,
// to fill even-odd. Each level samples every arc on its own, so the points where arcs meet (the
// piece's corners) are always kept: skipping points of the whole outline cut corners off.
// The cutting is in the Klein model, where a tile is a convex polygon with straight edges (its
// sampled geodesic edges stay on those lines), so Sutherland–Hodgman against each edge does it.
const STEPS = [1, 2, 4, 8]; // (as stepFor gives)
const shapeCache = new WeakMap();
const toKlein = ([x, y]) => { const s = 2 / (1 + x * x + y * y); return [s * x, s * y]; };
const toPoincare = ([x, y]) => { const s = 1 / (1 + Math.sqrt(Math.max(0, 1 - x * x - y * y))); return [s * x, s * y]; };
const arcLoop = (loop, step) => loop.flatMap(({ c, r, a0, a1 }) => {
  const k = Math.max(step > 1 ? 2 : 6, Math.ceil((Math.abs(a1 - a0) * r) / (0.004 * step)));
  return Array.from({ length: k }, (_, i) => { const a = a0 + ((a1 - a0) * i) / k; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
});
export function pieceShapes(P) {
  if (shapeCache.has(P)) return shapeCache.get(P);
  const out = P.regions.map((region) => STEPS.map((step) => {
    const loops = region.outline.map((loop) => arcLoop(loop, step)), klein = loops.map((l) => l.map(toKlein));
    const stickers = region.tiles.map((tile) => { const k = tile.map(toKlein); return klein.map((l) => clipConvex(l, k)).filter((l) => l.length >= 3).map((l) => l.map(toPoincare)); });
    return { loops, stickers };
  }));
  shapeCache.set(P, out);
  return out;
}
// a polygon (any shape) cut to a convex one
function clipConvex(subject, clip) {
  let area = 0;
  for (let i = 0, j = clip.length - 1; i < clip.length; j = i++) area += clip[j][0] * clip[i][1] - clip[i][0] * clip[j][1];
  const sign = Math.sign(area);
  let out = subject;
  for (let i = 0, j = clip.length - 1; i < clip.length && out.length; j = i++) {
    const a = clip[j], b = clip[i], dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx * dx + dy * dy < 1e-24) continue; // (a repeated point)
    const side = (p) => sign * (dx * (p[1] - a[1]) - dy * (p[0] - a[0]));
    const next = [];
    for (let k = 0; k < out.length; k++) {
      const p = out[k], q = out[(k + 1) % out.length], sp = side(p), sq = side(q);
      if (sp >= 0) next.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
    out = next;
  }
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
  }
  heightFor(P, w) { return w; }
  layout(P, safe) {
    // (a new puzzle, even one with the same pieces count and view, is a new picture: the cached one
    // is keyed by view and state, so it goes)
    // (the same surface rebuilt, as while a cut is dragged, keeps where the view is)
    if (this.P !== P) { if (!this.P || this.P.H !== P.H) this.start = { m: Mb.I, e: 0 }; this.P = P; this.visible = null; this.cache = null; }
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
    const big = (c, d) => { const s = abs(Mb.apply(d.m, G.corners[0]) .map((x, i) => x - c[i])); return s * this.R > MIN_PX || abs(c) < 0.2; };
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
  // the circle whose line passes nearest a point, within tol px: { axis, layer, center (disk) }
  circleAt(px, py, tol = 10) {
    if (!this.shows(px, py)) return null;
    const { P } = this, z = this.toDisk(px, py), k = ((1 - (z[0] ** 2 + z[1] ** 2)) / 2) * this.R; // (px per hyperbolic unit there: a disk step dz is 2·dz/(1 − |z|²) hyperbolic)
    let best = null, bestD = tol / k;
    for (const kind of ["face", "vertex", "edge"]) {
      if (!P.radii[kind].length) continue;
      for (const { axis, at } of this.axisCopies(kind)) {
        const d = hdist(z, at);
        // (a ring's line grabs the ring just inside it)
        P.radii[kind].forEach((r, layer) => { if (Math.abs(d - r) < bestD) { bestD = Math.abs(d - r); best = { axis, layer, center: at }; } });
      }
    }
    return best;
  }
  // the tile whose middle a point is on (the part a tap turns): its axis, or null
  tileAt(px, py) {
    if (!this.shows(px, py) || !this.P.radii.face.length) return null;
    const z = this.toDisk(px, py), r = 0.3 * this.P.G.Ri;
    const hit = this.axisCopies("face").find(({ at }) => hdist(z, at) < r);
    return hit ? hit.axis : null;
  }
  // the piece under a point, and where that copy is ({ i, m }), or null
  pieceAt(px, py, state) {
    if (!this.shows(px, py)) return null;
    const { P } = this, { G, H } = P, z = this.toDisk(px, py), where = this.whereIs(state);
    // (just the tiles near the point: a piece reaches at most its circles' size past its tile)
    const reach = G.Rv + 2 * Math.max(0, ...["face", "vertex", "edge"].flatMap((k) => P.radii[k])) + G.Rv;
    for (const d of this.listVisible().tiles) {
      if (hdist(Mb.apply(d.m, [0, 0]), z) > reach) continue;
      let m = d.m, e = d.e;
      for (let k = 0; k < G.N; k++) {
        const local = Mb.apply(Mb.inv(m), z);
        for (const i of where.get(e) || []) if (faceHas(P.regions[P.pieces[i].region].face, local)) return i;
        m = Mb.mul(m, G.A); e = H.right[0][e];
      }
    }
    return null;
  }
  // which pieces are at each element now (a piece at g sits at g·home)
  whereIs(state) {
    const { P } = this, out = new Map();
    for (let i = 0; i < P.n; i++) { const e = P.H.mul(state[i], P.pieces[i].home); if (!out.has(e)) out.set(e, []); out.get(e).push(i); }
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
  // state: the puzzle's state. turn: { pieces (Map piece → the point, in its region's frame, it
  // turns about), theta (radians, counterclockwise) } or null. look: { hover ({ axis, layer }),
  // lit (Set of pieces), litAlpha, pointer ({ at (disk), cursor, real }) }
  draw(state, turn, look) {
    const { ctx, canvas, P } = this, dpr = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
    const moving = turn ? turn.pieces : null;
    // (a steady light, like blacking out's hovered kind, goes in the cached layer; a pulsing one,
    // an algorithm's, is drawn each frame)
    const steady = look.lit && look.litSteady ? look.lit : null;
    const key = [this.viewKey(), state.join(), moving ? [...moving.keys()].join(".") : "", this.cx, this.cy, this.origin.x, this.origin.y, canvas.width, canvas.height, P.n, steady ? [...steady].join(".") : ""].join("|");
    if (!this.cache || this.cache.key !== key) {
      const c = this.cache?.canvas || document.createElement("canvas");
      if (c.width !== canvas.width || c.height !== canvas.height) { c.width = canvas.width; c.height = canvas.height; }
      const cx = c.getContext("2d");
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, c.width, c.height);
      cx.setTransform(dpr, 0, 0, dpr, -this.origin.x * dpr, -this.origin.y * dpr); // (page px → this canvas)
      // (Pieces at rest sit on the tiling: every way they turn maps it onto itself. So the tiles'
      // edges inside them can go on in one pass over the tiles, and their outlines, which are all
      // arcs of the circles, as the circles: rather than each piece stroking its own, every line
      // twice. Blacked-out pieces go over the tiles' edges; a turning piece draws its own.)
      const still = (i) => !moving || !moving.has(i);
      this.disk(cx);
      this.paintTiles(cx);
      this.paint(cx, state, (i) => still(i) && !P.pieces[i].black, null, "fill");
      this.tileEdges(cx);
      this.paint(cx, state, (i) => still(i) && P.pieces[i].black, null, "fill");
      this.circleLines(cx);
      if (steady) this.paint(cx, state, (i) => steady.has(i) && (!moving || !moving.has(i)), null, "light", look.litAlpha ?? 0.34);
      this.cache = { key, canvas: c };
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.cache.canvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, -this.origin.x * dpr, -this.origin.y * dpr);
    ctx.save();
    this.clipDisk(ctx);
    if (moving) { this.paint(ctx, state, (i) => moving.has(i), turn); this.paint(ctx, state, (i) => moving.has(i), turn, "lines"); }
    if (look.lit && !steady) this.paint(ctx, state, (i) => look.lit.has(i), turn, "light", look.litAlpha ?? 0.34);
    if (look.hover) this.drawRings(ctx, look.hover);
    if (look.pointer) this.drawPointers(ctx, look.pointer);
    ctx.restore();
  }
  disk(ctx) {
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, 0, 2 * Math.PI); ctx.fillStyle = BODY; ctx.fill();
    this.clipDisk(ctx);
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
    ctx.lineJoin = "round"; ctx.strokeStyle = BODY;
    for (const d of this.listVisible().tiles) {
      const px = this.pxSize(d.m);
      ctx.beginPath();
      // (small ones: their corners will do, the edges' bend is under a pixel)
      if (px < 12) this.trace(ctx, P.G.corners, d.m); else this.trace(ctx, P.G.poly, d.m, this.stepFor(px));
      ctx.fillStyle = hyperColor(P, P.H.coset.face.of[d.e]); ctx.fill();
      ctx.lineWidth = this.lineFor(d.m); ctx.stroke();
    }
  }
  // the tiles' edges again, thin, over the pieces (where a sticker meets the next one)
  tileEdges(ctx) {
    const { P } = this;
    ctx.lineJoin = "round"; ctx.strokeStyle = BODY;
    for (const d of this.listVisible().tiles) {
      const px = this.pxSize(d.m);
      if (px < PIECE_PX) continue;
      ctx.beginPath();
      if (px < 12) this.trace(ctx, P.G.corners, d.m); else this.trace(ctx, P.G.poly, d.m, this.stepFor(px));
      ctx.lineWidth = 0.6 * this.lineFor(d.m); ctx.stroke();
    }
  }
  // every circle at every visible copy of its middle: the pieces' outlines
  circleLines(ctx) {
    const { P } = this;
    ctx.strokeStyle = BODY;
    for (const kind of ["face", "vertex", "edge"]) {
      if (!P.radii[kind].length) continue;
      for (const { at } of this.axisCopies(kind)) {
        const px = diskCircle(at, P.G.Rv).r * this.R; // (a tile's size there, as pxSize)
        if (px < PIECE_PX) continue;
        ctx.lineWidth = Math.max(0.35, Math.min(2, 0.035 * px));
        for (const r of P.radii[kind]) {
          const { c, r: er } = diskCircle(at, r), p = this.toScreen(c);
          ctx.beginPath(); ctx.arc(p.x, p.y, er * this.R, 0, 2 * Math.PI); ctx.stroke();
        }
      }
    }
  }
  // Draw the pieces `which` picks, at every visible copy. turn: the moving ones' turn, or null.
  // mode: "pieces" (filled, with the tiles' edges across them), "fill" (just filled), "lines"
  // (outlines, after every fill, so each edge gets one line), "light" (a white light, alpha strong)
  paint(ctx, state, which, turn, mode = "pieces", alpha = 1) {
    const { P } = this, { H } = P, vis = this.listVisible(), shapes = pieceShapes(P);
    for (let i = 0; i < P.n; i++) {
      if (!which(i)) continue;
      const pc = P.pieces[i], e = H.mul(state[i], pc.home);
      const pivot = turn && turn.pieces.get(i), spin = pivot ? Mb.about(pivot, turn.theta) : null;
      for (const m0 of vis.byElement.get(e) || []) {
        const px = this.pxSize(m0);
        if (px < PIECE_PX) continue; // (too small to see: the solved picture under it shows)
        const m = spin ? Mb.mul(m0, spin) : m0, shape = shapes[pc.region][STEPS.indexOf(this.stepFor(px))];
        ctx.beginPath();
        for (const poly of shape.loops) this.trace(ctx, poly, m);
        if (mode === "lines") { ctx.lineJoin = "round"; ctx.strokeStyle = BODY; ctx.lineWidth = this.lineFor(m0); ctx.stroke(); continue; }
        if (mode === "light") { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = "#fff"; ctx.fill("evenodd"); ctx.restore(); continue; }
        if (pc.black) { ctx.fillStyle = BLACK; ctx.fill("evenodd"); continue; }
        // (each sticker already cut to its tile: no clip, which is most of the drawing's time)
        shape.stickers.forEach((loops, j) => {
          ctx.beginPath();
          for (const poly of loops) this.trace(ctx, poly, m);
          ctx.fillStyle = hyperColor(P, pc.faces[j]); ctx.fill("evenodd");
          if (mode === "pieces") { ctx.strokeStyle = BODY; ctx.lineWidth = 0.6 * this.lineFor(m0); ctx.stroke(); }
        });
      }
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
