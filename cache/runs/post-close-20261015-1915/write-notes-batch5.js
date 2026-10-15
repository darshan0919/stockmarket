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
  const out = execFileSync('node', ['packages/jobs-runtime/watchlistInsights.js', 'add-note'], {
    input: JSON.stringify(payload),
    maxBuffer: 1024 * 1024 * 20,
  }).toString('utf8');
  console.log('[add-note]', companyId, note.announcementId, '->', out.slice(0, 200));
  return out;
}

function markProcessed(companyId, annId, usecase) {
  const args = ['packages/jobs-runtime/watchlistInsights.js', 'mark-processed', companyId, annId];
  if (usecase) args.push(usecase);
  const out = execFileSync('node', args).toString('utf8');
  console.log(
    '[mark-processed]',
    companyId,
    annId,
    usecase || '(default)',
    '->',
    out.slice(0, 200)
  );
  return out;
}

// ===========================================================================
// 0. NSE:STALLION — regulatory (GST inspection) — ROUTINE
// Maharashtra GST search/inspection (Oct 9-14) concluded voluntarily; ITC
// reversals/corrections across 5 line items (OFS-expense ITC, inter-state
// Rights-issue ITC, cancelled-supplier ITC, ISD distribution, blocked ITC).
// Company states tax+interest already paid, "revenue-neutral", and "does
// not anticipate any material impact on ongoing operations". No monetary
// figure disclosed, matter closed by the company's own account. Genuinely
// low-signal after reading in full -> routine.
// ===========================================================================
markProcessed('NSE:STALLION', 'x6nx8mwlmtqaeoeyvo1umjwh.pdf');

// ===========================================================================
// 1. NSE:UTLSOLAR (Fujiyama Power Systems) — fundraise — NOTEWORTHY (medium)
// Board approved a QIP of up to Rs 1,200 Cr, explicitly framed as being
// undertaken "with a view to achieving and maintaining the minimum public
// shareholding requirements" (MPS) -- i.e. this is a compliance-driven float
// expansion, not disclosed growth capital. Size/price/timing are all left to
// a newly-constituted QIP Committee, so dilution cannot be quantified yet.
// Separately, the Board allotted 4,11,587 ESOP shares at Rs398.39 exercise
// price, nudging paid-up capital from Rs30.69cr to Rs30.73cr (+0.13%,
// immaterial on its own).
// ===========================================================================
addNote('NSE:UTLSOLAR', {
  depth: 'standard',
  announcementId: 'mxpu2hvajs8dqxupegendux7.pdf',
  announcementTitle: 'Board Meeting Outcome for Outcome Of Board Meeting Regarding Fund Raising',
  pdfUrl: 'https://www.stockscans.in/document/mxpu2hvajs8dqxupegendux7.pdf',
  category: 'fundraise',
  significance: 'medium',
  headline:
    'Fujiyama Power Systems approves a QIP of up to Rs1,200cr framed around minimum-public-shareholding compliance, not disclosed growth capex -- size/price undetermined, so dilution is not yet quantifiable.',
  insight:
    "Fujiyama Power Systems' Board approved raising up to Rs1,200cr via QIP, with the stated purpose being to achieve/maintain minimum public shareholding (MPS) requirements rather than funding a specific growth project -- the filing discloses no use-of-proceeds for capex or debt. A QIP Committee was constituted to determine size, timing, number and price of the issue, so neither the final raise quantum nor the issue price is known yet, meaning dilution cannot be estimated from this filing alone. Separately the Board allotted 4,11,587 ESOP shares at an exercise price of Rs398.39, lifting paid-up capital from Rs30,69,01,762 to Rs30,73,13,349 (+0.13%), an immaterial standalone change. Because the QIP is compliance-driven (MPS) rather than growth-driven, any dilution from it would not be offset by a disclosed earnings contribution -- worth tracking once the QIP Committee sets price and size.",
  thesisChain: [
    'Board approves QIP of up to Rs1,200cr, explicitly tied to meeting MPS requirements, not a named growth/capex use',
    'QIP Committee still has to set size, price and timing -- actual dilution is undeterminable from this filing',
    'Separately, 4,11,587 ESOP shares allotted at Rs398.39, a 0.13% bump to paid-up capital',
    'A compliance-driven (not growth-driven) equity raise implies dilution without a disclosed offsetting earnings driver -- watch the QIP pricing/size disclosure for the real EPS read',
  ],
  epsImpact: {
    direction: 'negative',
    magnitude: 'undeterminable -- size and price of the up-to-Rs1,200cr QIP are not yet set',
    timeline:
      'next 1-2 quarters pending QIP committee pricing and shareholder/regulatory approvals',
    confidence: 'low',
  },
  tags: ['qip', 'fundraise', 'mps_compliance', 'esop_allotment', 'dilution_watch'],
  jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  knowledgeGap:
    'Not high-conviction category, so not required, but noting: unclear whether the MPS shortfall driving this QIP stems from a promoter-holding breach or a public-float technicality -- would need the shareholding pattern to judge urgency/signal.',
  numPages: null,
  isHeavyParse: false,
});
markProcessed('NSE:UTLSOLAR', 'mxpu2hvajs8dqxupegendux7.pdf', 'announcement-insights:standard');

// ===========================================================================
// 2. NSE:STYLEBAAZA (Baazar Style Retail) — general — NOTEWORTHY (medium)
// Only ONE Stylebaazar filing in this batch (cross-checked; no duplicate
// companyId appears twice in batch_5.json), so rule 6's merge-two-filings
// guidance does not apply here. The filing itself bundles four items: (a)
// Audit Committee reconstitution (routine governance), (b) new independent
// director appointment (routine), (c) incorporation of a new Wholly-Owned
// Subsidiary for SOLAR POWER / RENEWABLE ENERGY -- a genuine diversification
// away from the core value-fashion retail business (rule 3: new
// subsidiary/business-line = real signal regardless of size), and (d)
// allotment of 20,00,000 equity shares (Rs328.25 issue price) on non-promoter
// warrant conversion -- per prior notes in this company's history, this is a
// known, ongoing, low-signal warrant-conversion tranche (not new capital).
// Combined headline centers on the new WOS since that's the only genuinely
// new strategic fact.
// ===========================================================================
addNote('NSE:STYLEBAAZA', {
  depth: 'standard',
  announcementId: '12mgv1sx4gzrsuxmemnhnyal.pdf',
  announcementTitle: 'Board Meeting Outcome for Outcome Of Board Meeting',
  pdfUrl: 'https://www.stockscans.in/document/12mgv1sx4gzrsuxmemnhnyal.pdf',
  category: 'general',
  significance: 'medium',
  headline:
    "Baazar Style Retail incorporates a new WOS to enter solar/renewable-energy generation -- a real diversification away from core value-fashion retail; the accompanying 20L-share warrant-conversion tranche is a known, ongoing, low-signal item per this company's note history.",
  insight:
    "Baazar Style Retail's Board approved incorporating a wholly-owned subsidiary/SPV to develop, acquire and operate solar power and other renewable-energy generation projects -- described as in line with 'long-term growth strategy' but with no capex quantum, capacity target or timeline disclosed. Per standing direction, a new subsidiary/business-line incorporation is a real business-state change worth surfacing regardless of rupee size, and this is a genuine strategic expansion beyond the company's core value-fashion retail operations, not a same-people-same-roles filing. The same board meeting also approved allotment of 20,00,000 equity shares (face value Rs5, issue price Rs328.25) on non-promoter warrant-holder conversion (20L of the remaining 76L outstanding warrants) -- this company's note history shows this is a known, already-approved, ongoing warrant-conversion programme (prior tranches of 10L shares at the same Rs328.25 price were logged as low-significance follow-ups), so this tranche itself carries no new capital or strategic information. Audit Committee reconstitution and the appointment of a new independent director (a retired bank GM) are routine governance housekeeping.",
  thesisChain: [
    'Board approves incorporation of a new WOS/SPV for solar power generation and renewable energy -- a real diversification beyond core retail, even with no capex figure disclosed yet',
    'No disclosed capacity target, capex quantum or funding source for the new renewable-energy vertical -- too early to size an EPS impact',
    "Same meeting converts another 20L of the already-approved non-promoter warrant pool at Rs328.25 -- consistent with prior low-signal tranches in this company's note history, not a new capital event",
    'Watch for the follow-up filing disclosing capex/capacity plans for the renewable-energy SPV -- that is where the real EPS read will emerge',
  ],
  epsImpact: {
    direction: 'neutral',
    magnitude: 'no capex/capacity/funding figures disclosed for the new renewable-energy SPV yet',
    timeline: 'next few quarters, pending capex disclosure',
    confidence: 'low',
  },
  tags: [
    'new_subsidiary',
    'diversification',
    'renewable_energy',
    'warrant_conversion',
    'follow_up',
    'governance',
  ],
  jCurve: {
    isCandidate: false,
    shape: null,
    elbowEvidence:
      'Entering a new business line is the opposite of an elbow -- it is new sunk cost yet to be incurred, not a drag ending or capex just commissioned.',
    whatWouldConfirm:
      "A later filing showing the solar SPV's capex commissioned and generating revenue would be the earliest possible elbow signal, likely 2+ years out.",
  },
  numPages: null,
  isHeavyParse: false,
});
markProcessed('NSE:STYLEBAAZA', '12mgv1sx4gzrsuxmemnhnyal.pdf', 'announcement-insights:standard');

// ===========================================================================
// 3. BSE:TLL (Trident Lifeline) — fundraise ((\ tll); actually a related-
//    party subsidiary stake dilution) — NOTEWORTHY (low-medium, governance flag)
// Prior note (2026-09-30) shows TLL's stake in subsidiary Trident Mediquip
// (TML) rose 58.67% -> 59.67% via a related-party share purchase. This new
// filing shows TML did a private placement to "other shareholders" that
// pulled TLL's stake back down to 58.23% -- and the disclosed related
// parties receiving/benefiting are again director-relatives (Mr. Amit
// Bhupendra Halvawala, Mr. Chetan Chandrakant Jariwala - relative of
// Rupaben Jariwala, Mr. Hardik Jigishkumar Desai). Consideration/price
// fields in the Reg-30 Annexure are all filled "NA" despite this being a
// priced private placement -- a disclosure-transparency gap worth flagging
// even though "arm's length" is asserted.
// ===========================================================================
addNote('BSE:TLL', {
  depth: 'standard',
  announcementId: 'wizhhrtl1qr264bjvg0lw7nz.pdf',
  announcementTitle: 'Announcement under Regulation 30 (LODR)-Acquisition',
  pdfUrl: 'https://www.stockscans.in/document/wizhhrtl1qr264bjvg0lw7nz.pdf',
  category: 'fundraise',
  significance: 'medium',
  headline:
    'Trident Mediquip private-placement to related-party shareholders dilutes parent Trident Lifeline\'s stake back to 58.23% (from 59.67% just two weeks ago) -- price/consideration undisclosed despite an "arm\'s length" claim, a related-party transparency gap worth flagging.',
  insight:
    "Subsidiary Trident Mediquip Limited (TML) made a private placement of equity shares to 'other shareholders', diluting parent Trident Lifeline's (TLL) stake from 59.67% to 58.23% (a 1.44pp drop). This directly reverses part of the 1% stake top-up TLL itself disclosed on 2026-09-30 (58.67% -> 59.67%), so the parent's effective economic interest in TML has been moving in both directions via back-to-back related-party transactions within weeks of each other. The Reg-30 annexure names the beneficiaries/parties with an interest in TML as director-relatives of TLL (Mr. Amit Bhupendra Halvawala, Mr. Chetan Chandrakant Jariwala -- relative of Rupaben Jariwala -- and Mr. Hardik Jigishkumar Desai), and states the transaction is 'at arm's length', but every pricing/consideration field in the disclosure (cost of acquisition, consideration type, government approvals, timeline) is filled 'NA' -- unusual for a priced private placement and a genuine disclosure-transparency gap, since 'arm's length' cannot be verified without a price. TML's scale remains small (FY26 turnover Rs27.31cr) so the earnings impact of the oscillating stake is immaterial standalone, but the pattern of repeated related-party capital movements in and out of a majority subsidiary, with no price disclosed, is worth continued governance monitoring.",
  thesisChain: [
    "TLL's stake in subsidiary TML has moved 58.67% -> 59.67% (Sep-30, acquisition) -> 58.23% (this filing, dilution via private placement)",
    'Both transactions involve the same cluster of director-relative related parties',
    'This filing\'s Reg-30 annexure discloses no price/consideration despite being a priced private placement, undermining verifiability of the stated "arm\'s length" basis',
    "TML's small scale (Rs27.31cr turnover) keeps the standalone EPS impact immaterial, but repeated opaque related-party stake movements are a governance signal to keep tracking",
  ],
  epsImpact: {
    direction: 'neutral',
    magnitude: 'immaterial -- 1.44pp stake move in a Rs27.31cr-turnover subsidiary',
    timeline: 'immediate',
    confidence: 'high',
  },
  tags: [
    'related_party_transaction',
    'subsidiary_dilution',
    'governance',
    'disclosure_gap',
    'follow_up',
  ],
  jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  knowledgeGap:
    'Unclear why TML needed a private placement to "other shareholders" so soon after TLL itself bought a 1% top-up stake -- could be a working-capital raise at TML level, but the filing gives no stated purpose or price, so the real rationale is not derivable from this document.',
  numPages: null,
  isHeavyParse: false,
});
markProcessed('BSE:TLL', 'wizhhrtl1qr264bjvg0lw7nz.pdf', 'announcement-insights:standard');

// ===========================================================================
// 4. NSE:PARACABLES (Paramount Communications) — category tagged
//    "shareholding_change" (SAST) — NOTEWORTHY (low) per rule 2, HARD
//    REQUIREMENT: never default to routine.
// data/runs/digest_20261015.json does NOT exist for 2026-10-15 (confirmed via
// `ls`), so there is no same-day dealsDigest snapshot to cross-check pricing
// against. Critically, the extracted PDF text itself contains NO
// shareholding/SAST content whatsoever -- it is a plain Regulation 29 board
// meeting intimation for Q2/H1 FY27 results and a trading-window-closure
// notice. There is no inter-se transfer, no pledge creation/release, no
// transferor/transferee, no quantum or price anywhere in the text. This is a
// category/content mismatch (the "shareholding_change" tag does not match
// the filing's actual substance), which is exactly the kind of taxonomy gap
// rule 5 warns about -- so this is written up honestly rather than invented.
// ===========================================================================
addNote('NSE:PARACABLES', {
  depth: 'standard',
  announcementId: 'w2voqiui9ofhdugq6ouhs0au.pdf',
  announcementTitle:
    'Board Meeting Intimation for Intimation Of The Board Meeting Pursuant To Regulation 29 Of The Securities And Exchange Board Of India (Listing Obligations And Disclosure Requirements) Regulations 2015',
  pdfUrl: 'https://www.stockscans.in/document/w2voqiui9ofhdugq6ouhs0au.pdf',
  category: 'shareholding_change',
  significance: 'low',
  headline:
    'Category tagged "shareholding_change" (SAST) but the extracted PDF text contains no SAST/shareholding content at all -- it is a plain Regulation 29 board-meeting intimation for Q2/H1 FY27 results; no dealsDigest snapshot exists for 2026-10-15 to cross-check pricing either way, so this needs manual follow-up rather than being judged or defaulted to routine.',
  insight:
    "This item carries the category tag shareholding_change (SAST), which per standing direction must never be defaulted to routine even when a same-day dealsDigest snapshot is unavailable -- and indeed data/runs/digest_20261015.json does not exist for 2026-10-15 (confirmed), so there is no priced snapshot to cross-check. However, having read the full extracted PDF text carefully, it contains no shareholding, SAST, inter-se transfer, promoter-pledge, or Form-related disclosure of any kind -- it is purely a Regulation 29 board meeting intimation for Paramount Communications' Q2/H1 FY27 unaudited results (meeting scheduled Oct 26, 2026) plus a trading-window-closure notice (closed since Oct 1, reopening 48 hours post-results, i.e. through Oct 28). There are no parties, quantum, price, or transaction type anywhere in the text to judge strategic/governance relevance from, per the rule's instruction to judge it 'directly from the PDF text' -- the text simply does not contain SAST substance. This looks like a category/content mismatch: either the scanner mis-tagged a routine results-intimation filing as shareholding_change, or the actual SAST filing for this company on this date is a separate document not captured in this extraction. Flagging for manual follow-up rather than silently marking routine, per the hard rule on this category.",
  thesisChain: [
    'Filing is tagged shareholding_change (SAST) by the scan taxonomy',
    'Full PDF text read end-to-end contains zero SAST/shareholding content -- only a Q2/H1 FY27 results board-meeting intimation and trading-window notice',
    'data/runs/digest_20261015.json (same-day dealsDigest) does not exist, so there is no priced snapshot to corroborate or contradict',
    'No basis in the text to assess inter-se transfer, pledge creation/release, or promoter-trust activity -- cannot derive an EPS/governance read from content that is not present',
    "Recommend manual check of Paramount Communications's actual SAST/shareholding disclosures for 2026-10-15, since the real SAST document may not be the one captured here",
  ],
  epsImpact: null,
  tags: ['category_mismatch', 'sast', 'no_digest_snapshot', 'manual_follow_up_needed'],
  jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  knowledgeGap:
    'Cannot determine from this document whether an actual inter-se/pledge SAST filing exists elsewhere for this company on this date, or whether the taxonomy simply mis-tagged a routine results-intimation filing -- would need to re-query the Stockscans announcement feed directly for Paramount Communications on 2026-10-15 to resolve.',
  numPages: null,
  isHeavyParse: false,
});
markProcessed('NSE:PARACABLES', 'w2voqiui9ofhdugq6ouhs0au.pdf', 'announcement-insights:standard');

// ==========================================================================
// 5. BSE:TRISHAKT — anticipation — ROUTINE
// Plain Reg-29 board meeting intimation for Q2/H1 FY27 results (Oct 22) +
// trading-window-closure notice. No figures, no new information.
// ==========================================================================
markProcessed('BSE:TRISHAKT', 'dg94hd6jcvvho67m9a6ccbp8.pdf');

// ===========================================================================
// 6. BSE:MAXGROW — general — ROUTINE
// Appointment of a new Company Secretary and two additional independent
// directors. Standard governance/compliance housekeeping -- no new
// business line, no capital event, no numbers. Same-type-of-role
// continuation (board composition refresh), not a business-state change.
// ===========================================================================
markProcessed('BSE:MAXGROW', 'h8xvrq0zzwi9e32h77ssst4q.pdf');

// ===========================================================================
// 7. NSE:GESHIP (Great Eastern Shipping) — general — ROUTINE
// Mandated daily buyback progress report (Regulation 18 of SEBI Buyback
// Regulations) -- a recurring, boilerplate compliance disclosure filed every
// trading day for the duration of the buyback window. No new strategic
// information beyond the day's running total (27,08,660 shares bought back
// cumulatively, avg price Rs1,526.10 today).
// ===========================================================================
markProcessed('NSE:GESHIP', 'pbf1c7jrrw2lw1faj7jk6ufm.pdf');

// ==========================================================================
// 8. NSE:SAREGAMA — anticipation — ROUTINE
// Plain Reg-29 board meeting notice for Q2/H1 FY27 results (Nov 4) +
// trading-window-closure notice. No figures, no new information.
// ===========================================================================
markProcessed('NSE:SAREGAMA', '2l74bopwt2hlxtjs5vba4bgl.pdf');

// ==========================================================================
// 9. NSE:ADOR (Ador Welding) — general — ROUTINE
// BIS Act Section 17(3) matter (welding wire-flux cored possessed without
// valid authorization/license) disposed by Bhiwandi court with a Rs34 lakh
// fine, already paid; company states "no material impact on financials or
// operations or other activities". Historical/already-known matter
// (references a 2023 letter) now formally closed with an immaterial fine.
// ==========================================================================
markProcessed('NSE:ADOR', '460chkdpon6bxdnpf80d3fpv.pdf');

console.log('\nDone: batch_5 processed (10 items: 3 noted, 7 routine).');
