// Where a truncation makes a face regular: the depths at which some face's sides all come
// out the same length (the soccer ball's hexagons, a truncated square's octagons). Shared by
// the solids (puzzle.mjs) and the tilings (tiles.mjs).

const dist = (a, b) => Math.sqrt(a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0));

// How far a polygon is from having equal sides: (longest − shortest) / longest, over its sides
// with straight runs joined (a corner of 180° isn't one). verts: points of any dimension.
export function unevenness(verts) {
  const n = verts.length, keep = [];
  for (let i = 0; i < n; i++) {
    const a = verts[(i - 1 + n) % n], b = verts[i], c = verts[(i + 1) % n];
    const ab = dist(a, b), bc = dist(b, c), ac = dist(a, c);
    if (ab > 1e-9 && bc > 1e-9 && ab + bc - ac > 1e-9 * (ab + bc)) keep.push(b); // (a real corner)
  }
  if (keep.length < 3) return Infinity;
  const sides = keep.map((v, i) => dist(v, keep[(i + 1) % keep.length]));
  return (Math.max(...sides) - Math.min(...sides)) / Math.max(...sides);
}

// The outline of convex polygons that meet along whole sides (a face made of parts from
// several tiles): the sides only one of them has, chained into a loop. 2D points.
export function unionOutline(polys) {
  // (points within 1e-9 are one, each numbered once: rounding them to a key instead, two
  // copies of one point a hair apart can round apart)
  const pts = [], grid = new Map(), cell = 1e-9;
  const k = (p) => {
    const gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const i of grid.get(`${gx + dx},${gy + dy}`) || []) if (Math.abs(pts[i][0] - p[0]) < cell && Math.abs(pts[i][1] - p[1]) < cell) return i;
    pts.push(p);
    if (!grid.has(`${gx},${gy}`)) grid.set(`${gx},${gy}`, []);
    grid.get(`${gx},${gy}`).push(pts.length - 1);
    return pts.length - 1;
  };
  const sides = new Map();
  for (const poly of polys) poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if (k(a) === k(b)) return;
    const back = `${k(b)}>${k(a)}`;
    if (sides.has(back)) sides.delete(back);
    else sides.set(`${k(a)}>${k(b)}`, [a, b]);
  });
  const next = new Map([...sides.values()].map(([a, b]) => [k(a), b]));
  const first = [...sides.values()][0];
  if (!first) return [];
  const loop = [first[0]];
  for (let p = first[1]; k(p) !== k(first[0]) && loop.length <= sides.size; p = next.get(k(p))) {
    loop.push(p);
    if (!next.has(k(p))) return [];
  }
  return loop;
}

// The depths in [lo, hi] where a face turns regular. facesAt(f): the faces at depth f, as a Map
// from a name that stays the same across depths to the face's vertices. Scans, then narrows
// down each dip in a face's unevenness to where it reaches 0. A face that's regular all along
// (a cube's squares under a corner cut) isn't a dip.
export function regularDepths(build, lo, hi, steps = 120) {
  // (faces alike go down the same search, so each depth is built once)
  const memo = new Map(), facesAt = (f) => { if (!memo.has(f)) memo.set(f, build(f)); return memo.get(f); };
  const fs = Array.from({ length: steps + 1 }, (_, i) => lo + ((hi - lo) * i) / steps);
  const scan = fs.map((f) => { const m = new Map(); for (const [name, verts] of facesAt(f)) m.set(name, unevenness(verts)); return m; });
  const at = (f, name) => { const v = facesAt(f).get(name); return v ? unevenness(v) : Infinity; };
  const out = [];
  for (let i = 1; i < steps; i++)
    for (const [name, u] of scan[i]) {
      const a = scan[i - 1].get(name) ?? Infinity, b = scan[i + 1].get(name) ?? Infinity;
      // (rising on both sides: a face that turns up regular and stays so has no dip)
      if (!(u < a - 1e-9 && u < b - 1e-9 && u < 0.1) || !Number.isFinite(a + b)) continue;
      // golden-section search for the bottom of the dip
      let x0 = fs[i - 1], x1 = fs[i + 1];
      const g = (Math.sqrt(5) - 1) / 2;
      let c = x1 - g * (x1 - x0), d = x0 + g * (x1 - x0), uc = at(c, name), ud = at(d, name);
      for (let s = 0; s < 45; s++) {
        if (uc < ud) { x1 = d; d = c; ud = uc; c = x1 - g * (x1 - x0); uc = at(c, name); }
        else { x0 = c; c = d; uc = ud; d = x0 + g * (x1 - x0); ud = at(d, name); }
      }
      const f = (x0 + x1) / 2;
      if (at(f, name) < 1e-5 && !out.some((o) => Math.abs(o - f) < 1e-6)) out.push(f);
    }
  return out.sort((x, y) => x - y);
}
