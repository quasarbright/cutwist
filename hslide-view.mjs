// Drawing and hit-testing for the hyperbolic sliding squares (hslide.mjs) on a 2D canvas: the
// surface unrolled into the Poincaré disk, as the hyperbolic turning puzzles' (HyperView: the same
// disk, panning and list of visible squares), turned 45° so the middle square sits square to the
// screen.
//
// Every visible square shows its piece: a picture (the color wheel, or one of yours) painted across
// the fundamental domain, so the piece shows the scrap of it that's at its home. A square's scrap
// is bent by the disk's map, so it's drawn by WebGL (offscreen, then onto the canvas): each square a
// small mesh, its texture each piece's scrap from an atlas (one cell per piece, its home square
// sampled from the picture once). A row sliding moves its squares along the row, stretched to fit
// it (hslide.mjs's slidePoint). The squares' outlines, the domain's edge and the labels (each
// piece's home: ring · angle, turned as the piece is) are drawn on the canvas on top.
import { HyperView } from "./hyper-view.mjs";
import { mobius as Mb } from "./hyper.mjs";
import { VIEW_TURN, domainFrame, slidePoint } from "./hslide.mjs";

const BODY = "#0a0b0e";
const abs = (z) => Math.hypot(z[0], z[1]);
const turnBy = (z, t) => [z[0] * Math.cos(t) - z[1] * Math.sin(t), z[0] * Math.sin(t) + z[1] * Math.cos(t)];

// A point of a square, from (s, t) in [0, 1]²: straight across the square in the Klein model, where
// its edges are straight (so (s, t) on an edge of the unit square is on the square's edge), back to
// the Poincaré disk. G: the square's geometry (corners in order).
const kleinCorners = new WeakMap();
function squarePoint(G, s, t) {
  if (!kleinCorners.has(G)) kleinCorners.set(G, G.corners.map(([x, y]) => { const k = 2 / (1 + x * x + y * y); return [x * k, y * k]; }));
  const [a, b, c, d] = kleinCorners.get(G);
  const kx = (1 - s) * (1 - t) * a[0] + s * (1 - t) * b[0] + s * t * c[0] + (1 - s) * t * d[0];
  const ky = (1 - s) * (1 - t) * a[1] + s * (1 - t) * b[1] + s * t * c[1] + (1 - s) * t * d[1];
  const q = 1 / (1 + Math.sqrt(Math.max(0, 1 - kx * kx - ky * ky)));
  return [kx * q, ky * q];
}
// a grid of a square's points, res × res cells: { pts (in the square's frame), st }
const grids = new Map();
function gridOf(G, res) {
  const key = `${G.M},${res}`;
  if (!grids.has(key)) {
    const pts = [], st = [], idx = [];
    for (let j = 0; j <= res; j++) for (let i = 0; i <= res; i++) { pts.push(squarePoint(G, i / res, j / res)); st.push([i / res, j / res]); }
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) { const k = j * (res + 1) + i; idx.push(k, k + 1, k + res + 2, k, k + res + 2, k + res + 1); }
    grids.set(key, { pts, st, idx });
  }
  return grids.get(key);
}

// The default picture: a color wheel, hue by direction (0° red, to the right), light in the middle
// and darker outward. p: a point on the turned view; R: how far the domain reaches.
function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
export const wheelColor = (p, R) => hsl((((Math.atan2(p[1], p[0]) * 180) / Math.PI) + 360) % 360, 0.85, 0.78 - 0.4 * Math.min(1, abs(p) / R));

const VS = `#version 300 es
in vec2 aPos; in vec2 aUv; uniform vec2 uSize; out vec2 vUv;
void main() { vUv = aUv; gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; uniform sampler2D uTex; in vec2 vUv; out vec4 color;
void main() { color = texture(uTex, vUv); }`;

export class HSlideView extends HyperView {
  constructor(canvas) {
    super(canvas);
    this.gl = null; // (made the first time it draws)
    this.atlas = null; // { key, cols, C, size }
    this.drawn = ""; // what's on the canvas (skip drawing it again)
  }
  layout(P, safe) {
    super.layout(P, safe);
    // (a new surface starts turned: the middle square square to the screen)
    if (this.start.m === Mb.I) { this.start = { m: Mb.rot(VIEW_TURN), e: this.start.e }; this.visible = null; }
  }
  recenter() { this.start = { m: Mb.rot(VIEW_TURN), e: 0 }; this.visible = null; }

  // ---- hit testing ----
  // the square under a point (CSS px): its dart on screen, { m, e }, or null off the disk
  squareAt(px, py) {
    const z = this.toDisk(px, py);
    if (abs(z) >= 0.999) return null;
    let best = null, bd = Infinity;
    for (const d of this.listVisible().tiles) {
      const c = Mb.apply(d.m, [0, 0]), dd = abs([z[0] - c[0], z[1] - c[1]]) / (1 - c[0] * c[0] - c[1] * c[1]); // (≈ distance, fine for picking the nearest middle)
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  // The two rows through the square at a dart d, as they run on screen there: [{ axis (the row),
  // dir (unit, CSS px: the way +1 slides), step (px from one square's middle to the next's) }]
  rowsAt(d) {
    const { P } = this, out = [];
    let x = d.e, m = d.m;
    for (let j = 0; j < 4; j++, x = P.H.right[0][x], m = Mb.mul(m, P.G.A)) {
      if (P.fwd[x] !== 1) continue;
      const c = this.toScreen(Mb.apply(m, [0, 0])), f = this.toScreen(Mb.apply(Mb.mul(m, P.Tg), [0, 0])), b = this.toScreen(Mb.apply(Mb.mul(m, Mb.inv(P.Tg)), [0, 0]));
      const dx = f.x - b.x, dy = f.y - b.y, len = Math.hypot(dx, dy) || 1;
      out.push({ axis: P.rowOf[x], dir: [dx / len, dy / len], step: len / 2, center: c });
    }
    return out;
  }

  // ---- the atlas: each piece's home square, sampled from the picture once ----
  // picture: { img } (painted across the domain, covering it) or null (the color wheel)
  makeAtlas(picture) {
    const { P } = this, key = `${P.surface.group}:${P.surface.tile}:${P.M}:${P.spec.surface}:${picture ? picture.id : "wheel"}`;
    if (this.atlas && this.atlas.key === key) return this.atlas;
    const cols = Math.ceil(Math.sqrt(P.n)), C = Math.max(24, Math.min(96, Math.floor(4096 / cols))), size = cols * C;
    const data = new Uint8ClampedArray(size * size * 4), R = P.domainRadius;
    // (the picture's pixels, and how it lies over the domain: covering its box, cropped to fit)
    let pix = null, pw = 0, ph = 0, upp = 0;
    if (picture) {
      const img = picture.img, k = Math.min(1, 1024 / Math.max(img.width, img.height));
      pw = Math.max(1, Math.round(img.width * k)); ph = Math.max(1, Math.round(img.height * k));
      const cv = document.createElement("canvas"); cv.width = pw; cv.height = ph;
      const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, pw, ph); pix = cx.getImageData(0, 0, pw, ph).data;
      upp = Math.max((2 * R) / pw, (2 * R) / ph); // (disk units per picture pixel: the picture covers the domain's box, cropped to fit)
    }
    const paint = (p) => {
      if (!pix) return wheelColor(p, R);
      const x = Math.round(pw / 2 + p[0] / upp - 0.5), y = Math.round(ph / 2 - p[1] / upp - 0.5);
      if (x < 0 || y < 0 || x >= pw || y >= ph) return [20, 22, 28];
      const i = 4 * (y * pw + x); return [pix[i], pix[i + 1], pix[i + 2]];
    };
    const e = 1 / C; // (a texel's margin round each cell, sampled just past the square: no seams)
    for (let i = 0; i < P.n; i++) {
      const F = domainFrame(P, P.reps[i]), x0 = (i % cols) * C, y0 = Math.floor(i / cols) * C;
      for (let py = 0; py < C; py++) for (let px = 0; px < C; px++) {
        const s = ((px + 0.5) / C - e) / (1 - 2 * e), t = ((py + 0.5) / C - e) / (1 - 2 * e);
        const c = paint(turnBy(Mb.apply(F, squarePoint(P.G, s, t)), VIEW_TURN)), o = 4 * ((y0 + py) * size + x0 + px);
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
    this.atlas = { key, cols, C, size, e, data, uploaded: false };
    return this.atlas;
  }
  // a piece's (s, t) in its atlas cell, as texture coordinates
  uvOf(i, s, t) {
    const { cols, C, size, e } = this.atlas, x0 = (i % cols) * C, y0 = Math.floor(i / cols) * C;
    return [(x0 + (e + s * (1 - 2 * e)) * C) / size, (y0 + (e + t * (1 - 2 * e)) * C) / size];
  }

  // ---- WebGL, offscreen ----
  ensureGL() {
    if (this.gl !== null) return this.gl;
    const cv = document.createElement("canvas"), gl = cv.getContext("webgl2", { antialias: true, premultipliedAlpha: false });
    if (!gl) { this.gl = false; console.warn("no WebGL 2: the sliding squares can't be drawn"); return false; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    this.glCanvas = cv;
    this.glp = { prog, aPos: gl.getAttribLocation(prog, "aPos"), aUv: gl.getAttribLocation(prog, "aUv"), uSize: gl.getUniformLocation(prog, "uSize"), uTex: gl.getUniformLocation(prog, "uTex"),
      pos: gl.createBuffer(), uv: gl.createBuffer(), idx: gl.createBuffer(), tex: gl.createTexture() };
    this.gl = gl;
    return gl;
  }
  dispose() { if (this.gl) { this.gl.getExtension("WEBGL_lose_context")?.loseContext(); this.gl = null; } }

  // ---- drawing ----
  // state: each piece's position. slide: the row moving, { axis, theta (steps) }, or null.
  // look: { picture (or null: the color wheel), labels }
  draw(state, slide, look) {
    const { P, ctx, canvas } = this, o = this.origin, dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
    const lit = look.lit && look.lit.size ? look.lit : null;
    const key = [this.viewKey(), canvas.width, canvas.height, o.x, o.y, state.join(","), slide ? `${slide.axis}:${slide.theta}` : "", look.picture ? look.picture.id : "", look.labels ? 1 : 0,
      lit ? `${[...lit].join(",")}:${(look.litAlpha ?? 0.34).toFixed(3)}` : ""].join("|");
    if (key === this.drawn) return;
    this.drawn = key;
    const W = canvas.width / dpr, Hh = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    ctx.fillStyle = BODY;
    ctx.beginPath(); ctx.arc(this.cx - o.x, this.cy - o.y, this.R, 0, 2 * Math.PI); ctx.fill();
    const tiles = this.listVisible().tiles, H = P.H, row = slide ? P.rows[slide.axis] : null;
    // which piece is on each square
    const pieceOn = new Int32Array(P.n);
    for (let i = 0; i < P.n; i++) pieceOn[P.face[state[i]]] = i;
    // each visible square: its piece's frame there (and, sliding, the row's frame to slide it in)
    const shown = [], keys = new Set(), centerKey = (m) => Mb.apply(m, [0, 0]).map((v) => Math.round(v * 1e7)).join(",");
    const add = (d, min) => {
      const c = Mb.apply(d.m, [0, 0]), size = abs([Mb.apply(d.m, P.G.corners[0])[0] - c[0], Mb.apply(d.m, P.G.corners[0])[1] - c[1]]) * this.R;
      if (size < min) return;
      keys.add(centerKey(d.m));
      const f = P.face[d.e], i = pieceOn[f], g = state[i];
      let x = d.e, m = d.m;
      for (let j = 0; j < 4 && x !== g; j++) { x = H.right[0][x]; m = Mb.mul(m, P.G.A); }
      let warp = null, along = null;
      if (row && row.inRow[f]) {
        let y = d.e, ma = d.m;
        for (let j = 0; j < 4 && !(P.rowOf[y] === slide.axis && P.fwd[y] === 1); j++) { y = H.right[0][y]; ma = Mb.mul(ma, P.G.A); }
        const back = Mb.inv(ma), t = slide.theta;
        warp = (z) => Mb.apply(ma, slidePoint(P, Mb.apply(back, z), t));
        along = { y, ma };
      }
      shown.push({ d, m, i, size, warp, along });
    };
    for (const d of tiles) add(d, 0.6);
    // (sliding: the row's squares just past what's listed, as many as the slide reaches, either way:
    // they slide into view, and would leave holes, then pop in when it lands)
    if (row) {
      const reach = Math.ceil(Math.abs(slide.theta)) + 1, Ti = Mb.inv(P.Tg);
      const back = (y) => H.right[0][H.rightInv[1][y]]; // (y·T⁻¹ = y·S⁻¹·R)
      for (const s of shown.filter((s) => s.along)) for (const dir of [1, -1]) {
        let { y, ma } = s.along;
        for (let k = 0; k < reach; k++) {
          y = dir > 0 ? H.right[1][H.right[0][H.right[0][H.right[0][y]]]] : back(y);
          ma = Mb.norm(Mb.mul(ma, dir > 0 ? P.Tg : Ti));
          if (!keys.has(centerKey(ma)) && abs(Mb.apply(ma, [0, 0])) < 0.9999) add({ m: ma, e: y }, 0.05);
        }
      }
    }
    // the pieces' pictures (WebGL, offscreen, then onto the canvas)
    const gl = this.ensureGL();
    if (gl) {
      const atlas = this.makeAtlas(look.picture), { glp } = this;
      const pos = [], uv = [], idx = [];
      for (const { m, i, size, warp } of shown) {
        // (a sliding square bends: a finer mesh, so its straight-segment edges keep to the row's edge)
        const res = warp ? Math.max(2, Math.min(28, Math.ceil(size / 6))) : Math.max(1, Math.min(10, Math.ceil(size / 16))), grid = gridOf(P.G, res), base = pos.length / 2;
        for (let k = 0; k < grid.pts.length; k++) {
          let z = Mb.apply(m, grid.pts[k]);
          if (warp) z = warp(z);
          pos.push(this.cx + z[0] * this.R - o.x, this.cy - z[1] * this.R - o.y);
          uv.push(...this.uvOf(i, grid.st[k][0], grid.st[k][1]));
        }
        for (const k of grid.idx) idx.push(base + k);
      }
      const cv = this.glCanvas;
      if (cv.width !== canvas.width || cv.height !== canvas.height) { cv.width = canvas.width; cv.height = canvas.height; }
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(glp.prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, glp.tex);
      if (!atlas.uploaded) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlas.size, atlas.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, atlas.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        atlas.uploaded = true;
      }
      gl.uniform1i(glp.uTex, 0);
      gl.uniform2f(glp.uSize, W, Hh);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.pos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(glp.aPos); gl.vertexAttribPointer(glp.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.uv); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(glp.aUv); gl.vertexAttribPointer(glp.aUv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glp.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cv, 0, 0); ctx.restore();
    }
    // the squares' outlines (sliding: carried along), then the domain's edge (where the squares are, not
    // the pieces: it stays put)
    const px = (z) => [this.cx + z[0] * this.R - o.x, this.cy - z[1] * this.R - o.y];
    ctx.lineJoin = "round";
    for (const { m, size, warp } of shown) {
      if (size < 3) continue;
      const step = size < 14 ? 12 : size < 50 ? 4 : 1;
      ctx.beginPath();
      for (let k = 0; k < P.G.poly.length; k += step) { let z = Mb.apply(m, P.G.poly[k]); if (warp) z = warp(z); const [x, y] = px(z); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
      ctx.lineWidth = Math.min(1.2, size / 30); ctx.strokeStyle = "rgba(10,11,14,.6)"; ctx.stroke();
    }
    // (lit: the pieces an algorithm would move, lightened)
    if (lit) {
      ctx.fillStyle = `rgba(255, 255, 255, ${look.litAlpha ?? 0.34})`;
      for (const { m, i, size, warp } of shown) {
        if (!lit.has(i) || size < 2) continue;
        ctx.beginPath();
        for (let k = 0; k < P.G.poly.length; k += size < 14 ? 12 : 4) { let z = Mb.apply(m, P.G.poly[k]); if (warp) z = warp(z); const [x, y] = px(z); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.closePath(); ctx.fill();
      }
    }
    const edgeK = P.G.edge;
    ctx.strokeStyle = "rgba(255,255,255,.6)";
    for (const { d, size } of shown) {
      if (size < 4) continue;
      let x = d.e, m = d.m;
      for (let k = 0; k < 4; k++, x = H.right[0][x], m = Mb.mul(m, P.G.A)) {
        if (!P.boundary.has(x)) continue;
        ctx.beginPath();
        for (let j = 0; j <= 24; j++) { const p = j < 24 ? P.G.poly[edgeK * 24 + j] : P.G.corners[(edgeK + 1) % 4], [sx, sy] = px(Mb.apply(m, p)); if (j) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
        ctx.lineWidth = Math.min(1.8, size / 20); ctx.stroke();
      }
    }
    // labels: each piece's home (ring · angle), upright at home, turned as the piece is
    if (look.labels) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const { m, i, size, warp } of shown) {
        if (size < 26) continue;
        const f = P.face[P.reps[i]], text = P.ring[f] === 0 ? "0" : `${P.ring[f]} · ${P.degrees[f]}°`;
        let a = Mb.apply(m, [0, 0]), b = Mb.apply(m, this.labelUp(i));
        if (warp) { a = warp(a); b = warp(b); }
        const [ax, ay] = px(a), [bx, by] = px(b), fs = Math.max(8, Math.min(18, size * 0.27));
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.atan2(by - ay, bx - ax) + Math.PI / 2);
        ctx.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`;
        ctx.lineWidth = fs * 0.2; ctx.strokeStyle = BODY; ctx.strokeText(text, 0, 0);
        ctx.fillStyle = "#fff"; ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
  }
  // a point a little "up" from piece i's middle (up on the picture, at home), in its own frame
  labelUp(i) {
    const { P } = this;
    this.ups ??= new Map();
    if (this.ups.get(P)?.[i]) return this.ups.get(P)[i];
    if (!this.ups.has(P)) this.ups.set(P, []);
    const F = domainFrame(P, P.reps[i]), c = Mb.apply(F, [0, 0]), up = turnBy([0, 1], -VIEW_TURN), eps = 1e-4 * (1 - c[0] * c[0] - c[1] * c[1]);
    const w = Mb.apply(Mb.inv(F), [c[0] + up[0] * eps, c[1] + up[1] * eps]), r = abs(w), out = [(w[0] / r) * 0.05, (w[1] / r) * 0.05];
    this.ups.get(P)[i] = out;
    return out;
  }
  // the solved puzzle, filling this (small) canvas: the corner card
  drawSolvedCard(P, look, top = 22) {
    const { canvas } = this, w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height, pad = 4;
    this.minPx = 4;
    this.layout(P, { left: pad, top, right: w - pad, bottom: h - pad });
    this.origin = { x: 0, y: 0 };
    this.draw(P.reps, null, { picture: look.picture, labels: false });
  }
}
