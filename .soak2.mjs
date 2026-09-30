import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
await p.addInitScript(() => {
  window.__raf = { ms: 0, calls: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); window.__raf.ms += performance.now() - s; window.__raf.calls++; });
});
await p.goto("http://localhost:8960/index.html");
await p.waitForFunction(() => !!window.cutwist);
const ids = ["cube", "megaminx", "skewb", "sliding-klein", "pyraminx", "sliding-torus", "sliding-rp2", "icosahedron"];
for (let round = 0; round <= 5; round++) {
  if (round) for (let k = 0; k < 30; k++) { await p.evaluate((id) => window.cutwist.load(id), ids[k % ids.length]); await p.waitForTimeout(50); }
  await p.evaluate(() => window.cutwist.load("cube"));
  await p.waitForTimeout(500);
  await p.evaluate(() => { window.__raf = { ms: 0, calls: 0 }; });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => ({ ...window.__raf, heap: performance.memory.usedJSHeapSize / 1e6, gpu: window.cutwist.gpu() }));
  console.log(`after ${round * 30} loads`, "ms/frame:", (r.ms / r.calls).toFixed(2), "heap MB:", r.heap.toFixed(1), "gpu:", JSON.stringify(r.gpu));
}
await b.close();
