const { execFileSync } = require('child_process');

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
  return execFileSync('node', ['packages/jobs-runtime/watchlistInsights.js', 'add-note'], {
    input: JSON.stringify(payload),
    maxBuffer: 1024 * 1024 * 20,
  }).toString('utf8');
}

function markProcessed(companyId, annId, usecase) {
  const args = ['packages/jobs-runtime/watchlistInsights.js', 'mark-processed', companyId, annId];
  if (usecase) args.push(usecase);
  return execFileSync('node', args).toString('utf8');
}

function run(label, fn) {
  try {
    const out = fn();
    console.log('[OK] ' + label);
    if (out && out.trim()) console.log(out.trim());
  } catch (e) {
    console.error('[FAIL] ' + label);
    console.error(e.stderr ? e.stderr.toString('utf8') : e.message);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// 1. NSE:NUVOCO — voluntary liquidation of wholly-owned shell subsidiary AEPL
//    (turnover Rs0.02cr, nil % of group turnover, net worth 1.12% of group) —
//    pure group-structure simplification (VEGL becomes direct WOS instead of
//    step-down), no operational/financial impact disclosed. ROUTINE.
run('NUVOCO markProcessed', () => markProcessed('NSE:NUVOCO', 'vkwbny7xplslyne0f1g6mw0f.pdf'));

// ---------------------------------------------------------------------------
// 2. NSE:SOUTHBANK — Board merely designates an existing building as
//    "Corporate Office"; registered/head office unchanged. Pure admin. ROUTINE.
run('SOUTHBANK markProcessed', () =>
  markProcessed('NSE:SOUTHBANK', 'oecg32njd5c7waidd6dazbde.pdf')
);

// ---------------------------------------------------------------------------
// 3. BSE:SHARDUL — routine board-meeting intimation (Q2 results date). ROUTINE.
run('SHARDUL markProcessed', () => markProcessed('BSE:SHARDUL', 'ez4bbfihlx4hnxp9q5adkfav.pdf'));

// ---------------------------------------------------------------------------
// 4. BSE:PURPLEFIN — routine board-meeting intimation (Q2 results date). ROUTINE.
run('PURPLEFIN markProcessed', () =>
  markProcessed('BSE:PURPLEFIN', 's2j07tjp3llvuczap1x7ifhy.pdf')
);

// ---------------------------------------------------------------------------
// 5. BSE:SGFIN — categorised "fundraise" but the filing is the half-yearly
//    ISIN compliance statement for ALREADY-ISSUED NCD/CP, both shown as
//    "Amt outstanding: Nil" / "Already Redeemed". No new raise, no new
//    figures — a taxonomy mislabel, but the content itself is non-events.
//    ROUTINE.
run('SGFIN markProcessed', () => markProcessed('BSE:SGFIN', 'gb0okbxwkiga4u30x0un0jdp.pdf'));

// ---------------------------------------------------------------------------
// 6. NSE:AEGISLOG — commissioning (not just announcement) of a 35,000 MT/yr
//    specialised LPG bottling plant at JNPA, part of the J2 Greenfield
//    Terminal project under the Framework Agreement with Aegis Vopak
//    Terminals (AVTL). Real capex crossing into operation -> J-curve
//    candidate, though the asset is slated to transfer to AVTL later, so the
//    standalone EPS read is low-confidence pending transfer terms.
// ---------------------------------------------------------------------------
run('AEGISLOG addNote', () =>
  addNote('NSE:AEGISLOG', {
    announcementId: 'lxx2i6ihzv2ki7q2enz8cy13.pdf',
    announcementTitle:
      'Aegis Logistics Limited Has Informed The Exchange About Commissioning Of Specialised LPG Bottling Plant At Jawaharlal Nehru Port (JNPA) By The Company',
    pdfUrl: 'https://www.stockscans.in/document/lxx2i6ihzv2ki7q2enz8cy13.pdf',
    category: 'capacity',
    depth: 'standard',
    significance: 'medium',
    headline:
      'Aegis Logistics commissions a 35,000 MT/yr LPG bottling plant at JNPA under the J2 Greenfield Terminal project — first physical capacity live under the Aegis Vopak framework, ahead of its planned transfer to the JV.',
    insight:
      'The company has physically commissioned (effective Oct 15, 2026), not merely announced, a specialised LPG bottling plant with 35,000 MT per annum capacity at JNPA, as part of the J2 Greenfield Terminal project under the Nov-2025 Framework Agreement with Aegis Vopak Terminals Limited (AVTL). No revenue, cost, or utilisation figures were disclosed for the plant. The filing explicitly states the completed asset "would be transferred subsequently to AVTL," so any P&L benefit to Aegis Logistics standalone is likely transient — the durable economic benefit accrues to the AVTL joint venture once the transfer and its consideration terms are disclosed.',
    thesisChain: [
      'Plant is commissioned and operational (w.e.f. Oct 15, 2026), not just approved or under construction',
      'Adds 35,000 MT/yr bottling capacity within the larger multi-asset J2 Greenfield Terminal buildout',
      'Asset will transfer to AVTL — standalone Aegis Logistics P&L benefit is likely short-lived pending transfer terms',
      'Watch disclosed transfer consideration and AVTL utilisation ramp for the actual forward EPS/equity-method read',
    ],
    epsImpact: {
      direction: 'neutral_to_positive',
      magnitude:
        'small — one specialised unit within a larger multi-year project, no standalone financials disclosed',
      timeline: 'near-term operational, medium-term economic benefit shifts to AVTL post-transfer',
      confidence: 'low',
    },
    tags: [
      'capacity_commissioning',
      'lpg',
      'jnpa',
      'aegis_vopak',
      'greenfield_terminal',
      'j_curve_candidate',
    ],
    jCurve: {
      isCandidate: true,
      shape: 'stepwise capacity addition within a multi-year Greenfield terminal buildout',
      elbowEvidence:
        'capex has crossed from "approved/under construction" to "commissioned and operational" with a named capacity figure (35,000 MT/yr), not just management commentary',
      whatWouldConfirm:
        'disclosed utilisation ramp and revenue/EBITDA contribution post-commissioning, plus the consideration/terms of the planned transfer to AVTL',
    },
    numPages: null,
    isHeavyParse: false,
  })
);
run('AEGISLOG markProcessed', () =>
  markProcessed('NSE:AEGISLOG', 'lxx2i6ihzv2ki7q2enz8cy13.pdf', 'announcement-insights:standard')
);

// ---------------------------------------------------------------------------
// 7. NSE:DHAMPURSUG — regulatory compounding order for molasses-storage
//    shortfall at Rajpura unit (sugar years 2021-22 through 2025-26),
//    penalty Rs10,00,000. Filing itself states "No material impact on
//    financial, operation, or other activities." Genuinely immaterial,
//    backward-looking compliance matter for a company of Dhampur's size.
//    ROUTINE.
run('DHAMPURSUG markProcessed', () =>
  markProcessed('NSE:DHAMPURSUG', 'xhzubzpljef803g2v1v7r22e.pdf')
);

// ---------------------------------------------------------------------------
// 8. BSE:WELSPLSOL — routine board-meeting intimation (Q2 results date). ROUTINE.
run('WELSPLSOL markProcessed', () =>
  markProcessed('BSE:WELSPLSOL', 'ed0jsd300yxtj8u7dotnk53m.pdf')
);

// ---------------------------------------------------------------------------
// 9 & 10. NSE:LOTUSDEV — two same-day, same-company filings for the SAME
//    Q2 FY27 results: (9) the investor press release carrying the real
//    quantified numbers and management commentary, and (10) the formal
//    board-outcome filing that only confirms approval + encloses the
//    financials/limited-review report. Per the merged-headline rule, the
//    combined thesis lives on (9); (10) is kept accurate but subordinate.
// ---------------------------------------------------------------------------
run('LOTUSDEV press-release addNote', () =>
  addNote('NSE:LOTUSDEV', {
    announcementId: 'x95i57050uqfz2aohb0u6ilt.pdf',
    announcementTitle: 'Announcement under Regulation 30 (LODR)-Press Release / Media Release',
    pdfUrl: 'https://www.stockscans.in/document/x95i57050uqfz2aohb0u6ilt.pdf',
    category: 'general',
    depth: 'standard',
    significance: 'medium',
    headline:
      'Sri Lotus Q2 FY27: pre-sales +83% YoY to Rs470cr, PAT +91% YoY to Rs89cr at a 39.9% EBITDA margin, plus Rs2,700-2,800cr of new project GDV added — strong execution, but FY27 guidance (55-60% revenue/PAT growth) is reiterated, not raised.',
    insight:
      'Sri Lotus Developers reported Q2 FY27 pre-sales up 83% YoY to Rs470cr (H1: Rs879cr, +176% YoY), EBITDA up 113% YoY to Rs107cr at a 39.9% margin, and PAT up 91% YoY to Rs89cr. The company added three new redevelopment projects (Juhu, Dadar West, Versova) plus incremental area on an existing project, together worth Rs2,700-2,800cr of GDV, and has four H2 launches lined up worth ~Rs3,500-4,000cr GDV. Management states the balance sheet is net debt-free, so the new project wins appear internally funded rather than adding leverage risk, but explicitly reiterated (did not raise) FY27 guidance of Rs1,800-2,000cr pre-sales and 55-60% revenue/PAT growth. The same-day companion board-outcome filing (xcj1vwx0g2icrylj3vhxtxra.pdf) is the formal approval of these identical results plus the limited-review report, and adds no incremental figures beyond what is captured here.',
    thesisChain: [
      'Q2 execution (pre-sales, EBITDA, PAT) is tracking comfortably inside the FY27 guidance band',
      'Net-debt-free balance sheet funds new project wins without adding incremental leverage',
      'New GDV additions (Rs2,700-2,800cr) plus the H2 launch pipeline (Rs3,500-4,000cr) extend revenue visibility 2-3 years out',
      'Guidance was reiterated, not raised — the re-rating case rests on H2 launches actually converting to pre-sales, not on a guidance beat today',
    ],
    epsImpact: {
      direction: 'positive',
      magnitude:
        'PAT +91% YoY in-quarter, consistent with unchanged 55-60% FY27 PAT-growth guidance',
      timeline: 'current FY (FY27), with H2 launches shaping FY28 visibility',
      confidence: 'medium',
    },
    tags: [
      'quarterly_results',
      'realty',
      'redevelopment',
      'pipeline_addition',
      'guidance_maintained',
    ],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm: null,
    },
    numPages: null,
    isHeavyParse: false,
  })
);
run('LOTUSDEV press-release markProcessed', () =>
  markProcessed('NSE:LOTUSDEV', 'x95i57050uqfz2aohb0u6ilt.pdf', 'announcement-insights:standard')
);

run('LOTUSDEV board-outcome addNote (subordinate)', () =>
  addNote('NSE:LOTUSDEV', {
    announcementId: 'xcj1vwx0g2icrylj3vhxtxra.pdf',
    announcementTitle:
      'Board Meeting Outcome for Outcome Of Board Meeting Held Today I.E. October 15 2026',
    pdfUrl: 'https://www.stockscans.in/document/xcj1vwx0g2icrylj3vhxtxra.pdf',
    category: 'general',
    depth: 'standard',
    significance: 'low',
    headline:
      'Formal board approval + clean limited-review report for the same Q2 FY27 results already analysed in the companion press release (x95i57050uqfz2aohb0u6ilt.pdf) — no incremental figures; subordinate filing.',
    insight:
      'The Board approved standalone and consolidated unaudited results for Q2/H1 FY27 and the filing encloses the limited-review report (unqualified, no adverse remarks) from the statutory auditor. Every figure in this filing duplicates the same-day investor press release, which already carries the full quantified analysis (pre-sales, EBITDA, PAT, guidance). This note is kept deliberately subordinate per the merged-headline convention for related same-company, same-day filings.',
    thesisChain: [
      'Same Q2 FY27 results as the companion press release — this filing is the formal regulatory confirmation only',
      'Clean limited-review report reduces (does not eliminate) restatement risk on the numbers already analysed elsewhere',
    ],
    epsImpact: null,
    tags: ['board_outcome', 'duplicate_of_press_release', 'no_incremental_info'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm: null,
    },
    numPages: null,
    isHeavyParse: false,
  })
);
run('LOTUSDEV board-outcome markProcessed', () =>
  markProcessed('NSE:LOTUSDEV', 'xcj1vwx0g2icrylj3vhxtxra.pdf', 'announcement-insights:standard')
);

console.log('DONE');
