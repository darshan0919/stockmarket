'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractResultPdf, declaredBasis, applyUnitHint } = require('../lib/pdfExtract/router');
const { scoreResultPage, rankResultPages } = require('../lib/pdfExtract/pages');
const { MockProvider } = require('../lib/pdfExtract/tier3');

// Minimal text-PDF writer (one Courier line per row), so no fixture file is needed.
function buildPdf(pageLines) {
  const objs = [];
  const add = (b) => objs.push(b) && objs.length;
  const catalog = add('');
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const kids = [];
  for (const lines of pageLines) {
    let s = 'BT /F1 8 Tf 10 TL 20 760 Td\n';
    for (const l of lines) s += `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*\n`;
    s += 'ET';
    const c = add(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Contents ${c} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`
      )
    );
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((b, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${b}\nendobj\n`;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

const row = (label, a, b, c) =>
  `${label.padEnd(52)}${a.padStart(12)}${b.padStart(12)}${c.padStart(12)}`;
const TABLE = (title) => [
  'ACME INDUSTRIES LIMITED',
  title,
  'Rs. in Lakhs',
  row('Particulars', '30-Jun-26', '31-Mar-26', '30-Jun-25'),
  row('1 Revenue from operations', '10,000.00', '9,000.00', '8,000.00'),
  row('2 Other income', '500.00', '400.00', '300.00'),
  row('3 Total income (1+2)', '10,500.00', '9,400.00', '8,300.00'),
  row('4 Expenses', '', '', ''),
  row('a) Employee benefit expense', '1,500.00', '1,400.00', '1,300.00'),
  row('b) Finance costs', '200.00', '190.00', '180.00'),
  row('c) Depreciation and amortisation expense', '300.00', '290.00', '280.00'),
  row('d) Other expenses', '6,000.00', '5,500.00', '5,000.00'),
  row('Total expenses', '8,000.00', '7,380.00', '6,760.00'),
  row('5 Profit before tax (3-4)', '2,500.00', '2,020.00', '1,540.00'),
  row('6 Tax expense', '600.00', '500.00', '400.00'),
  row('7 Net profit after tax (5-6)', '1,900.00', '1,520.00', '1,140.00'),
  row('8 Earnings per share basic (Rs.)', '19.00', '15.20', '11.40'),
];

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-test-'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const write = (name, pages) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, buildPdf(pages));
  return f;
};

describe('page ranking and basis', () => {
  test('a result table page outranks prose', () => {
    expect(
      scoreResultPage(TABLE('STATEMENT OF STANDALONE FINANCIAL RESULTS').join('\n'))
    ).toBeGreaterThan(scoreResultPage('Notice of annual general meeting. Directors report.'));
    const ranked = rankResultPages(['Directors report text', TABLE('x').join('\n')], { top: 3 });
    expect(ranked[0].page).toBe(2);
  });
  test('declaredBasis reads the heading', () => {
    expect(declaredBasis('UNAUDITED CONSOLIDATED FINANCIAL RESULTS')).toBe('consolidated');
    expect(declaredBasis('STANDALONE financial results')).toBe('standalone');
    expect(declaredBasis('both consolidated and standalone')).toBeNull();
  });
});

describe('extractResultPdf', () => {
  test('Tier 1 finds, converts and verifies the table on the right page', async () => {
    const f = write('t1.pdf', [
      ['Cover page', 'Press release'],
      TABLE('STATEMENT OF STANDALONE UNAUDITED FINANCIAL RESULTS'),
    ]);
    const r = await extractResultPdf(f, { skipTier2: true });
    expect(r.found).toBe(true);
    expect(r.tier).toBe(1);
    expect(r.page).toBe(2);
    expect(r.unit).toBe('lakh');
    expect(r.verification).toBe('verified');
    expect(r.cur.revenue).toBeCloseTo(100, 4);
    expect(r.cur.pat).toBeCloseTo(19, 4);
    expect(r.tokens.local).toBe(0);
  });
  test('abstains (does not guess) when there is no result table', async () => {
    const f = write('none.pdf', [['Directors report', 'Corporate governance']]);
    const r = await extractResultPdf(f, { skipTier2: true });
    expect(r.found).toBe(false);
    expect(r.abstained).toBe(true);
  });
  test('a column that fails L2 is not served', async () => {
    const bad = TABLE('STATEMENT OF STANDALONE FINANCIAL RESULTS').map((l) =>
      l.includes('Total income')
        ? row('3 Total income (1+2)', '90,500.00', '9,400.00', '8,300.00')
        : l
    );
    const f = write('bad.pdf', [bad]);
    const r = await extractResultPdf(f, { skipTier2: true });
    expect(r.found).toBe(false);
  });
  test('Tier 3 rescues a page the parser cannot read, grounded and verified', async () => {
    const garbled = [
      'ACME',
      'STATEMENT OF STANDALONE FINANCIAL RESULTS',
      'Rs. in Lakhs',
      'Revenue from operations 10,000.00',
      'Other income 500.00',
      'Total income 10,500.00',
      'Total expenses 8,000.00',
      'Profit before tax 2,500.00',
      'Tax expense 600.00',
      'Profit after tax 1,900.00',
    ];
    const f = write('t3.pdf', [garbled]);
    const calls = [];
    const provider = new MockProvider((a) => {
      calls.push(a);
      return {
        unit: 'lakh',
        basis: 'standalone',
        values: {
          revenue: 10000,
          otherIncome: 500,
          totalIncome: 10500,
          totalExpenses: 8000,
          pbt: 2500,
          tax: 600,
          pat: 1900,
        },
      };
    });
    const r = await extractResultPdf(f, { skipTier1: true, tier3: { provider } });
    expect(calls.length).toBeGreaterThan(0);
    expect(r.found).toBe(true);
    expect(r.tier).toBe(3);
    expect(r.cur.revenue).toBeCloseTo(100, 4);
    expect(r.tokens.local).toBeGreaterThan(0);
  });
  test('Tier 3 output that fails verification is not served', async () => {
    const f = write('t3bad.pdf', [
      [
        'STATEMENT OF STANDALONE FINANCIAL RESULTS',
        'Rs. in Lakhs',
        'Revenue from operations 10,000.00',
        'Total income 10,500.00',
        'Other income 500.00',
      ],
    ]);
    const provider = new MockProvider(() => ({
      unit: 'lakh',
      basis: 'standalone',
      values: { revenue: 10000, otherIncome: 500, totalIncome: 10500 + 0 },
    }));
    const bad = new MockProvider(() => ({
      unit: 'lakh',
      basis: 'standalone',
      values: { revenue: 10000, totalIncome: 10500, otherIncome: 5 },
    }));
    const ok = await extractResultPdf(f, { skipTier1: true, tier3: { provider } });
    expect(ok.found).toBe(true);
    const no = await extractResultPdf(f, { skipTier1: true, tier3: { provider: bad } });
    expect(no.found).toBe(false);
  });
});

describe('Tier 2 with an OCR model', () => {
  const { normaliseOcrText, promptFor } = require('../lib/pdfExtract/ocrmodel');

  test('markdown and HTML tables become parser rows', () => {
    const md =
      '```markdown\n| Particulars | Q1 |\n|---|---|\n| Revenue from operations | 10,000.00 |\n```';
    const out = normaliseOcrText(md);
    expect(out).toMatch(/Revenue from operations\s+10,000\.00/);
    expect(out).not.toMatch(/---|\||```/);
    const html = '<table><tr><td>Other income</td><td>500.00</td></tr></table>';
    expect(normaliseOcrText(html)).toMatch(/Other income\s+500\.00/);
  });
  test('each OCR family gets its own prompt', () => {
    expect(promptFor('glm-ocr')).toBe('Table Recognition:');
    expect(promptFor('deepseek-ocr')).toMatch(/markdown/);
    expect(promptFor('something-else')).toMatch(/plain text/);
  });
  test('router uses the OCR model for a page with no text layer and verifies the result', async () => {
    // A page the text layer cannot read: only a header, so Tier 1 finds nothing and Tier 2 runs.
    const f = write('ocrm.pdf', [['STATEMENT OF STANDALONE FINANCIAL RESULTS']]);
    const md = TABLE('STATEMENT OF STANDALONE FINANCIAL RESULTS')
      .map(
        (l) =>
          `| ${l
            .trim()
            .split(/\s{2,}/)
            .join(' | ')} |`
      )
      .join('\n');
    const seen = [];
    const provider = new MockProvider((a) => {
      seen.push(a);
      return md;
    }, 'ollama:glm-ocr');
    provider.model = 'glm-ocr';
    const r = await extractResultPdf(f, { ocrModel: { provider } });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].system).toBeNull();
    expect(seen[0].images.length).toBe(1);
    expect(r.found).toBe(true);
    expect(r.tier).toBe(2);
    expect(r.cur.revenue).toBeCloseTo(100, 4);
    expect(r.tokens.local).toBeGreaterThan(0);
  });
  test('empty model output falls back to tesseract instead of failing', async () => {
    const f = write('ocrm2.pdf', [['STATEMENT OF STANDALONE FINANCIAL RESULTS']]);
    const provider = new MockProvider(() => '', 'ollama:glm-ocr');
    const r = await extractResultPdf(f, { ocrModel: { provider } });
    expect(r.found).toBe(false); // nothing to read, and no crash
  });
});

describe('Tier 3 basis comes from the page heading', () => {
  test('a model that labels a consolidated page "standalone" is overruled by the heading', async () => {
    const f = write('basis.pdf', [TABLE('STATEMENT OF CONSOLIDATED UNAUDITED FINANCIAL RESULTS')]);
    const provider = new MockProvider(() => ({
      unit: 'lakh',
      basis: 'standalone',
      values: {
        revenue: 10000,
        otherIncome: 500,
        totalIncome: 10500,
        totalExpenses: 8000,
        pbt: 2500,
        tax: 600,
        pat: 1900,
      },
    }));
    const r = await extractResultPdf(f, { skipTier1: true, tier3: { provider } });
    expect(r.found).toBe(true);
    expect(r.basis).toBe('consolidated');
  });
});

describe('OCR engine comparison mode', () => {
  test('forceOcr skips the text-layer parse and reads the page through the OCR engine', async () => {
    const f = write('force.pdf', [TABLE('STATEMENT OF STANDALONE UNAUDITED FINANCIAL RESULTS')]);
    const text = await extractResultPdf(f, { skipTier2: true });
    expect(text.tier).toBe(1);
    const md = TABLE('x')
      .map(
        (l) =>
          `| ${l
            .trim()
            .split(/\s{2,}/)
            .join(' | ')} |`
      )
      .join('\n');
    const provider = new MockProvider(() => md, 'ollama:glm-ocr');
    const viaOcr = await extractResultPdf(f, { forceOcr: true, ocrModel: { provider } });
    expect(viaOcr.tier).toBe(2);
    expect(viaOcr.tokens.local).toBeGreaterThan(0);
  });
  test('a scan with no rankable page still gets its first pages OCR-ed', async () => {
    const f = write('scan.pdf', [['x'], ['y'], ['z'], ['w']]);
    const seen = [];
    const provider = new MockProvider((a) => {
      seen.push(a);
      return '';
    }, 'ollama:glm-ocr');
    await extractResultPdf(f, { ocrModel: { provider }, scanPages: 3, ocrPages: 3 });
    expect(seen.length).toBe(3);
  });
});

describe('applyUnitHint', () => {
  test('a hinted lakh unit converts values printed in lakh to crore', () => {
    const r = applyUnitHint({ unit: 'unknown', cur: { revenue: 4904.01, pat: 934.08 } }, 'lakh');
    expect(r.unit).toBe('lakh');
    expect(r.cur).toEqual({ revenue: 49.0401, pat: 9.3408 });
  });
  test('a hinted crore unit leaves values alone; million divides by ten', () => {
    expect(applyUnitHint({ cur: { revenue: 12.5 } }, 'crore').cur).toEqual({ revenue: 12.5 });
    expect(applyUnitHint({ cur: { revenue: 500 } }, 'million').cur).toEqual({ revenue: 50 });
  });
});
