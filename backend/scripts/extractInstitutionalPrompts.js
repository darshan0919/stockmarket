/**
 * Splits the institutional equity guide PDF into prompt .txt files for API + agent skills.
 * Run from backend: node scripts/extractInstitutionalPrompts.js
 */
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const REPO_ROOT = path.join(__dirname, '../..');
const SOURCE = path.join(
  REPO_ROOT,
  'Dashboard_complete_GuideExtraction___Generation_18_04_26_lyst1776605515998.pdf'
);
const OUT_BACKEND = path.join(__dirname, '../prompts/institutional-equity');
const OUT_SKILL_EXTRACTION = path.join(
  REPO_ROOT,
  '.agents/skills/equity-research-extraction/prompts'
);
const OUT_SKILL_DASHBOARD = path.join(
  REPO_ROOT,
  '.agents/skills/equity-research-dashboard/prompts'
);

function stripPageMarkers(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*--\s*\d+\s+of\s+\d+\s+--\s*$/.test(line.trim()))
    .join('\n');
}

function between(text, startNeedle, endNeedle) {
  const i = text.indexOf(startNeedle);
  const j = text.indexOf(endNeedle, i + startNeedle.length);
  if (i === -1 || j === -1) {
    throw new Error(
      `Marker not found:\n  start: ${startNeedle.slice(0, 80)}...\n  end: ${endNeedle.slice(0, 80)}...`
    );
  }
  return text.slice(i, j).trim();
}

function fixUrls(s) {
  return s.replace(/hlps:\/\//g, 'https://');
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Missing source file:', SOURCE);
    process.exit(1);
  }
  const dataBuffer = fs.readFileSync(SOURCE);
  const result = await pdf(dataBuffer);
  const text = stripPageMarkers(result.text);

  const unified = between(
    text,
    'I have 5 document folders containing PDFs for a company research project.',
    'End of copy-paste block'
  );

  const annual = between(
    text,
    'EXTRACTION PROMPT 1: ANNUAL REPORTS ONLY',
    'EXTRACTION PROMPT 2: CONCALLS ONLY'
  );

  const concalls = between(
    text,
    'EXTRACTION PROMPT 2: CONCALLS ONLY',
    'EXTRACTION PROMPT 3: INVESTOR PRESENTATIONS ONLY'
  );

  const investor = between(
    text,
    'EXTRACTION PROMPT 3: INVESTOR PRESENTATIONS ONLY',
    'EXTRACTION PROMPT 4: CREDIT RATING REPORTS ONLY'
  );

  const credit = between(
    text,
    'EXTRACTION PROMPT 4: CREDIT RATING REPORTS ONLY',
    'EXTRACTION PROMPT 5: EVENTS & ANNOUNCEMENTS ONLY'
  );

  const events = between(
    text,
    'EXTRACTION PROMPT 5: EVENTS & ANNOUNCEMENTS ONLY',
    'PROJECT B: EQUITY DASHBOARD GENERATOR'
  );

  const dashboard = fixUrls(
    between(
      text,
      'INSTITUTIONAL EQUITY RESEARCH DASHBOARD — MASTER PROMPT v4.0',
      'End of copy-paste block (above this)'
    )
  );

  fs.mkdirSync(OUT_BACKEND, { recursive: true });
  fs.mkdirSync(OUT_SKILL_EXTRACTION, { recursive: true });
  fs.mkdirSync(OUT_SKILL_DASHBOARD, { recursive: true });

  const extractionFiles = [
    ['unified_master.txt', unified],
    ['annual_reports.txt', annual],
    ['concalls.txt', concalls],
    ['investor_presentations.txt', investor],
    ['credit_ratings.txt', credit],
    ['events_announcements.txt', events],
  ];

  for (const [fname, content] of extractionFiles) {
    fs.writeFileSync(path.join(OUT_BACKEND, fname), content + '\n', 'utf8');
    fs.writeFileSync(path.join(OUT_SKILL_EXTRACTION, fname), content + '\n', 'utf8');
  }

  fs.writeFileSync(path.join(OUT_BACKEND, 'dashboard_master_v4.txt'), dashboard + '\n', 'utf8');
  fs.writeFileSync(
    path.join(OUT_SKILL_DASHBOARD, 'dashboard_master_v4.txt'),
    dashboard + '\n',
    'utf8'
  );

  console.log('Wrote institutional-equity prompts to', OUT_BACKEND);
  console.log('Wrote skill prompts to', OUT_SKILL_EXTRACTION, 'and', OUT_SKILL_DASHBOARD);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
