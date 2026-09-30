import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
await p.addInitScript(() => {
  window.__raf = { ms: 0, calls: 0, max: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); const d = performance.now() - s; window.__raf.ms += d; window.__raf.calls++; });
});
await p.goto("http://localhost:8960/index.html");
await p.waitForFunction(() => !!window.cutwist);
await p.getByRole("button", { name: "about", exact: true }).click();
// scroll through so every diagram gets built and drawn, then park on the drift + table ones
for (const k of ["carve-sphere", "cuts", "symcuts", "orient", "onepiece", "drift", "table"]) { await p.locator(`.cohesion-about [data-viz="${k}"]`).scrollIntoViewIfNeeded(); await p.waitForTimeout(700); }
for (let k = 0; k < 12; k++) {
  const park = ["drift", "table", "cuts", "carve-sphere"][k % 4];
  await p.locator(`.cohesion-about [data-viz="${park}"]`).scrollIntoViewIfNeeded();
  await p.evaluate(() => { window.__raf = { ms: 0, calls: 0 }; });
  await p.waitForTimeout(20000);
  const r = await p.evaluate(() => ({ ...window.__raf, heap: performance.memory.usedJSHeapSize / 1e6 }));
  console.log(`${(k + 1) * 20}s on ${park}`.padEnd(22), "callbacks/s:", (r.calls / 20).toFixed(0), "ms/callback:", (r.ms / r.calls).toFixed(2), "heap MB:", r.heap.toFixed(1));
}
await b.close();
