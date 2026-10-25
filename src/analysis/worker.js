import { analyse } from './core.js';

self.onmessage = (e) => {
  const { id, bd, ad, opts } = e.data;
  try {
    const r = analyse(new Uint8ClampedArray(bd), new Uint8ClampedArray(ad), opts);
    self.postMessage({ id, ok: true, r }, [r.labels.buffer, r.heat.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};
