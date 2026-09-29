// Drawing and hit-testing for the planar puzzles (planar.mjs) on a 2D canvas. The page owns
// the state, the animation queue and input; this lays the grid out inside a safe rectangle
// (clear of the page's controls), draws it, and says what's under a point.
//
// Every cell of the grid is a "slot" holding up to two pieces: one, normally, or the two
// halves of neighbors while a line is sliding. A piece is drawn in its own frame (sticker,
// texture, notch, label), mirrored by its orientation, so a flip shows as a mirror image.
// The faint copies around the edges draw the slot they're glued to, mirrored across a
// flipped seam, so it's visible which edge meets which.
import { MX, MY, loop, wrap, pieceOf, orientOf } from "./planar.mjs";

const GHOST = 0.5; // how far the wrapped-around copies reach past each edge, in cells
const COORD = 0.45; // the band past that for the board's coordinates (row letters, column numbers)
const ARROW = 0.75; // the band past that for the arrow buttons
const TEXTURES = ["plain", "stripes", "grid", "dots", "checker", "wavy", "honeycomb"];

export class PlanarView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.P = null;
    this.cell = 40; this.ox = 0; this.oy = 0; // layout, in CSS px: cell size and the grid's top-left
    this.origin = { x: 0, y: 0 }; // where the canvas's top-left is on the page (it may cover part of it)
  }

  // fit the grid, its wrapped copies and arrows inside `safe` ({ left, top, right, bottom })
  layout(P, safe) {
    this.P = P;
    const band = GHOST + COORD + ARROW;
    const w = Math.max(40, safe.right - safe.left), h = Math.max(40, safe.bottom - safe.top);
    this.cell = Math.max(6, Math.min(110, w / (P.W + 2 * band), h / (P.H + 2 * band)));
    this.ox = safe.left + (w - P.W * this.cell) / 2;
    this.oy = safe.top + (h - P.H * this.cell) / 2;
  }

  // ---- hit testing (CSS px) ----
  // the grid cell under a point, or null
  cellAt(px, py) {
    const x = Math.floor((px - this.ox) / this.cell), y = Math.floor((py - this.oy) / this.cell);
    return x >= 0 && y >= 0 && x < this.P.W && y < this.P.H ? { x, y } : null;
  }
  // every arrow button: the move it makes and where it is
  arrows() {
    const { W, H } = this.P, c = this.cell, d = GHOST + COORD + ARROW / 2, out = [];
    for (let r = 0; r < H; r++) {
      out.push({ axis: 0, layer: r, q: -1, x: this.ox - d * c, y: this.oy + (r + 0.5) * c, dir: [-1, 0] });
      out.push({ axis: 0, layer: r, q: 1, x: this.ox + (W + d) * c, y: this.oy + (r + 0.5) * c, dir: [1, 0] });
    }
    for (let k = 0; k < W; k++) {
      out.push({ axis: 1, layer: k, q: -1, x: this.ox + (k + 0.5) * c, y: this.oy - d * c, dir: [0, -1] });
      out.push({ axis: 1, layer: k, q: 1, x: this.ox + (k + 0.5) * c, y: this.oy + (H + d) * c, dir: [0, 1] });
    }
    return out;
  }
  arrowAt(px, py) {
    const r = Math.max(10, this.cell * 0.38);
    let best = null, bd = r;
    for (const a of this.arrows()) {
      const d = Math.hypot(px - a.x, py - a.y);
      if (d < bd) { best = a; bd = d; }
    }
    return best;
  }
  cellCenter(x, y) { return { x: this.ox + (x + 0.5) * this.cell, y: this.oy + (y + 0.5) * this.cell }; }

  // ---- drawing ----
  // state: the planar state. slide: the line moving right now, { axis, layer, p } with p its
  // offset in cells, or null. look: { labels, picture, arrows, hover (an arrow) }.
  draw(state, slide, look) {
    const { ctx, canvas, P } = this, o = this.origin;
    const dpr = canvas.width / canvas.clientWidth || 1;
    ctx.setTransform(dpr, 0, 0, dpr, -o.x * dpr, -o.y * dpr); // page coordinates, like the layout
    ctx.clearRect(o.x, o.y, canvas.clientWidth, canvas.clientHeight);
    const slots = this.slots(state, slide);
    const c = this.cell;
    // the body behind the stickers
    ctx.fillStyle = "#0a0b0e";
    roundRect(ctx, this.ox - c * 0.03, this.oy - c * 0.03, P.W * c + c * 0.06, P.H * c + c * 0.06, c * 0.1);
    ctx.fill();
    // wrapped-around copies, faint, clipped to a band around the grid
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.ox - GHOST * c, this.oy - GHOST * c, (P.W + 2 * GHOST) * c, (P.H + 2 * GHOST) * c);
    ctx.rect(this.ox, this.oy, P.W * c, P.H * c); // the grid itself: a hole
    ctx.clip("evenodd");
    ctx.globalAlpha = 0.32;
    for (let y = -1; y <= P.H; y++)
      for (let x = -1; x <= P.W; x++) {
        if (x >= 0 && y >= 0 && x < P.W && y < P.H) continue;
        const w = wrap(P, x, y);
        this.drawSlot(slots[w.y * P.W + w.x], this.ox + x * c, this.oy + y * c, c, w.flip, look, w);
      }
    ctx.restore();
    for (let i = 0; i < P.n; i++) {
      const at = { x: i % P.W, y: Math.floor(i / P.W) };
      this.drawSlot(slots[i], this.ox + at.x * c, this.oy + at.y * c, c, 0, look, at);
    }
    this.drawCoordinates();
    if (look.arrows) this.drawArrows(look.hover);
  }

  // Just the cells, edge to edge, filling the canvas: the picture wrapped around the 3D
  // surface. The canvas should be W×H cells of square pixels.
  drawBare(P, state, slide, look) {
    const { ctx, canvas } = this;
    this.P = P;
    this.cell = canvas.width / P.W; this.ox = 0; this.oy = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a0b0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const slots = this.slots(state, slide), c = this.cell;
    for (let i = 0; i < P.n; i++) {
      const at = { x: i % P.W, y: Math.floor(i / P.W) };
      this.drawSlot(slots[i], at.x * c, at.y * c, c, 0, look, at);
    }
  }

  // the solved grid, filling this (small) canvas: the corner card
  drawSolvedCard(P, look) {
    const { ctx, canvas } = this;
    this.P = P;
    const dpr = canvas.width / canvas.clientWidth || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    this.drawReference({ left: 0, top: 0, width: canvas.clientWidth, height: canvas.clientHeight }, look);
  }

  // what each grid cell shows: [{ v (piece*4 + orientation), dx, dy }], offsets in cells
  slots(state, slide) {
    const P = this.P;
    const slots = Array.from({ length: P.n }, (_, i) => [{ v: state[i], dx: 0, dy: 0 }]);
    if (!slide || !slide.p) return slots;
    const { cells, flips } = loop(P, slide.axis, slide.layer), L = cells.length;
    for (const i of cells) slots[i] = [];
    // flips picked up walking the loop from index i to unwrapped index m
    const flipsBetween = (i, m) => {
      let f = 0;
      if (m > i) for (let k = i; k < m; k++) f ^= flips[mod(k, L)];
      else for (let k = i - 1; k >= m; k--) f ^= flips[mod(k, L)];
      return f;
    };
    cells.forEach((cellIdx, i) => {
      const u = i + slide.p, m0 = Math.floor(u), f = u - m0, v = state[cellIdx];
      for (const [m, off] of [[m0, f], [m0 + 1, f - 1]]) {
        if (off <= -1 || off >= 1) continue;
        const d = { v: v ^ flipsBetween(i, m), dx: 0, dy: 0 };
        if (slide.axis === 0) d.dx = off; else d.dy = off;
        slots[cells[mod(m, L)]].push(d);
      }
    });
    return slots;
  }

  // one grid cell's contents at (x, y), size c, mirrored by `flip` (for the wrapped copies);
  // at: which grid cell this is, for the labels' in-place marks
  drawSlot(slot, x, y, c, flip, look, at) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(c, c);
    mirror(ctx, flip);
    ctx.beginPath(); ctx.rect(0, 0, 1, 1); ctx.clip();
    for (const d of slot) {
      ctx.save();
      ctx.translate(d.dx, d.dy);
      this.drawPiece(pieceOf(d.v), orientOf(d.v), look, c, at, flip);
      ctx.restore();
    }
    ctx.restore();
  }

  // a piece in the unit square, in its own frame: mirrored by its orientation. at: the grid
  // cell it's in (null: nowhere in particular, as in the solved thumbnail). seam: the mirror
  // the wrapped copies are drawn with, so an upright label can undo it.
  drawPiece(piece, orient, look, c, at = null, seam = 0) {
    const { ctx, P } = this;
    const hx = piece % P.W, hy = Math.floor(piece / P.W);
    const inset = 0.03, r = 0.1; // the gap between neighbors is twice the inset
    mirror(ctx, orient);
    ctx.save();
    roundRect(ctx, inset, inset, 1 - 2 * inset, 1 - 2 * inset, r);
    ctx.clip();
    if (look.picture) {
      const { img, sx, sy, sw, sh } = look.picture;
      ctx.drawImage(img, sx + (hx * sw) / P.W, sy + (hy * sh) / P.H, sw / P.W, sh / P.H, 0, 0, 1, 1);
    } else {
      ctx.fillStyle = cellColor(hx, hy, P.W, P.H);
      ctx.fillRect(0, 0, 1, 1);
      if (look.textures) drawTexture(ctx, TEXTURES[hx % TEXTURES.length], c);
    }
    // the notch: this piece's own top-left corner, so a flip shows on any piece
    if (P.T.x || P.T.y) {
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(inset + 0.3, 0); ctx.lineTo(0, inset + 0.3); ctx.closePath();
      ctx.fillStyle = "rgba(10, 11, 14, 0.8)";
      ctx.fill();
    }
    ctx.restore();
    if (look.labels) {
      // reflected labels off: turn the text back upright on screen (it still gets a reflected
      // piece's colors, and the notch and underlines stay where they are)
      if (!look.reflectLabels) mirror(ctx, orient ^ seam);
      this.drawLabel(hx, hy, at, orient !== 0);
    }
  }

  // Column letter and row number, like a chess square (A1 is the top-left), white with a black
  // outline (a reflected piece: black with a white outline). A part is underlined when the
  // piece is in its home column (letter) or home row (number). Drawn 100× larger and scaled down: text measured at a fraction of a
  // pixel comes out too narrow, and the parts would overlap.
  drawLabel(hx, hy, at, reflected) {
    const { ctx } = this, K = 100;
    const parts = [
      { text: colLabel(hx), home: !!at && at.x === hx },
      { text: String(hy + 1), home: !!at && at.y === hy },
    ];
    const size = K * Math.min(0.32, 0.84 / (parts[0].text.length + parts[1].text.length));
    const [fill, edge] = reflected ? ["#0a0b0e", "#fff"] : ["#fff", "#0a0b0e"];
    ctx.save();
    ctx.scale(1 / K, 1 / K);
    ctx.font = `700 ${size}px ui-monospace, "IBM Plex Mono", monospace`;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = edge; ctx.fillStyle = fill;
    const gap = size * 0.08;
    const widths = parts.map((p) => ctx.measureText(p.text).width);
    let x = K * 0.5 - (widths[0] + gap + widths[1]) / 2;
    const y = K * 0.5, bar = { dy: size * 0.62, h: size * 0.13 };
    const xs = [x, x + widths[0] + gap];
    // outlines first, then fills, so one part's outline never covers the other's letters
    parts.forEach((p, i) => {
      ctx.strokeText(p.text, xs[i], y);
      if (p.home) ctx.strokeRect(xs[i], y + bar.dy, widths[i], bar.h);
    });
    parts.forEach((p, i) => {
      ctx.fillText(p.text, xs[i], y);
      if (p.home) ctx.fillRect(xs[i], y + bar.dy, widths[i], bar.h);
    });
    ctx.restore();
  }

  // the board's coordinates, like a chess board's: column letters above and below, row numbers
  // left and right. They name the grid's places, so they never move.
  drawCoordinates() {
    const { ctx, P } = this, c = this.cell, d = GHOST + COORD / 2;
    ctx.save();
    ctx.font = `600 ${Math.max(9, Math.min(15, c * 0.28))}px ui-monospace, "IBM Plex Mono", monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#8b909a";
    for (let y = 0; y < P.H; y++) {
      const cy = this.oy + (y + 0.5) * c;
      ctx.fillText(String(y + 1), this.ox - d * c, cy);
      ctx.fillText(String(y + 1), this.ox + (P.W + d) * c, cy);
    }
    for (let x = 0; x < P.W; x++) {
      const cx = this.ox + (x + 0.5) * c;
      ctx.fillText(colLabel(x), cx, this.oy - d * c);
      ctx.fillText(colLabel(x), cx, this.oy + (P.H + d) * c);
    }
    ctx.restore();
  }

  drawArrows(hover) {
    const { ctx } = this, s = this.cell * 0.2;
    for (const a of this.arrows()) {
      const on = hover && hover.axis === a.axis && hover.layer === a.layer && hover.q === a.q;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(Math.atan2(a.dir[1], a.dir[0]));
      ctx.beginPath();
      ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.85); ctx.lineTo(-s * 0.7, s * 0.85); ctx.closePath();
      ctx.fillStyle = on ? "#f5c518" : "rgba(142, 144, 155, 0.75)";
      ctx.fill();
      ctx.restore();
    }
  }

  // the solved grid, small, inside `box` (a DOMRect: the corner card)
  drawReference(box, look) {
    const { ctx, P } = this, pad = 8, top = 22; // (below the card's SOLVED label)
    const c = Math.min((box.width - 2 * pad) / P.W, (box.height - pad - top) / P.H);
    const x0 = box.left + (box.width - P.W * c) / 2, y0 = box.top + top + (box.height - top - pad - P.H * c) / 2;
    for (let i = 0; i < P.n; i++) {
      ctx.save();
      ctx.translate(x0 + (i % P.W) * c, y0 + Math.floor(i / P.W) * c);
      ctx.scale(c, c);
      this.drawPiece(i, 0, { ...look, labels: false }, c);
      ctx.restore();
    }
  }
}

const mod = (a, n) => ((a % n) + n) % n;
function mirror(ctx, flip) {
  if (flip & MX) { ctx.translate(1, 0); ctx.scale(-1, 1); }
  if (flip & MY) { ctx.translate(0, 1); ctx.scale(1, -1); }
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// A cell's home color. The row picks a hue, evenly spaced by how hues look (OKLCH hue
// angles, not HSL's, where greens take up so much of the wheel that two rows could both land
// in green), and column A shows it at full strength: the most vivid color a screen can make at
// that hue. Each column after is that color darkened (scaled toward black, which keeps it fully
// saturated), down to DARK of its brightness in the last column: dark enough to read as a
// step, not so dark the hues run together.
export const DARK = 0.4;
const vivid = new Map(); // hue angle → [r, g, b] in 0..1 (sRGB), the hue at full strength
function vividColor(hueDeg) {
  const key = hueDeg.toFixed(2);
  if (vivid.has(key)) return vivid.get(key);
  const h = (hueDeg * Math.PI) / 180, a = Math.cos(h), b = Math.sin(h);
  // OKLab → sRGB (0..1), or null when the screen can't show it
  const rgb = (L, C) => {
    const l = (L + 0.3963377774 * C * a + 0.2158037573 * C * b) ** 3;
    const m = (L - 0.1055613458 * C * a - 0.0638541728 * C * b) ** 3;
    const s = (L - 0.0894841775 * C * a - 1.291485548 * C * b) ** 3;
    const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                 -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                 -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    if (lin.some((v) => v < -1e-4 || v > 1 + 1e-4)) return null;
    return lin.map((v) => { v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; });
  };
  // the most chroma at any lightness: for each lightness, bisect the chroma the screen allows
  let best = null, bestC = -1;
  for (let L = 0.4; L <= 0.99; L += 0.01) {
    let lo = 0, hi = 0.4;
    for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2; if (rgb(L, mid)) lo = mid; else hi = mid; }
    if (lo > bestC) { bestC = lo; best = rgb(L, lo); }
  }
  // the search stops a hair short of the edge: stretch to a channel at 0 and one at 1
  const lo = Math.min(...best), hi = Math.max(...best);
  best = best.map((c) => (c - lo) / (hi - lo));
  vivid.set(key, best);
  return best;
}
export function cellColor(x, y, W, H) {
  const base = vividColor((y * 360) / H + 29); // +29: row 1 starts at red
  const v = W > 1 ? 1 - ((1 - DARK) * x) / (W - 1) : 1;
  const hex = (c) => Math.round(c * v * 255).toString(16).padStart(2, "0");
  return `#${base.map(hex).join("")}`;
}

// columns are letters (A, B, … Z, AA, AB…, like a spreadsheet), rows numbers (1, 2, 3…)
export function colLabel(x) {
  let s = "";
  for (let n = x + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const label = (x, y) => colLabel(x) + (y + 1);

// a column's texture, drawn as dark ink in the unit square (the page's 3D textures, in 2D)
function drawTexture(ctx, kind, c) {
  if (kind === "plain") return;
  const p = 0.25, lw = Math.max(0.045, 1.2 / c); // period, and a line width of at least ~1 px
  ctx.fillStyle = ctx.strokeStyle = "rgba(10, 11, 14, 0.3)";
  ctx.lineWidth = lw;
  ctx.beginPath();
  if (kind === "stripes") for (let y = p / 2; y < 1; y += p) { ctx.moveTo(0, y); ctx.lineTo(1, y); }
  else if (kind === "grid") for (let t = p / 2; t < 1; t += p) { ctx.moveTo(0, t); ctx.lineTo(1, t); ctx.moveTo(t, 0); ctx.lineTo(t, 1); }
  else if (kind === "wavy") for (let y = p / 2; y < 1; y += p) for (let x = 0; x <= 1.001; x += 0.05) {
    const yy = y + 0.05 * Math.sin(x * Math.PI * 4);
    if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
  }
  if (kind === "stripes" || kind === "grid" || kind === "wavy") { ctx.stroke(); return; }
  if (kind === "dots") for (let y = p / 2; y < 1; y += p) for (let x = p / 2; x < 1; x += p) { ctx.moveTo(x + 0.055, y); ctx.arc(x, y, 0.055, 0, 7); }
  else if (kind === "checker") for (let j = 0; j < 1 / p; j++) for (let i = 0; i < 1 / p; i++) { if ((i + j) % 2 === 0) ctx.rect(i * p, j * p, p, p); }
  else if (kind === "honeycomb") {
    // flat-topped hexagons of side s: columns 1.5 s apart, rows √3 s apart, every other column
    // shifted half a row. Start a couple of cells outside the square so its edges are covered.
    const s = 0.13, rowH = s * Math.sqrt(3);
    for (let col = -2; col * 1.5 * s < 1 + 2 * s; col++)
      for (let row = -2; row * rowH < 1 + 2 * rowH; row++) {
        const cx = col * 1.5 * s, cy = row * rowH + (col & 1 ? rowH / 2 : 0);
        for (let k = 0; k <= 6; k++) {
          const a = (Math.PI / 3) * k, x = cx + s * Math.cos(a), y = cy + s * Math.sin(a);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
    ctx.stroke();
    return;
  }
  ctx.fill();
}
