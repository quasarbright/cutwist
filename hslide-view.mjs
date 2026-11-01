// Drawing and hit-testing for the hyperbolic sliding squares (hslide.mjs) on a 2D canvas: the
// surface unrolled into the Poincaré disk, as the hyperbolic turning puzzles' (HyperView: the same
// disk, panning and list of visible squares), turned 45° so the middle square sits square to the
// screen.
//
// Every visible square shows its piece: a picture (the color wheel, or one of yours) painted across
// the fundamental domain, so the piece shows the scrap of it that's at its home. A square's scrap
// is bent by the disk's map, so it's drawn by WebGL (offscreen, then onto the canvas): each square a
// small mesh whose points carry where they are on the picture, painted per pixel from the picture
// itself (or the wheel, worked out per pixel). A row sliding moves its squares along the row, stretched to fit
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
// A grid of a square's points, res × res cells: { pts (in the square's frame), st, out }. A ring of
// cells around it reaches `over` past the square's edges (in (s, t)): a mesh's straight edges cut
// inside the square's curved ones, most near the rim where they curve hard, and the background would
// show between neighbors. The ring's points are `out` (1): drawn behind every square's inside, so a
// ring only fills what no square does, and never covers a neighbor (or, stretched by a slide, the
// row beside it). (A pixel or two: overOf.)
const grids = new Map();
const overOf = (size) => Math.round(Math.min(0.04, 1.4 / Math.max(1, size)) * 400) / 400; // (size: middle to corner, px)
function gridOf(G, res, over = 0) {
  const key = `${G.M},${res},${over}`;
  if (!grids.has(key)) {
    const pts = [], st = [], out = [], idx = [], n = res + 2;
    const at = (k) => (k === 0 ? -over : k === n ? 1 + over : (k - 1) / res);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { pts.push(squarePoint(G, at(i), at(j))); st.push([at(i), at(j)]); out.push(i === 0 || j === 0 || i === n || j === n ? 1 : 0); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * (n + 1) + i; idx.push(k, k + 1, k + n + 2, k, k + n + 2, k + n + 1); }
    grids.set(key, { key, pts, st, out, idx });
  }
  return grids.get(key);
}

// The pieces are painted per pixel by WebGL: each mesh point carries where it is on the picture (p, a
// point of the turned view of the domain at the piece's home), and the fragment shader paints that
// spot. The default picture is a color wheel: hue by direction (0° red, to the right), light in the
// middle and darker outward (uR: how far the domain reaches). A picture of yours covers the domain's
// box, cropped to fit (uScale: picture widths per disk unit), sampled from the picture at its own
// size (up to the GPU's limit), mipmapped for squares smaller than their scrap of it.
const VS = `#version 300 es
in vec2 aPos; in vec2 aP; in float aOut; uniform vec2 uSize; out vec2 vP;
void main() { vP = aP; gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, aOut - 1.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
uniform int uMode; uniform float uR; uniform vec2 uScale; uniform sampler2D uTex;
in vec2 vP; out vec4 color;
vec3 hsl(float h, float s, float l) {
  float a = s * min(l, 1.0 - l);
  vec3 k = mod(vec3(0.0, 8.0, 4.0) + h / 30.0, 12.0);
  return l - a * max(vec3(-1.0), min(min(k - 3.0, 9.0 - k), vec3(1.0)));
}
void main() {
  if (uMode == 0) {
    float h = mod(degrees(atan(vP.y, vP.x)) + 360.0, 360.0);
    color = vec4(hsl(h, 0.85, 0.78 - 0.4 * min(1.0, length(vP) / uR)), 1.0);
  } else {
    vec2 uv = vec2(0.5 + vP.x * uScale.x, 0.5 - vP.y * uScale.y);
    color = any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))) ? vec4(20.0, 22.0, 28.0, 255.0) / 255.0 : texture(uTex, uv);
  }
}`;

export class HSlideView extends HyperView {
  constructor(canvas) {
    super(canvas);
    this.gl = null; // (made the first time it draws)
    this.pic = null; // (the picture on the GPU: { id, w, h })
    this.drawn = ""; // what's on the canvas (skip drawing it again)
  }
  layout(P, safe) {
    // (squares down to a pixel and a half: smaller leaves the rim black. Each is a few triangles)
    if (this.minPx > 1.5 && !this.card) this.minPx = 1.5;
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

  // ---- where each piece's points are on the picture (a grid's points, at the piece's home, on the
  // turned view of the domain), worked out once per piece and grid ----
  homePoints(i, grid) {
    const { P } = this;
    if (this.homeFor !== P) { this.homeFor = P; this.homes = new Map(); this.frames = []; }
    const key = `${i}:${grid.key}`;
    if (!this.homes.has(key)) {
      const F = (this.frames[i] ??= domainFrame(P, P.reps[i]));
      this.homes.set(key, grid.pts.map((w) => turnBy(Mb.apply(F, w), VIEW_TURN)));
    }
    return this.homes.get(key);
  }
  // the picture on the GPU, at its own size (up to the GPU's limit): { id, w, h } or null
  pictureTexture(gl, picture) {
    if (!picture) return null;
    if (this.pic && this.pic.id === picture.id) return this.pic;
    const img = picture.img, max = gl.getParameter(gl.MAX_TEXTURE_SIZE), k = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * k)), h = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
    let src = img;
    if (k < 1) { src = document.createElement("canvas"); src.width = w; src.height = h; src.getContext("2d").drawImage(img, 0, 0, w, h); }
    gl.bindTexture(gl.TEXTURE_2D, this.glp.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension("EXT_texture_filter_anisotropic");
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.pic = { id: picture.id, w, h };
    return this.pic;
  }

  // ---- WebGL, offscreen ----
  ensureGL() {
    if (this.gl !== null) return this.gl;
    const cv = document.createElement("canvas"), gl = cv.getContext("webgl2", { antialias: true, depth: true, premultipliedAlpha: false });
    if (!gl) { this.gl = false; console.warn("no WebGL 2: the sliding squares can't be drawn"); return false; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    this.glCanvas = cv;
    const u = (n) => gl.getUniformLocation(prog, n);
    this.glp = { prog, aPos: gl.getAttribLocation(prog, "aPos"), aP: gl.getAttribLocation(prog, "aP"), aOut: gl.getAttribLocation(prog, "aOut"), uSize: u("uSize"), uTex: u("uTex"), uMode: u("uMode"), uR: u("uR"), uScale: u("uScale"),
      pos: gl.createBuffer(), p: gl.createBuffer(), out: gl.createBuffer(), idx: gl.createBuffer(), tex: gl.createTexture() };
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
    // (a square's size on screen: middle to corner, averaged over its four corners, so it's the same
    // whichever way a piece on it is turned; f: where a point of it is drawn)
    const sizeOf = (f, to = P.G.corners) => { const c = f([0, 0]); return (to.reduce((s, k) => { const q = f(k); return s + abs([q[0] - c[0], q[1] - c[1]]); }, 0) / 4) * this.R; };
    const add = (d, min) => {
      const size = sizeOf((z) => Mb.apply(d.m, z));
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
      // (a sliding square's size where it is now, not where it started: one sliding in from the rim
      // grows, and its mesh, outline and label go with what it looks like)
      const at = warp ? (z) => warp(Mb.apply(m, z)) : (z) => Mb.apply(m, z), now = warp ? sizeOf(at) : size;
      // (and middle to its edges' middles: half its width, which with many squares at a corner is far
      // less than to its corners)
      shown.push({ d, m, i, size: now, half: sizeOf(at, P.G.mids), rest: size, warp, along });
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
      const { glp } = this, pos = [], home = [], out = [], idx = [];
      for (const { m, i, size, warp } of shown) {
        // (fine enough that the mesh's straight edges keep to the square's curved ones: no background
        // showing through between neighbors; finer still for a sliding square, which bends)
        const res = Math.max(1, Math.min(32, Math.ceil(size / (warp ? 5 : 6)))), grid = gridOf(P.G, res, overOf(size)), base = pos.length / 2, at = this.homePoints(i, grid);
        for (let k = 0; k < grid.pts.length; k++) {
          let z = Mb.apply(m, grid.pts[k]);
          if (warp) z = warp(z);
          pos.push(this.cx + z[0] * this.R - o.x, this.cy - z[1] * this.R - o.y);
          home.push(at[k][0], at[k][1]);
          out.push(grid.out[k]);
        }
        for (const k of grid.idx) idx.push(base + k);
      }
      const cv = this.glCanvas;
      if (cv.width !== canvas.width || cv.height !== canvas.height) { cv.width = canvas.width; cv.height = canvas.height; }
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
      gl.useProgram(glp.prog);
      gl.activeTexture(gl.TEXTURE0);
      const pic = this.pictureTexture(gl, look.picture), R = P.domainRadius;
      gl.bindTexture(gl.TEXTURE_2D, glp.tex);
      gl.uniform1i(glp.uTex, 0);
      gl.uniform1i(glp.uMode, pic ? 1 : 0);
      gl.uniform1f(glp.uR, R);
      // (picture widths per disk unit: the picture covers the domain's box, 2R across, cropped to fit)
      if (pic) { const upp = Math.max((2 * R) / pic.w, (2 * R) / pic.h); gl.uniform2f(glp.uScale, 1 / (upp * pic.w), 1 / (upp * pic.h)); }
      gl.uniform2f(glp.uSize, W, Hh);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.pos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(glp.aPos); gl.vertexAttribPointer(glp.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.p); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(home), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(glp.aP); gl.vertexAttribPointer(glp.aP, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.out); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(glp.aOut); gl.vertexAttribPointer(glp.aOut, 1, gl.FLOAT, false, 0, 0);
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
    // (the domain's edge is where the squares are, so it's sized by them at rest: a piece sliding
    // over doesn't change it)
    for (const { d, rest: size } of shown) {
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
    // (as the sliding grids' labels: a part of the piece, sized with its square wherever it is, so it
    // grows and shrinks with it as it slides or the view moves; too small to read, it fades out)
    if (look.labels) {
      // Each part underlined when the piece has it right, as the sliding grids' labels are: the ring
      // when it's in its home ring, the angle when it's in its home direction (any ring); both, it's in
      // its home square (maybe turned). And as theirs, by the square it's drawn over: a sliding piece
      // across two squares is drawn in each, clipped to it, with that square's underlines, so they
      // change as it crosses the edge, not all at once when it lands.
      ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      const fwd = (y) => H.right[1][H.right[0][H.right[0][H.right[0][y]]]], bwd = (y) => H.right[0][H.rightInv[1][y]];
      const outline = (mm) => { ctx.beginPath(); P.G.poly.forEach((z, k) => { const [x, y] = px(Mb.apply(mm, z)); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); };
      const label = (i, here, a, b, fs) => {
        const f = P.face[P.reps[i]];
        const parts = P.ring[f] === 0 ? [{ text: "0", home: P.ring[here] === 0 }]
          : [{ text: String(P.ring[f]), home: P.ring[here] === P.ring[f] }, { text: "·", home: false }, { text: `${P.degrees[f]}°`, home: P.ring[here] > 0 && P.degrees[here] === P.degrees[f] }]; // (the middle has no direction)
        const [ax, ay] = px(a), [bx, by] = px(b);
        ctx.save(); ctx.globalAlpha = Math.min(1, (fs - 2.5) / 3.5);
        ctx.translate(ax, ay); ctx.rotate(Math.atan2(by - ay, bx - ax) + Math.PI / 2);
        ctx.font = `700 ${fs}px ui-monospace, "IBM Plex Mono", monospace`;
        ctx.lineWidth = fs * 0.2; ctx.strokeStyle = BODY; ctx.fillStyle = "#fff";
        const widths = parts.map((p) => ctx.measureText(p.text).width), xs = [];
        for (let k = 0, x = -widths.reduce((s, w) => s + w, 0) / 2; k < parts.length; x += widths[k], k++) xs.push(x);
        const bar = { dy: fs * 0.62, h: fs * 0.13 };
        // (outlines first, then fills, so one part's outline never covers another's letters)
        parts.forEach((p, k) => { ctx.strokeText(p.text, xs[k], 0); if (p.home) ctx.strokeRect(xs[k], bar.dy, widths[k], bar.h); });
        parts.forEach((p, k) => { ctx.fillText(p.text, xs[k], 0); if (p.home) ctx.fillRect(xs[k], bar.dy, widths[k], bar.h); });
        ctx.restore();
      };
      for (const { d, m, i, size, half, warp, along } of shown) {
        const f = P.face[P.reps[i]], len = P.ring[f] === 0 ? 1 : `${P.ring[f]}·${P.degrees[f]}°`.length;
        // (size: middle to corner; a long label spans most of the square's width, a short one is as
        // tall. But never wider than the square: a monospace letter is about 0.6 of the font size, so
        // at most ~80% of the width, 2·half)
        const fs = Math.min(size * Math.min(0.3, 1.9 / len), (2.6 * half) / len);
        if (fs < 2.5) continue;
        let a = Mb.apply(m, [0, 0]), b = Mb.apply(m, this.labelUp(i));
        if (!warp) { label(i, P.face[d.e], a, b, fs); continue; }
        a = warp(a); b = warp(b);
        // (sliding: the squares of the row it's over, at rest, from a step behind to two ahead)
        const k0 = Math.floor(slide.theta);
        let y = along.y, mk = along.ma;
        for (let k = 0; k < k0 - 1; k++) { y = fwd(y); mk = Mb.mul(mk, P.Tg); }
        for (let k = 0; k > k0 - 1; k--) { y = bwd(y); mk = Mb.mul(mk, Mb.inv(P.Tg)); }
        for (let k = k0 - 1; k <= k0 + 2; k++, y = fwd(y), mk = Mb.mul(mk, P.Tg)) {
          ctx.save(); outline(mk); ctx.clip();
          label(i, P.face[y], a, b, fs);
          ctx.restore();
        }
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
    this.card = true; this.minPx = 2;
    this.layout(P, { left: pad, top, right: w - pad, bottom: h - pad });
    this.origin = { x: 0, y: 0 };
    this.draw(P.reps, null, { picture: look.picture, labels: false });
  }
}
