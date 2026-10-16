// How many pieces each kind of puzzle builds before the page bogs down. Past these, a build stops
// as soon as it knows (TooManyPieces), so a design that would take seconds a frame costs no more
// to turn down than one that fits; the page asks before building it anyway. Measured (October
// 2026) as where turning starts to stutter: a solid's or a ball's pieces are meshes drawn every
// frame (a ball's curved ones cost most), a torus's and a hyperbolic surface's are flat outlines,
// but a hyperbolic surface draws each piece once for every copy of it in view.
export const PIECE_LIMITS = { solid: 3000, sphere: 2500, tiles: 4000, hyper: 2500 };

export class TooManyPieces extends Error {
  constructor(count, limit) {
    super(`more than ${limit} pieces`);
    this.count = count; // (at least this many: the build stopped once it passed the limit)
    this.limit = limit;
  }
}
// (no limit given: no limit)
export function checkPieces(count, limit) {
  if (limit !== undefined && count > limit) throw new TooManyPieces(count, limit);
}
