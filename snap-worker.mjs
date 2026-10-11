// Checks a solid's snap candidates off the page's thread (see computeSnaps in index.html): each
// check builds the puzzle three times, which on a big truncated design takes a second or more.
import { isGoodSnap } from "./puzzle.mjs";

onmessage = (e) => {
  const { id, spec, target, f, maxPieces } = e.data;
  let ok = false;
  try { ok = isGoodSnap(spec, target, f, maxPieces); } catch { /* (a candidate that won't build isn't one) */ }
  postMessage({ id, ok });
};
