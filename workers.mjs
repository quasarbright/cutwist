// For the unit tests: cases that each take a while, run side by side on worker threads, one per
// core. pool(module, fn, cases) starts them all and returns a promise for each case's result:
// module's export fn, called with the case in a worker (plain data in, plain data out). A test
// file can be its own module: it exports its checks, and registers its tests only on the main
// thread (isMainThread), so a worker importing it runs none of them.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";

// (the worker's copy only: see pool)
if (!isMainThread && workerData && workerData.pool && import.meta.url.endsWith("?worker")) {
  const mod = await import(workerData.module);
  parentPort.on("message", async ({ id, arg }) => {
    try { parentPort.postMessage({ id, ok: await mod[workerData.fn](arg) }); }
    catch (e) { parentPort.postMessage({ id, err: (e && e.stack) || String(e) }); }
  });
}

export { isMainThread };

// (cases in the order given: put the slowest first, so they don't start last)
export function pool(module, fn, cases, size = Number(process.env.TEST_THREADS) || availableParallelism()) {
  const queue = cases.map((arg, id) => ({ arg, id }));
  const out = cases.map(() => { const o = {}; o.p = new Promise((res, rej) => { o.res = res; o.rej = rej; }); o.p.catch(() => {}); return o; });
  for (let w = 0; w < Math.min(size, cases.length); w++) {
    // (the worker's own copy of this module, by another URL: the test file it imports imports this
    // one, and the same module importing itself through an await never finishes loading. Imported,
    // as a worker's entry file loses its query. Its output kept, not piped: a dozen workers piped
    // into the parent's trip its listener limit)
    const entry = new URL("?worker", import.meta.url).href;
    const worker = new Worker(`import(${JSON.stringify(entry)})`, { eval: true, workerData: { pool: true, module: String(module), fn }, stdout: true, stderr: true });
    let current = null;
    const next = () => { current = queue.shift() ?? null; if (current) worker.postMessage(current); else worker.terminate(); };
    worker.on("message", ({ id, ok, err }) => { if (err) out[id].rej(new Error(err)); else out[id].res(ok); next(); });
    // (a worker that dies takes its case with it, and the ones left waiting)
    const fail = (e) => { if (current) out[current.id].rej(e); current = null; for (const c of queue.splice(0)) out[c.id].rej(e); };
    worker.on("error", fail);
    worker.on("exit", (code) => fail(new Error(`a test worker quit (${code}) before its case was done`)));
    next();
  }
  return out.map((o) => o.p);
}
