#!/usr/bin/env node
'use strict';

/**
 * preprocessCalibrate.js — L3 of the verification design
 * (docs/PREPROCESSING_PIPELINE_PLAN.md §2).
 *
 * A profile does not go live until it has passed this gate: numeric fields agree
 * with a flagship read on real documents at >= the threshold below, and no field
 * mis-signs a direction. `docExtracts.isEnabled()` reads `PREPROCESS_PROFILES`,
 * so "passed the gate" and "is queued" are the same switch — the gate is enforced
 * in code rather than by remembering to honour it.
 *
 * This is not ceremony. The P0 work on this pipeline produced a coverage metric
 * that read 13% when the truth was 92% — plausible, stable, and wrong by 7x —
 * because of a sampling artifact nobody would have guessed at. Extraction
 * accuracy has exactly the same failure shape, and the only defence is measuring
 * it against a known-good read before trusting it, per profile, on real documents.
 *
 * Two commands, because the middle step is a model's job and not a script's:
 *
 *   plan  --profile result --n 15
 *       Picks N real documents whose text is already cached (so both readers see
 *       the identical input, and neither is advantaged by a better fetch), and
 *       writes a worksheet. The agent then reads each document properly — full
 *       flagship attention, no schema shortcuts — and fills in `reference`.
 *
 *   score --profile result --worksheet <file>
 *       Deterministic field-by-field diff of the stored cheap-agent extracts
 *       against that reference. Emits per-field agreement, the numeric-agreement
 *       rate that gates the profile, and every disagreement in full so a failure
 *       is diagnosable rather than just a number.
 */

const fs = require('fs');
const path = require('path');
const { argValue } = require('./lib/env');
const db = require('./lib/db');
const docExtracts = require('./lib/docExtracts');

// The gate. Numeric fields must agree at this rate, AND no directional field may
// disagree at all — a wrong number is a bad datum, a wrong SIGN is a wrong thesis.
const NUMERIC_AGREEMENT_THRESHOLD = 0.98;
const NUMERIC_TOLERANCE = 0.005; // 0.5% relative — rounding, not disagreement

function worksheetPath(profile) {
  return path.join(db.cachePath(path.join('doc-extracts', '_calibration')), `${profile}.json`);
}

/** Flatten to scalar leaves keyed by dotted path, so two shapes can be compared. */
function flatten(node, out = {}, trail = '') {
  if (node === null || typeof node !== 'object') {
    if (trail) out[trail] = node;
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => flatten(v, out, `${trail}[${i}]`));
    return out;
  }
  for (const [k, v] of Object.entries(node)) flatten(v, out, trail ? `${trail}.${k}` : k);
  return out;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function numbersAgree(a, b) {
  if (!isNum(a) || !isNum(b)) return false;
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale === 0 ? true : Math.abs(a - b) / scale <= NUMERIC_TOLERANCE;
}

function cmdPlan(argv) {
  const profile = argValue('--profile', argv);
  const n = Number(argValue('--n', argv) || 15);
  if (!profile) throw new Error('plan requires --profile');

  // Only documents whose text is already cached: both readers must see the
  // identical input, or the diff measures fetch quality rather than extraction.
  const dir = docExtracts.dir(profile);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  const rows = [];
  const truncatedSkipped = [];
  for (const f of files) {
    const e = docExtracts.get(
      profile,
      JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).sourceUrl
    );
    if (!e) continue;
    // Both readers must see the SAME and COMPLETE document. A truncated source
    // makes the whole exercise meaningless in the most dangerous way: two readers
    // handed the same 8,000-char excerpt of a 951,309-char annual report agree
    // perfectly, the gate returns PASS, and it certifies a profile that reads
    // under 1% of the document. Skip these rather than score them.
    const meta = docExtracts.sourceTextMeta(e.sourceUrl);
    if (meta == null) continue;
    if (meta.truncated) {
      truncatedSkipped.push(e.sourceUrl);
      continue;
    }
    rows.push({ sourceUrl: e.sourceUrl, companyId: e.companyId || null, reference: null });
    if (rows.length >= n) break;
  }

  const out = worksheetPath(profile);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        profile,
        createdAt: new Date().toISOString(),
        instructions:
          'For each row, read the source document with full attention and fill `reference` ' +
          'with the SAME schema the profile emits. Do not look at the stored extract first — ' +
          'anchoring on it is how a calibration run confirms whatever it was going to confirm. ' +
          'Then run: preprocessCalibrate.js score --profile <p> --worksheet <this file>',
        threshold: { numericAgreement: NUMERIC_AGREEMENT_THRESHOLD, tolerance: NUMERIC_TOLERANCE },
        rows,
      },
      null,
      2
    )
  );
  process.stdout.write(
    JSON.stringify({ status: 'planned', profile, documents: rows.length, worksheet: out }, null, 2)
  );
}

function cmdScore(argv) {
  const profile = argValue('--profile', argv);
  if (!profile) throw new Error('score requires --profile');
  const wsPath = argValue('--worksheet', argv) || worksheetPath(profile);
  const ws = JSON.parse(fs.readFileSync(wsPath, 'utf8'));

  const filled = ws.rows.filter((r) => r.reference && typeof r.reference === 'object');
  if (!filled.length) throw new Error(`no rows in ${wsPath} have a filled \`reference\``);

  let numTotal = 0;
  let numAgree = 0;
  let strTotal = 0;
  let strAgree = 0;
  const signFlips = [];
  const disagreements = [];
  const perField = {};

  for (const row of filled) {
    const stored = docExtracts.get(profile, row.sourceUrl, { includeShadow: true });
    if (!stored) {
      disagreements.push({ sourceUrl: row.sourceUrl, issue: 'no stored extract' });
      continue;
    }
    const A = flatten(stored.data || {});
    const B = flatten(row.reference || {});
    for (const [k, refVal] of Object.entries(B)) {
      // Quotes are L1's job, not L3's — two readers will legitimately pick
      // different (both correct) supporting quotes, and scoring that as
      // disagreement would drown the numeric signal this gate exists to measure.
      if (/quote|\.text$/i.test(k)) continue;
      const gotVal = A[k];
      perField[k] = perField[k] || { checked: 0, agreed: 0 };
      perField[k].checked += 1;

      if (isNum(refVal)) {
        numTotal += 1;
        if (numbersAgree(refVal, gotVal)) {
          numAgree += 1;
          perField[k].agreed += 1;
        } else {
          disagreements.push({ sourceUrl: row.sourceUrl, field: k, expected: refVal, got: gotVal });
          // A sign flip is disqualifying on its own, however good the rate is.
          if (isNum(gotVal) && Math.sign(refVal) !== Math.sign(gotVal) && refVal !== 0) {
            signFlips.push({ sourceUrl: row.sourceUrl, field: k, expected: refVal, got: gotVal });
          }
        }
      } else if (typeof refVal === 'string' && refVal.trim()) {
        strTotal += 1;
        const same =
          typeof gotVal === 'string' && gotVal.trim().toLowerCase() === refVal.trim().toLowerCase();
        if (same) {
          strAgree += 1;
          perField[k].agreed += 1;
        } else {
          disagreements.push({ sourceUrl: row.sourceUrl, field: k, expected: refVal, got: gotVal });
        }
      }
    }
  }

  const numericAgreement = numTotal ? numAgree / numTotal : null;
  const passes =
    numericAgreement !== null &&
    numericAgreement >= NUMERIC_AGREEMENT_THRESHOLD &&
    signFlips.length === 0;

  process.stdout.write(
    JSON.stringify(
      {
        profile,
        documentsScored: filled.length,
        numericFields: numTotal,
        numericAgreement: numericAgreement === null ? null : Number(numericAgreement.toFixed(4)),
        stringFields: strTotal,
        stringAgreement: strTotal ? Number((strAgree / strTotal).toFixed(4)) : null,
        signFlips,
        // The verdict is the whole point: a gate that reports numbers and leaves
        // the decision to whoever reads them is not a gate.
        verdict: passes ? 'PASS — safe to enable this profile' : 'FAIL — do not enable',
        blockedBy: passes
          ? []
          : [
              ...(numericAgreement === null ? ['no numeric fields to score'] : []),
              ...(numericAgreement !== null && numericAgreement < NUMERIC_AGREEMENT_THRESHOLD
                ? [
                    `numeric agreement ${(numericAgreement * 100).toFixed(1)}% < ${NUMERIC_AGREEMENT_THRESHOLD * 100}%`,
                  ]
                : []),
              ...(signFlips.length ? [`${signFlips.length} directional sign flip(s)`] : []),
            ],
        worstFields: Object.entries(perField)
          .filter(([, v]) => v.agreed < v.checked)
          .sort((a, b) => a[1].agreed / a[1].checked - b[1].agreed / b[1].checked)
          .slice(0, 10)
          .map(([k, v]) => ({ field: k, agreed: v.agreed, checked: v.checked })),
        disagreements: disagreements.slice(0, 40),
        disagreementsTotal: disagreements.length,
      },
      null,
      2
    )
  );
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const commands = { plan: cmdPlan, score: cmdScore };
  const fn = commands[cmd];
  if (!fn) {
    process.stderr.write(`Usage: preprocessCalibrate.js <plan|score> --profile <p> [args]\n`);
    process.exit(1);
  }
  fn(rest);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`[calibrate] fatal: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { flatten, numbersAgree, NUMERIC_AGREEMENT_THRESHOLD };
