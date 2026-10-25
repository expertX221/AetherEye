// @ts-nocheck
/**
 * AetherEye analysis core — pure functions, no DOM access.
 * Runs inside a Web Worker (worker.js) and is also importable from Node for tests.
 *
 * Pipeline:
 *   1. optional translation auto-alignment (coarse-to-fine SAD search)
 *   2. optional robust exposure normalisation (percentile gain/offset per channel)
 *   3. per-pixel RGB colour distance → smoothed score map
 *   4. adaptive / Otsu thresholding, sensitivity scaling
 *   5. majority-vote morphology + connected components
 *   6. per-region land-cover transition analysis → explainable heuristic labels
 */

export const SW = 480;
export const SH = 320;

/** Visible-spectrum land-cover proxies. Heuristic only — RGB cannot identify true land cover. */
export const CLASSES = ['Other', 'Water', 'Vegetation', 'Bare / built-up', 'Dark surface', 'Soil'];

export const TYPES = {
  flood:   { label: 'Possible flooding / water expansion',      group: 'Natural-event indicator', color: '#3aa8ff' },
  recede:  { label: 'Possible water recession / drying',        group: 'Natural or seasonal',     color: '#5eead4' },
  burn:    { label: 'Possible burn scar / vegetation damage',   group: 'Natural-event indicator', color: '#ff8a3d' },
  vegloss: { label: 'Possible vegetation loss or clearing',     group: 'Natural or human-made',   color: '#ff746f' },
  veggain: { label: 'Possible vegetation growth / regrowth',    group: 'Natural or seasonal',     color: '#7be37b' },
  build:   { label: 'Possible excavation or new construction',  group: 'Human-activity indicator', color: '#ffd24d' },
  dark:    { label: 'Possible shadow, burn or dark surface',    group: 'Needs verification',      color: '#b48cff' },
  unknown: { label: 'Unusual surface change',                   group: 'Needs verification',      color: '#ff9aa2' },
};

export const DEFAULTS = Object.freeze({
  sensitivity: 1,
  minRegion: 115,
  smoothing: 1,
  method: 'adaptive',
  normalise: true,
  align: true,
  maxRegions: 20,
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Classify one RGB pixel into a coarse surface class (index into CLASSES). */
export function pixelClass(r, g, b) {
  const lum = (r + g + b) / 3;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = (mx - mn) / (mx + 1);
  if (b > r * 1.18 && b - r > 14 && b >= g * 0.95 && lum < 175) return 1; // water-like
  if (g > r * 1.04 && g > b * 1.04 && sat > 0.08) return 2; // vegetation-like
  if (lum < 55) return 4;                                    // dark
  if (sat < 0.26 && lum >= 115) return 3;                    // bright, low-chroma: bare/built
  if (r >= g && g >= b * 0.98 && sat >= 0.2) return 5;       // brownish soil
  return 0;
}

function grayDown(d, f) {
  const w = SW / f, h = SH / f, g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const p = ((y * f + dy) * SW + x * f + dx) * 4;
      s += d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
    }
    g[y * w + x] = s / (f * f);
  }
  return g;
}

function sad(a, b, w, h, dx, dy, margin) {
  let s = 0, n = 0;
  for (let y = margin; y < h - margin; y++) {
    const row = y * w, row2 = (y + dy) * w + dx;
    for (let x = margin; x < w - margin; x++) { s += Math.abs(a[row + x] - b[row2 + x]); n++; }
  }
  return n ? s / n : Infinity;
}

/**
 * Estimate the integer translation (in analysis pixels) such that after(x+dx, y+dy) ≈ before(x, y).
 * Only accepted if it reduces mean absolute error by >7 %; otherwise {0,0}.
 */
export function estimateShift(bd, ad) {
  const f = 4, w = SW / f, h = SH / f, R = 6;
  const bg = grayDown(bd, f), ag = grayDown(ad, f);
  let best = { dx: 0, dy: 0, e: Infinity };
  const base = sad(bg, ag, w, h, 0, 0, R + 1);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const e = sad(bg, ag, w, h, dx, dy, R + 1);
    if (e < best.e) best = { dx, dy, e };
  }
  const fullB = grayDown(bd, 1), fullA = grayDown(ad, 1);
  const cx = best.dx * f, cy = best.dy * f, M = R * f + 6;
  const base0 = sad(fullB, fullA, SW, SH, 0, 0, M);
  let fine = { dx: 0, dy: 0, e: base0 };
  for (let dy = cy - 4; dy <= cy + 4; dy++) for (let dx = cx - 4; dx <= cx + 4; dx++) {
    const e = sad(fullB, fullA, SW, SH, dx, dy, M);
    if (e < fine.e) fine = { dx, dy, e };
  }
  const improvement = base0 > 0 ? 1 - fine.e / base0 : 0;
  if ((fine.dx || fine.dy) && improvement > 0.07) return { dx: fine.dx, dy: fine.dy, improvement, coarseBase: base };
  return { dx: 0, dy: 0, improvement: 0, coarseBase: base };
}

/** Resample `ad` so that output(x,y)=ad(x+dx,y+dy). Out-of-frame pixels copy `bd` (zero difference). */
function shiftImage(bd, ad, dx, dy) {
  if (!dx && !dy) return new Uint8ClampedArray(ad);
  const out = new Uint8ClampedArray(ad.length);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const p = (y * SW + x) * 4, xx = x + dx, yy = y + dy;
    const q = xx >= 0 && yy >= 0 && xx < SW && yy < SH ? (yy * SW + xx) * 4 : -1;
    const s = q >= 0 ? ad : bd, i = q >= 0 ? q : p;
    out[p] = s[i]; out[p + 1] = s[i + 1]; out[p + 2] = s[i + 2]; out[p + 3] = 255;
  }
  return out;
}

function percentiles(d, ch, mask) {
  const h = new Uint32Array(256);
  let total = 0;
  for (let i = ch, k = 0; i < d.length; i += 4, k++) if (!mask || mask[k]) { h[d[i]]++; total++; }
  const out = [];
  for (const q of [0.25, 0.5, 0.75]) {
    let acc = 0, v = 0;
    for (; v < 256; v++) { acc += h[v]; if (acc >= total * q) break; }
    out.push(v);
  }
  return out;
}

/**
 * Match the after image's central tendency/spread to before, per channel.
 * Fitted only on `stable` pixels (those that barely changed) so large genuine changes
 * such as a flood do not bias the correction. Gain is clamped to avoid over-correction.
 */
function normaliseExposure(bd, ad, stable) {
  const gains = [];
  for (let c = 0; c < 3; c++) {
    const [b25, b50, b75] = percentiles(bd, c, stable), [a25, a50, a75] = percentiles(ad, c, stable);
    const gain = clamp((b75 - b25 + 1) / (a75 - a25 + 1), 0.75, 1.33);
    const offset = b50 - gain * a50;
    gains.push({ gain, offset });
    for (let i = c; i < ad.length; i += 4) ad[i] = clamp(ad[i] * gain + offset, 0, 255);
  }
  return gains;
}

function blur3(src, dst, w, h) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; s += src[yy * w + xx]; n++; }
    }
    dst[y * w + x] = s / n;
  }
}

function otsu(hist, total) {
  let sum = 0; for (let i = 0; i < hist.length; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 0;
  for (let i = 0; i < hist.length; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; t = i; }
  }
  return t;
}

/**
 * @param {Uint8ClampedArray} bd  RGBA before, SW×SH
 * @param {Uint8ClampedArray} adRaw  RGBA after, SW×SH
 * @param {Partial<typeof DEFAULTS>} [options]
 */
export function analyse(bd, adRaw, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const pix = SW * SH;

  const shift = o.align ? estimateShift(bd, adRaw) : { dx: 0, dy: 0, improvement: 0 };
  const ad = shiftImage(bd, adRaw, shift.dx, shift.dy);
  let gains = null;
  if (o.normalise) {
    // preliminary difference → stable-pixel mask (lowest 60 % of raw differences)
    const prelim = new Float32Array(pix), ph = new Uint32Array(443);
    for (let i = 0; i < pix; i++) {
      const p = i * 4, dr = ad[p] - bd[p], dg = ad[p + 1] - bd[p + 1], db = ad[p + 2] - bd[p + 2];
      const s = Math.sqrt(dr * dr + dg * dg + db * db);
      prelim[i] = s; ph[Math.min(442, s | 0)]++;
    }
    let acc = 0, cut = 0;
    for (; cut < 443; cut++) { acc += ph[cut]; if (acc >= pix * 0.6) break; }
    const stable = new Uint8Array(pix);
    for (let i = 0; i < pix; i++) stable[i] = prelim[i] <= cut ? 1 : 0;
    gains = normaliseExposure(bd, ad, stable);
  }

  // --- score map ---
  let scores = new Float32Array(pix), sum = 0, sumsq = 0;
  for (let i = 0; i < pix; i++) {
    const p = i * 4, dr = ad[p] - bd[p], dg = ad[p + 1] - bd[p + 1], db = ad[p + 2] - bd[p + 2];
    scores[i] = Math.sqrt(dr * dr + dg * dg + db * db);
  }
  if (o.smoothing > 0) {
    let tmp = new Float32Array(pix);
    for (let k = 0; k < o.smoothing; k++) { blur3(scores, tmp, SW, SH); [scores, tmp] = [tmp, scores]; }
  }
  const hist443 = new Uint32Array(443);
  for (let i = 0; i < pix; i++) { const s = scores[i]; sum += s; sumsq += s * s; hist443[Math.min(442, s | 0)]++; }
  const mean = sum / pix, sd = Math.sqrt(Math.max(0, sumsq / pix - mean * mean));
  const adaptive = clamp(mean + Math.max(17, sd * 0.55), 34, 85);
  const otsuT = clamp(otsu(hist443, pix), 30, 110);
  const base = o.method === 'otsu' ? otsuT : adaptive;
  const threshold = clamp(base / o.sensitivity, 12, 200);

  const raw = new Uint8Array(pix), tmpM = new Uint8Array(pix), clean = new Uint8Array(pix);
  for (let i = 0; i < pix; i++) raw[i] = scores[i] > threshold ? 1 : 0;
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const p = y * SW + x; let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += raw[p + dy * SW + dx];
    tmpM[p] = n >= 5 ? 1 : 0;
  }
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const p = y * SW + x; let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += tmpM[p + dy * SW + dx];
    clean[p] = n >= 4 ? 1 : 0;
  }

  // --- connected components with transition statistics ---
  const labels = new Int32Array(pix), queue = new Int32Array(pix), comps = [];
  let id = 0;
  for (let start = 0; start < pix; start++) {
    if (!clean[start] || labels[start]) continue;
    id++;
    let head = 0, tail = 1; queue[0] = start; labels[start] = id;
    while (head < tail) {
      const p = queue[head++], x = p % SW, y = (p / SW) | 0;
      if (x > 0 && clean[p - 1] && !labels[p - 1]) { labels[p - 1] = id; queue[tail++] = p - 1; }
      if (x < SW - 1 && clean[p + 1] && !labels[p + 1]) { labels[p + 1] = id; queue[tail++] = p + 1; }
      if (y > 0 && clean[p - SW] && !labels[p - SW]) { labels[p - SW] = id; queue[tail++] = p - SW; }
      if (y < SH - 1 && clean[p + SW] && !labels[p + SW]) { labels[p + SW] = id; queue[tail++] = p + SW; }
    }
    const count = tail;
    if (count < o.minRegion) continue;
    comps.push(describe(id, count, queue, bd, ad, scores, threshold));
  }
  comps.sort((a, b) => b.count - a.count);
  const top = comps.slice(0, o.maxRegions);
  top.forEach((r, i) => { r.rank = i + 1; });
  const allow = new Set(top.map(r => r.id));
  let affected = 0;
  for (let i = 0; i < pix; i++) { if (labels[i] && !allow.has(labels[i])) labels[i] = 0; else if (labels[i]) affected++; }

  // --- outputs ---
  const heat = new Uint8Array(pix);
  for (let i = 0; i < pix; i++) heat[i] = clamp((scores[i] * 255) / 160, 0, 255);
  const hist = new Uint32Array(64);
  for (let i = 0; i < pix; i++) hist[Math.min(63, (scores[i] / 3) | 0)]++;
  const breakdown = {};
  for (const r of top) {
    const b = (breakdown[r.key] ||= { regions: 0, pixels: 0 });
    b.regions++; b.pixels += r.count;
  }

  return {
    labels, heat, regions: top,
    stats: {
      mean, sd, adaptive, otsu: otsuT, threshold, affected,
      changedPct: (affected / pix) * 100,
      hist, shift: { dx: shift.dx, dy: shift.dy, improvement: shift.improvement || 0 },
      gains, breakdown, candidates: comps.length, options: o,
    },
  };
}

function describe(id, count, queue, bd, ad, scores, threshold) {
  let sx = 0, sy = 0, minX = SW, minY = SH, maxX = 0, maxY = 0, sc = 0, mx = 0, dLum = 0, dExG = 0;
  const trans = new Uint32Array(36);
  for (let k = 0; k < count; k++) {
    const p = queue[k], x = p % SW, y = (p / SW) | 0, i = p * 4;
    sx += x; sy += y;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    const s = scores[p]; sc += s; if (s > mx) mx = s;
    const cb = pixelClass(bd[i], bd[i + 1], bd[i + 2]), ca = pixelClass(ad[i], ad[i + 1], ad[i + 2]);
    trans[cb * 6 + ca]++;
    dLum += (ad[i] + ad[i + 1] + ad[i + 2] - bd[i] - bd[i + 1] - bd[i + 2]) / 3;
    dExG += (2 * ad[i + 1] - ad[i] - ad[i + 2]) - (2 * bd[i + 1] - bd[i] - bd[i + 2]);
  }
  let waterGain = 0, waterLoss = 0, vegLoss = 0, vegGain = 0, darkGain = 0, builtGain = 0, topT = 0, topN = 0;
  for (let b = 0; b < 6; b++) for (let a = 0; a < 6; a++) {
    if (a === b) continue;
    const n = trans[b * 6 + a];
    if (a === 1) waterGain += n; if (b === 1) waterLoss += n;
    if (b === 2) vegLoss += n; if (a === 2) vegGain += n;
    if (a === 4) darkGain += n; if (a === 3 && b !== 1) builtGain += n;
    if (n > topN) { topN = n; topT = b * 6 + a; }
  }
  dLum /= count; // mean brightness change (0-255 scale)
  const f = v => v / count;
  let key = 'unknown';
  if (f(waterGain) > 0.3) key = 'flood';
  else if (f(waterLoss) > 0.3) key = 'recede';
  else if (f(darkGain) > 0.3 && f(vegLoss) > 0.12) key = 'burn';
  else if (f(builtGain) > 0.3 && dLum > 8) key = 'build';
  else if (f(vegLoss) > 0.3) key = 'vegloss';
  else if (f(vegGain) > 0.3) key = 'veggain';
  else if (f(darkGain) > 0.35) key = 'dark';

  const t = TYPES[key];
  const meanScore = sc / count;
  const transition = topN ? `${CLASSES[(topT / 6) | 0]} → ${CLASSES[topT % 6]}` : 'No dominant transition';
  const reason = topN
    ? `${Math.round(f(topN) * 100)}% of pixels shifted ${transition}; mean brightness ${dLum >= 0 ? '+' : ''}${dLum.toFixed(0)}, greenness ${dExG >= 0 ? '+' : ''}${(dExG / count).toFixed(0)}.`
    : 'Strong multi-channel colour change forms a coherent region; no single surface-class transition dominates.';
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  return {
    id, rank: 0, count, key, type: t.label, group: t.group, color: t.color,
    x: sx / count / SW, y: sy / count / SH, minX, minY, maxX, maxY,
    transition, reason,
    score: Math.round(meanScore), maxScore: Math.round(mx),
    strength: Math.round(clamp((meanScore / (threshold * 2.5)) * 100, 0, 100)),
    fill: count / (bw * bh), dLum: Math.round(dLum), dExG: Math.round(dExG / count),
  };
}
