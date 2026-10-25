import { analyse } from './core.js';

let worker = null;
let seq = 0;
const pending = new Map();
let workerBroken = false;

function ensureWorker() {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, ok, r, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      ok ? p.resolve(r) : p.reject(new Error(error));
    };
    worker.onerror = () => {
      workerBroken = true;
      worker = null;
      for (const [, p] of pending) p.fallback();
      pending.clear();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

/** Run the analysis off the main thread; transparently falls back to the main thread. */
export function runAnalysis(bd, ad, opts) {
  const direct = () => new Promise((res) => setTimeout(() => res(analyse(new Uint8ClampedArray(bd), new Uint8ClampedArray(ad), opts)), 0));
  const w = ensureWorker();
  if (!w) return direct();
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, fallback: () => direct().then(resolve, reject) });
    w.postMessage({ id, bd: bd.buffer.slice(bd.byteOffset, bd.byteOffset + bd.byteLength), ad: ad.buffer.slice(ad.byteOffset, ad.byteOffset + ad.byteLength), opts });
  });
}
