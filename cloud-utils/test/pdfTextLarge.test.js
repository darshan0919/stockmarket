'use strict';

const { pdfToLayoutTextWithMeta } = require('../src/pdfText');

// Minimal multi-page text PDF writer, so the test needs no fixture file.
function buildPdf(pages, linesPerPage, lineText) {
  const objs = [];
  const add = (body) => objs.push(body) && objs.length;
  const catalog = add('');
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const kids = [];
  for (let p = 0; p < pages; p++) {
    let stream = 'BT /F1 4 Tf 2 TL 10 780 Td\n';
    for (let l = 0; l < linesPerPage; l++) stream += `(${lineText}) Tj T*\n`;
    stream += 'ET';
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`
      )
    );
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages} >>`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((b, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${b}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    out += `${String(o).padStart(10, '0')} 00000 n \n`;
  });
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

describe('pdfToLayoutTextWithMeta on a large document', () => {
  test('returns text larger than execFileSync default 1 MiB maxBuffer', async () => {
    // 30 pages x 200 lines x ~200 chars = about 1.2 MB of text
    const line = 'REVENUE FROM OPERATIONS 1,234.56 2,345.67 '.repeat(5);
    const buf = buildPdf(30, 200, line);
    const meta = await pdfToLayoutTextWithMeta(buf, { maxChars: Infinity });
    expect(meta.originalChars).toBeGreaterThan(1024 * 1024);
    expect(meta.text).toContain('REVENUE');
    expect(meta.ocrFailed).toBe(false);
  }, 60000);
});
