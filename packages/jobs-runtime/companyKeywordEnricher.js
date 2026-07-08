#!/usr/bin/env node
/**
 * Company keyword enricher — populates company-master.json's keywords[]
 * using a day's captured tweets, so future tweets that mention a company by
 * an alias/short name (not the exact Kite `name` field, not a #TICKER
 * hashtag) can still be resolved.
 *
 * HIGH-CONFIDENCE ONLY. A candidate phrase is only added as a keyword for a
 * company when it can be tied to that company's already-known NSE ticker or
 * normalized company name within the SAME tweet — no fuzzy/guessed
 * associations. This deliberately leaves some tweets unmatched rather than
 * risk polluting the shared master DB with wrong aliases.
 *
 * Usage:
 *   node companyKeywordEnricher.js jobs/data/tweet_signals/{date}_tweets_raw.json
 */
const fs = require('fs');
const path = require('path');
const { loadCompanyMaster, normalizeName, MASTER_PATH } = require('./lib/companyMaster');

/** Candidate "lead phrase" patterns bots/alerts commonly use to name a company. */
function extractCandidatePhrases(text) {
  const candidates = [];
  // "NATCO PHARMA LTD: ..." / "CEIGALL INDIA LTD: CO. EMERGES..."
  const leadColon = text.match(/^([A-Z][A-Z0-9&.,'()\-\s]{3,60}?):/);
  if (leadColon) candidates.push(leadColon[1].trim());
  // "TATA POWER AGM" / "KPIT IN FOCUS" style headers (no colon)
  const inFocus = text.match(/^([A-Z][A-Z0-9&.,'()\-\s]{3,60}?)\s+(IN FOCUS|AGM)\b/);
  if (inFocus) candidates.push(inFocus[1].trim());
  return candidates;
}

function main() {
  const tweetsPath = process.argv[2];
  if (!tweetsPath) {
    console.error('Usage: node companyKeywordEnricher.js <tweets_raw.json>');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(tweetsPath, 'utf8'));
  const tweets = raw.tweets || [];

  const master = loadCompanyMaster({ forceReload: true });
  let addedCount = 0;
  const addedLog = [];

  for (const tweet of tweets) {
    const text = String(tweet.text || '');
    const upper = text.toUpperCase();

    // Anchor 1: an explicit #TICKER hashtag matching a known NSE ticker.
    const hashtagMatch = upper.match(/#([A-Z0-9]{2,20})\b/);
    const tickerAnchor = hashtagMatch ? master._byNseTicker.get(hashtagMatch[1]) : null;

    const candidates = extractCandidatePhrases(text.toUpperCase());

    for (const candidate of candidates) {
      const normCandidate = normalizeName(candidate);
      if (normCandidate.length < 3) continue;

      // Anchor 2: candidate phrase's normalized form matches (or is contained
      // by / contains) a known company's normalized name.
      let nameAnchor = master._byNormName.get(normCandidate) || null;
      if (!nameAnchor) {
        for (const [norm, company] of master._byNormName) {
          if (norm.length >= 4 && (normCandidate.includes(norm) || norm.includes(normCandidate))) {
            nameAnchor = company;
            break;
          }
        }
      }

      const company = tickerAnchor || nameAnchor;
      if (!company) continue;

      // Only add if this exact candidate string isn't already a keyword.
      if (!company.keywords.includes(candidate)) {
        company.keywords.push(candidate);
        addedCount++;
        addedLog.push({ companyId: company.companyId, keyword: candidate, viaTicker: !!tickerAnchor, viaName: !!nameAnchor });
      }
    }
  }

  master.generatedAt = new Date().toISOString();
  fs.writeFileSync(MASTER_PATH, JSON.stringify(
    {
      generatedAt: master.generatedAt,
      source: master.source,
      totalCompanies: master.totalCompanies,
      nseListed: master.nseListed,
      bseOnly: master.bseOnly,
      companies: master.companies,
    },
    null,
    2
  ));

  console.log(JSON.stringify({ status: 'ok', tweetsProcessed: tweets.length, keywordsAdded: addedCount, sample: addedLog.slice(0, 15) }, null, 2));
}

main();
