// Writes regular-maps/shapes/N-M-k.json: for each puzzle surface with holes (k: its index among the
// tiling's puzzle surfaces) of up to MAX_TILES tiles, its shape in space for the 3D view,
// hyper-surface.mjs's implicitShape: the pretzel's numbers, how finely its tiles are sampled, and
// where the vertices of its mesh (surfaceMesh, split twice) sit on the pretzel. Laying the tiles on
// takes up to minutes per surface, so it's done here once; the page reads the file when the 3D view
// is wanted (implicitSurface).
// Run: node data/add-shapes.mjs [N-M or N-M-k …] (just those; all by default)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildHyper, hyperSurfaces } from "../hyper.mjs";
import { surfaceMesh, meshDetail, implicitShape, implicitSurface, turnedOver, packShape, unpackShape } from "../hyper-surface.mjs";

// (past five holes the pretzel is a long ribbon of them; and some surfaces of three or more holes
// cutLayout doesn't lay out with nothing turned over, so they get no shape)
export const MAX_TILES = 64, MAX_GENUS = 5;

// One surface's shape: laid flat by its half turn if it has one (two holes: the plate comes out
// symmetric), else cut along loops round its handles (cutLayout); sampled more finely if that turns
// triangles over. Returns the file's contents, or throws.
export function shapeFor(P) {
  const tries = [];
  for (const k of [0, 2, 4].map((d) => meshDetail(P) + d)) for (const layout of P.surface.genus === 2 ? ["plate", "cut"] : ["cut"]) {
    try {
      // (laid flat with some turned over, the tiles mostly come right on the pretzel, where the rims
      // can slide: unturning them again and again from the start; only kept with none turned over)
      const mesh = surfaceMesh(P, k, k), made = implicitShape(P, mesh, { layout, allowTurned: true, restarts: 4 });
      if (!made.at.every(Number.isFinite)) throw new Error("lost its way (not a number)");
      const kept = packShape(made), drawn = implicitSurface(mesh, unpackShape(kept)), turned = turnedOver(drawn, kept.shape);
      if (drawn.tooStretched) throw new Error("stretched too thin to draw smooth");
      if (turned) throw new Error(`${turned} triangles turned over`);
      return { rings: k, perEdge: k, layout, ...kept };
    } catch (e) { tries.push(`${layout} at ${k}: ${e.message}`); }
  }
  throw new Error(tries.join("; "));
}

export function addShapes(only = [], dir = new URL("../regular-maps/", import.meta.url)) {
  const out = new URL("shapes/", dir), done = [];
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(dir).filter((f) => /^\d+-\d+\.json$/.test(f))) {
    const file = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    hyperSurfaces(file).forEach((s, k) => {
      const name = `${file.N}-${file.M}-${k}`;
      if (s.genus < 2 || s.genus > MAX_GENUS || s.tiles > MAX_TILES || (only.length && !only.some((o) => name === o || name.startsWith(`${o}-`)))) return;
      const t = performance.now();
      try {
        const P = buildHyper({ rule: "hyper", N: file.N, M: file.M, surface: k, cuts: [], blackout: [] }, file), kept = shapeFor(P);
        writeFileSync(new URL(`${name}.json`, out), JSON.stringify({
          how: "The surface in 3D: a pretzel, y² = s·(1 − (x/A)² − (z/B)²)·Π(1 − r²/((x − cx)² + (z − cz)²)) over its holes [cx, cz, r], and at: where the vertices of hyper-surface.mjs's surfaceMesh (rings, perEdge), split twice by loopSurface (not smooth), sit on it (x y z each, int16 of most, base64).",
          ...kept,
        }));
        done.push(`${name}: genus ${s.genus}, ${s.tiles} tiles, ${kept.layout} at ${kept.rings} (${Math.round(performance.now() - t)} ms)`);
      } catch (e) { done.push(`${name}: none (${e.message})`); }
    });
  }
  // (the list the page reads first, so it asks only for shapes there are)
  writeFileSync(new URL("index.json", out), JSON.stringify(readdirSync(out).filter((f) => /^\d+-\d+-\d+\.json$/.test(f)).map((f) => f.replace(/\.json$/, "")).sort()));
  return done;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) for (const line of addShapes(process.argv.slice(2))) console.log(line);
