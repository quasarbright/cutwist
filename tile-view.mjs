// Drawing and hit-testing for the tile-turning puzzles (tiles.mjs) on a 2D canvas. The page
// owns the state, the animation queue and input; this lays the torus out inside a safe
// rectangle (clear of the page's controls), draws it, and says what's under a point.
//
// The flat view shows one copy of every tile (the patch around the middle, outlined), and the
// copies of its neighbors around it, so it's visible how the edges glue: a piece leaving the
// patch on one side comes back in on the other. Under the pieces is the solved picture (the
// faces in their colors), which shows wherever no circle reaches. A piece is clipped to its
// outline (arcs of the circles that cut it out), then each of its stickers filled: the parts
// of its face.
import { piecePose, nearestCopy, partsNear } from "./tiles.mjs";
import { PUZZLE_COLORS, vividHex } from "./planar-view.mjs";
import { faceTextures, colorDistance, PUZZLE_PALETTES } from "./puzzle.mjs";

const MARGIN = 0.75; // how far the copies around reach past the patch, in tile spacings
const LINE = 0.017; // the lines between stickers, in tile spacings (half that on triangles)
const BODY = "#0a0b0e";
const BLACK = "#1c1f27"; // (a blacked-out piece)
let uid = 0; // (a number per puzzle, for the cache's key)

// A tile's color, from a real twisty puzzle's palette: the cube's and megaminx's 12 up to 12
// tiles, the icosahedron's 20 up to 20, the rhombic triacontahedron's 30 up to 30 (past that,
// hues spread by the golden angle). Tiles take colors in turn, outward from the middle, each
// the one least like its neighbors' (colors near the palette's start win once it's clearly
// different, so the cube's six come first), so look-alikes don't touch. A truncation's faces
// take the solids' truncation colors: light for corners, deeper for edges.
const colorSets = new WeakMap();
export function faceColor(P, f) {
  if (!colorSets.has(P)) colorSets.set(P, faceColors(P));
  return colorSets.get(P)[f];
}
export const tileColor = faceColor; // (the tiles are the first faces)
function faceColors(P) {
  const n = P.tiles.length;
  const palette = n <= 12 ? PUZZLE_COLORS : n <= 20 ? PUZZLE_PALETTES[20] : n <= 30 ? PUZZLE_PALETTES[30]
    : Array.from({ length: n }, (_, i) => vividHex((i * 137.508 + 29) % 360));
  // neighbors: tiles sharing an edge or a corner
  const reach = P.spec.tiling === "square" ? 1.45 : 1.01;
  const near = P.tiles.map((t, i) => P.tiles.map((u, j) => j).filter((j) => j !== i && Math.sqrt(nearestCopy(P, P.tiles[j].center, t.center).dd) < reach));
  const out = new Array(P.faces.length), used = new Set();
  for (let i = 0; i < n; i++) {
    let best = -1, score = -Infinity;
    palette.forEach((c, k) => {
      if (used.has(k)) return;
      const d = Math.min(0.18, ...near[i].filter((j) => out[j]).map((j) => colorDistance(c, out[j])));
      if (d - 0.002 * k > score) { score = d - 0.002 * k; best = k; }
    });
    out[i] = palette[best]; used.add(best);
  }
  for (const kind of ["vertex", "edge"]) {
    const list = P.faces.map((f, i) => (f.kind === kind ? i : -1)).filter((i) => i >= 0);
    list.forEach((f, k) => { out[f] = hslHex((k * 360) / list.length + (kind === "vertex" ? 15 : 195), kind === "vertex" ? 45 : 40, kind === "vertex" ? 72 : 48); });
  }
  return out;
}
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, "0")).join("")}`;
}
// each face's texture (an index into TEXTURES), so faces of look-alike colors get different
// ones: the 3D puzzles' assignment (puzzle.mjs), made once per puzzle
const textureSets = new WeakMap();
export function tileTextures(P) {
  if (!textureSets.has(P)) textureSets.set(P, faceTextures(P.faces.map((_, i) => faceColor(P, i))));
  return textureSets.get(P);
}

export class TileView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.P = null;
    this.scale = 60; this.ox = 0; this.oy = 0; // layout: CSS px per plane unit, and where plane (0, 0) is
    this.origin = { x: 0, y: 0 }; // where the canvas's top-left is on the page
    this.cache = null; // the pieces that aren't moving, drawn once: { key, canvas }
    this.lineScale = 1; // (thinner on the 3D torus's texture, which stretches them)
  }

  // the patch's box in plane coordinates, with the copies around it
  box(P) {
    const xs = P.tiles.flatMap((t) => t.corners.map((c) => c[0])), ys = P.tiles.flatMap((t) => t.corners.map((c) => c[1]));
    return { x0: Math.min(...xs) - MARGIN, y0: Math.min(...ys) - MARGIN, x1: Math.max(...xs) + MARGIN, y1: Math.max(...ys) + MARGIN };
  }
  heightFor(P, w) {
    const b = this.box(P);
    return (w * (b.y1 - b.y0)) / (b.x1 - b.x0);
  }
  // fit the patch and its surroundings inside `safe` ({ left, top, right, bottom }), centered
  layout(P, safe) {
    this.P = P;
    const b = this.box(P), w = Math.max(40, safe.right - safe.left), h = Math.max(40, safe.bottom - safe.top);
    this.scale = Math.min(200, w / (b.x1 - b.x0), h / (b.y1 - b.y0));
    this.ox = safe.left + w / 2 - ((b.x0 + b.x1) / 2) * this.scale;
    this.oy = safe.top + h / 2 - ((b.y0 + b.y1) / 2) * this.scale;
    this.view = b; // (just the patch and its band of copies, cut off square: see draw)
  }

  // ---- hit testing (CSS px) ----
  toPlane(px, py) { return [(px - this.ox) / this.scale, (py - this.oy) / this.scale]; }
  toScreen([x, y]) { return { x: this.ox + x * this.scale, y: this.oy + y * this.scale }; }
  // the circle whose line passes nearest a point, within tol px: { axis, layer (the one just
  // inside it), center (plane, the copy) }. Only where the tiles are drawn: none in the empty
  // space around them.
  circleAt(px, py, tol = 10) { return this.shows(px, py) ? circleNear(this.P, this.toPlane(px, py), tol / this.scale) : null; }
  // the turning point whose middle a point is on (the part a click turns), or null
  tileAt(px, py) { return this.shows(px, py) ? axisNear(this.P, this.toPlane(px, py)) : null; }
  // what a press there takes (see pressAt): { circle } or { middle } or {}
  pressAt(px, py, tol = 10) { return this.shows(px, py) ? pressAt(this.P, this.toPlane(px, py), tol / this.scale) : {}; }
  // the piece under a point (state: where everything is now), or null
  pieceAt(px, py, state) { return this.shows(px, py) ? pieceNear(this.P, state, this.toPlane(px, py), this.ctx) : null; }
  // whether a point (CSS px) is on the drawn tiles
  shows(px, py) {
    const [x, y] = this.toPlane(px, py), v = this.view;
    return x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1;
  }

  // ---- drawing ----
  // state: the puzzle's state. turn: the layer turning right now, { pieces (Map piece → point
  // it turns about, internal), theta (radians clockwise) }, or null. look: { hover ({ axis,
  // layer }: the circles to light, or null), lit (a Set of pieces to lighten, or null) }.
  draw(state, turn, look) {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const moving = turn ? turn.pieces : null;
    // everything that isn't moving, from the cache (redrawn when anything about it changes)
    const key = [(this.P.uid ??= ++uid), !!look.textures, state.join(), moving ? [...moving.keys()].join(".") : "", this.scale, this.ox, this.oy, canvas.width, canvas.height].join("|");
    const plain = { ...look, lit: null }; // (lit pieces get their pulsing light on top, every frame)
    if (!this.cache || this.cache.key !== key) {
      const c = this.cache?.canvas || document.createElement("canvas");
      c.width = canvas.width; c.height = canvas.height;
      const cx = c.getContext("2d");
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, c.width, c.height);
      cx.setTransform(...this.planeToCanvas());
      this.clipToView(cx);
      this.paintFaces(cx, plain);
      this.paint(cx, state, (i) => !moving || !moving.has(i), null, plain, 1);
      this.paint(cx, state, (i) => !moving || !moving.has(i), null, plain, 1, "lines");
      this.cache = { key, canvas: c };
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.cache.canvas, 0, 0);
    ctx.setTransform(...this.planeToCanvas());
    ctx.save();
    this.clipToView(ctx);
    if (moving) {
      this.paint(ctx, state, (i) => moving.has(i), turn, plain, 1);
      this.paint(ctx, state, (i) => moving.has(i), turn, plain, 1, "lines");
    }
    if (look.lit) this.paint(ctx, state, (i) => look.lit.has(i), turn, look, look.litAlpha ?? 0.34, "light");
    this.drawOutline(ctx);
    if (look.hover) this.drawRings(ctx, look.hover);
    if (look.pointer) this.drawPointers(ctx, look.pointer);
    ctx.restore();
  }
  // The pointer's copies: wherever the spot under it shows again around the patch, what the
  // real pointer shows (an arrow; a hand open over a circle, closed dragging one, pointing
  // over a tile's middle). pointer: { at (plane), cursor ("grab", "grabbing", "pointer" or
  // ""), real (whether the real pointer is there: then that copy is left out) }
  // Each copy is the negative of what's under it: the shape, in white, drawn with the
  // "difference" blend (white minus each color).
  drawPointers(ctx, { at, cursor, real }) {
    const icon = HANDS[cursor] || HANDS.arrow;
    const { P } = this, v = this.view, m = ctx.getTransform(), k = (0.85 * m.a) / this.scale; // (canvas px per icon unit: 24 units, about 20 CSS px)
    const mask = handMask(icon, k);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "difference";
    for (let a = -4; a <= 4; a++)
      for (let b = -4; b <= 4; b++) {
        if (real && !a && !b) continue;
        const x = at[0] + a * P.Ap[0] + b * P.Bp[0], y = at[1] + a * P.Ap[1] + b * P.Bp[1];
        if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
        const p = m.transformPoint({ x, y });
        ctx.drawImage(mask, Math.round(p.x - (icon.hot[0] + MASK_PAD) * k), Math.round(p.y - (icon.hot[1] + MASK_PAD) * k));
      }
    ctx.restore();
  }
  // the patch and its band of copies, cut off square
  clipToView(ctx) {
    const v = this.view;
    ctx.beginPath();
    ctx.rect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    ctx.clip();
  }

  // Just the pieces, filling the canvas as the torus's square of flat coordinates (s, t) in
  // [0, 1]², the patch's steps A and B along its edges: the picture wrapped around the 3D torus.
  // ids: instead, which texture each spot shows (index × 32 in the red; black between pieces),
  // for the 3D torus's shader to draw them fixed to the screen
  drawBare(P, state, look, ids = false) {
    const { ctx, canvas } = this, W = canvas.width, H = canvas.height, { Ap, Bp } = P, det = Ap[0] * Bp[1] - Ap[1] * Bp[0];
    this.P = P;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ids ? "#000" : BODY;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform((W * Bp[1]) / det, (-H * Ap[1]) / det, (-W * Bp[0]) / det, (H * Ap[0]) / det, 0, 0);
    this.scale = W / Math.hypot(...Ap); // (px per unit, about: for line widths)
    this.lineScale = 0.6;
    // every copy that reaches into the square: the patch's, and one step around it each way
    const s = [0, 1, 0, 1], t = [0, 0, 1, 1];
    this.view = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let k = 0; k < 4; k++) {
      const x = s[k] * Ap[0] + t[k] * Bp[0], y = s[k] * Ap[1] + t[k] * Bp[1];
      this.view = { x0: Math.min(this.view.x0, x), y0: Math.min(this.view.y0, y), x1: Math.max(this.view.x1, x), y1: Math.max(this.view.y1, y) };
    }
    this.paintFaces(ctx, look, ids);
    this.paint(ctx, state, () => true, null, look, 1, ids ? "ids" : "pieces");
    if (!ids) this.paint(ctx, state, () => true, null, look, 1, "lines");
    if (!ids && look.hover) this.drawRings(ctx, look.hover);
  }

  // the solved puzzle, filling this (small) canvas: the corner card
  drawSolvedCard(P, look) {
    const { canvas } = this, w = canvas.clientWidth, h = canvas.clientHeight, pad = 8;
    this.origin = { x: 0, y: 0 };
    this.layout(P, { left: pad, top: 26, right: w - pad, bottom: h - pad }); // (26: under the card's label)
    this.draw(new Int32Array(3 * P.n), null, { hover: null, lit: null, textures: look.textures });
  }

  // The solved picture, under the pieces: every face's parts in the view in its color (and,
  // ids, its texture's number), with the lines between them. It shows where no piece is.
  paintFaces(ctx, look, ids = false) {
    const { P } = this, v = this.view, mid = [(v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2];
    const textures = look.textures || ids ? tileTextures(P) : null;
    ctx.save();
    ctx.lineWidth = 2 * Math.max(this.lineWidth(), 1 / this.scale);
    ctx.lineJoin = "round";
    ctx.strokeStyle = BODY;
    for (const { face, poly } of partsNear(P, mid, Math.hypot(v.x1 - v.x0, v.y1 - v.y0) / 2 + 1.2)) {
      const f = P.faceAt(face);
      ctx.beginPath();
      poly.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      if (ids) { ctx.fillStyle = `rgb(${textures[f] * 32 + 16}, 0, 0)`; ctx.fill(); continue; }
      ctx.fillStyle = faceColor(P, f);
      ctx.fill();
      if (textures && textures[f]) this.texture(ctx, poly, textures[f], faceColor(P, f));
      ctx.stroke();
    }
    ctx.restore();
  }
  lineWidth() { return (this.P.spec.tiling === "triangle" ? LINE / 2 : LINE) * this.lineScale; }

  // Draw the pieces `which` picks, each copy that shows in the view, at strength alpha.
  // turn: the moving ones' extra turn, or null. mode: "pieces"; "lines", their outlines, drawn
  // after every piece's fill (full width on the edge, so every edge has the same line, whether
  // a piece or the still solved picture is across it); "light", just a white light over them,
  // alpha strong (the pieces an algorithm would move); "ids", the picture of which texture
  // shows where.
  paint(ctx, state, which, turn, look, alpha, mode = "pieces") {
    const { P } = this, v = this.view, rmax = Math.max(0, ...P.axes.map((a) => a.radii.at(-1)));
    for (let i = 0; i < P.n; i++) {
      if (!which(i)) continue;
      const pc = P.pieces[i], { k, t, anchor } = piecePose(P, state, i), T = P.toPlane(t), angle = k * P.step;
      const reach = pc.extent + 0.05 + (turn ? 2 * rmax : 0); // (turning, a copy just outside can swing in)
      // the copies of it that show: start from the one nearest the view's middle
      const mid = [(v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2], base = nearestCopy(P, anchor, mid);
      for (let a = -3; a <= 3; a++)
        for (let b = -3; b <= 3; b++) {
          const lam = [base.q[0] - anchor[0] + a * P.Ap[0] + b * P.Bp[0], base.q[1] - anchor[1] + a * P.Ap[1] + b * P.Bp[1]];
          const ax = anchor[0] + lam[0], ay = anchor[1] + lam[1];
          if (ax < v.x0 - reach || ax > v.x1 + reach || ay < v.y0 - reach || ay > v.y1 + reach) continue;
          ctx.save();
          if (turn && turn.pieces.has(i)) {
            const c = P.toPlane(turn.pieces.get(i)), cx = c[0] + lam[0], cy = c[1] + lam[1];
            ctx.translate(cx, cy); ctx.rotate(turn.theta); ctx.translate(-cx, -cy);
          }
          ctx.translate(T[0] + lam[0], T[1] + lam[1]);
          ctx.rotate(angle);
          ctx.translate(...pc.offset); // (its outline and stickers: at the cell at the origin)
          if (mode === "light") {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fill(outlinePath(pc.outline), "evenodd");
          } else if (mode === "lines") {
            ctx.lineWidth = 2 * Math.max(this.lineWidth(), 1 / this.scale);
            ctx.lineJoin = "round";
            ctx.strokeStyle = BODY;
            ctx.stroke(outlinePath(pc.outline));
          } else if (mode === "ids") this.pieceIds(ctx, pc, tileTextures(P));
          else this.piece(ctx, pc, alpha, look.lit && look.lit.has(i), look.textures ? tileTextures(P) : null);
          ctx.restore();
        }
    }
  }

  // one piece, at the cell at the origin in the current transform: clipped to its outline,
  // each sticker's face parts filled in its color, with the faces' edges inside it as lines
  // (its own outline comes after, with every other piece's: see paint)
  piece(ctx, pc, alpha, lit, textures) {
    const path = outlinePath(pc.outline);
    ctx.clip(path, "evenodd");
    ctx.lineWidth = 2 * Math.max(this.lineWidth(), 1 / this.scale);
    ctx.lineJoin = "round";
    ctx.strokeStyle = BODY;
    ctx.globalAlpha = alpha;
    if (pc.black) {
      ctx.fillStyle = BLACK;
      ctx.fill(path, "evenodd");
      if (lit) { ctx.fillStyle = "rgba(255, 255, 255, 0.34)"; ctx.fill(path, "evenodd"); }
      return;
    }
    for (const st of pc.stickers) {
      const color = faceColor(this.P, st.face);
      for (const poly of st.parts) {
        ctx.beginPath();
        poly.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        if (textures && textures[st.face]) this.texture(ctx, poly, textures[st.face], color);
        if (lit) { ctx.fillStyle = "rgba(255, 255, 255, 0.34)"; ctx.fill(); }
        ctx.stroke(); // (the face's edges)
      }
    }
  }
  // A face's texture over a polygon (the current path), fixed to the screen (the sticker a
  // window onto it, like the 3D puzzles'): over the polygon's box in canvas pixels
  texture(ctx, poly, t, color) {
    const m = ctx.getTransform(), pts = poly.map(([x, y]) => m.transformPoint({ x, y }));
    const x0 = Math.min(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y));
    const x1 = Math.max(...pts.map((p) => p.x)), y1 = Math.max(...pts.map((p) => p.y));
    ctx.save();
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = inkPattern(ctx, t, color, this.canvas.clientWidth ? this.canvas.width / this.canvas.clientWidth : 1);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  // one piece in the picture of which texture shows where: each sticker's face's, as its red
  pieceIds(ctx, pc, textures) {
    ctx.clip(outlinePath(pc.outline), "evenodd");
    for (const st of pc.stickers)
      for (const poly of st.parts) {
        ctx.beginPath();
        poly.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = pc.black ? "#000" : `rgb(${textures[st.face] * 32 + 16}, 0, 0)`;
        ctx.fill();
      }
  }

  // the outline around the patch: tile edges between a patch tile and one that isn't
  drawOutline(ctx) {
    const { P } = this;
    if (!this.outline) this.outline = new Map();
    let segs = this.outline.get(P);
    if (!segs) {
      const homes = new Set(P.tiles.map((t) => t.home.join()));
      segs = [];
      for (const t of P.tiles)
        t.corners.forEach((a, j) => {
          const b = t.corners[(j + 1) % t.corners.length], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const across = P.fromPlane([2 * mid[0] - t.center[0], 2 * mid[1] - t.center[1]]).map(Math.round); // (the neighbor's middle: this one's mirrored)
          if (!homes.has(across.join())) segs.push([a, b]);
        });
      this.outline = new Map([[P, segs]]);
    }
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(232, 234, 242, 0.85)";
    ctx.lineWidth = Math.max(0.03, 2.2 / this.scale);
    ctx.beginPath();
    for (const [a, b] of segs) { ctx.moveTo(...a); ctx.lineTo(...b); }
    ctx.stroke();
    ctx.restore();
  }

  // a layer's circles (a disk's, or a ring's two), lit, at every copy in view (in plane
  // coordinates: the current transform)
  drawRings(ctx, { axis, layer }) {
    const { P } = this, v = this.view, ax = P.axes[axis];
    if (!ax) return;
    const c0 = ax.center, radii = [ax.radii[layer], ...(layer ? [ax.radii[layer - 1]] : [])], r = radii[0];
    ctx.save();
    for (let a = -4; a <= 4; a++)
      for (let b = -4; b <= 4; b++) {
        const x = c0[0] + a * P.Ap[0] + b * P.Bp[0], y = c0[1] + a * P.Ap[1] + b * P.Bp[1];
        if (x < v.x0 - r || x > v.x1 + r || y < v.y0 - r || y > v.y1 + r) continue;
        ctx.beginPath();
        for (const rr of radii) { ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, 2 * Math.PI); }
        ctx.lineWidth = Math.max(0.07, 5 / this.scale); ctx.strokeStyle = BODY; ctx.stroke();
        ctx.lineWidth = Math.max(0.035, 2.6 / this.scale); ctx.strokeStyle = "#f5c518"; ctx.stroke();
      }
    ctx.restore();
  }

  // the transform from plane coordinates to this canvas's pixels (the flat view's layout)
  planeToCanvas() {
    const { canvas } = this, o = this.origin, dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1, s = this.scale * dpr; // (a canvas off the page: 1)
    return [s, 0, 0, s, (this.ox - o.x) * dpr, (this.oy - o.y) * dpr];
  }
}

// The pointer's copies' shapes, in a 24-unit box, filled white and outlined black like the
// system's cursors, each with its hot spot (where the pointer is). The arrow is one outline;
// a hand is a palm (a rounded box) and fingers (capsules: [x1, y1, x2, y2, width]), drawn all
// outlined, then all filled, so the outline goes round the whole hand.
const HANDS = {
  arrow: { arrow: "M0 0V17L4.2 13L7 19.5L9.6 18.4L6.9 12.2H12.5Z", hot: [0, 0] },
  // open: four fingers up, the thumb out to the side
  grab: { palm: [6, 10.5, 13, 11, 4.5], fingers: [[7.9, 5, 7.9, 12, 3.4], [11.4, 3.2, 11.4, 12, 3.4], [14.9, 4, 14.9, 12, 3.4], [17.9, 6.6, 17.9, 13, 3]], thumb: [7.5, 16, 3.2, 11.5, 3.4], hot: [12, 12] },
  // closed: the fingers curled into knuckles over the palm
  grabbing: { palm: [5.5, 10, 14, 10.5, 4.5], fingers: [[7.9, 9.2, 7.9, 11, 3.4], [11.4, 8.6, 11.4, 11, 3.4], [14.9, 8.8, 14.9, 11, 3.4], [17.9, 9.6, 17.9, 11.5, 3]], thumb: [7.5, 15.5, 4.5, 13.5, 3.4], hot: [12, 13] },
  // pointing: the index finger up, the others curled
  pointer: { palm: [6.5, 11, 13, 10.5, 4.5], fingers: [[8.6, 1.7, 8.6, 12, 3.4], [12, 10, 12, 12, 3.4], [15.3, 10.2, 15.3, 12, 3.4], [18.2, 10.8, 18.2, 12.5, 3]], thumb: [8, 16.5, 4, 13.5, 3.4], hot: [8.6, 0.3] },
};
// a shape's whole silhouette (outline and all) in white, k canvas px per unit, made once per
// shape and size: one layer, so the "difference" blend inverts each pixel once
const MASK_PAD = 2; // (units around the 24-unit box, for the outline)
const masks = new Map();
function handMask(h, k) {
  const id = Object.keys(HANDS).find((n) => HANDS[n] === h) + ":" + k.toFixed(3);
  if (!masks.has(id)) {
    const c = document.createElement("canvas"), side = Math.ceil((24 + 2 * MASK_PAD) * k);
    c.width = c.height = side;
    const cx = c.getContext("2d");
    cx.scale(k, k); cx.translate(MASK_PAD, MASK_PAD);
    drawHand(cx, h);
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.globalCompositeOperation = "source-in";
    cx.fillStyle = "#fff";
    cx.fillRect(0, 0, side, side);
    masks.set(id, c);
  }
  return masks.get(id);
}
// draw one, in the current transform (its 24-unit box at the origin)
function drawHand(ctx, h) {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (h.arrow) {
    const p = (h.path ??= new Path2D(h.arrow));
    ctx.fillStyle = "#fff"; ctx.fill(p);
    ctx.lineWidth = 1.4; ctx.strokeStyle = "#000"; ctx.stroke(p);
    return;
  }
  const [x, y, w, hh, r] = h.palm, caps = [...h.fingers, h.thumb], O = 1.4; // (the outline's width)
  const palm = () => { ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); };
  const cap = ([x1, y1, x2, y2]) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); };
  ctx.strokeStyle = ctx.fillStyle = "#000";
  palm(); ctx.lineWidth = 2 * O; ctx.fill(); ctx.stroke();
  for (const c of caps) { cap(c); ctx.lineWidth = c[4] + 2 * O; ctx.stroke(); }
  ctx.strokeStyle = ctx.fillStyle = "#fff";
  palm(); ctx.fill();
  for (const c of caps) { cap(c); ctx.lineWidth = c[4]; ctx.stroke(); }
}

// ---- textures, fixed to the screen ----
// The 3D puzzles' ink patterns (index.html's INK_GLSL), as canvas patterns: the same shapes
// at the same TEXTURE_PX per period, black over light colors and white over dark ones, laid
// from the canvas's corner. Each pattern's tile is a whole number of its repeats (a wavy line
// and the honeycomb repeat at odd lengths, so theirs is stretched a hair to fit).
const TEXTURE_PX = 8;
const REPEAT = [null, [1, 1], [1, 1], [1, 1], [4, 4], [(2 * Math.PI) / 1.6, 1.25], [1.4, 1.4 * Math.sqrt(3)]]; // (in periods)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cover = (d, hw, w) => 1 - smooth(hw - 0.5 * w, hw + 0.5 * w, d);
const fract = (x) => x - Math.floor(x);
const line = (x, hw, w) => cover(Math.abs(fract(x + 0.5) - 0.5), hw, w);
const modp = (a, n) => a - n * Math.floor(a / n);
// how much ink texture t puts at p (in periods), w a pixel's width
function ink(t, [x, y], w) {
  if (t === 1) return line(y, 0.16, w);
  if (t === 2) return Math.max(line(x, 0.09, w), line(y, 0.09, w));
  if (t === 3) return cover(Math.hypot(fract(x) - 0.5, fract(y) - 0.5), 0.25, w);
  if (t === 4) return modp(Math.floor(x * 0.5) + Math.floor(y * 0.5), 2);
  if (t === 5) return line(y * 0.8 + 0.3 * Math.sin(x * 1.6), 0.13, w * 1.2);
  if (t === 6) {
    const r = [1.4, 1.4 * Math.sqrt(3)], h = [r[0] / 2, r[1] / 2];
    const ga = [modp(x, r[0]) - h[0], modp(y, r[1]) - h[1]], gb = [modp(x - h[0], r[0]) - h[0], modp(y - h[1], r[1]) - h[1]];
    const g = (ga[0] ** 2 + ga[1] ** 2 < gb[0] ** 2 + gb[1] ** 2 ? ga : gb).map(Math.abs);
    return cover(0.7 - Math.max(g[0], 0.5 * g[0] + 0.8660254 * g[1]), 0.07, w);
  }
  return 0;
}
// a color's lightness as the shader sees it (linear light)
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const inkPatterns = new WeakMap(); // a context → its patterns, by texture, ink and pixel ratio
function inkPattern(ctx, t, color, dpr) {
  if (!inkPatterns.has(ctx)) inkPatterns.set(ctx, new Map());
  const dark = luminance(color) > 0.12, key = `${t}:${dark}:${dpr}`, cache = inkPatterns.get(ctx);
  if (!cache.has(key)) {
    const per = TEXTURE_PX * dpr, [rx, ry] = REPEAT[t], W = Math.max(1, Math.round(rx * per)), H = Math.max(1, Math.round(ry * per));
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const cx = c.getContext("2d"), img = cx.createImageData(W, H);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const a = ink(t, [((i + 0.5) * rx) / W, ((j + 0.5) * ry) / H], 1 / per), k = (j * W + i) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = dark ? 0 : 255;
        img.data[k + 3] = Math.round(255 * (dark ? 0.34 : 0.24) * a);
      }
    cx.putImageData(img, 0, 0);
    cache.set(key, ctx.createPattern(c, "repeat"));
  }
  return cache.get(key);
}

// a piece outline (tiles.mjs's outline: loops of arcs) as a path, made once per outline; fill
// and clip it "evenodd", so a ring's inner circle is a hole
const paths = new WeakMap();
function outlinePath(loops) {
  let p = paths.get(loops);
  if (p) return p;
  p = new Path2D();
  for (const loop of loops) {
    loop.forEach(({ c, r, a0, a1 }, j) => {
      if (!j) p.moveTo(c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0));
      p.arc(c[0], c[1], r, a0, a1, a1 < a0);
    });
    p.closePath();
  }
  paths.set(loops, p);
  return p;
}

// ---- hit testing in plane coordinates (the 3D view uses these too) ----
// the circle whose line passes nearest p, within tol: { axis, layer (the layer just inside
// that circle), center (plane, the copy nearest p) }
export function circleNear(P, p, tol) {
  let best = null;
  P.axes.forEach((ax, axis) => {
    const n = nearestCopy(P, ax.center, p), d0 = Math.sqrt(n.dd);
    ax.radii.forEach((r, layer) => {
      const d = Math.abs(d0 - r);
      if (d < tol && (!best || d < best.d)) best = { axis, layer, center: n.q, d };
    });
  });
  return best;
}
// the turning point whose middle p is on (well inside its first circle: the part a click
// turns), or null
export function axisNear(P, p) { const hit = axisHit(P, p); return hit ? hit.axis : null; }
// the same, with how far p is from it: { axis, d }, or null
export function axisHit(P, p) {
  let best = null;
  P.axes.forEach((ax, axis) => {
    const d = Math.sqrt(nearestCopy(P, ax.center, p).dd), zone = Math.min(0.25, 0.55 * ax.radii[0]);
    if (d < zone && (!best || d < best.d)) best = { axis, d };
  });
  return best;
}
// What a press at p takes: the circle whose line it's by (within tol), to drag, or the turning
// point whose middle it's on, to turn; where both are near, as round a corner with other circles'
// lines close by, whichever is nearer. { circle } or { middle } (an axis), or {}.
export function pressAt(P, p, tol) {
  const c = circleNear(P, p, tol), m = axisHit(P, p);
  if (c && (!m || c.d <= m.d)) return { circle: c };
  return m ? { middle: m.axis } : {};
}
export const tileNear = axisNear;
// the piece under p (state: where everything is now), or null; ctx: any 2D context, for
// testing a point against a piece's outline
export function pieceNear(P, state, p, ctx) {
  for (let i = 0; i < P.n; i++) {
    const pc = P.pieces[i], { k, t, anchor } = piecePose(P, state, i), n = nearestCopy(P, p, anchor);
    if (Math.sqrt(n.dd) > pc.extent + 0.02) continue;
    // back to its home: undo its turn and shift, then into the cell at the origin
    const T = P.toPlane(t), d = [n.q[0] - T[0], n.q[1] - T[1]], a = -k * P.step, c = Math.cos(a), s = Math.sin(a);
    const h = [c * d[0] - s * d[1] - pc.offset[0], s * d[0] + c * d[1] - pc.offset[1]];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const inside = ctx.isPointInPath(outlinePath(pc.outline), h[0], h[1], "evenodd");
    ctx.restore();
    if (inside) return i;
  }
  return null;
}
