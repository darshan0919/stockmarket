const { execFileSync } = require('child_process');

function runWithRetry(cmd, args, opts, maxAttempts) {
  maxAttempts = maxAttempts || 8;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return execFileSync(cmd, args, opts);
    } catch (e) {
      lastErr = e;
      const stderrStr = (e.stderr || '').toString('utf8');
      if (stderrStr.includes('Could not acquire lock') && attempt < maxAttempts) {
        const waitMs = 3000 + attempt * 2000;
        console.log('[retry] lock contention, attempt', attempt, '- waiting', waitMs, 'ms');
        execFileSync('sleep', [String(waitMs / 1000)]);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function addNote(companyId, note) {
  const payload = {
    companyId,
    note: Object.assign(
      {
        sourceSkill: 'post-close-scan-insights',
        usecase: 'announcement-insights:' + (note.depth || 'standard'),
        modelUsed: 'claude-sonnet-5',
      },
      note
    ),
  };
  const out = runWithRetry('node', ['packages/jobs-runtime/watchlistInsights.js', 'add-note'], {
    input: JSON.stringify(payload),
    maxBuffer: 1024 * 1024 * 20,
  }).toString('utf8');
  console.log('[addNote]', companyId, '->', out);
  return out;
}

function markProcessed(companyId, annId, usecase) {
  const args = ['packages/jobs-runtime/watchlistInsights.js', 'mark-processed', companyId, annId];
  if (usecase) args.push(usecase);
  const out = runWithRetry('node', args, {}).toString('utf8');
  console.log('[markProcessed]', companyId, annId, usecase || '(default)', '->', out);
  return out;
}

// ---------------------------------------------------------------------------
// 1. NSE:ABDL - routine board meeting intimation (results). No new info.
markProcessed('NSE:ABDL', 'bvrdmtehas4exe94n0mrivgs.pdf');

// ---------------------------------------------------------------------------
// 2. NSE:SPLPETRO - routine board meeting intimation (results + interim
// dividend to be *considered*, not yet declared).
markProcessed('NSE:SPLPETRO', 'tsuo0tryxno3p0mltrlr3zfx.pdf');

// ---------------------------------------------------------------------------
// 3. NSE:INDSWFTLAB - routine board meeting intimation (results).
markProcessed('NSE:INDSWFTLAB', '2ba20opa2emqzcgw093mldyu.pdf');

// ---------------------------------------------------------------------------
// 4. NSE:AEROENTER - DEEP: acquisition, highConviction. Aeroflex Neu Limited
// (material subsidiary of Aeroflex Enterprises) approved acquiring 51.01%
// control of Stilonn Valves and Controls Pvt Ltd for ~Rs16.02cr, via a mix of
// secondary purchase + fresh subscription across tranches. Stilonn makes
// precision engineering products (valves, sanitary fittings) for the AI
// Infra/Data Centre space plus pharma/healthcare - a different end-market
// from Aeroflex's core stainless-steel flexible hose business.
addNote('NSE:AEROENTER', {
  depth: 'deep',
  announcementId: '18lqp7p6fg17or4lwtnsemde.pdf',
  announcementTitle: 'Announcement Under Regulation 30 Of LODR',
  pdfUrl: 'https://www.stockscans.in/document/18lqp7p6fg17or4lwtnsemde.pdf',
  category: 'acquisition',
  significance: 'medium',
  headline:
    "Aeroflex's subsidiary Aeroflex Neu buys 51.01% control of Stilonn Valves (~Rs16cr) to plant a flag in AI-infra/data-centre precision engineering, beyond its core flexible-hose business - financially small today, EPS impact unquantifiable until Stilonn's numbers are disclosed.",
  insight:
    "Aeroflex Neu Limited, Aeroflex Enterprises' material subsidiary, approved acquiring 7,27,040 equity shares of Stilonn Valves and Controls Pvt Ltd for an aggregate ~Rs16,00,21,504, taking it to 51.01% control (Stilonn becomes a subsidiary of Aeroflex Neu). The deal is structured as a mix of secondary purchase from existing Stilonn shareholders plus subscription to fresh equity, executed in tranches via SPA/SSSA. Stilonn makes precision engineering products - valves, sanitary fittings and allied goods - for the AI Infra and Data Centre space as well as pharmaceutical/healthcare, which is a genuinely different end-market from Aeroflex's core stainless-steel flexible hoses for industrial/defense/infrastructure use. The filing discloses no revenue, EBITDA or order-book figures for Stilonn, so the purchase multiple and earnings contribution cannot be quantified from this document alone; at ~Rs16cr the deal is small in absolute terms. This also follows an NSE surveillance query from June 23, 2026 (in prior notes) about an unexplained stock price move - that query predates this disclosure by nearly four months, so whether it is connected to this deal is unresolved and worth tracking.",
  thesisChain: [
    'Aeroflex Neu Limited (material subsidiary) approves acquiring 51.01% of Stilonn Valves and Controls for ~Rs16.02cr via secondary purchase + fresh equity subscription in tranches',
    'Control (>50%) makes Stilonn a subsidiary of Aeroflex Neu, giving future consolidation of its financials into the group',
    "Stilonn's product line (precision valves/sanitary fittings for AI Infra/Data Centre plus pharma/healthcare) is a new, higher-growth-theme end market distinct from Aeroflex's core flexible-hose business",
    'No revenue/EBITDA/order-book disclosed for Stilonn in this filing, so purchase multiple and earnings accretion cannot be derived yet',
    'EPS impact is therefore optionality-only for now: positive if Stilonn scales on the AI-infra capex theme, but unquantifiable until consolidated numbers or a follow-up disclosure with target financials appear',
  ],
  epsImpact: {
    direction: 'positive',
    magnitude:
      'unquantified - no revenue/EBITDA disclosed for Stilonn; deal value (~Rs16cr) is small relative to group scale',
    timeline:
      'over the next 1-2 quarters as Stilonn consolidates and/or management discloses target financials',
    confidence: 'low',
  },
  tags: [
    'acquisition',
    'high_conviction',
    'ai_infra',
    'data_center',
    'subsidiary',
    'diversification',
    'control_acquisition',
  ],
  jCurve: {
    isCandidate: false,
    shape: null,
    elbowEvidence: null,
    whatWouldConfirm:
      "Disclosure of Stilonn's current revenue/profit run-rate and a visible AI-infra/data-centre order pipeline that would mark an actual earnings inflection from this acquisition, rather than just a platform-building step.",
  },
  knowledgeGap:
    "The deal is a mix of secondary share purchase plus primary subscription executed in tranches to reach 51.01% - without Stilonn's disclosed financials, the implied valuation multiple (P/E or EV/EBITDA) being paid can't be assessed. Also unresolved: whether the unexplained Jun 23, 2026 NSE price-movement query (flagged in a prior note) is related to this Oct 15 deal, given the ~4-month gap between the two events.",
  numPages: null,
  isHeavyParse: false,
});
markProcessed('NSE:AEROENTER', '18lqp7p6fg17or4lwtnsemde.pdf', 'announcement-insights:deep');

// ---------------------------------------------------------------------------
// 5. NSE:NXST - routine earnings conference-call scheduling notice only
// (date/time/dial-in details). No new financial or strategic information.
markProcessed('NSE:NXST', '34r7z0s9swuz95drwopledyt.pdf');

// ---------------------------------------------------------------------------
// 6. BSE:AKCAPIT - routine commercial-paper allotment (Rs25cr, 9.00%
// discount rate, ~4-month tenor to Feb 18 2027). This is BAU treasury
// financing for a capital-markets-services firm, not a strategic state
// change - no JV, new approval, or business-model shift here.
markProcessed('BSE:AKCAPIT', '8woee91k8t4dgxwefqq1r14m.pdf');

// ---------------------------------------------------------------------------
// 7. NSE:NAM-INDIA - routine board meeting intimation (results + interim
// dividend to be *considered*, not yet declared).
markProcessed('NSE:NAM-INDIA', 'pg8kuqgk9edkuhpro2s8np0l.pdf');

// ---------------------------------------------------------------------------
// 8. NSE:ZYDUSWELL - routine board meeting intimation (results).
markProcessed('NSE:ZYDUSWELL', 'qlpbm7fhrt4m5aopuo8lsgl7.pdf');

// ---------------------------------------------------------------------------
// 9. NSE:STYLEBAAZA - category tagged "fundraise" but the filing bundles
// FOUR board actions. Per notes-DB history, this company's warrant-
// conversion tranches (76L->56L outstanding here, same Rs328.25 price as
// the Sep 28 tranche) have consistently been judged low/routine/follow-up -
// that pattern holds again here. What IS new and not previously flagged:
// incorporation of a Wholly Owned Subsidiary/SPV for solar power generation
// and renewable energy - a genuine diversification into an unrelated
// business for a value-fashion retailer. Per standing rule, a new JV/
// associate/SPV incorporation is a real state-change signal regardless of
// rupee size, so this is written up; the AC reconstitution and independent
// director appointment are routine board-refresh housekeeping folded into
// the same note rather than treated as separate signals.
addNote('NSE:STYLEBAAZA', {
  depth: 'standard',
  announcementId: 'wyzy6oddpskg4o12t2a8w70r.pdf',
  announcementTitle: 'Announcement under Regulation 30 (LODR)-Allotment',
  pdfUrl: 'https://www.stockscans.in/document/wyzy6oddpskg4o12t2a8w70r.pdf',
  category: 'fundraise',
  significance: 'medium',
  headline:
    'Baazar Style Retail incorporates a new solar-power/renewable-energy SPV - its first disclosed diversification outside value-fashion retail - alongside a routine warrant-conversion tranche (20L shares at Rs328.25) and board refresh; EPS impact from the SPV is currently zero/undisclosed since it is pre-incorporation.',
  insight:
    "Baazar Style Retail's board approved four items in one meeting: (1) Audit Committee reconstitution, (2) appointment of Mrs. Binata Sengupta as an additional independent director, (3) incorporation of a Wholly Owned Subsidiary/SPV to develop, acquire and operate solar power generation and other renewable energy projects, and (4) allotment of 20,00,000 equity shares at Rs328.25 (premium Rs323.25 over Re5 face value) on conversion of non-promoter warrants, taking outstanding unconverted warrants from 76,00,000 to 56,00,000. Per this company's note history, warrant-conversion tranches at this same price have repeatedly been judged routine continuations of an already-approved programme, and that holds again here - it is not new capital-raise information. What is genuinely new is item (3): a value-fashion retailer diversifying into unrelated solar/renewable-energy capex. No investment size, capacity (MW), funding plan or timeline is disclosed for the SPV, so there is no quantifiable near-term EPS effect, but it is a real capital-allocation signal worth tracking - unrelated diversification by a recently-listed retailer raises questions about capital-allocation discipline that should be watched alongside the retail same-store-sales trend already flagged in this company's prior notes (Q2 FY27 SSSG -25% YoY on a calendar-shift explanation).",
  thesisChain: [
    'Board approves incorporation of a WOS/SPV for solar power generation and other renewable-energy projects - the first disclosed move outside the core value-fashion retail business',
    'No capex size, capacity, funding source or timeline disclosed for the SPV, so no revenue/EPS contribution can be estimated yet',
    'In parallel, 20L more non-promoter warrants convert to equity at Rs328.25 (well above face value), continuing a routine, already-approved dilution programme (76L->56L warrants remaining) consistent with prior tranches',
    'Net effect for now: a capital-allocation/diversification signal to monitor, not an EPS-moving event; watch for disclosed capex size and whether the diversification funds come from the warrant-conversion proceeds',
  ],
  epsImpact: null,
  tags: [
    'diversification',
    'renewable_energy',
    'capital_allocation',
    'warrant_conversion',
    'board_change',
  ],
  jCurve: {
    isCandidate: false,
    shape: null,
    elbowEvidence: null,
    whatWouldConfirm:
      "A follow-up filing disclosing the SPV's planned capex size, funding mix and expected capacity/commissioning timeline for the solar/renewable project - none of that is in this filing yet.",
  },
  numPages: null,
  isHeavyParse: false,
});
markProcessed('NSE:STYLEBAAZA', 'wyzy6oddpskg4o12t2a8w70r.pdf', 'announcement-insights:standard');

// ---------------------------------------------------------------------------
// 10. NSE:VIJIFIN - routine procedural follow-up: trading approval received
// from BSE/NSE for 1,00,00,000 equity shares already disclosed as allotted
// on Oct 9, 2026 (warrant conversion). The substantive event (the
// allotment/conversion itself) was already disclosed earlier; this filing
// is just the mechanical listing-approval confirmation with no new
// information beyond "the shares got listed as expected."
markProcessed('NSE:VIJIFIN', '6albyww66liy7ggt7qw34agc.pdf');

console.log('DONE');
