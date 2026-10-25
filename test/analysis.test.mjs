// Run with:  npm test   (Node ≥ 18, no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyse, estimateShift, pixelClass, SW, SH } from '../src/analysis/core.js';
import { PDFPage, buildPDF, wrap, pdfSafe } from '../src/export/pdf.js';

/** Deterministic synthetic scene: green land, blue sea strip, soft texture. */
function scene(seed = 7) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const d = new Uint8ClampedArray(SW * SH * 4);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const p = (y * SW + x) * 4, sea = x < 90;
    const n = (rnd() - 0.5) * 6 + Math.sin(x / 23) * 9 + Math.cos(y / 31) * 9;
    d[p] = (sea ? 20 : 60) + n; d[p + 1] = (sea ? 80 : 130) + n; d[p + 2] = (sea ? 140 : 70) + n; d[p + 3] = 255;
  }
  return d;
}
function paint(d, x0, y0, w, h, rgb) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const p = (y * SW + x) * 4; d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; }
}

test('identical images produce no regions', () => {
  const a = scene(); const r = analyse(a, new Uint8ClampedArray(a));
  assert.equal(r.regions.length, 0); assert.equal(r.stats.affected, 0);
});

test('a new water body is found and labelled as flooding', () => {
  const b = scene(), a = new Uint8ClampedArray(b);
  paint(a, 250, 120, 90, 70, [20, 90, 150]);
  const r = analyse(b, a, { align: false, normalise: false });
  assert.equal(r.regions.length, 1);
  assert.equal(r.regions[0].key, 'flood');
  assert.ok(Math.abs(r.regions[0].x * SW - 295) < 8 && Math.abs(r.regions[0].y * SH - 155) < 8);
});

test('vegetation clearing and construction are distinguished', () => {
  const b = scene(), a = new Uint8ClampedArray(b);
  paint(a, 150, 40, 70, 60, [150, 110, 80]);     // green → soil
  paint(a, 300, 220, 60, 50, [205, 205, 205]);   // green → bright built-up
  const r = analyse(b, a, { align: false, normalise: false });
  const keys = r.regions.map((x) => x.key).sort();
  assert.deepEqual(keys, ['build', 'vegloss']);
});

test('auto-align recovers an injected translation', () => {
  const b = scene(3);
  // add structure so alignment is well-posed
  for (let i = 0; i < 40; i++) paint(b, 110 + (i * 37) % 340, 20 + (i * 53) % 270, 8 + (i % 5), 6 + (i % 4), [(i * 40) % 255, 200 - (i * 20) % 150, (i * 90) % 255]);
  const a = new Uint8ClampedArray(b.length), dx = 7, dy = -5;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const sx = Math.min(SW - 1, Math.max(0, x - dx)), sy = Math.min(SH - 1, Math.max(0, y - dy));
    const p = (y * SW + x) * 4, q = (sy * SW + sx) * 4; a[p] = b[q]; a[p + 1] = b[q + 1]; a[p + 2] = b[q + 2]; a[p + 3] = 255;
  }
  const s = estimateShift(b, a);
  assert.deepEqual([s.dx, s.dy], [dx, -5]);
  assert.equal(analyse(b, a).regions.length, 0);
});

test('exposure normalisation suppresses a global brightness change', () => {
  const b = scene(), a = new Uint8ClampedArray(b);
  for (let i = 0; i < a.length; i += 4) { a[i] = a[i] * 1.12 + 10; a[i + 1] = a[i + 1] * 1.12 + 10; a[i + 2] = a[i + 2] * 1.12 + 10; }
  assert.equal(analyse(b, a, { align: false, normalise: true }).regions.length, 0);
});

test('sensitivity and minimum region size behave monotonically', () => {
  const b = scene(), a = new Uint8ClampedArray(b);
  paint(a, 200, 100, 14, 14, [20, 90, 150]);
  const small = analyse(b, a, { align: false, normalise: false, minRegion: 40 });
  const filtered = analyse(b, a, { align: false, normalise: false, minRegion: 400 });
  assert.ok(small.regions.length >= 1); assert.equal(filtered.regions.length, 0);
});

test('pixelClass heuristics', () => {
  assert.equal(pixelClass(20, 80, 140), 1); assert.equal(pixelClass(60, 140, 60), 2);
  assert.equal(pixelClass(10, 10, 12), 4);  assert.equal(pixelClass(210, 210, 208), 3);
});

test('PDF writer emits a structurally valid document', async () => {
  const pg = new PDFPage().rect(0, 0, 10, 10, '#ff0000').text(20, 20, 12, 'Hello (world) → ≈ ü');
  const blob = buildPDF([pg, new PDFPage().text(10, 10, 10, 'p2')], {}, 'T');
  const txt = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4')); assert.ok(txt.trimEnd().endsWith('%%EOF')); assert.match(txt, /\/Count 2/);
  const xref = Number(/startxref\n(\d+)/.exec(txt)[1]); assert.equal(txt.slice(xref, xref + 4), 'xref');
  assert.equal(pdfSafe('a(b)'), 'a\\(b\\)'); assert.ok(wrap('one two three four', 9).length >= 2);
});
