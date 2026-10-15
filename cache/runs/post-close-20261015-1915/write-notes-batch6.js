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
  console.log('--- addNote', companyId, note.announcementId, '---');
  const out = execFileSync('node', ['packages/jobs-runtime/watchlistInsights.js', 'add-note'], {
    input: JSON.stringify(payload),
    maxBuffer: 1024 * 1024 * 20,
  }).toString('utf8');
  console.log(out);
  return out;
}

function markProcessed(companyId, annId, usecase) {
  const args = ['packages/jobs-runtime/watchlistInsights.js', 'mark-processed', companyId, annId];
  if (usecase) args.push(usecase);
  console.log('--- markProcessed', companyId, annId, usecase || '(default)', '---');
  const out = execFileSync('node', args).toString('utf8');
  console.log(out);
  return out;
}

// ---------- Item 0: NSE:ANGELONE — Q2FY27 press release (primary note) ----------
addNote('NSE:ANGELONE', {
  announcementId: 'xro7t5xkgvv0uetf1elklamd.pdf',
  announcementTitle: 'Announcement under Regulation 30 (LODR)-Press Release / Media Release',
  pdfUrl: 'https://www.stockscans.in/document/xro7t5xkgvv0uetf1elklamd.pdf',
  category: 'general',
  significance: 'high',
  depth: 'standard',
  headline:
    "Angel One Q2FY27: standalone PAT +55.2% YoY to Rs367cr (+35.5% QoQ, reversing Q1's seasonal dip) as EBDAT margin expands 1,123bps YoY to 48.9%, above guided range, on a wealth/credit mix-shift",
  insight:
    "Angel One's Q2FY27 press release shows standalone PAT of Rs3,667mn (+55.2% YoY) and consolidated PAT of Rs3,350mn (+58.2% YoY), with standalone EBDAT margin expanding 1,123bps YoY to 48.9% -- above management's guided range -- even as core F&O order volumes stayed soft (366mn orders, -9.8% QoQ) following the Closing Auction Session and bank-funding-norm changes. The margin lift is traceable to a real mix-shift: Wealth Management AUM +160.5% YoY to Rs160bn and credit distribution +51.8% YoY to Rs6.9bn (a record ~Rs2.8bn in Sep'26 alone), both high-margin, recurring lines scaling off a small base, plus a record average client funding book of Rs74.5bn (+40.5% YoY). Cross-referencing the company's own prior notes: standalone PAT recovered from Rs2,707mn in Q1FY27 to Rs3,667mn in Q2FY27 (+35.5% QoQ), confirming that the Q1 QoQ PAT dip flagged in the 16-Jul-2026 note was seasonal/cyclical rather than a genuine deceleration. If the wealth/credit mix-shift persists while broking volumes stabilize, margin and EPS growth should keep outpacing headline revenue growth into H2FY27.",
  thesisChain: [
    'Wealth Management AUM +160.5% YoY and credit distribution +51.8% YoY are high-margin, recurring revenue lines scaling off a small base.',
    'This mix-shift lifted standalone EBDAT margin 1,123bps YoY to 48.9%, above the guided range, despite soft core F&O order volumes (-9.8% QoQ).',
    "Standalone PAT rose to Rs3,667mn (+55.2% YoY, +35.5% QoQ vs Q1FY27's Rs2,707mn), resolving the seasonal-dip question flagged in the 16-Jul-2026 note.",
    'Record client funding book (Rs74.5bn, +40.5% YoY) continues to underpin NBFC-linked credit income growth.',
    'Sustained mix-shift + stabilizing broking volumes implies margin/EPS growth should keep outpacing revenue growth into H2FY27.',
  ],
  epsImpact: {
    direction: 'positive',
    magnitude:
      'Standalone PAT +55.2% YoY / consolidated +58.2% YoY; QoQ PAT recovery of +35.5% standalone resolves the prior seasonal-dip concern',
    timeline:
      'Current quarter (Q2FY27); trend expected to continue into H2FY27 if the wealth/credit mix-shift persists',
    confidence: 'high',
  },
  tags: [
    'quarterly_results',
    'margin_expansion',
    'wealth_management',
    'credit_distribution',
    'record_metrics',
    'mix_shift',
  ],
  jCurve: {
    isCandidate: true,
    shape: 'margin-accretive mix shift',
    elbowEvidence:
      'EBDAT margin +1,123bps YoY to 48.9% standalone, above guided range, coincident with Wealth AUM +160.5% YoY and credit distribution +51.8% YoY -- both disclosed, actual, high-margin lines scaling off a small base, not just management commentary',
    whatWouldConfirm:
      'Q3FY27 standalone EBDAT margin holding at or above ~45-48% even if F&O-linked order volumes (down 9.8% QoQ this quarter) stay soft, confirming the margin lift is structural/mix-driven rather than a one-off cost quarter',
  },
  numPages: null,
  isHeavyParse: false,
});
markProcessed('NSE:ANGELONE', 'xro7t5xkgvv0uetf1elklamd.pdf', 'announcement-insights:standard');

// ---------- Item 2: NSE:ANGELONE — Board meeting outcome / dividend (subordinate note) ----------
addNote('NSE:ANGELONE', {
  announcementId: 'pg5m9uvjpnth521c5f46c52r.pdf',
  announcementTitle:
    'Board Meeting Outcome for Outcome Of The Board Meeting Held Today I.E. October 15 2026 Under (Listing Obligations And Disclosure Requirements) Regulations 2015',
  pdfUrl: 'https://www.stockscans.in/document/pg5m9uvjpnth521c5f46c52r.pdf',
  category: 'general',
  significance: 'medium',
  depth: 'standard',
  headline:
    "Angel One board declares 2nd FY27 interim dividend of Rs1.40/share (record date 22-Oct-2026) -- a 40% step-up from Q1's Re1/share -- alongside the Q2FY27 results detailed in the same-day press-release note",
  insight:
    'This is the formal Board Meeting Outcome filing that approved the Q2FY27 results covered in more analytical detail in the companion press-release note filed the same day (xro7t5xkgvv0uetf1elklamd.pdf) -- see that note for the PAT/margin thesis. The incremental, actionable item here is the 2nd FY27 interim dividend of Rs1.40/equity share (face value Re1), record date Thursday 22-Oct-2026, payable by 14-Nov-2026 -- a 40% step-up from the Re1/share Q1FY27 interim dividend declared in July. The filing also confirms no deviation in use of the Feb-2026 Rs50cr NCD proceeds and discloses the standard security-cover statement; neither carries new information.',
  thesisChain: [
    "Board formally approved Q2FY27 results (P&L detail in the companion press-release note) and declared a 2nd interim dividend of Rs1.40/share, up 40% from Q1FY27's Re1/share.",
    'Record date 22-Oct-2026; payment by 14-Nov-2026.',
    'A rising interim dividend alongside +55% YoY PAT growth signals management confidence in sustaining a higher payout, reinforcing rather than adding to the main results thesis.',
  ],
  epsImpact: null,
  tags: ['dividend', 'board_meeting', 'capital_return', 'follow_up'],
  jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  numPages: null,
  isHeavyParse: false,
});
markProcessed('NSE:ANGELONE', 'pg5m9uvjpnth521c5f46c52r.pdf', 'announcement-insights:standard');

// ---------- Item 1: NSE:LTFOODS — subsidiary name change (ROUTINE) ----------
markProcessed('NSE:LTFOODS', '2ekef39mnedg8zpdow0hrikl.pdf');

// ---------- Item 3: BSE:MEGAMONT — Pigeon Peas import contract ----------
addNote('BSE:MEGAMONT', {
  announcementId: 'yamx2okt47n3lac7xiqr1xly.pdf',
  announcementTitle: 'Announcement under Regulation 30 (LODR)-Press Release / Media Release',
  pdfUrl: 'https://www.stockscans.in/document/yamx2okt47n3lac7xiqr1xly.pdf',
  category: 'general',
  significance: 'low',
  depth: 'standard',
  headline:
    'Megamont secures a ~Rs2.13cr Pigeon Peas import contract from Africa (Mozambique/Malawi) -- a new commodity line/sourcing geography for its trading diversification strategy, but the contract value is immaterial on its own',
  insight:
    "Megamont Limited, a diversified global commodity trading company, has secured an import contract of ~Rs2.13cr for Pigeon Peas (Tur/Arhar) sourced from Mozambique or Malawi, with shipment Nov-Dec 2026 to Nhava Sheva Port, intended for resale to Indian FMCG/food-processing buyers. Per standing taxonomy guidance, a small rupee figure does not make a new commodity line / new sourcing geography low-signal by itself -- this is a genuine (if incremental) state change, extending Megamont's stated strategy of building a diversified multi-product global trading house (it already operates in metals, energy, industrial commodities and agri). However, at ~Rs2.13cr the contract is too small to move standalone EPS on its own and should be read as a data point on the company's trading-volume ramp rather than a standalone catalyst.",
  thesisChain: [
    'New import contract (~Rs2.13cr) for Pigeon Peas from Mozambique/Malawi, shipping Nov-Dec 2026, to be on-sold to FMCG/food-processing buyers.',
    "Extends Megamont's diversification into a new commodity line and new sourcing geography (Africa) -- a real, if small, state change.",
    'Contract size (~Rs2.13cr) is immaterial versus any plausible revenue base, so no standalone EPS catalyst -- track as part of a cumulative volume-ramp pattern, not in isolation.',
  ],
  epsImpact: {
    direction: 'neutral/slightly positive',
    magnitude: '~Rs2.13cr contract value -- immaterial individually',
    timeline: 'Nov-Dec 2026 shipment/revenue recognition window',
    confidence: 'low',
  },
  tags: ['new_contract', 'commodity_diversification', 'trading_company', 'immaterial_size'],
  jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  numPages: null,
  isHeavyParse: false,
});
markProcessed('BSE:MEGAMONT', 'yamx2okt47n3lac7xiqr1xly.pdf', 'announcement-insights:standard');

// ---------- Item 4: NSE:NHIT — quarterly unitholding pattern (ROUTINE) ----------
markProcessed('NSE:NHIT', 'vwagkalafmgg9zi37sxh7krn.pdf');

// ---------- Item 5: NSE:PHOENIXLTD — "demerger"-tagged Scheme of Arrangement (deep, high-conviction) ----------
addNote('NSE:PHOENIXLTD', {
  announcementId: '3st7yng2b8ovdt08imyeushc.pdf',
  announcementTitle: 'Announcement under Regulation 30 (LODR)-Scheme of Arrangement',
  pdfUrl: 'https://www.stockscans.in/document/3st7yng2b8ovdt08imyeushc.pdf',
  category: 'demerger',
  significance: 'medium',
  depth: 'deep',
  headline:
    "Phoenix Mills: today's 'demerger'-tagged Scheme of Arrangement is actually an intra-group amalgamation of two step-down subsidiaries (Truevalue Infrabuild merging into SGH Realty), not a business split or capital return -- zero cash consideration, zero shareholding impact, and the same recurring internal-simplification pattern already logged twice on this name (Astrea/Coimbatore entities, Sep 2026)",
  insight:
    "Despite the 'demerger' category tag and high-conviction flag, the actual filing describes a Scheme of Amalgamation (a merger, not a demerger) between two of Phoenix Mills' own subsidiaries: Truevalue Infrabuild Pvt Ltd (a near-dormant step-down subsidiary -- net worth only Rs3.70 lakh, nil turnover) is being folded into SGH Realty Pvt Ltd (an operating subsidiary, net worth Rs111.4cr). There is no cash consideration and no new share issuance -- Truevalue's entire share capital is simply cancelled on effectiveness -- and the filing explicitly states 'there is no change in the shareholding pattern of the Company.' So this is neither a real business split (ruling out the 'demerger' label) nor a capital-return/bonus-preference distribution (the other known taxonomy-gap pattern this skill watches for) -- it is pure legal-entity consolidation. It is also not a new type of event for Phoenix: this company's notes already record the identical pattern twice -- a six-subsidiary merger into Astrea Real Estate Developers, first disclosed Jan-2025, NCLT-sanctioned Sep-2026, and its effective-date filing on 11-Sep-2026 -- confirming Phoenix runs an ongoing group-level legal-entity simplification program across its commercial real-estate subsidiaries. P&L and EPS for the listed entity are unaffected; the only real-world effect is marginal admin/compliance-cost reduction from running one fewer legal entity, pending RD/NCLT and other regulatory approvals (no timeline given).",
  thesisChain: [
    'Filing text itself (not the category tag) describes a merger of near-dormant Truevalue Infrabuild (net worth Rs3.70 lakh, nil turnover) into operating subsidiary SGH Realty (net worth Rs111.4cr) -- both already owned by Phoenix Mills.',
    "No cash consideration, no new shares, explicit 'no change in shareholding pattern of the Company' -- rules out both a real business split and a capital-return/bonus-preference distribution.",
    'Identical pattern already logged twice on PHOENIXLTD (Astrea Real Estate Developers subsidiary mergers, Jan-2025 disclosure / Sep-2026 NCLT sanction+effective date) -- this is a recurring group-simplification program, not a one-off strategic event.',
    'Standalone/consolidated EPS for the listed entity is unaffected; net real-world effect is a marginal reduction in compliance overhead from one fewer legal entity.',
    'Net read: file as governance/process housekeeping, not an EPS or re-rating catalyst, despite the high-conviction category flag.',
  ],
  epsImpact: {
    direction: 'neutral',
    magnitude: 'No disclosed P&L or shareholding effect on the listed entity',
    timeline: 'Pending Regional Director/NCLT and other regulatory approvals; no date given',
    confidence:
      'high (confidence is in the "no effect" read, grounded in the filing\'s own explicit language)',
  },
  tags: [
    'demerger_mislabeled',
    'intra_group_merger',
    'no_shareholder_impact',
    'recurring_pattern',
    'high_conviction',
    'governance_housekeeping',
  ],
  jCurve: {
    isCandidate: false,
    shape: null,
    elbowEvidence:
      'None -- no capex commissioning, no debt retirement crossing a threshold, no margin-mix shift, no drag ending; this is pure legal-entity consolidation with no operating or financial inflection.',
    whatWouldConfirm: null,
  },
  knowledgeGap:
    "Unclear from this filing why Phoenix organizes certain real-estate assets through SGH Realty/Truevalue specifically rather than directly or via the Astrea vehicle used in the earlier, similar scheme -- i.e. whether this reflects a specific project's land-title/JV history, tax structuring, or historical M&A residue, and whether further such step-down mergers are still pending across the group. Would need the broader subsidiary org chart or an annual-report note to resolve.",
  numPages: null,
  isHeavyParse: false,
});
markProcessed('NSE:PHOENIXLTD', '3st7yng2b8ovdt08imyeushc.pdf', 'announcement-insights:deep');

// ---------- Item 6: NSE:CUBEXTUB — board meeting intimation (ROUTINE) ----------
markProcessed('NSE:CUBEXTUB', 'k39nec9df8tpbmgwa0skmexb.pdf');

// ---------- Item 7: BSE:UCIL — preferential warrant fundraise ----------
addNote('BSE:UCIL', {
  announcementId: 'zgar7o7ynzgrk3zago1ng3pa.pdf',
  announcementTitle: 'Board Meeting Outcome for Fund Raising Held On 15Th October 2026',
  pdfUrl: 'https://www.stockscans.in/document/zgar7o7ynzgrk3zago1ng3pa.pdf',
  category: 'fundraise',
  significance: 'medium',
  depth: 'standard',
  headline:
    'Unifinz Capital India raises up to Rs99.97cr via preferential warrants at Rs102 to 7 non-promoter investors -- ~24% dilution on a fully-diluted post-issue base, pending EGM approval on 11-Nov-2026',
  insight:
    "Board approved issuing up to 98,01,000 warrants (each convertible 1:1 into a Rs10 face-value equity share, 18-month exercise window) to 7 named non-promoter investors at Rs102/warrant, aggregating up to Rs99.97cr, subject to shareholder approval at an EGM on 11-Nov-2026. Combined with 40,95,000 already-granted ESOPs, the fully-diluted post-issue share count rises from ~4.43cr to ~5.81cr -- roughly 24% dilution of the enlarged base. New investor Kotia Enterprises Limited would become the largest single named post-issue holder among the disclosed investors (10.81% post-issue vs 5.65% pre-issue), taking a sizeable stake at a premium cash price rather than via market purchase -- a reasonable confidence signal. However, the filing discloses neither use of proceeds nor the company's current PAT/EPS base, and a check of prior UCIL notes (get-company-notes) found none to fill the gap, so the EPS-accretion math cannot be computed from what's disclosed -- this is logged as a capital/ownership event pending further disclosure, not yet a quantified EPS catalyst.",
  thesisChain: [
    'Board approved up to 98,01,000 warrants at Rs102 each (up to Rs99.97cr) to 7 non-promoter investors, pending EGM approval 11-Nov-2026.',
    'Combined with 40,95,000 existing ESOPs, fully-diluted post-issue shares rise from ~4.43cr to ~5.81cr -- ~24% dilution of the enlarged base.',
    'Kotia Enterprises becomes the largest named post-issue holder (10.81%, up from 5.65% pre-issue) -- a new strategic/financial stake at a premium cash price.',
    'Use of proceeds and current PAT/EPS are not disclosed in this filing or any prior note on this company, so EPS accretion cannot be quantified yet.',
    'Watch the 11-Nov-2026 EGM outcome and any follow-up use-of-proceeds disclosure to convert this into a quantified EPS thesis.',
  ],
  epsImpact: {
    direction: 'uncertain',
    magnitude: 'Raise of up to Rs99.97cr; ~24% fully-diluted dilution',
    timeline:
      'Pending shareholder approval 11-Nov-2026; warrants exercisable over an 18-month window thereafter',
    confidence:
      'low -- use of proceeds, current PAT and existing EPS base are not disclosed in this filing, and no prior note exists for this company to supply them',
  },
  tags: ['preferential_issue', 'warrants', 'dilution', 'new_investor', 'pending_approval'],
  jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  numPages: null,
  isHeavyParse: false,
});
markProcessed('BSE:UCIL', 'zgar7o7ynzgrk3zago1ng3pa.pdf', 'announcement-insights:standard');

// ---------- Item 8: NSE:AKUMS — NPPA demand notice on subsidiary ----------
addNote('NSE:AKUMS', {
  announcementId: 'wmsbfoqb44o6plbs5egd8isv.pdf',
  announcementTitle:
    'Intimation Under Regulation 30 Of The SEBI (Listing Obligations And Disclosure Requirements) Regulations 2015 - Demand Notice',
  pdfUrl: 'https://www.stockscans.in/document/wmsbfoqb44o6plbs5egd8isv.pdf',
  category: 'general',
  significance: 'medium',
  depth: 'standard',
  headline:
    "Akums subsidiary Pure & Cure named as manufacturer in a Rs52.75cr NPPA demand notice over client Hetero Healthcare's DPCO overcharging on an injection formulation -- but standard supply-agreement indemnity clauses place primary liability on marketer Hetero, not Akums",
  insight:
    "NPPA issued a Rs52.75cr demand notice (Rs18.95cr overcharge + Rs18.95cr penalty [100% of overcharge] + Rs14.85cr interest to 30-Oct-2026) jointly against marketer Hetero Healthcare, Akums's wholly-owned subsidiary Pure & Cure Healthcare (the manufacturer), and Abaris Healthcare, over MRP in excess of DPCO limits on 'Lanol 1000mg injection' batches made Dec-2017 to Aug-2024. The filing itself states that the prime responsibility to respond lies with Hetero as marketer, and that Akums's standard supply agreements contractually place DPCO-violation liability on the marketing entity -- consistent with this company's track record (a separate Rs3.59cr GST penalty on subsidiary Maxcure Nutravedics was fully set aside on appeal in Jul-2026, per the existing note on this company). Even with the indemnity in place, Pure & Cure remains a named party on a Rs52.75cr notice spanning nearly 7 years of batches, which is a tail/contingent-liability risk worth tracking, and signals continuing NPPA scrutiny of CDMO-manufactured, marketer-branded formulations generally. No direct P&L impact is expected if the contractual indemnity is upheld; the real risk is a multi-year legal/regulatory overhang rather than an immediate EPS hit.",
  thesisChain: [
    "NPPA demand notice of Rs52.75cr jointly names marketer Hetero Healthcare, Akums's subsidiary Pure & Cure (manufacturer), and Abaris Healthcare over DPCO MRP violations on batches made 2017-2024.",
    "Filing explicitly states prime responsibility lies with marketer Hetero, and Akums's standard supply agreements contractually indemnify the manufacturer -- consistent with Akums's track record of successfully contesting a similar subsidiary penalty (Maxcure GST case, set aside Jul-2026).",
    'Still, Pure & Cure is a named party on a large, multi-year notice -- a contingent tail risk to monitor even though no direct cost to Akums is currently expected.',
    'Net EPS read: no near-term P&L impact expected if indemnity holds; track for any shift in liability allocation or NPPA/appellate outcome.',
  ],
  epsImpact: {
    direction: 'contingent negative (tail risk)',
    magnitude:
      'Rs52.75cr joint demand, expected to fall on marketer Hetero under supply-agreement indemnity, not directly on Akums',
    timeline: 'Ongoing regulatory/legal process; no resolution date given',
    confidence:
      'low -- outcome depends on indemnity-clause enforcement and any NPPA/appellate decision',
  },
  tags: [
    'regulatory_risk',
    'nppa_demand_notice',
    'contingent_liability',
    'third_party_indemnification',
    'cdmo',
  ],
  jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  numPages: null,
  isHeavyParse: false,
});
markProcessed('NSE:AKUMS', 'wmsbfoqb44o6plbs5egd8isv.pdf', 'announcement-insights:standard');

// ---------- Item 9: NSE:SWANDEF — corporate presentation (truncated extraction) ----------
addNote('NSE:SWANDEF', {
  announcementId: 'nv93m6vr646q6xwfzgx3tirs.pdf',
  announcementTitle: 'Announcement Under Regulation 30 (LODR) - Corporate Presentation',
  pdfUrl: 'https://www.stockscans.in/document/nv93m6vr646q6xwfzgx3tirs.pdf',
  category: 'general',
  significance: 'low',
  depth: 'standard',
  headline:
    "Swan Defence corporate presentation titled 'India's Largest Private Shipyard: Entering Execution Scale-Up' -- extracted text is truncated at ~8,000 characters and contains only boilerplate disclaimer with no capacity/order-book/financial figures captured; flagging for manual PDF review given the title's forward-looking claim",
  insight:
    "The presentation's own title/subtitle ('H1FY27 ... Entering Execution Scale-Up') suggests an operational-milestone claim for a company still rebuilding post its Reliance Naval predecessor, but the extracted PDF text (8,048 of a reported >23,000 characters) is entirely generic forward-looking-statement disclaimer language -- no slide content, capacity figures, or order-book numbers survived extraction. Per standing taxonomy guidance, a corporate-presentation filing tagged 'general' should be treated cautiously like a heavy document rather than dismissed as routine, especially given a headline claim of a scale-up inflection -- but no specific figure can be stated here without inventing it, so this is logged as low-significance pending manual follow-up rather than as a quantified insight. This is an extraction/truncation gap, not an OCR failure (ocrFailed=false, isHeavyParse=false, numPages unknown).",
  thesisChain: [
    "Title claims an operational scale-up inflection ('Entering Execution Scale-Up') for India's largest private shipyard.",
    'Extracted text (8,048 chars of a reported >23,000) is 100% boilerplate disclaimer -- zero real slide content, capacity, or order-book figures captured.',
    'No quantified insight can be derived without inventing figures; flag for manual full-PDF review before the next post-close cycle rather than mark routine.',
  ],
  epsImpact: null,
  tags: [
    'text_truncated',
    'manual_review_recommended',
    'heavy_doc_treated_cautiously',
    'corporate_presentation',
  ],
  jCurve: {
    isCandidate: false,
    shape: null,
    elbowEvidence: null,
    whatWouldConfirm:
      "Full, untruncated presentation content showing an actual commissioning/order-book/margin inflection, not just the title's framing",
  },
  numPages: null,
  isHeavyParse: false,
});
markProcessed('NSE:SWANDEF', 'nv93m6vr646q6xwfzgx3tirs.pdf', 'announcement-insights:standard');

console.log('DONE');
