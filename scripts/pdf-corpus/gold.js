#!/usr/bin/env node
'use strict';

/**
 * Gold-set labelling workflow for document types that have no free XBRL truth
 * (docs/PDF_OCR_EXTRACTION_PLAN.md §3c): two independent extractions, a script verifies every
 * quote against the document's own text, and a person adjudicates only what is left.
 *
 *   select     stratified gold selection           -> gold/selection.jsonl
 *   packets    text + batch files for the labellers -> gold/text/*.txt, gold/batches/batch_NN.jsonl
 *   verify     --pass A|B   check quotes in labels_<pass>.jsonl -> labels_<pass>.verified.jsonl
 *   queue      compare A and B -> gold/labels.jsonl (agreed) + gold/adjudicate.jsonl (disagreements/unverified)
 *   apply      --file decisions.jsonl  (owner decisions: {docId, field, value}) -> merged into gold/labels.jsonl
 *   status     counts
 *
 *   node --env-file=.env scripts/pdf-corpus/gold.js select [--per-type 20]
 *
 * Label file line (one per document, written by a labeller):
 *   {"docId": "...", "fields": {"<field>": {"value": <v|null>, "quote": "<verbatim text>"} , ...}}
 * A field with `value: null` means "the document does not state it" and needs no quote.
 * Selection is hash-stable and splits evenly between dev and test (plus a little train) so both
 * can be scored; scanned/hybrid documents are oversampled.
 */

const fs = require('fs');
const path = require('path');
const L = require('./lib');
const { pdfToLayoutTextWithMeta } = require('../../cloud-utils/src/pdfText.js');

const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'gold_schema.json'), 'utf8'));
const G = (...p) => L.p('gold', ...p);
const TYPES = Object.keys(SCHEMA).filter((k) => !k.startsWith('_'));
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? d : process.argv[i + 1];
};
const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
const numbersIn = (s) =>
  (
    String(s)
      .replace(/,/g, '')
      .match(/-?\d+(?:\.\d+)?/g) || []
  ).map(Number);

// Long documents: the packet is a header plus keyword windows, never the whole text.
const KEYWORDS = {
  PPT: /revenue|ebitda|profit after tax|\bpat\b|\bq[1-4]\s*fy|quarter ended/i,
  Transcript: /moderator|management|guidance|growth|outlook|call|conference/i,
  'Annual Report':
    /statutory auditor|independent auditor'?s report|opinion|dividend|total income|financial year/i,
};
const PACKET_CHARS = 14000;

function packetText(type, text) {
  if (text.length <= PACKET_CHARS) return text;
  const head = text.slice(0, 3000);
  const re = KEYWORDS[type];
  if (!re) return text.slice(0, PACKET_CHARS);
  const windows = [];
  const g = new RegExp(re.source, 'gi');
  let m;
  while ((m = g.exec(text)) && windows.length < 200) {
    const s = Math.max(0, m.index - 350);
    const e = Math.min(text.length, m.index + 450);
    const last = windows[windows.length - 1];
    if (last && s <= last[1]) last[1] = e;
    else windows.push([s, e]);
    g.lastIndex = e;
  }
  let out = `${head}\n\n[... keyword windows follow ...]\n`;
  for (const [s, e] of windows) {
    const piece = `\n--- chars ${s}-${e} ---\n${text.slice(s, e)}\n`;
    if (out.length + piece.length > PACKET_CHARS) break;
    out += piece;
  }
  return out;
}

function select() {
  const per = Number(arg('--per-type', 20));
  const quarantined = new Set(L.readJsonl(L.p('quarantine.jsonl')).map((q) => q.docId));
  const manifest = L.readJsonl(L.p('manifest.jsonl')).filter(
    (r) => !r.dupOf && !quarantined.has(r.docId)
  );
  const out = [];
  for (const type of TYPES) {
    const docs = manifest.filter((r) => r.type === type);
    const order = (r) => L.bucket(`${r.docId}|gold`) * 1000 + (r.docId.charCodeAt(0) % 1000);
    const pool = (split, nonText) =>
      docs
        .filter((r) => r.split === split && (r.form !== 'text') === nonText)
        .sort((a, b) => order(a) - order(b));
    // dev 40% / test 40% / train 20%; within each, scanned/hybrid first up to 40% of the quota
    for (const [split, frac] of [
      ['dev', 0.4],
      ['test', 0.4],
      ['train', 0.2],
    ]) {
      const quota = Math.max(1, Math.round(per * frac));
      const nonTextQuota = Math.ceil(quota * 0.4);
      const picked = [...pool(split, true).slice(0, nonTextQuota)];
      for (const r of pool(split, false)) if (picked.length < quota) picked.push(r);
      for (const r of pool(split, true).slice(nonTextQuota))
        if (picked.length < quota) picked.push(r);
      for (const r of picked)
        out.push({
          docId: r.docId,
          type,
          split: r.split,
          form: r.form,
          pages: r.pages,
          file: r.file,
          companyId: r.companyId,
        });
    }
  }
  fs.mkdirSync(G(), { recursive: true });
  fs.writeFileSync(G('selection.jsonl'), out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const c = {};
  for (const r of out)
    c[`${r.type}|${r.split}|${r.form === 'text' ? 'text' : 'nontext'}`] =
      (c[`${r.type}|${r.split}|${r.form === 'text' ? 'text' : 'nontext'}`] || 0) + 1;
  console.log(
    JSON.stringify({
      selected: out.length,
      byType: Object.fromEntries(TYPES.map((t) => [t, out.filter((r) => r.type === t).length])),
      nonText: out.filter((r) => r.form !== 'text').length,
    })
  );
}

async function packets() {
  const sel = L.readJsonl(G('selection.jsonl'));
  fs.mkdirSync(G('text'), { recursive: true });
  fs.mkdirSync(G('batches'), { recursive: true });
  const deadline = Date.now() + Number(arg('--budget-sec', 140)) * 1000;
  let done = 0;
  for (const r of sel) {
    if (Date.now() > deadline) break;
    const f = G('text', `${r.docId}.txt`);
    if (fs.existsSync(f)) continue;
    const meta = await pdfToLayoutTextWithMeta(fs.readFileSync(L.p(r.file)), {
      maxChars: Infinity,
    });
    fs.writeFileSync(f, meta.text);
    done++;
  }
  const missing = sel.filter((r) => !fs.existsSync(G('text', `${r.docId}.txt`))).length;
  if (missing)
    return console.log(JSON.stringify({ textWritten: done, missing, note: 're-run to continue' }));
  const size = Number(arg('--batch', 10));
  let n = 0;
  for (let i = 0; i < sel.length; i += size) {
    const lines = sel.slice(i, i + size).map((r) => {
      const text = fs.readFileSync(G('text', `${r.docId}.txt`), 'utf8');
      return JSON.stringify({
        docId: r.docId,
        type: r.type,
        form: r.form,
        fields: SCHEMA[r.type],
        text: packetText(r.type, text),
      });
    });
    fs.writeFileSync(
      G('batches', `batch_${String(n++).padStart(2, '0')}.jsonl`),
      lines.join('\n') + '\n'
    );
  }
  console.log(JSON.stringify({ textWritten: done, batches: n, docs: sel.length }));
}

function verifyField(spec, f, docText) {
  if (f == null || f.value === null || f.value === undefined) return { ok: true, status: 'null' };
  if (!f.quote || !norm(docText).includes(norm(f.quote)))
    return { ok: false, status: 'quote-not-in-document' };
  if (spec.kind === 'number') {
    const v = Number(f.value);
    if (!Number.isFinite(v)) return { ok: false, status: 'value-not-numeric' };
    const toks = numbersIn(f.quote);
    if (toks.some((t) => Math.abs(t - v) <= Math.max(0.005 * Math.abs(v), 1e-9)))
      return { ok: true, status: 'verified' };
    const conv = toks.some(
      (t) =>
        t !== 0 &&
        v !== 0 &&
        [10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 0.1, 0.01, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7].some(
          (k) => Math.abs(t * k - v) <= 0.005 * Math.abs(v)
        )
    );
    return conv
      ? { ok: true, status: 'unit-converted' }
      : { ok: false, status: 'number-not-in-quote' };
  }
  if (spec.kind === 'enum' && !spec.values.includes(f.value))
    return { ok: false, status: 'enum-invalid' };
  if (spec.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(f.value)))
    return { ok: false, status: 'date-format' };
  if (spec.kind === 'bool' && typeof f.value !== 'boolean')
    return { ok: false, status: 'bool-invalid' };
  return { ok: true, status: 'verified' };
}

function verify() {
  const pass = arg('--pass', null);
  if (!pass) throw new Error('--pass A|B');
  const src = G(`labels_${pass}.jsonl`);
  const sel = new Map(L.readJsonl(G('selection.jsonl')).map((r) => [r.docId, r]));
  const out = [];
  const stats = {
    docs: 0,
    fields: 0,
    verified: 0,
    unitConverted: 0,
    nulls: 0,
    failed: 0,
    unknownDocs: 0,
  };
  const failures = {};
  for (const r of L.readJsonl(src)) {
    const s = sel.get(r.docId);
    if (!s) {
      stats.unknownDocs++;
      continue;
    }
    const docText = fs.readFileSync(G('text', `${r.docId}.txt`), 'utf8');
    const fields = {};
    for (const [name, spec] of Object.entries(SCHEMA[s.type])) {
      const v = verifyField(spec, r.fields && r.fields[name], docText);
      stats.fields++;
      if (v.status === 'null') stats.nulls++;
      else if (v.ok) v.status === 'unit-converted' ? stats.unitConverted++ : stats.verified++;
      else {
        stats.failed++;
        failures[v.status] = (failures[v.status] || 0) + 1;
      }
      fields[name] = {
        value: r.fields && r.fields[name] ? (r.fields[name].value ?? null) : null,
        quote: (r.fields && r.fields[name] && r.fields[name].quote) || null,
        verified: v.ok,
        status: v.status,
      };
    }
    stats.docs++;
    out.push({ docId: r.docId, type: s.type, fields });
  }
  fs.writeFileSync(
    G(`labels_${pass}.verified.jsonl`),
    out.map((r) => JSON.stringify(r)).join('\n') + (out.length ? '\n' : '')
  );
  console.log(JSON.stringify({ pass, ...stats, failures }));
}

const tokens = (s) =>
  new Set(
    norm(s)
      .replace(/[^a-z0-9. ]/g, ' ')
      .split(' ')
      .filter(Boolean)
  );
function same(spec, a, b) {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (spec.kind === 'number')
    return (
      Math.abs(Number(a) - Number(b)) <= Math.max(0.005 * Math.max(Math.abs(a), Math.abs(b)), 1e-9)
    );
  if (spec.kind === 'text') {
    const x = tokens(a);
    const y = tokens(b);
    const inter = [...x].filter((t) => y.has(t)).length;
    return inter / Math.min(x.size, y.size) >= 0.8;
  }
  return a === b;
}

function queue() {
  const A = new Map(L.readJsonl(G('labels_A.verified.jsonl')).map((r) => [r.docId, r]));
  const B = new Map(L.readJsonl(G('labels_B.verified.jsonl')).map((r) => [r.docId, r]));
  const sel = L.readJsonl(G('selection.jsonl'));
  const labels = [];
  const adjud = [];
  const c = { fields: 0, agreed: 0, adjudicate: 0, docsMissingPass: 0 };
  for (const s of sel) {
    const a = A.get(s.docId);
    const b = B.get(s.docId);
    if (!a || !b) {
      c.docsMissingPass++;
      continue;
    }
    const fields = {};
    for (const [name, spec] of Object.entries(SCHEMA[s.type])) {
      const fa = a.fields[name];
      const fb = b.fields[name];
      c.fields++;
      const bothOk = fa.verified && fb.verified;
      if (bothOk && same(spec, fa.value, fb.value)) {
        fields[name] = { value: fa.value, quote: fa.quote || fb.quote, source: 'agreed' };
        c.agreed++;
      } else {
        c.adjudicate++;
        adjud.push({
          docId: s.docId,
          type: s.type,
          split: s.split,
          form: s.form,
          field: name,
          A: { value: fa.value, quote: fa.quote, status: fa.status },
          B: { value: fb.value, quote: fb.quote, status: fb.status },
          file: s.file,
        });
      }
    }
    labels.push({ docId: s.docId, type: s.type, split: s.split, form: s.form, fields });
  }
  fs.writeFileSync(
    G('labels.jsonl'),
    labels.map((r) => JSON.stringify(r)).join('\n') + (labels.length ? '\n' : '')
  );
  fs.writeFileSync(
    G('adjudicate.jsonl'),
    adjud.map((r) => JSON.stringify(r)).join('\n') + (adjud.length ? '\n' : '')
  );
  const md = [
    '# Gold-set adjudication queue',
    '',
    `${adjud.length} fields need your decision (of ${c.fields}). Fill \`decisions.jsonl\`: one line per field \`{"docId":"...","field":"...","value":<final value or null>}\`, then run \`gold.js apply --file decisions.jsonl\`.`,
    '',
  ];
  for (const r of adjud)
    md.push(
      `- **${r.docId}** \`${r.field}\` (${r.type}, ${r.split}, ${r.form}): A = ${JSON.stringify(r.A.value)} [${r.A.status}] "${(r.A.quote || '').slice(0, 120)}" | B = ${JSON.stringify(r.B.value)} [${r.B.status}] "${(r.B.quote || '').slice(0, 120)}" — file: ${r.file}`
    );
  fs.writeFileSync(G('adjudicate.md'), `${md.join('\n')}\n`);
  console.log(JSON.stringify(c));
}

function apply() {
  const file = arg('--file', null);
  const decisions = L.readJsonl(file);
  const labels = new Map(L.readJsonl(G('labels.jsonl')).map((r) => [r.docId, r]));
  let n = 0;
  for (const d of decisions) {
    const doc = labels.get(d.docId);
    if (!doc || !SCHEMA[doc.type][d.field]) continue;
    doc.fields[d.field] = { value: d.value, quote: null, source: arg('--source', 'owner') };
    n++;
  }
  fs.writeFileSync(
    G('labels.jsonl'),
    [...labels.values()].map((r) => JSON.stringify(r)).join('\n') + '\n'
  );
  const remaining = L.readJsonl(G('adjudicate.jsonl')).filter(
    (r) => !(labels.get(r.docId).fields[r.field] || {}).source
  );
  fs.writeFileSync(
    G('adjudicate.jsonl'),
    remaining.map((r) => JSON.stringify(r)).join('\n') + (remaining.length ? '\n' : '')
  );
  console.log(JSON.stringify({ applied: n, remainingToAdjudicate: remaining.length }));
}

// Third-pass tie-break: a field is auto-resolved only when pass C's value carries a quote verified in the
// document AND agrees with A or B. Everything else stays in adjudicate.jsonl for the owner.
function tiebreak() {
  const file = G('labels_C.jsonl');
  const cs = L.readJsonl(file);
  const queue = L.readJsonl(G('adjudicate.jsonl'));
  const byKey = new Map(cs.map((c) => [`${c.docId}|${c.field}`, c]));
  const decisions = [];
  const stats = { disputes: queue.length, resolved: 0, cNotVerified: 0, cAgreesNeither: 0, noC: 0 };
  for (const r of queue) {
    const c = byKey.get(`${r.docId}|${r.field}`);
    if (!c) {
      stats.noC++;
      continue;
    }
    const spec = SCHEMA[r.type][r.field];
    const docText = fs.readFileSync(G('text', `${r.docId}.txt`), 'utf8');
    const v = verifyField(spec, { value: c.value, quote: c.quote }, docText);
    if (!v.ok) {
      stats.cNotVerified++;
      continue;
    }
    const side = [r.A, r.B].find(
      (x) =>
        x.value !== undefined &&
        same(spec, x.value ?? null, c.value ?? null) &&
        (x.status === 'verified' || x.status === 'null' || x.status === 'unit-converted')
    );
    if (!side) {
      stats.cAgreesNeither++;
      continue;
    }
    decisions.push({ docId: r.docId, field: r.field, value: c.value ?? null });
    stats.resolved++;
  }
  const out = G('decisions_auto.jsonl');
  fs.writeFileSync(
    out,
    decisions.map((d) => JSON.stringify(d)).join('\n') + (decisions.length ? '\n' : '')
  );
  console.log(
    JSON.stringify({
      ...stats,
      wrote: out,
      note: 'run: gold.js apply --file ' + out + ' --source auto-C',
    })
  );
}

function status() {
  const sel = L.readJsonl(G('selection.jsonl'));
  const labels = L.readJsonl(G('labels.jsonl'));
  const adj = L.readJsonl(G('adjudicate.jsonl'));
  const fieldsTotal = labels.reduce((a, r) => a + Object.keys(SCHEMA[r.type]).length, 0);
  const done = labels.reduce((a, r) => a + Object.values(r.fields).length, 0);
  console.log(
    JSON.stringify({
      selected: sel.length,
      labelledDocs: labels.length,
      fieldsLabelled: done,
      fieldsTotal,
      toAdjudicate: adj.length,
    })
  );
}

const cmd = process.argv[2];
Promise.resolve({ select, packets, verify, queue, tiebreak, apply, status }[cmd]?.()).catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
if (!['select', 'packets', 'verify', 'queue', 'tiebreak', 'apply', 'status'].includes(cmd))
  console.error('usage: gold.js select|packets|verify --pass A|B|queue|apply --file f|status');
