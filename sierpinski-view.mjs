// Drawing and hit-testing for the Sierpinski puzzle (sierpinski.mjs) on a 2D canvas, as
// tile-view.mjs does for the tori. The page owns the state and the turns; this owns the camera.
//
// Every triangle is a piece, drawn with its thirds over it: the thirds together shrunk a little about
// its middle (K), so they touch at their corners and a band of it shows round them as well as its
// middle. The puzzle holds itself: each smallest triangle's thirds are copies of a triangle of it
// (the state says which, and turned how), holding copies too, drawn down to a few pixels (fading in
// by size, so nothing pops as they grow). A turn shows wherever its pieces do, every copy too, as
// the tori's copies turn.
//
// The camera: a path of digits from the whole (a third at each step: past a smallest triangle,
// into one of its copies, the triangle it's of). The view shows the triangle at the end of the path,
// its own way up, filling the screen's triangle; so zooming in through a copy of the whole is
// exactly where it started.
// A zoom moves the camera there smoothly, what's round the third fading out.
//
// The turns' circles sit in the middle of the triangle they turn (the inner its ring, the outer the
// whole triangle), and a dot at the very middle zooms in on it: wherever the triangle shows big
// enough, copies too (a copy's are the same pieces' turns). Each frame records what it drew, for
// hit-testing.
import { inkPattern } from "./tile-view.mjs";
import { faceTextures } from "./puzzle.mjs";

const BODY = "#0a0b0e", HOVER = "#f5c518";
export const K = 0.93; // (a triangle's thirds, together, as a share of it)
// the colors (as the issue settled them): the whole white; the thirds the cube's red, green and
// blue (top, left, right); the ninths nine more, none like those; smaller triangles take their
// corner's third's
export const SIER_COLORS = ["#f2f1ec", "#c8102e", "#009b48", "#0046ad", "#ffd500", "#ff6a13", "#5bc2e7", "#ff7eb6", "#9ad93b", "#8a4fd8", "#23b5a6", "#d6a86a", "#c9b6ff"];
const textureSet = faceTextures(SIER_COLORS);
export const sierColor = (P, piece) => SIER_COLORS[P.colorOf[piece]];

const ROOT = [[0, Math.sqrt(3) / 2], [-0.5, 0], [0.5, 0]]; // (the whole: top, bottom left, bottom right)
export const centerOf = (C) => [(C[0][0] + C[1][0] + C[2][0]) / 3, (C[0][1] + C[1][1] + C[2][1]) / 3];
const shrink = (C, k, m = centerOf(C)) => C.map((q) => [m[0] + k * (q[0] - m[0]), m[1] + k * (q[1] - m[1])]);
// a triangle's thirds, laid out inside it (corner j of each toward corner j of it), and its middle
const thirdOf = (C, c) => { const m = centerOf(C); return shrink(C.map((_, j) => [(C[c][0] + C[j][0]) / 2, (C[c][1] + C[j][1]) / 2]), K, m); };
export const middleOf = (C) => { const I = shrink(C, K); return [[1, 2], [2, 0], [0, 1]].map(([u, v]) => [(I[u][0] + I[v][0]) / 2, (I[u][1] + I[v][1]) / 2]); };
// the corners of the triangle at an address
export function cornersOf(a) { let C = ROOT; for (const c of a) C = thirdOf(C, c); return C; }
const inTri = ([x, y], C) => {
  const s = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const d1 = s(C[0], C[1]), d2 = s(C[1], C[2]), d3 = s(C[2], C[0]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
// affine maps [a, b, c, d, e, f]: (x, y) → (a x + c y + e, b x + d y + f)
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
// the map taking triangle p's corners onto q's
function mapTri(p, q) {
  const [p0, p1, p2] = p, [q0, q1, q2] = q, det = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  const a = ((q1[0] - q0[0]) * (p2[1] - p0[1]) - (q2[0] - q0[0]) * (p1[1] - p0[1])) / det, c = ((q2[0] - q0[0]) * (p1[0] - p0[0]) - (q1[0] - q0[0]) * (p2[0] - p0[0])) / det;
  const b = ((q1[1] - q0[1]) * (p2[1] - p0[1]) - (q2[1] - q0[1]) * (p1[1] - p0[1])) / det, d = ((q2[1] - q0[1]) * (p1[0] - p0[0]) - (q1[1] - q0[1]) * (p2[0] - p0[0])) / det;
  return [a, b, c, d, q0[0] - a * p0[0] - c * p0[1], q0[1] - b * p0[0] - d * p0[1]];
}
const rotAbout = ([cx, cy], t) => { const c = Math.cos(t), s = Math.sin(t); return (p) => [cx + c * (p[0] - cx) - s * (p[1] - cy), cy + s * (p[0] - cx) + c * (p[1] - cy)]; };
// (a turned triangle's corners in its own order: corner j where corner j − f was)
const turned = (C, f) => [0, 1, 2].map((j) => C[(j + f) % 3]);

export class SierView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.P = null;
    this.scale = 300; this.ox = 0; this.oy = 0; // CSS px per unit (the whole's side), and where (0, 0) is
    this.origin = { x: 0, y: 0 };
    this.path = []; // the camera (see the top)
    this.zoom = null; // a zoom going: { outer (path), rel (digits in from it), dir, t0, dur }
    this.drawn = { circles: [], dots: [] }; // what the last frame drew (hit-testing)
  }
  heightFor(P, w) { return (w * Math.sqrt(3)) / 2 + 90; }
  layout(P, safe) {
    if (P !== this.P) { this.P = P; this.path = []; this.zoom = null; this.geo = null; this.subtrees = null; }
    // (room round it: the zoom marks by its corners)
    const w = Math.max(40, safe.right - safe.left - 110), h = Math.max(40, safe.bottom - safe.top - 100);
    this.scale = Math.min(w, (h * 2) / Math.sqrt(3));
    this.ox = (safe.left + safe.right) / 2;
    this.oy = (safe.top + safe.bottom) / 2 + (this.scale * Math.sqrt(3)) / 4;
  }
  toScreen([x, y]) { return { x: this.ox + x * this.scale, y: this.oy - y * this.scale }; }
  screenRoot() { return ROOT.map((p) => { const s = this.toScreen(p); return [s.x, s.y]; }); }
  corner(c) { const s = this.screenRoot()[c]; return { x: s[0], y: s[1] }; }
  // each place's corners (plane), and the places in each place's triangle, its own first, by level
  places() { return (this.geo ??= this.P.addr.map((a) => cornersOf(a))); }
  under(i) {
    if (!this.subtrees) { const P = this.P; this.subtrees = P.addr.map((p) => P.addr.map((_, j) => j).filter((j) => P.within(p, P.addr[j])).sort((x, y) => P.addr[x].length - P.addr[y].length)); }
    return this.subtrees[i];
  }

  // ---- the camera ----
  // the place a path ends at, and the way the copies it passes through have turned it (state: where
  // the pieces are, and what each smallest one's corners show)
  walk(path, state) {
    const P = this.P;
    let i = 0, turn = 0;
    for (const d of path) {
      if (P.smallest[i]) { const v = state[P.slot(i, d)]; turn = (turn + (v % 3)) % 3; i = Math.floor(v / 3); } // (into a copy)
      else i = P.index([...P.addr[i], d]);
    }
    return { i, turn };
  }
  // where the triangle a path's digits lead to from the view's top shows (screen corners, its own
  // order), the view's top at screen corners S
  nodeCorners(rel, state, S = this.screenRoot(), from = this.walk(this.path, state).i) {
    const P = this.P;
    let i = from, m = mapTri(this.places()[i], S);
    for (const d of rel) {
      if (P.smallest[i]) { const v = state[P.slot(i, d)], slot = turned(thirdOf(this.places()[i], d), v % 3).map((p) => apply(m, p)); i = Math.floor(v / 3); m = mapTri(this.places()[i], slot); }
      else i = P.index([...P.addr[i], d]);
    }
    return this.places()[i].map((p) => apply(m, p));
  }
  busy() { return !!this.zoom; }
  // zoom in on the view's third c, or out (the view becoming the third c of what's round it: back up
  // the path if it came in that way, or, from the top, out to a smallest triangle whose corner c is
  // the whole the right way up: the far corner's if it is)
  zoomIn(c, state) { if (this.zoom) return; this.go(this.path.slice(), [c], 1); }
  zoomOut(c, state) {
    if (this.zoom) return;
    const p = this.path;
    if (p.length) { if (p.at(-1) !== c) return; this.go(p.slice(0, -1), [c], -1); }
    else { const out = this.outFrom(c, state); if (out) this.go(out, [c], -1); }
  }
  canZoomOut(c, state) { return this.path.length ? this.path.at(-1) === c : !!this.outFrom(c, state); }
  outFrom(c, state) {
    const P = this.P, far = P.index(Array(P.L - 1).fill(c));
    const ok = (i) => P.smallest[i] && state[P.slot(i, c)] === 0;
    if (ok(far)) return P.addr[far].slice();
    const i = P.addr.findIndex((_, i) => ok(i));
    return i >= 0 ? P.addr[i].slice() : null;
  }
  // zoom in down a path of digits from the view (a dot: to the triangle it's in)
  zoomTo(rel) { if (this.zoom || !rel.length) return; this.go(this.path.slice(), rel.slice(), 1); }
  go(outer, rel, dir) {
    const dur = 700 * Math.min(2.4, Math.max(1, Math.log2(1 + rel.length)));
    this.zoom = { outer, rel, dir, t0: performance.now(), dur };
    this.path = dir > 0 ? [...outer, ...rel] : outer.slice();
  }

  // ---- hit testing (CSS px), against what the last frame drew ----
  // the circle whose line passes nearest a point, within tol px: { axis, layer, x, y, r, center (plane), px }, or null
  circleAt(px, py, tol = 10) {
    if (this.zoom) return null;
    let best = null;
    for (const c of this.drawn.circles) { const d = Math.abs(Math.hypot(px - c.x, py - c.y) - c.r); if (d < tol && (!best || d < best.px)) best = { ...c, px: d }; }
    return best;
  }
  // the dot a point is on (its zone: inside the inner circle, or most of a middle with none), or null: { rel (digits in from the view), x, y }
  dotAt(px, py) {
    if (this.zoom) return null;
    let best = null;
    for (const d of this.drawn.dots) { const r = Math.hypot(px - d.x, py - d.y); if (r < d.zone && (!best || r < best.r)) best = { ...d, r }; }
    return best;
  }
  // a turn's circle as drawn (the biggest: the view's own), or undefined; a place's middle on screen
  circle(axis, layer) { return this.drawn.circles.filter((c) => c.axis === axis && c.layer === layer).sort((a, b) => b.r - a.r)[0]; }
  // ---- drawing ----
  // state: place → piece * 3 + facing. turn: { places (a Set: what's turning), center (plane), theta
  // (radians, counterclockwise) } or null. look: { hover ({ axis, layer }), lit (a Set of places),
  // litAlpha, textures, dotHover (a dot's rel, joined), controls (false: none) }.
  draw(state, turn, look = {}, now = performance.now()) {
    const { ctx, canvas } = this, dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, -this.origin.x * dpr, -this.origin.y * dpr);
    this.dpr = dpr;
    this.drawn = { circles: [], dots: [] };
    this.look = look; this.state = state; this.turn = turn;
    const S = this.screenRoot();
    if (this.zoom) {
      // the camera: from the outer view onto the inner triangle (in) or back (out), eased, about the
      // point the map holds still (a similarity: its complex number's power)
      const z = this.zoom, u0 = Math.min(1, (now - z.t0) / z.dur), u = u0 < 0.5 ? 4 * u0 ** 3 : 1 - (-2 * u0 + 2) ** 3 / 2, v = z.dir > 0 ? u : 1 - u;
      const outerTop = this.walk(z.outer, state).i, inner = this.nodeCorners(z.rel, state, S, outerTop);
      const M = mapTri(inner, S), cam = power(M, v);
      ctx.save();
      ctx.transform(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
      this.camScale = Math.hypot(cam[0], cam[1]);
      // (what's round the inner triangle fading out as the camera goes in; the inner one whole)
      ctx.globalAlpha = 1 - v;
      this.node(outerTop, mapTri(this.places()[outerTop], S), [], false);
      ctx.globalAlpha = 1;
      const end = this.walk([...z.outer, ...z.rel], state).i;
      this.node(end, mapTri(this.places()[end], inner), [], false);
      ctx.restore();
      this.camScale = 1;
      if (u0 >= 1) this.zoom = null;
      return;
    }
    this.camScale = 1;
    const top = this.walk(this.path, state).i;
    this.node(top, mapTri(this.places()[top], S), [], look.controls !== false);
    if (look.controls !== false) this.drawControls();
  }
  // Place i's triangle (and everything in it) drawn by plane map m onto the screen; rel: the digits
  // in from the view (for its dots); record: its turns' circles and dots too
  node(i, m, rel, record, depth = 0) {
    const { P, ctx, state, turn, look } = this, G = this.places(), sub = this.under(i);
    const moving = turn && turn.places, spin = moving ? rotAbout(turn.center, turn.theta) : null;
    const px = (C) => C.map((p) => apply(m, p)), size = (Q) => Math.hypot(Q[2][0] - Q[1][0], Q[2][1] - Q[1][1]) * this.camScale;
    const cornersAt = (j) => (moving && moving.has(j) ? G[j].map(spin) : G[j]);
    // (still ones, bigger first; then what's turning: its band and middle, the smallest all of it)
    for (const j of sub) if (!moving || !moving.has(j)) this.fill(this.tri(px(G[j])), state[j], look.lit && look.lit.has(j));
    if (moving) for (const j of sub) if (moving.has(j)) {
      const Q = px(cornersAt(j)), path = this.tri(Q);
      if (!P.smallest[j]) { this.tri(shrink(Q, K), path); this.tri(middleOfScreen(Q), path); }
      this.fill(path, state[j], look.lit && look.lit.has(j));
    }
    // the copies in each smallest one's corners, turned their ways, while they show (fading in from
    // 8 px to 16); a corner turning on its own (the 2 levels' ring) turned as it goes
    for (const j of sub) {
      if (!P.smallest[j]) continue;
      const C = cornersAt(j);
      for (let k = 0; k < 3; k++) {
        const at = P.slot(j, k), v = state[at], own = moving && !moving.has(j) && moving.has(at);
        const third = own ? thirdOf(G[j], k).map(spin) : thirdOf(C, k), slot = px(turned(third, v % 3)), s = size(slot);
        if (s < 8 || depth > 6) continue;
        const ga = ctx.globalAlpha, of = Math.floor(v / 3), cm = mapTri(G[of], slot);
        ctx.globalAlpha = ga * Math.min(1, (s - 8) / 8);
        // (a copy carried by the turn, of a triangle turning whole with it: still in it, as it's
        // already turned. A copy of a triangle part of a turn passes through, as the 2 levels' thirds
        // are of the whole's ring: what's round it too, the turn's whole triangle, cut to it)
        const carried = moving && (moving.has(at) || moving.has(j)) && moving.has(of);
        const from = moving && !carried && turn.p && !P.within(P.addr[of], turn.p) ? P.index(turn.p.filter((d, n) => P.addr[of].slice(0, n + 1).every((x, u) => x === turn.p[u]))) : of;
        if (carried) this.turn = null;
        if (from !== of) { ctx.save(); ctx.clip(this.tri(slot)); this.node(from, cm, [], false, depth + 1); ctx.restore(); }
        else this.node(of, cm, [...rel, ...P.addr[j].slice(P.addr[i].length), k], record && s > 40, depth + 1);
        this.turn = turn;
        if (look.lit && look.lit.has(at)) { ctx.fillStyle = `rgba(255, 255, 255, ${look.litAlpha ?? 0.34})`; ctx.fill(this.tri(slot)); }
        ctx.globalAlpha = ga;
      }
    }
    if (!record) return;
    // its turns' circles and dots, where big enough to use (not on what's turning)
    for (const j of sub) {
      if (moving && moving.has(j)) continue;
      const Q = px(G[j]), M = middleOfScreen(Q), mid = centerOfS(M), r = inRadiusS(M);
      if (r < 9) continue;
      const h = P.axisAt[j], ax = h >= 0 ? P.axes[h] : null;
      const there = { x: mid[0], y: mid[1], center: centerOf(G[j]) };
      if (ax && ax.ring) this.drawn.circles.push({ axis: h, layer: 0, ...there, r: 0.48 * r });
      if (ax) this.drawn.circles.push({ axis: h, layer: 1, ...there, r: (ax.ring ? 0.8 : 0.7) * r });
      const relHere = [...rel, ...P.addr[j].slice(P.addr[i].length)];
      if (relHere.length) this.drawn.dots.push({ rel: relHere, x: mid[0], y: mid[1], r: Math.max(2.5, Math.min(6, r * 0.12)), zone: (ax ? 0.25 : 0.55) * r });
    }
  }
  // the controls recorded: circles black (the one hovered or turning lit yellow over black), dots black
  drawControls() {
    const { ctx, look } = this, hover = look.hover;
    ctx.save();
    for (const c of this.drawn.circles) {
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 2 * Math.PI);
      const w = Math.max(1.5, Math.min(3.5, c.r * 0.09));
      if (hover && hover.axis === c.axis && hover.layer === c.layer) { ctx.lineWidth = w + 2.4; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = HOVER; ctx.stroke(); }
      else { ctx.lineWidth = w; ctx.strokeStyle = BODY; ctx.stroke(); }
    }
    for (const d of this.drawn.dots) {
      const lit = look.dotHover && look.dotHover === d.rel.join("");
      ctx.beginPath(); ctx.arc(d.x, d.y, lit ? d.r + 1.5 : d.r, 0, 2 * Math.PI);
      ctx.fillStyle = lit ? HOVER : BODY;
      ctx.fill();
    }
    ctx.restore();
  }
  tri(Q, path = new Path2D()) { path.moveTo(Q[0][0], Q[0][1]); path.lineTo(Q[1][0], Q[1][1]); path.lineTo(Q[2][0], Q[2][1]); path.closePath(); return path; }
  // a path filled as piece v (piece * 3 + facing) shows (lit: lightened)
  fill(path, v, lit = false) {
    const { ctx, P, look } = this, piece = Math.floor(v / 3), color = SIER_COLORS[P.colorOf[piece]], tex = look.textures ? textureSet[P.colorOf[piece]] : 0;
    ctx.fillStyle = color;
    ctx.fill(path, "evenodd");
    if (tex || lit) {
      ctx.save();
      ctx.clip(path, "evenodd");
      // (a texture fixed to the screen, as every puzzle's)
      if (tex) { const pat = inkPattern(ctx, tex, color, this.dpr); pat.setTransform(ctx.getTransform().inverse()); ctx.fillStyle = pat; ctx.fill(path, "evenodd"); }
      if (lit) { ctx.fillStyle = `rgba(255, 255, 255, ${look.litAlpha ?? 0.34})`; ctx.fill(path, "evenodd"); }
      ctx.restore();
    }
  }

  // the solved puzzle, filling this (small) canvas: the corner card
  drawSolvedCard(P, look = {}, top = 26) {
    const { canvas } = this, w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height, pad = 8;
    this.origin = { x: 0, y: 0 };
    if (P !== this.P) { this.P = P; this.geo = null; this.subtrees = null; this.path = []; }
    const W = w - 2 * pad, H = h - top - pad;
    this.scale = Math.min(W, (H * 2) / Math.sqrt(3));
    this.ox = w / 2; this.oy = top + H / 2 + (this.scale * Math.sqrt(3)) / 4;
    this.draw(P.home, null, { textures: look.textures, controls: false });
  }
}
// (screen-space triangle helpers)
const centerOfS = centerOf;
const middleOfScreen = (Q) => middleOf(Q);
const inRadiusS = (M) => { const m = centerOf(M), [a, b] = [M[1], M[2]]; return Math.abs((b[0] - a[0]) * (m[1] - a[1]) - (b[1] - a[1]) * (m[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]); };
// a similarity map (as a complex z ↦ αz + β) to the power v: α^v about its still point
function power(m, v) {
  const ar = m[0], ai = m[1], s = Math.hypot(ar, ai), th = Math.atan2(ai, ar);
  const sv = s ** v, tv = th * v, br = Math.cos(tv) * sv, bi = Math.sin(tv) * sv;
  // still point z* = β / (1 − α)
  const dr = 1 - ar, di = -ai, den = dr * dr + di * di;
  if (den < 1e-12) return [1, 0, 0, 1, m[4] * v, m[5] * v];
  const zr = (m[4] * dr + m[5] * di) / den, zi = (m[5] * dr - m[4] * di) / den;
  // z ↦ z* + α^v (z − z*): as an affine map
  return [br, bi, -bi, br, zr - (br * zr - bi * zi), zi - (bi * zr + br * zi)];
}
