'use strict';

const fs = require('fs');
const path = require('path');
const { stockscans } = require('../index');

const CANONICAL_TYPES = new Set(['Annual Report', 'PPT', 'Result', 'Transcript']);
const TYPE_ALIASES = {
  'annual report': 'Annual Report',
  'annualreport': 'Annual Report',
  'ar': 'Annual Report',
  'annual': 'Annual Report',
  'ppt': 'PPT',
  'presentation': 'PPT',
  'investor presentation': 'PPT',
  'investor_presentation': 'PPT',
  'deck': 'PPT',
  'investor deck': 'PPT',
  'result': 'Result',
  'results': 'Result',
  'financial result': 'Result',
  'financial results': 'Result',
  'quarterly result': 'Result',
  'quarterly results': 'Result',
  'earnings': 'Result',
  'transcript': 'Transcript',
  'transcripts': 'Transcript',
  'concall': 'Transcript',
  'concall transcript': 'Transcript',
  'earnings call': 'Transcript',
  'earnings call transcript': 'Transcript',
  'call transcript': 'Transcript'
};

function normaliseType(userType) {
  const key = userType.trim().toLowerCase();
  if (CANONICAL_TYPES.has(userType)) return userType;
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  const key2 = key.replace(/\s+/g, ' ');
  if (TYPE_ALIASES[key2]) return TYPE_ALIASES[key2];
  throw new Error(`Unknown document type: "${userType}". Allowed: ${[...CANONICAL_TYPES].sort().join(', ')}`);
}

function parseDateFilter(s) {
  if (!s) return null;
  const raw = s.trim();
  if (/^\d{4}$/.test(raw)) return parseInt(raw + '00', 10);
  const m = raw.match(/^(\d{4})[-/]?(\d{2})$/);
  if (!m) throw new Error(`Date filter must be YYYY or YYYYMM (got "${s}")`);
  return parseInt(m[1] + m[2], 10);
}

function docYyyymm(doc) {
  const dateRaw = String(doc.date || '').trim();
  if (/^\d{4}$/.test(dateRaw)) return parseInt(dateRaw + '03', 10);
  if (/^\d{6}$/.test(dateRaw)) return parseInt(dateRaw, 10);
  return 999912;
}

function filterDocuments(docs, { types, start, end, lastN } = {}) {
  let out = [...docs];

  if (types && types.length) {
    const canonical = new Set(types.map(normaliseType));
    out = out.filter(d => canonical.has(d.documentType));
  }

  if (start !== undefined || end !== undefined) {
    const s = start !== undefined ? start : 0;
    const e = end !== undefined ? end : 999912;
    out = out.filter(d => {
      const v = docYyyymm(d);
      return v >= s && v <= e;
    });
  }

  out.sort((a, b) => docYyyymm(b) - docYyyymm(a));

  if (lastN > 0) {
    if (types && types.length > 1) {
      const kept = [];
      const counts = {};
      for (const d of out) {
        const t = d.documentType;
        counts[t] = (counts[t] || 0) + 1;
        if (counts[t] <= lastN) kept.push(d);
      }
      out = kept;
    } else {
      out = out.slice(0, lastN);
    }
  }

  return out;
}

function safeTicker(ticker) {
  return ticker.replace(/[^A-Za-z0-9]+/g, '_');
}

function buildFilename(ticker, doc) {
  const t = (doc.documentType || '').replace(/\s/g, '');
  const dateRaw = String(doc.date || 'unknown');
  return `${safeTicker(ticker)}_${t}_${dateRaw}.pdf`;
}

/**
 * High-level modular function to fetch and download documents.
 */
async function fetchDocuments(ticker, options = {}) {
  const {
    types,
    startDate,
    endDate,
    year,
    lastN,
    outputDir = './stock_documents',
    listOnly = false
  } = options;

  let start = undefined, end = undefined;
  if (year) {
    if (!/^\d{4}$/.test(year)) throw new Error('year must be YYYY');
    start = parseInt(year + '01', 10);
    end = parseInt(year + '12', 10);
  } else {
    if (startDate) {
      const raw = String(startDate).trim();
      start = /^\d{4}$/.test(raw) ? parseInt(raw + '01', 10) : parseDateFilter(raw);
    }
    if (endDate) {
      const raw = String(endDate).trim();
      end = /^\d{4}$/.test(raw) ? parseInt(raw + '12', 10) : parseDateFilter(raw);
    }
  }

  const { documents } = await stockscans.documents(ticker);
  
  if (!documents || documents.length === 0) {
    return { fetched: [], skipped: [], matched: [] };
  }

  const matched = filterDocuments(documents, { types, start, end, lastN });

  if (listOnly) {
    return { matched };
  }

  const outDir = path.resolve(outputDir);
  fs.mkdirSync(outDir, { recursive: true });

  const fetched = [];
  const skipped = [];

  for (const d of matched) {
    const ssUrl = d.ssUrl;
    if (!ssUrl) {
      skipped.push({ ...d, reason: 'missing ssUrl' });
      continue;
    }
    const fname = buildFilename(ticker, d);
    const dest = path.join(outDir, fname);

    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      fetched.push({
        ...d,
        filename: fname,
        path: dest,
        size_bytes: fs.statSync(dest).size,
        cached: true
      });
      continue;
    }

    try {
      const url = stockscans.s3PdfUrl(ssUrl);
      const buf = await stockscans.fetchPdf(url);
      fs.writeFileSync(dest, buf);
      fetched.push({
        ...d,
        filename: fname,
        path: dest,
        size_bytes: buf.length,
        cached: false
      });
    } catch (e) {
      skipped.push({ ...d, reason: String(e) });
    }
  }

  const manifest = {
    ticker,
    fetched_at: new Date().toISOString(),
    documents: fetched,
    skipped
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { fetched, skipped, manifest, manifestPath };
}

module.exports = {
  fetchDocuments,
  filterDocuments,
  normaliseType,
  parseDateFilter,
  docYyyymm,
  safeTicker,
  buildFilename
};
