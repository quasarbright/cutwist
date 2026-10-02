// Drawing and hit-testing for the intersecting circles puzzles (circles.mjs) on a 2D canvas,
// the way planar-view.mjs does the sliding grids: the page owns the state, the animation
// queue and input; this lays the circles out inside a safe rectangle (clear of the page's
// controls), draws them and their stickers, and says which circle is under a point.
import { stickersDuring, flatPlace } from "./circles.mjs";
import { PUZZLE_COLORS } from "./planar-view.mjs";

// The color of each pair of families (circles.mjs numbers them): the twisty-puzzle colors,
// then, past twelve, hues spaced evenly around the wheel.
export function pairColor(i, count) {
  if (count <= PUZZLE_COLORS.length) return PUZZLE_COLORS[i];
  return `hsl(${Math.round((i * 360) / count)}, 85%, 55%)`;
}

const LINE = "rgba(142, 144, 155, 0.75)", HOVER = "#f5c518";

export class CirclesView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.P = null;
    this.k = 100; this.ox = 0; this.oy = 0; // layout, in CSS px: px per unit, and where (0, 0) is
    this.origin = { x: 0, y: 0 }; // where the canvas's top-left is on the page
  }

  // fit every circle (plus room for the stickers on them) inside `safe` ({ left, top, right, bottom })
  layout(P, safe) {
    this.P = P;
    const b = bounds(P), pad = 0.06 * Math.max(b.w, b.h);
    const w = Math.max(40, safe.right - safe.left), h = Math.max(40, safe.bottom - safe.top);
    this.k = Math.min(w / (b.w + 2 * pad), h / (b.h + 2 * pad));
    this.ox = safe.left + w / 2 - (b.x + b.w / 2) * this.k;
    this.oy = safe.top + h / 2 - (b.y + b.h / 2) * this.k;
  }
  toScreen([x, y]) { return [this.ox + x * this.k, this.oy + y * this.k]; }

  // the circle under a point (its index), or null: the nearest one within a few pixels
  circleAt(px, py) {
    const tol = Math.max(9, this.stickerRadius() * 0.9);
    let best = null, bd = tol;
    this.P.circles.forEach((c, i) => {
      const [cx, cy] = this.toScreen(c.c), d = Math.abs(Math.hypot(px - cx, py - cy) - c.r * this.k);
      if (d < bd) { best = i; bd = d; }
    });
    return best;
  }
  // a point on circle i, at angle a (radians, clockwise from the right), in CSS px
  circlePoint(i, a) {
    const c = this.P.circles[i];
    return this.toScreen([c.c[0] + c.r * Math.cos(a), c.c[1] + c.r * Math.sin(a)]);
  }

  // stickers are drawn this big: a bit over a third of the way to the nearest other crossing
  stickerRadius() {
    return Math.max(3, Math.min(18, 0.36 * nearest(this.P) * this.k));
  }

  // state: the circles state. turn: the circle turning right now, { axis, layer, p } with p
  // how many crossings along it has gone, or null. look: { hover (a circle index), lit (a
  // Set of points to lighten, or null) }
  draw(state, turn, look) {
    const { ctx, canvas } = this, o = this.origin;
    const dpr = canvas.width / canvas.clientWidth || 1;
    ctx.setTransform(dpr, 0, 0, dpr, -o.x * dpr, -o.y * dpr); // page coordinates, like the layout
    ctx.clearRect(o.x, o.y, canvas.clientWidth, canvas.clientHeight);
    this.drawAll(state, turn, look);
  }

  drawAll(state, turn, look, lineScale = 1) {
    const { ctx, P } = this;
    ctx.lineCap = "round";
    P.circles.forEach((c, i) => {
      if (i === look.hover) return;
      ctx.beginPath();
      ctx.arc(...this.toScreen(c.c), c.r * this.k, 0, Math.PI * 2);
      ctx.strokeStyle = LINE; ctx.lineWidth = 2 * lineScale;
      ctx.stroke();
    });
    if (look.hover != null) { // (on top of the rest)
      const c = P.circles[look.hover];
      ctx.beginPath();
      ctx.arc(...this.toScreen(c.c), c.r * this.k, 0, Math.PI * 2);
      ctx.strokeStyle = HOVER; ctx.lineWidth = 3.5 * lineScale;
      ctx.stroke();
    }
    const r = this.stickerRadius();
    const shown = stickersDuring(P, state, turn, (ci, k, f) => flatPlace(P, ci, k, f));
    // the still ones first, so the moving ones pass over them
    for (const s of [...shown.filter((s) => s.at === null), ...shown.filter((s) => s.at !== null)]) {
      const at = this.toScreen(s.at || P.points[s.point].at);
      ctx.beginPath();
      ctx.arc(at[0], at[1], r, 0, Math.PI * 2);
      ctx.fillStyle = pairColor(P.points[s.v].color, P.colors);
      ctx.fill();
      ctx.lineWidth = Math.max(1.2, r * 0.22) * lineScale; ctx.strokeStyle = "#0a0b0e";
      ctx.stroke();
      if (look.lit && s.point !== null && look.lit.has(s.point)) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
        ctx.fill();
      }
    }
  }

  // the solved circles, filling this (small) canvas: the corner card
  drawSolvedCard(P, state) {
    const { ctx, canvas } = this, dpr = canvas.width / canvas.clientWidth || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    const pad = 6, top = 20; // (below the card's SOLVED label)
    this.layout(P, { left: pad, top, right: canvas.clientWidth - pad, bottom: canvas.clientHeight - pad });
    this.drawAll(state, null, { hover: null, lit: null }, 0.5);
  }
}

// the drawing's extent: every circle in full
function bounds(P) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of P.circles) {
    x0 = Math.min(x0, c.c[0] - c.r); x1 = Math.max(x1, c.c[0] + c.r);
    y0 = Math.min(y0, c.c[1] - c.r); y1 = Math.max(y1, c.c[1] + c.r);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// the closest two crossings come (in the drawing's units), cached on the puzzle
function nearest(P) {
  if (P.nearest !== undefined) return P.nearest;
  let m = Infinity;
  const pts = P.points.map((p) => p.at);
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  return (P.nearest = Number.isFinite(m) ? m : 0.3);
}
