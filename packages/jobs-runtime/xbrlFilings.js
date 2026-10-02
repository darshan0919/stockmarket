#!/usr/bin/env node
'use strict';

/**
 * xbrlFilings.js — XBRL-first structured filings for a symbol: shareholding
 * pattern (with quarter-on-quarter diff), voting results, integrated
 * governance report and insider (PIT) trades. NSE first, BSE second; when
 * neither has XBRL the output says so (`fallbackToPdf: true`) and the calling
 * skill reads the PDF as before. Zero LLM.
 *
 * Usage:
 *   node xbrlFilings.js shareholding --symbol HNDFDS [--n 4]
 *   node xbrlFilings.js voting       --symbol HNDFDS [--n 3]
 *   node xbrlFilings.js governance   --symbol HNDFDS [--n 2]
 *   node xbrlFilings.js pit          --symbol HNDFDS --from DD-MM-YYYY --to DD-MM-YYYY
 *   node xbrlFilings.js events       --symbol KPIGREEN [--kinds credit-rating,reg30-para-b] [--from DD-MM-YYYY --to DD-MM-YYYY] [--n 10] [--full]
 *                                    (Reg-30 event XBRL; default window: last 90 days; --list-kinds prints the catalogue)
 */

const { NseClient } = require('../../stock-api/src/clients/NseClient.js');
const { BseClient } = require('../../stock-api/src/clients/BseClient.js');
const { createIssueLog } = require('./lib/xbrl/issues.js');
const { fetchFilingSeries } = require('./lib/xbrl/filingsFetch.js');
const { diffShareholding } = require('./lib/xbrl/filings.js');
const { fetchEventSeries } = require('./lib/xbrl/eventsFetch.js');
const { EVENT_KINDS, UNMAPPED_BSE_FLAGS } = require('./lib/xbrl/events.js');

function parseArgs(argv) {
  const [kind, ...rest] = argv;
  const o = {
    kind,
    symbol: null,
    n: null,
    from: null,
    to: null,
    bseScrip: null,
    kinds: null,
    full: false,
    listKinds: false,
  };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--symbol')
      o.symbol = String(rest[++i])
        .replace(/^(NSE|BSE):/i, '')
        .toUpperCase();
    else if (rest[i] === '--n') o.n = Number(rest[++i]);
    else if (rest[i] === '--from') o.from = rest[++i];
    else if (rest[i] === '--to') o.to = rest[++i];
    else if (rest[i] === '--bse-scrip') o.bseScrip = rest[++i];
    else if (rest[i] === '--kinds') o.kinds = String(rest[++i]).split(',').filter(Boolean);
    else if (rest[i] === '--full') o.full = true;
    else if (rest[i] === '--list-kinds') o.listKinds = true;
  }
  return o;
}

async function runEvents(a) {
  const issues = createIssueLog(`xbrl-events-${a.symbol}-${Date.now()}`);
  const series = await fetchEventSeries({
    symbol: a.symbol,
    kinds: a.kinds || undefined,
    from: a.from || undefined,
    to: a.to || undefined,
    limit: a.n || 10,
    nse: new NseClient(),
    bse: new BseClient(),
    issues,
    bseScrip: a.bseScrip || undefined,
  });
  const kinds = {};
  let total = 0;
  for (const [k, v] of Object.entries(series.kinds)) {
    total += v.items.length;
    kinds[k] = {
      label: EVENT_KINDS[k].label,
      source: v.exchange ? `xbrl-${v.exchange.toLowerCase()}` : null,
      items: v.items.map((i) => ({
        ref: i.ref,
        exchange: i.exchange,
        url: i.url,
        broadcast: i.broadcast,
        eventType: i.eventType,
        summary: i.summary,
        recordSummary: i.recordSummary,
        numbersCr: i.numbersCr,
        ...(a.full ? { fields: i.fields, records: i.records, numbers: i.numbers } : {}),
      })),
    };
  }
  process.stdout.write(
    JSON.stringify(
      {
        kind: 'events',
        symbol: a.symbol,
        window: { from: series.from, to: series.to },
        total,
        kinds,
        note: 'An empty kind means no such event in the window (normal). Events NSE/BSE do not publish as XBRL (e.g. NSE order wins) come from the announcement PDF.',
        issues: issues.all(),
        issueSummary: issues.summary(),
      },
      null,
      2
    ) + '\n'
  );
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.kind === 'events' && a.listKinds) {
    process.stdout.write(
      JSON.stringify({ kinds: EVENT_KINDS, unmappedBseFlags: UNMAPPED_BSE_FLAGS }, null, 2) + '\n'
    );
    return;
  }
  if (a.kind === 'events' && a.symbol) return runEvents(a);
  if (!['shareholding', 'voting', 'governance', 'pit', 'brsr'].includes(a.kind) || !a.symbol) {
    process.stdout.write(
      JSON.stringify({
        error: 'usage: xbrlFilings.js <shareholding|voting|governance|pit|brsr|events> --symbol X',
      }) + '\n'
    );
    process.exit(1);
  }
  const issues = createIssueLog(`xbrl-${a.kind}-${a.symbol}-${Date.now()}`);
  const limit = a.n || { shareholding: 4, voting: 3, governance: 2, pit: 50, brsr: 2 }[a.kind];
  const series = await fetchFilingSeries({
    kind: a.kind,
    symbol: a.symbol,
    limit,
    from: a.from,
    to: a.to,
    nse: new NseClient(),
    bse: new BseClient(),
    issues,
    bseScrip: a.bseScrip || undefined,
  });
  const out = {
    kind: a.kind,
    symbol: a.symbol,
    source: series.exchange ? `xbrl-${series.exchange.toLowerCase()}` : null,
    fallbackToPdf: series.items.length === 0,
    items: series.items.map((i) => ({
      ref: i.ref,
      url: i.url,
      broadcast: i.broadcast,
      exchange: i.exchange,
      data: i.dto,
    })),
    issues: issues.all(),
    issueSummary: issues.summary(),
  };
  if (a.kind === 'shareholding' && series.items.length >= 2) {
    out.quarterOnQuarter = diffShareholding(series.items[0].dto, series.items[1].dto);
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

if (require.main === module) main();
