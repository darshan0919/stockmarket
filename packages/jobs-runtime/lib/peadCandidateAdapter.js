'use strict';

/**
 * peadCandidateAdapter.js
 *
 * Deterministic bridge between forward-guidance report DTOs and pead-surprise-ranker inputs.
 * Ingests structured guidance items (metric_category, metric, relative_pct, quote, qoq_status)
 * and produces prefilled candidate annotations and growth_inputs skeletons.
 *
 * Eliminates manual LLM transcription of numbers and quotes in PEAD Step 1,
 * ensuring zero calculation errors and cutting frontier token usage.
 */

/**
 * @typedef {Object} GuidanceItem
 * @property {string} metric_category - 'Top Line' | 'Margins' | 'Bottom Line' | 'Balance Sheet' | 'Key Metrics'
 * @property {string} metric - e.g. 'Revenue', 'EBITDA margin', 'PAT'
 * @property {string} period_guided - e.g. 'FY27', 'Q1FY27'
 * @property {number|null} [absolute_value]
 * @property {string|null} [absolute_unit]
 * @property {number|null} [relative_pct]
 * @property {string} quote - management quote
 * @property {string} [qoq_status] - 'reaffirmed' | 'revised' | 'new' | 'dropped'
 */

/**
 * @typedef {Object} ForwardGuidanceDto
 * @property {string} companyId
 * @property {string} [companyName]
 * @property {string} quarter
 * @property {GuidanceItem[]} guidance
 * @property {Object} [scanRow]
 * @property {string} [staleGuidanceNote]
 */

/**
 * @typedef {Object} PeadCandidate
 * @property {string} ticker
 * @property {string} name
 * @property {string|null} sector
 * @property {number} tier
 * @property {string|null} rev_guided
 * @property {number|null} rev_guided_pct
 * @property {boolean} inorganic_flag
 * @property {string|null} margin_guided
 * @property {string} margin_dir
 * @property {string|string[]} pat_lever
 * @property {string} evidence
 * @property {string|null} thesis
 * @property {string[]} assumptions
 * @property {string|null} qoq_status
 * @property {Object|null} growth_inputs
 * @property {Object} scan_cols
 */

/**
 * Adapts a single forward-guidance DTO into a prefilled PEAD candidate annotation.
 *
 * @param {ForwardGuidanceDto} dto
 * @returns {PeadCandidate}
 */
function adaptGuidanceDtoToPeadCandidate(dto) {
  if (!dto || !dto.companyId) {
    throw new Error('Invalid forward-guidance DTO: missing companyId');
  }

  const items = Array.isArray(dto.guidance) ? dto.guidance : [];

  // 1. Locate Top Line / Revenue guidance
  const revItem =
    items.find((i) => i.metric === 'Revenue') ||
    items.find((i) => i.metric_category === 'Top Line') ||
    null;

  // 2. Locate Margins / EBITDA guidance
  const marginItem =
    items.find((i) => (i.metric_category || '').toLowerCase() === 'margins') ||
    items.find((i) => (i.metric || '').toLowerCase().includes('margin')) ||
    null;

  // 3. Locate Bottom Line / PAT guidance
  const patItem =
    items.find((i) => i.metric === 'PAT') ||
    items.find((i) => i.metric_category === 'Bottom Line') ||
    null;

  // Derive QoQ status summary across items
  let overallQoqStatus = 'new';
  if (items.some((i) => i.qoq_status === 'revised')) {
    overallQoqStatus = 'revised';
  } else if (items.some((i) => i.qoq_status === 'reaffirmed')) {
    overallQoqStatus = 'reaffirmed';
  } else if (items.some((i) => i.qoq_status === 'dropped')) {
    overallQoqStatus = 'dropped';
  }

  // Determine initial tier
  let tier = 2; // Default FY-specific
  const primaryPeriod =
    (revItem && revItem.period_guided) || (marginItem && marginItem.period_guided) || '';
  if (/^Q[1-4]/i.test(primaryPeriod)) {
    tier = 1; // Quarter-specific run-rate
  } else if (items.length === 0) {
    tier = 4; // Excluded / no visibility
  }

  // Pre-build growth_inputs skeleton if quantified guidance exists
  let growthInputs = null;
  const fyMatch = primaryPeriod.match(/FY\d{2,4}/i);
  const guidedFy = fyMatch ? fyMatch[0].toUpperCase() : null;

  if (guidedFy && (revItem || marginItem || patItem)) {
    growthInputs = {
      guided_fy: guidedFy,
    };

    if (revItem) {
      if (typeof revItem.relative_pct === 'number') {
        growthInputs.revenue = {
          growth_pct: revItem.relative_pct,
          basis: 'explicit',
        };
      } else if (typeof revItem.absolute_value === 'number' && revItem.absolute_unit === 'cr') {
        growthInputs.revenue = {
          fy_abs_cr: revItem.absolute_value,
          basis: 'explicit',
        };
      }
    }

    if (marginItem) {
      if (typeof marginItem.absolute_value === 'number' && marginItem.absolute_unit === '%') {
        growthInputs.operating_profit = {
          opm_pct: marginItem.absolute_value,
          basis: 'explicit',
        };
      } else if (typeof marginItem.relative_pct === 'number') {
        growthInputs.operating_profit = {
          growth_pct: marginItem.relative_pct,
          basis: 'explicit',
        };
      }
    }

    if (patItem) {
      if (typeof patItem.relative_pct === 'number') {
        growthInputs.pat = {
          growth_pct: patItem.relative_pct,
          basis: 'explicit',
        };
      } else if (typeof patItem.absolute_value === 'number' && patItem.absolute_unit === 'cr') {
        growthInputs.pat = {
          fy_abs_cr: patItem.absolute_value,
          basis: 'explicit',
        };
      }
    }
  }

  return {
    ticker: dto.companyId,
    name: dto.companyName || dto.companyId,
    sector: (dto.scanRow && dto.scanRow['Sector']) || null,
    tier,
    rev_guided: revItem ? revItem.quote : null,
    rev_guided_pct:
      revItem && typeof revItem.relative_pct === 'number' ? revItem.relative_pct : null,
    inorganic_flag: false,
    margin_guided: marginItem ? marginItem.quote : null,
    margin_dir: 'unclear', // To be confirmed/refined by reasoning step
    pat_lever: 'none_stated', // Can be single string or array of levers
    evidence: 'medium', // Default baseline
    thesis: null, // Requires LLM synthesis
    assumptions: [],
    qoq_status: overallQoqStatus,
    growth_inputs: growthInputs,
    scan_cols: dto.scanRow || {},
  };
}

/**
 * Adapts a batch of forward-guidance DTOs into ranked candidates and excluded lists.
 *
 * @param {ForwardGuidanceDto[]} dtos
 * @returns {{ candidates: PeadCandidate[], excluded: Array<{ ticker: string, reason: string, note?: string }> }}
 */
function adaptBatch(dtos) {
  const candidates = [];
  const excluded = [];

  for (const dto of dtos) {
    if (!dto.transcriptAvailable || !dto.guidance || dto.guidance.length === 0) {
      excluded.push({
        ticker: dto.companyId,
        reason:
          dto.transcriptAvailable === false
            ? 'No transcript found on file'
            : 'No quantified guidance commitments',
        note: dto.staleGuidanceNote || null,
      });
    } else {
      candidates.push(adaptGuidanceDtoToPeadCandidate(dto));
    }
  }

  return { candidates, excluded };
}

module.exports = {
  adaptGuidanceDtoToPeadCandidate,
  adaptBatch,
};
