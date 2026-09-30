import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"] });
const q = process.argv[2];
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
await p.addInitScript(() => {
  window.__raf = { ms: 0, calls: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); window.__raf.ms += performance.now() - s; window.__raf.calls++; });
});
await p.goto(`http://localhost:8960/index.html?${q}`);
await p.waitForFunction(() => !!window.cutwist);
await p.evaluate(() => {
  // a turn every 300 ms, forever
  const info = window.cutwist.info();
  setInterval(() => {
    const i = window.cutwist.info();
    if (i.planar) window.cutwist.turn(Math.random() < 0.5 ? 0 : 1, Math.floor(Math.random() * 5), Math.random() < 0.5 ? 1 : -1);
    else window.cutwist.turn(Math.floor(Math.random() * 3), Math.random() < 0.5 ? 0 : 2, 1);
  }, 300);
});
for (let k = 0; k < 12; k++) {
  await p.evaluate(() => { window.__raf = { ms: 0, calls: 0 }; });
  await p.waitForTimeout(20000);
  const r = await p.evaluate(() => ({ ...window.__raf, heap: performance.memory.usedJSHeapSize / 1e6, nodes: document.getElementsByTagName("*").length }));
  console.log(`${(k + 1) * 20}s`, "fps:", (r.calls / 20).toFixed(0), "ms/frame:", (r.ms / r.calls).toFixed(2), "heap MB:", r.heap.toFixed(1), "nodes:", r.nodes);
}
await b.close();
