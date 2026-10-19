// Drawing and hit-testing for the Sierpinski puzzle (sierpinski.mjs) on a 2D canvas, as
// tile-view.mjs does for the tori. The page owns the state and the turns; this owns the camera.
//
// Each triangle shows a piece, drawn with what's in its corners over it: those three shrunk a
// little about its middle together (K), so they touch at their corners and a band of it shows round
// them as well as its middle. Following the corners, the picture goes down to a few pixels (fading
// in by size, so nothing pops as it grows). A piece shows in many places, and a turn of it shows
// in every one: it turned, or its ring going round. A ring changes the pieces in its corners too,
// which show elsewhere: there, what changes fades from before to after as the ring goes round.
//
// The camera: the piece the view shows, its own way up, filling the screen's triangle, and the way
// it came (each piece it zoomed in from and the corner, for zooming back out). Zooming in goes into
// one of its corners; out, to a piece that has it in that corner (the one it came from, if it still
// does). A zoom moves the camera there smoothly, what's round the corner fading out.
//
// The turns' circles sit in the middle of the triangle they turn (the inner its ring, when that's
// a move, the outer the whole triangle), and a dot at the very middle zooms in on it: wherever the
// piece shows big enough. Each frame records what it drew, for hit-testing.
import { inkPattern } from "./tile-view.mjs";
import { faceTextures } from "./puzzle.mjs";
import { applySierMove } from "./sierpinski.mjs";

const BODY = "#0a0b0e", HOVER = "#f5c518", TAU = 2 * Math.PI;
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
// the corners of the triangle at an address, as the puzzle starts (on the plane)
export function cornersOf(a) { let C = ROOT; for (const c of a) C = thirdOf(C, c); return C; }
// affine maps [a, b, c, d, e, f]: (x, y) → (a x + c y + e, b x + d y + f)
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
// the map taking triangle p's corners onto q's
function mapTri(p, q) {
  const [p0, p1, p2] = p, [q0, q1, q2] = q, det = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  const a = ((q1[0] - q0[0]) * (p2[1] - p0[1]) - (q2[0] - q0[0]) * (p1[1] - p0[1])) / det, c = ((q2[0] - q0[0]) * (p1[0] - p0[0]) - (q1[0] - q0[0]) * (p2[0] - p0[0])) / det;
  const b = ((q1[1] - q0[1]) * (p2[1] - p0[1]) - (q2[1] - q0[1]) * (p1[1] - p0[1])) / det, d = ((q2[1] - q0[1]) * (p1[0] - p0[0]) - (q1[1] - q0[1]) * (p2[0] - p0[0])) / det;
  return [a, b, c, d, q0[0] - a * p0[0] - c * p0[1], q0[1] - b * p0[0] - d * p0[1]];
}
// (on the screen, y down: t radians counterclockwise as it looks)
const spinAbout = ([cx, cy], t) => { const c = Math.cos(t), s = Math.sin(t); return (p) => [cx + c * (p[0] - cx) + s * (p[1] - cy), cy - s * (p[0] - cx) + c * (p[1] - cy)]; };
// (a triangle turned f thirds counterclockwise, its corners in its own order: corner j where corner j + f was)
const turned = (C, f) => [0, 1, 2].map((j) => C[(j + f) % 3]);
const side = (C) => Math.hypot(C[2][0] - C[1][0], C[2][1] - C[1][1]);
const mod = (a, n) => ((a % n) + n) % n;

export class SierView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.P = null;
    this.scale = 300; this.ox = 0; this.oy = 0; // CSS px per unit (the whole's side), and where (0, 0) is
    this.origin = { x: 0, y: 0 };
    this.v = 0; this.stack = []; // the camera (see the top): the piece shown, and [{ node, d }] the way in
    this.zoom = null; // a zoom going: { outer (the piece it's from), rel (corners in from it), dir, t0, dur }
    this.drawn = { circles: [], dots: [] }; // what the last frame drew (hit-testing)
  }
  // the corners zoomed in through, one a step (the test hook's camera)
  get path() { return this.stack.map((e) => e.d); }
  heightFor(P, w) { return (w * Math.sqrt(3)) / 2 + 90; }
  layout(P, safe) {
    if (P !== this.P) { this.P = P; this.v = 0; this.stack = []; this.zoom = null; }
    // (room round it: the zoom marks by its corners)
    const w = Math.max(40, safe.right - safe.left - 110), h = Math.max(40, safe.bottom - safe.top - 100);
    this.scale = Math.min(w, (h * 2) / Math.sqrt(3));
    this.ox = (safe.left + safe.right) / 2;
    this.oy = (safe.top + safe.bottom) / 2 + (this.scale * Math.sqrt(3)) / 4;
  }
  toScreen([x, y]) { return { x: this.ox + x * this.scale, y: this.oy - y * this.scale }; }
  screenRoot() { return ROOT.map((p) => { const s = this.toScreen(p); return [s.x, s.y]; }); }
  corner(c) { const s = this.screenRoot()[c]; return { x: s[0], y: s[1] }; }

  // ---- the camera ----
  // the piece corners rel lead to from piece n; and where it shows (screen corners, its own order),
  // piece n at screen corners S
  walkFrom(n, rel, state) { for (const d of rel) n = Math.floor(state[3 * n + d] / 3); return n; }
  nodeCorners(rel, state, S, n) {
    let C = S;
    for (const d of rel) { const v = state[3 * n + d]; C = turned(thirdOf(C, d), v % 3); n = Math.floor(v / 3); }
    return C;
  }
  busy() { return !!this.zoom; }
  zoomIn(c, state) { this.zoomTo([c], state); }
  // zoom in down corners from the view (a dot: to the triangle it's in)
  zoomTo(rel, state) {
    if (this.zoom || !rel.length) return;
    const outer = this.v;
    let n = outer;
    for (const d of rel) { this.stack.push({ node: n, d }); n = Math.floor(state[3 * n + d] / 3); }
    this.v = n;
    this.go(outer, rel.slice(), 1);
  }
  // zoom out, the view becoming corner c of a piece that has it there (see outTo)
  zoomOut(c, state) {
    if (this.zoom) return;
    const j = this.outTo(c, state);
    if (j == null) return;
    const top = this.stack.at(-1);
    if (top && top.node === j && top.d === c) this.stack.pop();
    else this.stack = this.wayTo(j, state);
    this.go(j, [c], -1);
    this.v = j;
  }
  canZoomOut(c, state) { return this.outTo(c, state) != null; }
  // the piece to zoom out to by corner c: the one the view came from if it's still there; else the
  // smallest triangle at that corner's far end, as it started, if it has it; else any that does
  outTo(c, state) {
    const P = this.P, has = (n) => Math.floor(state[3 * n + c] / 3) === this.v, top = this.stack.at(-1);
    if (top && top.d === c && has(top.node)) return top.node;
    const far = P.index(Array(P.L - 1).fill(c));
    if (has(far)) return far;
    for (let n = 0; n < P.N; n++) if (has(n)) return n;
    return null;
  }
  // the shortest way in from the whole to piece j: [{ node, d }]
  wayTo(j, state) {
    const from = new Map([[0, null]]), queue = [0];
    while (queue.length) {
      const n = queue.shift();
      if (n === j) break;
      for (let d = 0; d < 3; d++) { const m = Math.floor(state[3 * n + d] / 3); if (!from.has(m)) { from.set(m, { node: n, d }); queue.push(m); } }
    }
    const way = [];
    for (let n = j; from.get(n); n = from.get(n).node) way.unshift(from.get(n));
    return way;
  }
  go(outer, rel, dir) {
    const dur = 700 * Math.min(2.4, Math.max(1, Math.log2(1 + rel.length)));
    this.zoom = { outer, rel, dir, t0: performance.now(), dur };
  }

  // ---- hit testing (CSS px), against what the last frame drew ----
  // the circle whose line passes nearest a point, within tol px: { axis, layer, x, y, r, px }, or null
  circleAt(px, py, tol = 10) {
    if (this.zoom) return null;
    let best = null;
    for (const c of this.drawn.circles) { const d = Math.abs(Math.hypot(px - c.x, py - c.y) - c.r); if (d < tol && (!best || d < best.px)) best = { ...c, px: d }; }
    return best;
  }
  // the dot a point is on (its zone: inside the inner circle), or null: { rel (corners in from the view), x, y }
  dotAt(px, py) {
    if (this.zoom) return null;
    let best = null;
    for (const d of this.drawn.dots) { const r = Math.hypot(px - d.x, py - d.y); if (r < d.zone && (!best || r < best.r)) best = { ...d, r }; }
    return best;
  }
  // a turn's circle as drawn (the biggest: the view's own), or undefined
  circle(axis, layer) { return this.drawn.circles.filter((c) => c.axis === axis && c.layer === layer).sort((a, b) => b.r - a.r)[0]; }

  // ---- drawing ----
  // state: piece * 3 + corner → what's there * 3 + its turn. turn: { axis, layer, theta (radians,
  // counterclockwise) } or null. look: { hover ({ axis, layer }), lit (a Set of corners: state
  // indices), litAlpha, textures, dotHover (a dot's rel, joined), controls (false: none) }.
  draw(state, turn, look = {}, now = performance.now()) {
    const { ctx, canvas, P } = this, dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, -this.origin.x * dpr, -this.origin.y * dpr);
    this.dpr = dpr;
    this.drawn = { circles: [], dots: [] };
    this.look = look; this.state = state; this.ringLater = null;
    // the turn going: a piece turned, or its ring (with the states either side of where it's got to,
    // for what fades elsewhere)
    this.anim = null;
    if (turn) {
      const n = P.nodeOf[turn.axis];
      if (turn.layer) this.anim = { n, layer: 1, theta: turn.theta };
      else if (P.canRing(state, n)) {
        const k = turn.theta / (TAU / 3), f = Math.floor(k), s0 = state.slice();
        applySierMove(P, s0, { axis: turn.axis, layer: 0, q: f });
        const s1 = applySierMove(P, s0.slice(), { axis: turn.axis, layer: 0, q: 1 });
        this.anim = { n, layer: 0, theta: turn.theta, s0, s1, a: k - f };
      }
    }
    const S = this.screenRoot();
    this.camScale = 1;
    if (this.zoom) {
      // the camera: from the outer view onto the inner triangle (in) or back (out), eased, about the
      // point the map holds still (a similarity: its complex number's power)
      const z = this.zoom, u0 = Math.min(1, (now - z.t0) / z.dur), u = u0 < 0.5 ? 4 * u0 ** 3 : 1 - (-2 * u0 + 2) ** 3 / 2, v = z.dir > 0 ? u : 1 - u;
      const inner = this.nodeCorners(z.rel, state, S, z.outer), M = mapTri(inner, S), cam = power(M, v);
      ctx.save();
      ctx.transform(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
      this.camScale = Math.hypot(cam[0], cam[1]);
      // (what's round the inner triangle fading out as the camera goes in; the inner one whole)
      ctx.globalAlpha = 1 - v;
      this.node(z.outer, S, [], false);
      ctx.globalAlpha = 1;
      this.node(this.walkFrom(z.outer, z.rel, state), inner, [], false);
      ctx.restore();
      this.camScale = 1;
      if (u0 >= 1) this.zoom = null;
      return;
    }
    this.node(this.v, S, [], look.controls !== false);
    if (look.controls !== false) this.drawControls();
  }
  // piece n drawn at screen corners C (its own order), and what's in its corners; rel: the corners in
  // from the view (for its dots); record: its turns' circles and dot too; ring: the corners of it
  // going round its parent's ring, { slots (a Set), center, theta }, or null
  node(n, C, rel, record, depth = 0, ring = null) {
    const { P, ctx, state, look, anim } = this;
    const spinning = anim && anim.layer === 1 && anim.n === n;
    if (spinning) C = C.map(spinAbout(centerOf(C), anim.theta));
    const outline = this.tri(C);
    this.fill(outline, n);
    // (a thin black line round it, thinner as it's smaller)
    const px = side(C) * this.camScale;
    ctx.lineWidth = Math.max(0.5, Math.min(2, px * 0.006)) / this.camScale;
    ctx.lineJoin = "round";
    ctx.strokeStyle = BODY;
    ctx.stroke(outline);
    const ringing = anim && anim.layer === 0 && anim.n === n;
    // (what's moving drawn after what's still round it, so it passes over: a piece turning after its
    // neighbors; a ring's corners going round after everything in the ring's piece)
    const later = [], outerRing = this.ringLater;
    if (ringing) this.ringLater = [];
    for (let k = 0; k < 3; k++) {
      const i = 3 * n + k, going = ring && ring.slots.has(k);
      let T = thirdOf(C, k);
      if (going) T = T.map(spinAbout(ring.center, ring.theta));
      const s = side(T) * this.camScale;
      if (s < 8 || depth > 10) continue;
      const ga = ctx.globalAlpha, show = ga * Math.min(1, (s - 8) / 8);
      // (this one's ring going: of what's in corner k, its two corners touching the middle go round)
      const theirs = ringing ? { slots: new Set([0, 1, 2].filter((x) => x !== k).map((x) => mod(x - (state[i] % 3), 3))), center: centerOf(C), theta: anim.theta } : null;
      const at = (v, alpha, rec) => { ctx.globalAlpha = alpha; this.node(Math.floor(v / 3), turned(T, v % 3), [...rel, k], rec, depth + 1, theirs); };
      const fades = anim && anim.layer === 0 && !going && anim.s0[i] !== anim.s1[i], v = going || !anim || anim.layer === 1 ? state[i] : anim.s0[i];
      const draw = () => {
        if (fades) { at(anim.s0[i], show, false); at(anim.s1[i], show * anim.a, false); }
        else at(v, show, record && s > 40 && !spinning && !going);
        if (look.lit && look.lit.has(i)) { ctx.globalAlpha = show; ctx.fillStyle = `rgba(255, 255, 255, ${look.litAlpha ?? 0.34})`; ctx.fill(this.tri(T)); }
        ctx.globalAlpha = ga;
      };
      if (going && this.ringLater) this.ringLater.push(draw);
      else if (anim && anim.layer === 1 && !fades && Math.floor(v / 3) === anim.n) later.push(draw);
      else draw();
    }
    for (const draw of later) draw();
    if (ringing) { const mine = this.ringLater; for (const draw of mine) draw(); this.ringLater = outerRing; }
    // its turns' circles and dot, where big enough to use (not while it's turning)
    if (!record || spinning) return;
    const M = middleOf(C), mid = centerOf(M), r = inRadius(M);
    if (r < 9) return;
    const h = P.axisAt[n], there = { x: mid[0], y: mid[1] }, rings = P.canRing(state, n);
    if (rings) this.drawn.circles.push({ axis: h, layer: 0, ...there, r: 0.48 * r });
    this.drawn.circles.push({ axis: h, layer: 1, ...there, r: (rings ? 0.8 : 0.7) * r });
    if (rel.length) this.drawn.dots.push({ rel, x: mid[0], y: mid[1], r: Math.max(2.5, Math.min(6, r * 0.12)), zone: 0.25 * r });
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
  // a path filled as piece n shows
  fill(path, n) {
    const { ctx, P, look } = this, color = SIER_COLORS[P.colorOf[n]], tex = look.textures ? textureSet[P.colorOf[n]] : 0;
    ctx.fillStyle = color;
    ctx.fill(path);
    if (tex) {
      ctx.save();
      ctx.clip(path);
      // (a texture fixed to the screen, as every puzzle's)
      const pat = inkPattern(ctx, tex, color, this.dpr); pat.setTransform(ctx.getTransform().inverse()); ctx.fillStyle = pat; ctx.fill(path);
      ctx.restore();
    }
  }

  // the solved puzzle, filling this (small) canvas: the corner card
  drawSolvedCard(P, look = {}, top = 26) {
    const { canvas } = this, w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height, pad = 8;
    this.origin = { x: 0, y: 0 };
    if (P !== this.P) { this.P = P; this.v = 0; this.stack = []; this.zoom = null; }
    const W = w - 2 * pad, H = h - top - pad;
    this.scale = Math.min(W, (H * 2) / Math.sqrt(3));
    this.ox = w / 2; this.oy = top + H / 2 + (this.scale * Math.sqrt(3)) / 4;
    this.draw(P.home, null, { textures: look.textures, controls: false });
  }
}
const inRadius = (M) => { const m = centerOf(M), [a, b] = [M[1], M[2]]; return Math.abs((b[0] - a[0]) * (m[1] - a[1]) - (b[1] - a[1]) * (m[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]); };
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
