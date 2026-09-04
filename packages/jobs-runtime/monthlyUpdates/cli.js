#!/usr/bin/env node
'use strict';
/**
 * CLI for the monthly-updates tracker.
 *
 *   yarn monthly-updates fetch    — scan + download + extract text (cached)
 *   yarn monthly-updates batches  — emit agent work-packets for unparsed filings
 *   yarn monthly-updates ingest   — validate + store the agent's JSON rows
 *   yarn monthly-updates build    — persist events + report DTO, render the page
 *   yarn monthly-updates deploy   — publish the rendered page to Vercel
 *   yarn monthly-updates run      — fetch, then build (skips the parse step)
 *
 * The parse step is deliberately split out: judgment belongs to the agent
 * running the skill, never to a script calling a model API.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '../../..');
require(path.join(REPO, 'packages/jobs-runtime/lib/env.js')).loadEnv(null);

const db = require('../lib/db.js');
const { extractMonthlyUpdates } = require('./fetchUpdates.js');
const { buildParseBatches, renderBatch, ingestParsedBatch } = require('./parseFiling.js');
const { persistAll } = require('./persist.js');
const { renderToFile } = require('./renderApp.js');

const OUT_HTML = () => db.assetPath('monthly-updates/index.html');

function arg(name, dflt = null) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
function flag(name) {
  return process.argv.includes(name);
}

function loadTextCache() {
  const dir = db.cachePath('monthly-updates-text');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

async function cmdFetch() {
  const { StockscansClient } = require(
    path.join(REPO, 'stock-api/src/clients/StockscansClient.js')
  );
  const months = Number(arg('--months', 15));
  const maxDay = Number(arg('--max-day', 3));
  const res = await extractMonthlyUpdates(new StockscansClient(), {
    months,
    maxDayOfMonth: maxDay,
    force: flag('--force'),
  });
  console.log(JSON.stringify({ ...res.stats, failures: res.stats.failures.length }, null, 2));
  if (res.stats.failures.length)
    console.warn('failures:', JSON.stringify(res.stats.failures.slice(0, 5)));
  return res;
}

function cmdBatches() {
  const recs = loadTextCache();
  const { batches, skipped, pending } = buildParseBatches(recs, { force: flag('--force') });
  const dir = path.join(db.dataRoot(), 'runs', 'monthly-updates-batches');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'batches.json'), JSON.stringify(batches));
  batches.forEach((b) => {
    fs.writeFileSync(
      path.join(dir, `batch_${String(b.index).padStart(2, '0')}.txt`),
      renderBatch(b)
    );
  });
  console.log(
    JSON.stringify(
      {
        cachedFilings: recs.length,
        alreadyParsed: skipped,
        pendingParse: pending,
        batches: batches.length,
        dir,
      },
      null,
      2
    )
  );
}

function cmdIngest() {
  const dir = path.join(db.dataRoot(), 'runs', 'monthly-updates-batches');
  const batchFile = path.join(dir, 'batches.json');
  if (!fs.existsSync(batchFile)) throw new Error(`no batches.json — run "batches" first (${dir})`);
  const batches = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
  const from = arg('--from', dir);
  let accepted = 0;
  let rejected = 0;
  const problems = [];
  for (const b of batches) {
    const f = path.join(from, `batch_${String(b.index).padStart(2, '0')}.json`);
    if (!fs.existsSync(f)) {
      problems.push(`missing ${path.basename(f)}`);
      continue;
    }
    let rows;
    try {
      rows = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      problems.push(`bad JSON ${path.basename(f)}`);
      continue;
    }
    const r = ingestParsedBatch(b, rows);
    accepted += r.stats.accepted;
    rejected += r.stats.rejected;
    if (r.stats.rejected)
      problems.push(`batch ${b.index}: ${JSON.stringify(r.rejected.slice(0, 2))}`);
  }
  console.log(JSON.stringify({ accepted, rejected, problems }, null, 2));
  if (problems.length) process.exitCode = 1;
}

function cmdBuild() {
  const r = persistAll();
  const out = OUT_HTML();
  const w = renderToFile(r.dto, out);
  console.log(
    JSON.stringify(
      {
        companies: r.dto.summary.companies,
        monthlyFilers: r.dto.companies.filter((c) => c.isMonthly).length,
        quarterlyFilers: r.dto.companies.filter((c) => !c.isMonthly).length,
        with12m: r.dto.summary.companiesWith12m,
        latestPeriod: r.dto.summary.latestPeriod,
        reportId: r.reportId,
        events: r.eventStats.stats,
        page: w.path,
        pageKb: Math.round(w.bytes / 1024),
        filesTouched: r.touched,
      },
      null,
      2
    )
  );
  return r;
}

/**
 * Publish to Vercel. Uses the Vercel CLI, which reads its own credentials from
 * `vercel login` (or a VERCEL_TOKEN in the environment) — this repo does not
 * store a deploy token of its own.
 */
function cmdDeploy() {
  const out = OUT_HTML();
  if (!fs.existsSync(out)) throw new Error('nothing to deploy — run "build" first');
  const dir = path.dirname(out);
  // A minimal config so Vercel serves the directory as a static site.
  fs.writeFileSync(
    path.join(dir, 'vercel.json'),
    JSON.stringify(
      {
        cleanUrls: true,
        headers: [
          {
            source: '/(.*)',
            headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
          },
        ],
      },
      null,
      2
    )
  );
  const project = arg('--project', process.env.MONTHLY_UPDATES_VERCEL_PROJECT || 'monthly-updates');
  const args = ['--yes', '--prod', '--cwd', dir];
  if (process.env.VERCEL_TOKEN) args.push('--token', process.env.VERCEL_TOKEN);
  try {
    const stdout = execFileSync('vercel', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const url = (stdout.match(/https:\/\/\S+\.vercel\.app/g) || []).pop() || null;
    console.log(JSON.stringify({ deployed: true, url, project }, null, 2));
    return url;
  } catch (e) {
    // A missing CLI / not-logged-in is an operator action, not a code bug —
    // say exactly what to do rather than failing opaquely.
    const msg = String(e.stderr || e.message || '').slice(0, 400);
    console.error(
      [
        'Vercel deploy failed.',
        msg,
        '',
        'Fix: install once with `npm i -g vercel`, authenticate once with `vercel login`',
        '(or export VERCEL_TOKEN), then re-run `yarn monthly-updates deploy`.',
        `The rendered page is already saved at: ${out}`,
      ].join('\n')
    );
    process.exitCode = 1;
    return null;
  }
}

async function cmdNotify() {
  const { sendMonthlyUpdatesEmail } = require('./notify');
  const dryRun = process.argv.includes('--dry-run');
  const to = arg('--to');
  const deployUrl = arg('--deploy-url');
  await sendMonthlyUpdatesEmail({ to, dryRun, deployUrl });
}

async function main() {
  const cmd = process.argv[2] || 'run';
  if (cmd === 'fetch') return void (await cmdFetch());
  if (cmd === 'batches') return cmdBatches();
  if (cmd === 'ingest') return cmdIngest();
  if (cmd === 'build') return void cmdBuild();
  if (cmd === 'deploy') return void cmdDeploy();
  if (cmd === 'notify') return void (await cmdNotify());
  if (cmd === 'run') {
    await cmdFetch();
    cmdBuild();
    return;
  }
  console.error(
    `unknown command "${cmd}" — use: fetch | batches | ingest | build | deploy | notify | run`
  );
  process.exitCode = 1;
}

if (require.main === module)
  main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
  });
module.exports = { cmdFetch, cmdBatches, cmdIngest, cmdBuild, cmdDeploy, cmdNotify };
