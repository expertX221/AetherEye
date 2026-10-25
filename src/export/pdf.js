/** Minimal dependency-free PDF writer: text, rectangles and embedded JPEG images, multi-page. */
const enc = new TextEncoder();

export const pdfSafe = (s) =>
  String(s).replaceAll('→', '->').replaceAll('≈', '~').replaceAll('×', 'x').replaceAll('Δ', 'd').replaceAll('·', '-')
    .normalize('NFKD').replace(/[^\x20-\x7e]/g, '-')
    .replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

export function wrap(str, max) {
  const out = []; let line = '';
  for (const word of String(str).split(/\s+/)) {
    if ((line + ' ' + word).trim().length > max) { if (line) out.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

const col = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');

export class PDFPage {
  constructor() { this.ops = []; this.imgs = new Set(); }
  rect(x, y, w, h, hex) { this.ops.push(`${col(hex)} rg ${x} ${y} ${w} ${h} re f`); return this; }
  stroke(x, y, w, h, hex, lw = 0.6) { this.ops.push(`${col(hex)} RG ${lw} w ${x} ${y} ${w} ${h} re S`); return this; }
  text(x, y, size, str, { bold = false, color = '#111827' } = {}) {
    this.ops.push(`BT ${col(color)} rg /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfSafe(str)}) Tj ET`);
    return this;
  }
  image(name, x, y, w, h) { this.imgs.add(name); this.ops.push(`q ${w} 0 0 ${h} ${x} ${y} cm /${name} Do Q`); return this; }
}

/** @param {PDFPage[]} pages @param {Record<string,{jpeg:Uint8Array,w:number,h:number}>} images */
export function buildPDF(pages, images, title = 'AetherEye report') {
  const chunks = []; let len = 0; const offsets = [];
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const imgNames = Object.keys(images);
  const imgObj = Object.fromEntries(imgNames.map((n, i) => [n, 5 + i]));
  let next = 5 + imgNames.length;
  const pageObjs = pages.map(() => { const p = next++, c = next++; return { p, c }; });
  const total = next - 1;

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageObjs.map((o) => o.p + ' 0 R').join(' ')}] /Count ${pages.length} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  for (const n of imgNames) {
    const im = images[n]; offsets[imgObj[n]] = len;
    push(`${imgObj[n]} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`);
    push(im.jpeg); push('\nendstream\nendobj\n');
  }
  pages.forEach((pg, i) => {
    const { p, c } = pageObjs[i];
    const xo = [...pg.imgs].map((n) => `/${n} ${imgObj[n]} 0 R`).join(' ');
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xo} >> >> /Contents ${c} 0 R >>`);
    const content = pg.ops.join('\n');
    obj(c, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);
  });
  const infoN = total + 1;
  obj(infoN, `<< /Title (${pdfSafe(title)}) /Producer (AetherEye) >>`);
  const xref = len;
  push(`xref\n0 ${infoN + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= infoN; n++) push(String(offsets[n]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${infoN + 1} /Root 1 0 R /Info ${infoN} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}
