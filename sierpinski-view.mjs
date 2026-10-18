// Drawing and hit-testing for the Sierpinski puzzle (sierpinski.mjs) on a 2D canvas, as
// tile-view.mjs does for the tori. The page owns the state, the animation queue and input.
//
// Each small triangle is drawn as the triangle it is plus the holes below it, as far down as they
// show (the deepest fading in by size), so a zoom only ever grows what's already there. A zoom's
// picture: the camera into one third (×2 about its outer corner) while each small triangle there,
// now the size of three, fades from its own color to the three it splits into; zooming out, the
// reverse, the rest of the puzzle coming in from round the edges.
import { pickTileColors, inkPattern } from "./tile-view.mjs";
import { faceTextures } from "./puzzle.mjs";

const BODY = "#0a0b0e", HOVER = "#f5c518";
const ROOT = [[0, Math.sqrt(3) / 2], [-0.5, 0], [0.5, 0]]; // (the whole triangle: top, bottom left, bottom right)
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
// the corners of the triangle at an address (corner j of a third toward corner j of its triangle)
export function cornersOf(d, P0 = ROOT) {
  let C = P0;
  for (const c of d) C = C.map((_, j) => mid(C[c], C[j]));
  return C;
}
export const centerOf = (C) => [(C[0][0] + C[1][0] + C[2][0]) / 3, (C[0][1] + C[1][1] + C[2][1]) / 3];
// a hole's corners: the midpoints of its triangle's sides
const holeOf = (C) => [mid(C[1], C[2]), mid(C[2], C[0]), mid(C[0], C[1])];
const inTri = ([x, y], C) => {
  const s = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const d1 = s(C[0], C[1]), d2 = s(C[1], C[2]), d3 = s(C[2], C[0]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

// each small triangle's color: 9, from the tori's palette (pickTileColors), the triangles two
// levels down that touch not alike
const colorSets = new WeakMap();
export function sierColors(P) {
  if (!colorSets.has(P)) {
    const groups = Array.from({ length: 9 }, (_, g) => cornersOf([Math.floor(g / 3), g % 3]));
    const touch = (A, B) => A.some((a) => B.some((b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9));
    const near = groups.map((A, i) => groups.map((_, j) => j).filter((j) => j !== i && touch(A, groups[j])));
    const colors = pickTileColors(9, near);
    colorSets.set(P, { colors, textures: faceTextures(colors) });
  }
  return colorSets.get(P);
}
export const sierColor = (P, piece) => sierColors(P).colors[P.colorOf[piece]];

// The unit triangle (0,0)-(1,0)-(½,√3/2) cut k levels down: its small triangles (solid), and
// the holes of the last level (to fade in)
const gaskets = new Map();
function gasket(k) {
  if (!gaskets.has(k)) {
    const solid = new Path2D(), holes = new Path2D();
    const go = (C, depth) => {
      if (depth === k) { solid.moveTo(...C[0]); solid.lineTo(...C[1]); solid.lineTo(...C[2]); solid.closePath(); return; }
      if (depth === k - 1) { const H = holeOf(C); holes.moveTo(...H[0]); holes.lineTo(...H[1]); holes.lineTo(...H[2]); holes.closePath(); }
      for (let c = 0; c < 3; c++) go(C.map((_, j) => mid(C[c], C[j])), depth + 1);
    };
    go([[0.5, Math.sqrt(3) / 2], [0, 0], [1, 0]], 0);
    gaskets.set(k, { solid, holes });
  }
  return gaskets.get(k);
}

export class SierView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.P = null;
    this.scale = 300; this.ox = 0; this.oy = 0; // CSS px per unit (the triangle's side), and where (0, 0) is
    this.origin = { x: 0, y: 0 };
  }
  // the triangle fits a width w with this height (and a little room round it)
  heightFor(P, w) { return (w * Math.sqrt(3)) / 2 + 24; }
  layout(P, safe) {
    this.P = P;
    const w = Math.max(40, safe.right - safe.left - 24), h = Math.max(40, safe.bottom - safe.top - 24);
    this.scale = Math.min(w, (h * 2) / Math.sqrt(3));
    this.ox = (safe.left + safe.right) / 2;
    this.oy = (safe.top + safe.bottom) / 2 + (this.scale * Math.sqrt(3)) / 4;
    this.box = { ...safe };
  }
  toScreen([x, y]) { return { x: this.ox + x * this.scale, y: this.oy - y * this.scale }; }
  toPlane(px, py) { return [(px - this.ox) / this.scale, (this.oy - py) / this.scale]; }

  // ---- hit testing (CSS px) ----
  // the small triangle's place under a point, or null
  placeAt(px, py) {
    const p = this.toPlane(px, py), P = this.P;
    for (let i = 0; i < P.N; i++) if (inTri(p, cornersOf(P.addr[i]))) return i;
    return null;
  }
  // the hole under a point (its blank triangle), or null: its index in P.holes
  holeAt(px, py) {
    const p = this.toPlane(px, py), P = this.P;
    for (let h = 0; h < P.holes.length; h++) if (inTri(p, holeOf(cornersOf(P.holes[h])))) return h;
    return null;
  }
  // a hole's middle on screen
  holeCenter(h) { return this.toScreen(centerOf(cornersOf(this.P.holes[h]))); }
  // the zoom dots: every hole but the whole triangle's, a dot in its middle (CSS px): the one within
  // reach of a point, or null
  dotAt(px, py) {
    let best = null;
    for (let h = 1; h < this.P.holes.length; h++) {
      const c = this.holeCenter(h), d = Math.hypot(px - c.x, py - c.y), r = this.dotRadius(h) + 6;
      if (d < r && (!best || d < best.d)) best = { h, d };
    }
    return best ? best.h : null;
  }
  dotRadius(h) { return Math.max(2.5, Math.min(6, (this.scale / 2 ** this.P.holes[h].length) * 0.05)); }

  // ---- drawing ----
  // state: where every small triangle is (place → triangle). turn: { places (a Set), center (plane),
  // theta (radians, counterclockwise) } turning now, or { zoom: { u (0 to 1), dir (+1 in, −1 out),
  // c (the third the camera goes into or comes out of), after (the state when it's done) } }, or
  // null. look: { hover ({ axis, layer }, or null), lit (a Set of places), litAlpha, textures,
  // dots (the zoom dots; the one hovered: dotHover) }.
  draw(state, turn, look = {}) {
    const { ctx, canvas, P } = this, dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, -this.origin.x * dpr, -this.origin.y * dpr);
    this.dpr = dpr;
    if (turn && turn.zoom) { this.drawZoom(state, turn.zoom, look); return; }
    const moving = turn ? turn.places : null;
    for (let i = 0; i < P.N; i++) {
      if (moving && moving.has(i)) continue;
      this.triangle(cornersOf(P.addr[i]), state[i], look, look.lit && look.lit.has(i));
    }
    if (moving) {
      ctx.save();
      const c = this.toScreen(turn.center);
      ctx.translate(c.x, c.y); ctx.rotate(-turn.theta); ctx.translate(-c.x, -c.y);
      for (const i of moving) this.triangle(cornersOf(P.addr[i]), state[i], look, look.lit && look.lit.has(i));
      ctx.restore();
    }
    if (look.hover) this.drawHover(look.hover, turn);
    if (look.dots !== false) this.drawDots(look.dotHover ?? null);
  }
  // one small triangle (plane corners C) showing triangle `piece`: solid, its holes below as far as
  // they show, in its color (alpha: for a zoom's fade)
  triangle(C, piece, look, lit = false, alpha = 1) {
    const { ctx, P } = this, a = this.toScreen(C[1]), b = this.toScreen(C[2]), t = this.toScreen(C[0]);
    const side = Math.hypot(b.x - a.x, b.y - a.y);
    // (levels below: down to holes of about 6 px, the last fading in from 6 px to 12, so the small
    // triangles still read as triangles; a zoom grows the ones there)
    let k = 0;
    while (side / 2 ** (k + 1) > 6 && k < 6) k++;
    const holePx = side / 2 ** k, fade = Math.max(0, Math.min(1, (holePx - 6) / 6));
    const g = gasket(k), color = sierColor(P, piece), { textures } = sierColors(P), tex = look.textures ? textures[P.colorOf[piece]] : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    // (the unit triangle onto this one: (0,0) → a, (1,0) → b, (½, √3/2) → t)
    ctx.transform(b.x - a.x, b.y - a.y, (t.x - a.x - (b.x - a.x) / 2) / (Math.sqrt(3) / 2), (t.y - a.y - (b.y - a.y) / 2) / (Math.sqrt(3) / 2), a.x, a.y);
    ctx.fillStyle = color;
    ctx.fill(g.solid);
    if (k > 0 && fade < 1) { ctx.globalAlpha = alpha * (1 - fade); ctx.fill(g.holes); ctx.globalAlpha = alpha; }
    if (tex || lit) {
      const path = new Path2D(); path.addPath(g.solid);
      ctx.clip(path);
      // (in canvas pixels, the texture fixed to the screen: the triangle's box, by the transform
      // above the triangle's own, which holds a zoom's camera and a turn's rotation too)
      const m = ctx.getTransform(), pts = [[0, 0], [1, 0], [0.5, Math.sqrt(3) / 2]].map(([x, y]) => m.transformPoint({ x, y }));
      const x0 = Math.min(...pts.map((q) => q.x)) - 2, y0 = Math.min(...pts.map((q) => q.y)) - 2, x1 = Math.max(...pts.map((q) => q.x)) + 2, y1 = Math.max(...pts.map((q) => q.y)) + 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (tex) { ctx.fillStyle = inkPattern(ctx, tex, color, this.dpr); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
      if (lit) { ctx.fillStyle = `rgba(255, 255, 255, ${look.litAlpha ?? 0.34})`; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
      ctx.setTransform(m);
    }
    ctx.restore();
  }
  // what a move takes, lit as the tori light a circle: yellow over black. A ring: round each small
  // triangle in it; a triangle: round it
  drawHover({ axis, layer }, turn) {
    const { ctx, P } = this, ax = P.axes[axis];
    if (!ax || ax.kind !== "hole") return;
    const outlines = layer ? [cornersOf(ax.p)] : P.moving(axis, 0).map((i) => cornersOf(P.addr[i]));
    ctx.save();
    if (turn && turn.places) { const c = this.toScreen(turn.center); ctx.translate(c.x, c.y); ctx.rotate(-turn.theta); ctx.translate(-c.x, -c.y); }
    const path = new Path2D();
    for (const C of outlines) { const s = C.map((q) => this.toScreen(q)); path.moveTo(s[0].x, s[0].y); path.lineTo(s[1].x, s[1].y); path.lineTo(s[2].x, s[2].y); path.closePath(); }
    ctx.lineJoin = "round";
    ctx.lineWidth = 5; ctx.strokeStyle = BODY; ctx.stroke(path);
    ctx.lineWidth = 2.6; ctx.strokeStyle = HOVER; ctx.stroke(path);
    ctx.restore();
  }
  // the zoom dots, in every hole but the whole triangle's (tapping one zooms in on it)
  drawDots(hover) {
    const { ctx, P } = this;
    for (let h = 1; h < P.holes.length; h++) {
      const c = this.holeCenter(h), r = this.dotRadius(h);
      ctx.beginPath(); ctx.arc(c.x, c.y, h === hover ? r + 1.5 : r, 0, 2 * Math.PI);
      ctx.fillStyle = h === hover ? HOVER : "rgba(236, 235, 230, 0.32)";
      ctx.fill();
    }
  }
  // a zoom, part way: see the top
  drawZoom(state, { u, dir, c, after }, look) {
    const { ctx, P } = this, n = P.n, corner = this.toScreen(ROOT[c]);
    const k = 2 ** (dir > 0 ? u : -u);
    ctx.save();
    // (the camera: ×k about the third's outer corner)
    ctx.translate(corner.x, corner.y); ctx.scale(k, k); ctx.translate(-corner.x, -corner.y);
    if (dir > 0) {
      // the other thirds, going off round the edges; this third's, each splitting into three
      for (let i = 0; i < P.N; i++) if (P.addr[i][0] !== c) this.triangle(cornersOf(P.addr[i]), state[i], look);
      for (let t = 0; t < P.N; t++) {
        const C = cornersOf([c, ...P.addr[t]]), from = state[P.index([c, ...P.addr[t].slice(0, n - 1)])];
        this.triangle(C, from, look);
        if (after[t] !== from) this.triangle(C, after[t], look, false, u);
      }
    } else {
      // the whole of it, the third it's going into; the rest coming in round the edges
      const big = ROOT.map((q) => [ROOT[c][0] + 2 * (q[0] - ROOT[c][0]), ROOT[c][1] + 2 * (q[1] - ROOT[c][1])]);
      for (let t = 0; t < P.N; t++) if (P.addr[t][0] !== c) this.triangle(cornersOf(P.addr[t], big), after[t], look);
      for (let i = 0; i < P.N; i++) {
        const C = cornersOf(P.addr[i]), to = after[P.index([c, ...P.addr[i].slice(0, n - 1)])];
        this.triangle(C, state[i], look);
        if (to !== state[i]) this.triangle(C, to, look, false, u);
      }
    }
    ctx.restore();
  }

  // the solved puzzle, filling this (small) canvas: the corner card
  drawSolvedCard(P, look = {}, top = 26) {
    const { canvas } = this, w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height, pad = 8;
    this.origin = { x: 0, y: 0 };
    this.layout(P, { left: pad, top, right: w - pad, bottom: h - pad }); // (top: under the card's label; the shelf's pictures have none)
    this.draw(Int32Array.from({ length: P.N }, (_, i) => i), null, { textures: look.textures, dots: false });
  }
}
