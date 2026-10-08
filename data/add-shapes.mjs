// Writes regular-maps/shapes/N-M-k.json: for each two-holed puzzle surface (k: its index among the
// tiling's puzzle surfaces), its shape in space for the 3D view, hyper-surface.mjs's implicitShape:
// the pretzel's numbers, and where the vertices of its mesh (surfaceMesh, split twice) sit on it.
// Laying the tiles on the pretzel takes most of a minute per surface, so it's done here once; the
// page reads the file when the 3D view is wanted (implicitSurface).
// Run: node data/add-shapes.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildHyper, hyperSurfaces } from "../hyper.mjs";
import { surfaceMesh, implicitShape, implicitSurface, turnedOver, packShape, unpackShape } from "../hyper-surface.mjs";

export function addShapes(dir = new URL("../regular-maps/", import.meta.url)) {
  const out = new URL("shapes/", dir), made = [];
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(dir).filter((f) => /^\d+-\d+\.json$/.test(f))) {
    const file = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    hyperSurfaces(file).forEach((s, k) => {
      if (s.genus !== 2) return;
      const name = `${file.N}-${file.M}-${k}`, t = performance.now();
      try {
        const P = buildHyper({ rule: "hyper", N: file.N, M: file.M, surface: k, cuts: [], blackout: [] }, file), mesh = surfaceMesh(P);
        const made = implicitShape(P, mesh);
        if (!made.at.every(Number.isFinite)) throw new Error("lost its way (not a number)");
        const kept = packShape(made), turned = turnedOver(implicitSurface(mesh, unpackShape(kept)), kept.shape);
        if (turned) throw new Error(`${turned} triangles turned over`);
        writeFileSync(new URL(`${name}.json`, out), JSON.stringify({
          how: "The surface in 3D: a pretzel, y² = s·(1 − (x/A)² − (z/B)²)·Π((x − cx)² + (z − cz)² − r²)/r² over its holes [cx, cz, r], and at: where the vertices of hyper-surface.mjs's surfaceMesh (6 rings, 6 points an edge), split twice by loopSurface (not smooth), sit on it (x y z each, int16 of most, base64).",
          ...kept,
        }));
        made.push(`${name} (${Math.round(performance.now() - t)} ms)`);
      } catch (e) { made.push(`${name}: none (${e.message})`); }
    });
  }
  return made;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) for (const line of addShapes()) console.log(line);
