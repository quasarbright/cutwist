// Unit tests for the 3D surfaces (surfaces.mjs): each glues its edges the way the flat grid
// does, and fits in the unit sphere.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { surfacePoint } from "./surfaces.mjs";

const same = (a, b, msg) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9, `${msg}: ${a} vs ${b}`);
const samples = Array.from({ length: 21 }, (_, i) => i / 20);

test("torus: left meets right, top meets bottom", () => {
  for (const u of samples) {
    same(surfacePoint("torus", 0, u), surfacePoint("torus", 1, u), `s edge at t=${u}`);
    same(surfacePoint("torus", u, 0), surfacePoint("torus", u, 1), `t edge at s=${u}`);
  }
});

test("Klein bottle: left meets right straight; top meets bottom mirrored", () => {
  for (const u of samples) {
    same(surfacePoint("klein", 0, u), surfacePoint("klein", 1, u), `s edge at t=${u}`);
    same(surfacePoint("klein", u, 1), surfacePoint("klein", 1 - u, 0), `t edge at s=${u}`);
  }
});

test("cross-cap: both pairs of edges meet mirrored (opposite boundary points)", () => {
  for (const u of samples) {
    same(surfacePoint("rp2", 1, u), surfacePoint("rp2", 0, 1 - u), `s edge at t=${u}`);
    same(surfacePoint("rp2", u, 1), surfacePoint("rp2", 1 - u, 0), `t edge at s=${u}`);
  }
});

test("every surface fits the unit sphere, and fills it", () => {
  for (const topology of ["torus", "klein", "rp2"]) {
    let r = 0;
    for (const s of samples) for (const t of samples) r = Math.max(r, Math.hypot(...surfacePoint(topology, s, t)));
    assert.ok(r <= 1 + 1e-9 && r > 0.9, `${topology}: ${r}`);
  }
});
