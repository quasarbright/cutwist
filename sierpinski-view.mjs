// Drawing and hit-testing for the Sierpinski puzzle (sierpinski.mjs) on a 2D canvas, as
// tile-view.mjs does for the tori. The page owns the state, the animation queue and input.
//
// Every triangle is a piece, drawn with its thirds over it: the thirds together shrunk a little about
// its middle (K), so they touch at their corners and a band of it shows round them as well as its
// middle. A turn turns what shows of each piece it carries (its band and middle; the smallest, all of
// it) about the turn's middle. A zoom is the camera into the third (its triangle onto the whole's),
// the smallest triangles that come back in growing into their places as it goes.
//
// The turns are circles, as the tori's are, in the middle of the triangle they turn (as drawn in the
// issue): the inner one its ring, the outer one the whole triangle; a press on a circle's line drags
// it. A dot at the very middle zooms in on that triangle.
import { inkPattern } from "./tile-view.mjs";
import { faceTextures } from "./puzzle.mjs";

const BODY = "#0a0b0e", HOVER = "#f5c518";
export const K = 0.93; // (a triangle's thirds, together, as a share of it)
// the colors (as the issue settled them): the whole white; the thirds the cube's red, blue and
// green; the ninths nine more, none like those; smaller triangles take their corner's third's
export const SIER_COLORS = ["#f2f1ec", "#c8102e", "#0046ad", "#009b48", "#ffd500", "#ff6a13", "#5bc2e7", "#ff7eb6", "#9ad93b", "#8a4fd8", "#23b5a6", "#d6a86a", "#c9b6ff"];
const textureSet = faceTextures(SIER_COLORS);
export const sierColor = (P, piece) => SIER_COLORS[P.colorOf[piece]];

const ROOT = [[0, Math.sqrt(3) / 2], [-0.5, 0], [0.5, 0]]; // (the whole: top, bottom left, bottom right)
export const centerOf = (C) => [(C[0][0] + C[1][0] + C[2][0]) / 3, (C[0][1] + C[1][1] + C[2][1]) / 3];
const shrink = (C, k, m = centerOf(C)) => C.map((q) => [m[0] + k * (q[0] - m[0]), m[1] + k * (q[1] - m[1])]);
// a triangle's thirds, laid out inside it (corner j of each toward corner j of it), and its middle
const thirdOf = (C, c) => { const m = centerOf(C); return shrink(C.map((_, j) => [(C[c][0] + C[j][0]) / 2, (C[c][1] + C[j][1]) / 2]), K, m); };
export const middleOf = (C) => { const I = shrink(C, K); return [[1, 2], [2, 0], [0, 1]].map(([u, v]) => [(I[u][0] + I[v][0]) / 2, (I[u][1] + I[v][1]) / 2]); };
// the corners of the triangle at an address (any length: a zoom draws a level past the smallest)
export function cornersOf(a) { let C = ROOT; for (const c of a) C = thirdOf(C, c); return C; }
const inTri = ([x, y], C) => {
  const s = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const d1 = s(C[0], C[1]), d2 = s(C[1], C[2]), d3 = s(C[2], C[0]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

export class SierView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.P = null;
    this.scale = 300; this.ox = 0; this.oy = 0; // CSS px per unit (the whole's side), and where (0, 0) is
    this.origin = { x: 0, y: 0 };
  }
  // the triangle fits a width w with this height (and room round it for the zoom buttons)
  heightFor(P, w) { return (w * Math.sqrt(3)) / 2 + 90; }
  layout(P, safe) {
    if (P !== this.P) this.geo = null;
    this.P = P;
    // (room round it: the zoom buttons at its corners)
    const w = Math.max(40, safe.right - safe.left - 110), h = Math.max(40, safe.bottom - safe.top - 100);
    this.scale = Math.min(w, (h * 2) / Math.sqrt(3));
    this.ox = (safe.left + safe.right) / 2;
    this.oy = (safe.top + safe.bottom) / 2 + (this.scale * Math.sqrt(3)) / 4;
  }
  // every place's corners (plane), once a puzzle
  places() { return (this.geo ??= this.P.addr.map((a) => cornersOf(a))); }
  toScreen([x, y]) { return { x: this.ox + x * this.scale, y: this.oy - y * this.scale }; }
  toPlane(px, py) { return [(px - this.ox) / this.scale, (this.oy - py) / this.scale]; }

  // ---- hit testing (CSS px) ----
  // the triangle whose middle a point is in (its index in P.middles), or null
  holeAt(px, py) {
    const p = this.toPlane(px, py), G = this.places();
    for (let h = 0; h < this.P.middles.length; h++) if (inTri(p, middleOf(G[this.P.index(this.P.middles[h])]))) return h;
    return null;
  }
  // the smallest place a point is in (in its band or its middle, or all of it), or null
  placeAt(px, py) {
    const p = this.toPlane(px, py), G = this.places();
    let best = null;
    this.P.addr.forEach((a, i) => { if (inTri(p, G[i]) && (best === null || a.length > this.P.addr[best].length)) best = i; });
    return best;
  }
  // a middle's inner circle's radius on screen (the inverted triangle's: it touches its sides)
  inRadius(C) { const M = middleOf(C), m = this.toScreen(centerOf(M)), a = this.toScreen(M[1]), b = this.toScreen(M[2]); return Math.abs((b.x - a.x) * (m.y - a.y) - (b.y - a.y) * (m.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y); }
  // every turn's circle, on screen: { axis, layer, x, y, r }: in its triangle's middle, the ring's
  // inside the whole triangle's
  circles() {
    const { P } = this, G = this.places(), out = [];
    P.axes.forEach((ax, h) => {
      if (ax.kind !== "hole") return;
      const C = G[P.index(ax.p)], m = this.toScreen(centerOf(C)), r = this.inRadius(C);
      if (ax.ring) out.push({ axis: h, layer: 0, x: m.x, y: m.y, r: (ax.layers > 1 ? 0.48 : 0.7) * r });
      if (ax.layers > 1) out.push({ axis: h, layer: 1, x: m.x, y: m.y, r: 0.8 * r });
    });
    return out;
  }
  // the circle whose line passes nearest a point, within tol px: { axis, layer, px (how near) }, or null
  circleAt(px, py, tol = 10) {
    let best = null;
    for (const c of this.circles()) {
      const d = Math.abs(Math.hypot(px - c.x, py - c.y) - c.r);
      if (d < tol && (!best || d < best.px)) best = { axis: c.axis, layer: c.layer, px: d };
    }
    return best;
  }
  // the middle whose dot a point is near (a tap there zooms, winning over a circle's line, as the
  // tori's tap zones win round a middle): within 45% of its ring's circle's radius of its middle, or null
  dotAt(px, py) {
    const h = this.holeAt(px, py);
    if (h === null || h === 0) return null;
    // (the dot's own zone: inside the inner circle, if any, or most of the middle)
    const C = this.places()[this.P.index(this.P.middles[h])], m = this.toScreen(centerOf(C)), r = this.inRadius(C), inner = this.circles().find((q) => q.x === m.x && q.y === m.y);
    return Math.hypot(px - m.x, py - m.y) < (inner ? 0.25 * r : 0.6 * r) ? h : null;
  }
  // a middle on screen (h: its index in P.middles)
  holeCenter(h) { return this.toScreen(centerOf(this.places()[this.P.index(this.P.middles[h])])); }
  // the whole's corners on screen (the zoom buttons go by them)
  corner(c) { return this.toScreen(ROOT[c]); }

  // ---- drawing ----
  // state: place → the triangle there. turn: { places (a Set: what's turning), center (plane),
  // theta (radians, counterclockwise) }, or { zoom: { before, after, c, dir (+1 in, −1 out), u (0 to
  // 1) } }, or null. look: { hover ({ axis, layer }), lit (a Set of places), litAlpha, textures,
  // dots (the zoom dots in the middles; dotHover the one lit) }.
  draw(state, turn, look = {}) {
    const { ctx, canvas } = this, dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, -this.origin.x * dpr, -this.origin.y * dpr);
    this.dpr = dpr;
    if (turn && turn.zoom) { this.drawZoom(turn.zoom, look); return; }
    this.paint(state, turn && turn.places ? turn : null, look);
    if (look.dots !== false) this.drawDots(look.dotHover ?? null);
    if (look.circles !== false) this.drawCircles(look.hover);
  }
  // the puzzle: places still, bigger first (each covered by its thirds but for its band and middle),
  // then what's turning: what shows of each, turned
  paint(state, turn, look) {
    const { P, ctx } = this, G = this.places(), moving = turn ? turn.places : null;
    const order = P.addr.map((_, i) => i).sort((i, j) => P.addr[i].length - P.addr[j].length);
    for (const i of order) if (!moving || !moving.has(i)) this.fill(this.tri(G[i]), state[i], look, look.lit && look.lit.has(i));
    if (!moving) return;
    ctx.save();
    const c = this.toScreen(turn.center);
    ctx.translate(c.x, c.y); ctx.rotate(-turn.theta); ctx.translate(-c.x, -c.y);
    for (const i of order) if (moving.has(i)) this.fill(this.shown(G[i], P.addr[i].length === P.L - 1), state[i], look, look.lit && look.lit.has(i));
    ctx.restore();
  }
  // a triangle as a path (screen)
  tri(C, path = new Path2D()) { const q = C.map((p) => this.toScreen(p)); path.moveTo(q[0].x, q[0].y); path.lineTo(q[1].x, q[1].y); path.lineTo(q[2].x, q[2].y); path.closePath(); return path; }
  // what shows of a triangle: its band and its middle (even-odd), or, the smallest, all of it
  shown(C, smallest) { const path = this.tri(C); if (!smallest) { this.tri(shrink(C, K), path); this.tri(middleOf(C), path); } return path; }
  // a path filled as piece `piece` shows (lit: lightened)
  fill(path, piece, look, lit = false) {
    const { ctx, P } = this, color = SIER_COLORS[P.colorOf[piece]], tex = look.textures ? textureSet[P.colorOf[piece]] : 0;
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
  // the turns' circles: black, as drawn in the issue, the one hovered or turning lit as the tori
  // light theirs (yellow over black)
  drawCircles(hover) {
    const { ctx } = this;
    ctx.save();
    for (const c of this.circles()) {
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 2 * Math.PI);
      const w = Math.max(1.5, Math.min(3.5, c.r * 0.09));
      if (hover && hover.axis === c.axis && hover.layer === c.layer) { ctx.lineWidth = w + 2.4; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = HOVER; ctx.stroke(); }
      else { ctx.lineWidth = w; ctx.strokeStyle = BODY; ctx.stroke(); }
    }
    ctx.restore();
  }
  // the zoom dots, in every middle but the whole's (a tap there zooms in till it's the whole's)
  drawDots(hover) {
    const { ctx, P } = this;
    for (let h = 1; h < P.middles.length; h++) {
      const c = this.holeCenter(h), r = Math.max(2.5, Math.min(6, this.inRadius(this.places()[P.index(P.middles[h])]) * 0.12));
      ctx.beginPath(); ctx.arc(c.x, c.y, h === hover ? r + 1.5 : r, 0, 2 * Math.PI);
      ctx.fillStyle = h === hover ? HOVER : BODY;
      ctx.fill();
    }
  }
  // A zoom into third c, part way (u): the camera from the whole onto the third (a scaling about the
  // point it holds still), the puzzle as it was under it, and the smallest triangles that come back in
  // growing into their places, a level past the smallest. Zooming out: the same, backwards.
  drawZoom({ before, after, c, dir, u }, look) {
    const { ctx, P } = this, L = P.L;
    const [from, to, v] = dir > 0 ? [before, after, u] : [after, before, 1 - u];
    // (the camera: the third's triangle onto the whole's, ×s about the point (fx, fy) it holds still)
    const T = cornersOf([c]), s = (ROOT[2][0] - ROOT[1][0]) / (T[2][0] - T[1][0]);
    const fx = (ROOT[1][0] - s * T[1][0]) / (1 - s), fy = (ROOT[1][1] - s * T[1][1]) / (1 - s);
    const k = s ** v, sc = this.toScreen([fx, fy]);
    ctx.save();
    ctx.translate(sc.x, sc.y); ctx.scale(k, k); ctx.translate(-sc.x, -sc.y);
    this.paint(from, null, look);
    const g = Math.min(1, v * 1.15);
    if (g > 0) P.addr.forEach((a, i) => { if (a.length === L - 1) this.fill(this.tri(shrink(cornersOf([c, ...a]), g)), to[i], look); });
    ctx.restore();
  }

  // the solved puzzle, filling this (small) canvas: the corner card
  drawSolvedCard(P, look = {}, top = 26) {
    const { canvas } = this, w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height, pad = 8;
    this.origin = { x: 0, y: 0 };
    if (P !== this.P) this.geo = null;
    this.P = P;
    const W = w - 2 * pad, H = h - top - pad;
    this.scale = Math.min(W, (H * 2) / Math.sqrt(3));
    this.ox = w / 2; this.oy = top + H / 2 + (this.scale * Math.sqrt(3)) / 4;
    this.draw(Int32Array.from({ length: P.N }, (_, i) => i), null, { textures: look.textures, dots: false, circles: false });
  }
}
