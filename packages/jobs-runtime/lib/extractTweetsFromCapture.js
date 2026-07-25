#!/usr/bin/env node
/**
 * Extracts {author, createdAt, text} tuples from a raw console-log dump
 * produced by the tweet-signal-capture-extension (the Chrome MCP's
 * console-reading tool saves oversized results to a text file — this script
 * operates on that saved file directly, so nothing large needs to be loaded
 * into a chat context window).
 *
 * This is a best-effort WINDOWED regex extraction, not a real JSON parse —
 * the captured console text is JSON-escaped inside {type,text} wrapper
 * objects, at a scale (multi-MB) where round-tripping through a real JSON
 * parser in-context isn't practical. It relies on X's GraphQL tweet schema
 * consistently ordering fields as: user.screen_name -> user.created_at
 * (account creation, always an OLD date) -> tweet.created_at (the real post
 * timestamp, always RECENT) -> tweet.full_text, within a bounded distance of
 * each other. Verified against a real capture during prototyping (see
 * skills/equity-research/tweet-signals/SKILL.md).
 *
 * Usage:
 *   node extractTweetsFromCapture.js <path-to-console-dump.txt> > tweets.json
 */
const fs = require('fs');

const WINDOW = 4000; // max chars between screen_name and full_text to still count as one tweet
const RECENT_YEAR_RE = /202[4-9]/; // treat as "recent" (tweet timestamp, not account-creation date)

function extractTuples(raw) {
  const tuples = [];
  const screenNameRe = /screen_name\\?"?:\\?"([A-Za-z0-9_]{1,20})/g;
  let m;
  while ((m = screenNameRe.exec(raw)) !== null) {
    const author = m[1];
    const windowText = raw.slice(m.index, m.index + WINDOW);

    // Find the first "recent" created_at within the window (skips the
    // account-creation created_at, which is usually the first one seen).
    const createdAtRe =
      /created_at\\?"?:\\?"((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \w+ \d+ [\d:]+ \+0000 \d{4})/g;
    let createdAt = null;
    let ca;
    while ((ca = createdAtRe.exec(windowText)) !== null) {
      if (RECENT_YEAR_RE.test(ca[1])) {
        createdAt = ca[1];
        break;
      }
    }
    if (!createdAt) continue;

    const fullTextRe = /full_text\\?"?:\\?"([^\\]{1,320})/;
    const ft = windowText.match(fullTextRe);
    if (!ft) continue;

    tuples.push({ author, createdAt, text: ft[1].trim() });
  }
  return tuples;
}

function dedupe(tuples) {
  const seen = new Set();
  const out = [];
  for (const t of tuples) {
    const key = `${t.author}::${t.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node extractTweetsFromCapture.js <console-dump.txt>');
    process.exit(1);
  }
  const raw = fs.readFileSync(inputPath, 'utf8');
  const tuples = dedupe(extractTuples(raw));

  const tweets = tuples.map((t, i) => ({
    id: `extract-${i}`,
    author: t.author,
    createdAt: t.createdAt,
    text: t.text,
  }));

  console.log(
    JSON.stringify(
      {
        captureMethod: 'extension-network-interception',
        extractedAt: new Date().toISOString(),
        totalExtracted: tweets.length,
        tweets,
      },
      null,
      2
    )
  );
}

main();
