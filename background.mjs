// The idle animation behind ?background: a sliding puzzle filling the whole screen, no
// controls. Each round picks a surface (torus, Klein bottle, projective plane), scrambles it
// out of sight, fades the scramble in over the last round's solved grid, slides it back to
// solved one move at a time, lingers, and starts over.
import { buildPlanar, solvedPlanarState, applyPlanarMove, inversePlanarMove, planarScrambleMoves } from "./planar.mjs";
import { PlanarView } from "./planar-view.mjs";

const TOPOLOGIES = ["torus", "klein", "rp2"];
const SHORT = 5, LONG_MAX = 12; // cells along the screen's short side, and at most along its long side
const FADE = 900, HOLD = 700, LINGER = 2000; // ms: the fade into a scramble, the scramble alone, the solved grid alone
const moveDur = (q) => 260 + 110 * Math.abs(q); // ms for a slide of q cells
const ease = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
const LOOK = { labels: false, textures: false, picture: null };

// a grid about the screen's shape: SHORT cells across its short side, as many along the long
// side as keep the cells near square (the cells stretch a little to fill the screen exactly)
function gridSize(w, h) {
  const long = Math.max(SHORT, Math.min(LONG_MAX, Math.round((SHORT * Math.max(w, h)) / Math.min(w, h))));
  return w >= h ? [long, SHORT] : [SHORT, long];
}

export function startBackground(canvas) {
  const view = new PlanarView(canvas), ctx = canvas.getContext("2d");
  // the last frame of the round before, faded out over the new scramble (at first, the page)
  const prev = document.createElement("canvas");
  let P, state, moves, i, phase, t;

  function fit() {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }

  function newRound() {
    prev.width = canvas.width; prev.height = canvas.height;
    const pc = prev.getContext("2d");
    if (P) pc.drawImage(canvas, 0, 0);
    else { pc.fillStyle = getComputedStyle(document.body).backgroundColor; pc.fillRect(0, 0, prev.width, prev.height); }
    const [W, H] = gridSize(innerWidth, innerHeight);
    const topology = TOPOLOGIES[Math.floor(Math.random() * TOPOLOGIES.length)];
    P = buildPlanar({ width: W, height: H, topology });
    state = solvedPlanarState(P);
    const scramble = planarScrambleMoves(P, 2 * (W + H));
    for (const m of scramble) applyPlanarMove(P, state, m);
    moves = scramble.reverse().map((m) => inversePlanarMove(P, m));
    i = 0; phase = "fade"; t = 0;
  }

  // advance by dt ms; the line sliding now, if any
  function step(dt) {
    t += dt;
    if (phase === "fade" && t >= FADE) { phase = "hold"; t -= FADE; }
    if (phase === "hold" && t >= HOLD) { phase = "solve"; t -= HOLD; }
    while (phase === "solve") {
      const m = moves[i];
      if (!m) { phase = "linger"; t = 0; break; }
      const dur = moveDur(m.q);
      if (t < dur) return { axis: m.axis, layer: m.layer, p: m.q * ease(t / dur) };
      applyPlanarMove(P, state, m);
      i++; t -= dur;
    }
    if (phase === "linger" && t >= LINGER) newRound();
    return null;
  }

  function draw(slide) {
    view.drawFill(P, state, slide, LOOK);
    if (phase === "fade") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1 - ease(Math.min(1, t / FADE));
      ctx.drawImage(prev, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
  }

  let last = null;
  function frame(now) {
    const dt = last === null ? 0 : Math.min(100, now - last); // (a hidden tab pauses, it doesn't jump)
    last = now;
    draw(step(dt));
    requestAnimationFrame(frame);
  }

  fit();
  addEventListener("resize", fit);
  newRound();
  requestAnimationFrame(frame);

  // for the browser tests
  window.cutwistBackground = {
    info: () => ({ W: P.W, H: P.H, topology: P.topology, phase, movesLeft: moves.length - i }),
  };
}
