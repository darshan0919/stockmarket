'use strict';

/**
 * historyPack.js — pure assembly of the `quarterly-result-history` record: everything
 * quarterly-result-analysis needs about the PAST, prepared before the result so the
 * result-day run only reasons about what is new.
 *
 * All reasoning-heavy inputs arrive as verified `concall-digest` DTOs (callDigest.js); this
 * module only joins, counts and sorts (conventions §17). Every input is an explicit argument.
 */

const {
  collectPriorGuidance,
  buildWalkTheTalkLedger,
  normalizeQuarter,
  quarterLabel,
} = require('@stock/api/analyzers/resultInflection');
const { quarterEndIso } = require('./period');

const REPORT_TYPE = 'quarterly-result-history';
const CREATOR = 'quarterly-result-extractor';
/** basket_framework.md 1B: "one-off" excuses in >= 2 of the trailing 4 quarters = recurrent. */
const ONE_OFF_RECURRENCE_THRESHOLD = 2;
const ONE_OFF_WINDOW = 4;

/**
 * "One-off" excuses across the trailing quarters, from verified digests.
 * @param {Array<Object>} digests newest first
 * @returns {Object}
 */
function oneOffRecurrence(digests) {
  const window = digests.slice(0, ONE_OFF_WINDOW);
  const items = window.flatMap((d) =>
    (d.oneOffs || []).map((o) => ({ quarter: quarterLabel(d.quarter), ...o }))
  );
  const quartersWithOneOffs = window
    .filter((d) => (d.oneOffs || []).length)
    .map((d) => quarterLabel(d.quarter));
  return {
    window: window.map((d) => quarterLabel(d.quarter)),
    quartersWithOneOffs,
    count: quartersWithOneOffs.length,
    threshold: ONE_OFF_RECURRENCE_THRESHOLD,
    recurrent: quartersWithOneOffs.length >= ONE_OFF_RECURRENCE_THRESHOLD,
    items,
  };
}

/**
 * Tone + topic arc of prior calls, newest first (basket 3B / tone_taxonomy "change vs prior").
 * @param {Array<Object>} digests newest first
 * @returns {Array<Object>}
 */
function narrativeArc(digests) {
  return digests.map((d) => ({
    quarter: quarterLabel(d.quarter),
    digestId: d.id,
    tone: d.tone,
    topics: d.topics || [],
  }));
}

/**
 * Catalysts already disclosed before the target quarter (so `isNew` is a diff, not a guess).
 * @param {Array<Object>} digests
 * @param {Object|null} rerating latest rerating-catalysts DTO
 * @returns {Array<Object>}
 */
function knownCatalysts(digests, rerating) {
  const fromDigests = digests.flatMap((d) =>
    (d.catalysts || []).map((c) => ({
      ...c,
      firstSeen: quarterLabel(d.quarter),
      source: `concall-digest ${d.id}`,
    }))
  );
  const fromRerating = ((rerating && rerating.catalysts) || []).map((c) => ({
    title: c.name,
    detail: c.newVsConfirmation || null,
    conviction: c.conviction || null,
    firstSeen: rerating.date,
    source: `rerating-catalysts ${rerating.id}`,
  }));
  return [...fromDigests, ...fromRerating];
}

/**
 * Prior quarterly-result verdict chain and last forward checklist.
 * @param {Array<Object>} priorResultDtos full DTOs
 * @param {string} targetYyyymm
 * @returns {Object}
 */
function priorVerdicts(priorResultDtos, targetYyyymm) {
  const prior = priorResultDtos
    .filter((d) => {
      const q = normalizeQuarter(d.quarter, d.date);
      return q && q < targetYyyymm;
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const last = prior[0] || null;
  const chips = (last && (last.verdictChips || last.chips)) || [];
  return {
    lastResultId: last ? last.id : null,
    lastResultQuarter: last ? last.quarter || null : null,
    walkTheTalk: prior.map((d) => d.walkTheTalk?.summary?.verdict).filter(Boolean),
    inflection: prior.map((d) => d.inflectionPoint?.verdict).filter(Boolean),
    peadVerdicts: prior.map((d) => d.peadRead?.verdict).filter(Boolean),
    q1ConfirmationPending: JSON.stringify(chips).includes('Q+1 CONFIRMATION PENDING'),
    lastChecklist: (last && (last.monitoringChecklist || last.checklist)) || [],
  };
}

/**
 * Topics from prior calls whose keywords do not appear in the current transcript — the
 * deterministic `possiblyDropped` seed (the agent still verifies before calling one dropped).
 * @param {Array<Object>} narrative narrativeArc() output, newest first
 * @param {string} currentText current-quarter transcript text
 * @param {number} [lookback] how many prior calls to diff against
 * @returns {Array<Object>}
 */
function possiblyDroppedTopics(narrative, currentText, lookback = 3) {
  const hay = String(currentText || '').toLowerCase();
  const seen = new Set();
  const out = [];
  for (const call of (narrative || []).slice(0, lookback)) {
    for (const t of call.topics || []) {
      const key = String(t.topic).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const kws = (t.keywords || []).map((k) => String(k).toLowerCase()).filter(Boolean);
      if (kws.length && !kws.some((k) => hay.includes(k))) {
        out.push({
          topic: t.topic,
          lastMentioned: call.quarter,
          keywords: t.keywords,
          quote: t.quote,
        });
      }
    }
  }
  return out;
}

/**
 * Assemble the pack. Pure.
 * @param {Object} a
 * @param {string} a.companyId
 * @param {string} a.targetYyyymm quarter whose result the pack prepares for
 * @param {string} a.asOf YYYY-MM-DD the pack's watermark (inputs consumed up to here)
 * @param {Array<Object>} a.digests concall-digest DTOs strictly before the target, newest first
 * @param {Array<string>} a.pendingDigestQuarters transcripts that still need a digest
 * @param {Array<Object>} [a.forwardGuidanceDtos]
 * @param {Array<Object>} [a.priorResultDtos]
 * @param {Object|null} [a.rerating] latest rerating-catalysts DTO
 * @param {Object|null} [a.financials] company-financials {quarters, years, baselines, ...}
 * @param {Array<Object>} [a.concallNotesGuidance] Stockscans concall-notes guidance tables
 * @param {Object|null} [a.filings] classifyFilings() output since the last reported quarter end
 * @param {Object|null} [a.priceAction] analyzePreResultPriceAction() output
 * @param {Array<Object>} [a.priorAnalyses] priorAnalyses() output
 * @returns {Object} the report body (envelope added by db.saveReport)
 */
function assembleHistoryPack(a) {
  const {
    companyId,
    targetYyyymm,
    asOf,
    digests = [],
    pendingDigestQuarters = [],
    forwardGuidanceDtos = [],
    priorResultDtos = [],
    rerating = null,
    financials = null,
    concallNotesGuidance = [],
    filings = null,
    priceAction = null,
    priorAnalyses = [],
  } = a;
  const usable = digests.filter((d) => d.quarter < targetYyyymm);
  const priorGuidance = collectPriorGuidance({
    currentYyyymm: targetYyyymm,
    forwardGuidanceDtos,
    priorResultDtos,
    callDigests: usable,
  });
  const narrative = narrativeArc(usable);
  const recurrence = oneOffRecurrence(usable);
  return {
    type: REPORT_TYPE,
    creator: CREATOR,
    companyId,
    date: quarterEndIso(targetYyyymm),
    targetQuarter: quarterLabel(targetYyyymm),
    targetYyyymm,
    coversThrough: asOf,
    digestCoverage: {
      verified: usable.map((d) => quarterLabel(d.quarter)),
      pending: pendingDigestQuarters.map(quarterLabel),
      complete: pendingDigestQuarters.length === 0,
    },
    summary: `History pack for ${quarterLabel(targetYyyymm)} as of ${asOf}: ${usable.length} call digests, ${priorGuidance.length} prior guides, one-offs in ${recurrence.count}/${recurrence.window.length} quarters`,
    priorGuidance,
    walkTheTalkSkeleton: buildWalkTheTalkLedger({
      currentYyyymm: targetYyyymm,
      priorGuidance,
      headline: null,
    }),
    narrative,
    oneOffRecurrence: recurrence,
    knownCatalysts: knownCatalysts(usable, rerating),
    priorVerdicts: priorVerdicts(priorResultDtos, targetYyyymm),
    concallNotesGuidance,
    financials: financials
      ? {
          basis: financials.basis || null,
          quarters: (financials.quarters || []).slice(-12),
          baselines: financials.baselines || null,
          warnings: financials.warnings || [],
        }
      : null,
    filings,
    priceAction,
    priorAnalyses,
    sourcesConsumed: [
      ...usable.map((d) => d.id),
      ...forwardGuidanceDtos.map((d) => d.id),
      ...priorResultDtos.map((d) => d.id),
      ...(rerating ? [rerating.id] : []),
    ].filter(Boolean),
  };
}

/**
 * Slim pack view for quarterly-result-analysis's --prepare context.
 * @param {Object|null} pack
 * @returns {Object|null}
 */
function historyContextOf(pack) {
  if (!pack) return null;
  return {
    packId: pack.id,
    targetQuarter: pack.targetQuarter,
    coversThrough: pack.coversThrough,
    digestCoverage: pack.digestCoverage,
    narrative: pack.narrative,
    oneOffRecurrence: pack.oneOffRecurrence,
    knownCatalysts: pack.knownCatalysts,
    priorVerdicts: pack.priorVerdicts,
    concallNotesGuidance: pack.concallNotesGuidance,
    priceAction: pack.priceAction,
    newFilingsSinceLastResult: ((pack.filings && pack.filings.items) || []).filter(
      (f) => !f.routine && (f.dotTags.length || f.significance !== 'NORMAL')
    ),
  };
}

module.exports = {
  REPORT_TYPE,
  CREATOR,
  ONE_OFF_RECURRENCE_THRESHOLD,
  oneOffRecurrence,
  narrativeArc,
  knownCatalysts,
  priorVerdicts,
  possiblyDroppedTopics,
  assembleHistoryPack,
  historyContextOf,
};
