'use strict';

/**
 * resolveFilingContent.js — the single "check before you fetch" entry point
 * every document-touching skill should call FIRST, per
 * docs/REUSE_ARCHITECTURE_PLAN.md §4.1.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * `docExtracts.js` (Tier 1 — Filing Extract) and `buildBaselines.js` (Tier 2
 * — Company Baseline Card) already store verified, fact-only data that many
 * skills independently re-derive by fetching and re-reading the same PDFs.
 * The reuse failure traced in the plan (§1, Failure A) wasn't that skills
 * didn't know a shared store existed — the plan itself found only 3 of ~15
 * document-touching skills actually reading it. Writing "check docExtracts
 * first" into a dozen SKILL.md files is the same shape of failure as writing
 * "don't drift from the schema" into a prompt: it erodes under repetition
 * and gets skipped under time pressure. The fix is to make the check a single
 * function call so cheap and so clearly named that skipping it is more work
 * than using it.
 *
 * ── What this is not ─────────────────────────────────────────────────────
 * A pure, deterministic lookup. No model call, no PDF fetch, no judgment.
 * On a miss, the caller falls back to whatever it does today — this is
 * purely additive and never blocks a skill that hasn't adopted it, or a
 * document the pre-processing pipeline hasn't reached yet.
 *
 * ── Two call shapes ──────────────────────────────────────────────────────
 *   resolveFilingContent({ sourceUrl, profile })
 *       -> Tier 1 lookup: does a SERVED, current-schema Filing Extract exist
 *          for this exact document? (Never returns a shadow-profile extract
 *          — same guard docExtracts.get() already enforces.)
 *
 *   resolveFilingContent({ companyId })
 *       -> Tier 2 lookup: the company-level rollup (guidance ledger, claim
 *          index, commitments) — for a caller that isn't asking about one
 *          specific document, but "what do we already know about this
 *          company".
 *
 * Passing both `sourceUrl` and `companyId` resolves the document-level
 * (Tier 1) question — companyId is ignored in that case, since a specific
 * document identifies itself; call again with only companyId for the
 * company-level rollup.
 *
 * ── Staleness (plan §4.5) ────────────────────────────────────────────────
 * A stored record whose `profileSchemaVersion` is older than the profile's
 * currently DECLARED version (`docExtracts.declaredSchemaVersion`) is
 * treated as a miss, not served. This is what lets `profiles.md` change a
 * profile's schema without silently handing an old-shaped record to a
 * caller expecting the new fields — the same discipline the two manual
 * `__invalidated` passes during annual_report's calibration enforced by
 * hand, now automatic and keyed off a version bump instead of a one-off flag.
 */

const docExtracts = require('./docExtracts');
const buildBaselines = require('../buildBaselines');
const cacheUsageCounter = require('./cacheUsageCounter');
const { resolveJobName } = require('./scriptJobName');

/**
 * @param {object} args
 * @param {string} [args.sourceUrl] - the document's canonical URL (same value
 *   docExtracts/watchlistInsights hash their caches on).
 * @param {string} [args.profile] - required when sourceUrl is given; one of
 *   docExtracts.PROFILES.
 * @param {string} [args.companyId] - for a Tier 2 (company-level) lookup when
 *   sourceUrl is omitted.
 * @returns {
 *   {source: 'extract-cache', data: object, extractedAt: string, sourceUrl: string, profile: string} |
 *   {source: 'baseline-cache', data: object, builtAt: string, companyId: string} |
 *   {source: 'miss', reason: string, [sourceUrl]: string, [profile]: string, [companyId]: string, [recordVersion]: number, [declaredVersion]: number}
 * }
 */
function resolveFilingContent({ sourceUrl, profile, companyId } = {}) {
  if (sourceUrl) {
    if (!profile) {
      throw new Error('resolveFilingContent: profile is required when sourceUrl is given');
    }
    if (!docExtracts.PROFILES.includes(profile)) {
      throw new Error(
        `resolveFilingContent: unknown profile "${profile}" — one of ${docExtracts.PROFILES.join(', ')}`
      );
    }

    // Served only — a shadow-profile extract (still being calibrated) must
    // never reach a consumer through this path, same guard docExtracts.get()
    // already applies. No {includeShadow} escape hatch here on purpose: this
    // helper is for production skills, not calibration tooling.
    const jobName = resolveJobName('unknown-job');
    const rec = docExtracts.get(profile, sourceUrl);
    if (!rec) {
      cacheUsageCounter.record(jobName, { name: 'extract-cache', hit: false });
      return { source: 'miss', reason: 'not-yet-extracted', sourceUrl, profile };
    }

    const declaredVersion = docExtracts.declaredSchemaVersion(profile);
    // Records written before this versioning scheme existed carry no
    // `profileSchemaVersion` at all — treat that as version 0 (always stale)
    // rather than silently trusting an unstamped record's shape.
    const recordVersion = Number.isInteger(rec.profileSchemaVersion) ? rec.profileSchemaVersion : 0;
    if (recordVersion < declaredVersion) {
      // A stale-schema record is treated as a miss by the CALLER (it can't
      // consume the record), but it is NOT a cache-store miss — the
      // document genuinely was pre-processed once already; profiles.md's
      // schema just moved on since. Counting it as a plain 'extract-cache'
      // miss would conflate "never did this work" with "did this work,
      // needs a schema-version re-run" — two very different fixes.
      cacheUsageCounter.record(jobName, { name: 'extract-cache-stale-schema', hit: false });
      return {
        source: 'miss',
        reason: 'stale-schema',
        sourceUrl,
        profile,
        recordVersion,
        declaredVersion,
      };
    }

    cacheUsageCounter.record(jobName, { name: 'extract-cache', hit: true });
    return {
      source: 'extract-cache',
      data: rec.data,
      extractedAt: rec.extractedAt,
      sourceUrl,
      profile,
    };
  }

  if (companyId) {
    const jobName = resolveJobName('unknown-job');
    const card = buildBaselines.readCard(companyId);
    if (!card) {
      cacheUsageCounter.record(jobName, { name: 'baseline-cache', hit: false });
      return { source: 'miss', reason: 'no-baseline-card', companyId };
    }
    cacheUsageCounter.record(jobName, { name: 'baseline-cache', hit: true });
    return { source: 'baseline-cache', data: card, builtAt: card.builtAt, companyId };
  }

  throw new Error('resolveFilingContent: requires either {sourceUrl, profile} or {companyId}');
}

// ── CLI ──────────────────────────────────────────────────────────────────
// So a skill's bash-only steps (conventions §17: logic in scripts, judgment
// in the SKILL.md prose) can call this without writing a one-off require().
function argValue(flag, argv) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function main() {
  const argv = process.argv.slice(2);
  const sourceUrl = argValue('--url', argv);
  const profile = argValue('--profile', argv);
  const companyId = argValue('--company', argv);
  const result = resolveFilingContent({ sourceUrl, profile, companyId });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`${JSON.stringify({ error: e.message })}\n`);
    process.exit(1);
  }
}

module.exports = { resolveFilingContent };
