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
  const only = process.env.ONLY_PREFIX;
  if (only && !label.startsWith(only)) {
    console.log(`[SKIP] ${label}`);
    return;
  }
  try {
    const r = fn();
    console.log(`[OK] ${label}`);
    if (r && r.trim()) console.log('   ' + r.trim().slice(0, 300));
  } catch (e) {
    console.error(`[FAIL] ${label}`);
    console.error('   STDOUT:', e.stdout ? e.stdout.toString() : '');
    console.error('   STDERR:', e.stderr ? e.stderr.toString() : e.message);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// 1. NSE:SAHANA - routine disclosure-of-a-leak, but reveals a real forward
//    signal (preferential issue to be considered at Oct 16 board meeting).
// ---------------------------------------------------------------------------
run('NSE:SAHANA addNote', () =>
  addNote('NSE:SAHANA', {
    depth: 'standard',
    announcementId: '8ae48k1ekf8x7l6cq7bpbwcl.pdf',
    announcementTitle: 'General Updates',
    pdfUrl: 'https://www.stockscans.in/document/8ae48k1ekf8x7l6cq7bpbwcl.pdf',
    category: 'general',
    significance: 'low',
    headline:
      'Sahana Systems inadvertently reveals a pending preferential-issue proposal ahead of its Oct 16 board meeting',
    insight:
      'The filing itself is a clarification/damage-control notice: an unapproved draft Postal Ballot Notice was prematurely emailed to shareholders by the company\'s e-voting service provider on Oct 14, and the company is disclaiming it as unauthorized and legally void. But the disclaimer itself confirms the underlying fact pattern — the Board is scheduled to consider a "proposed preferential issue and related matters" at its meeting on October 16, 2026, and a Postal Ballot Notice (required for shareholder approval of a preferential allotment) was already in draft. Nothing is approved yet and the Board retains full discretion to modify, defer or reject the proposal. This is a genuine forward-looking governance signal (a potential dilutive capital raise is on the table within 24-48 hours) rather than routine noise, even though the proximate filing is just an operational-lapse disclaimer.',
    thesisChain: [
      'Service-provider error leaks a draft Postal Ballot Notice referencing a "proposed preferential issue"',
      'Company confirms the Board will consider this preferential issue at its Oct 16, 2026 meeting, with no terms (size, price, allottees) yet disclosed',
      'If approved, a preferential allotment is dilutive to existing shareholders and raises fresh capital — EPS/book-value impact cannot be sized until pricing and quantum are disclosed',
    ],
    epsImpact: {
      direction: 'uncertain_pending_board_approval',
      magnitude: 'unknown',
      timeline: 'board meeting Oct 16, 2026 (next 1-2 days)',
      confidence: 'low',
    },
    tags: ['preferential_issue_pending', 'disclosure_lapse', 'governance', 'dilution_watch'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  })
);
run('NSE:SAHANA markProcessed', () =>
  markProcessed('NSE:SAHANA', '8ae48k1ekf8x7l6cq7bpbwcl.pdf', 'announcement-insights:standard')
);

// ---------------------------------------------------------------------------
// 2. NSE:YASHOPTICS - cyber-attack disclosure, real operational risk event.
// ---------------------------------------------------------------------------
run('NSE:YASHOPTICS addNote', () =>
  addNote('NSE:YASHOPTICS', {
    depth: 'standard',
    announcementId: 'to523qbxa60hrqugjqknj0jc.pdf',
    announcementTitle: 'General Updates',
    pdfUrl: 'https://www.stockscans.in/document/to523qbxa60hrqugjqknj0jc.pdf',
    category: 'general',
    significance: 'low',
    headline:
      'Yash Optics & Lens discloses a cyber-attack on its IT infrastructure, with affected systems shut down pending investigation',
    insight:
      'The company has suffered a cyber-attack on its IT infrastructure and has shut down the affected systems while it investigates with external cybersecurity experts. No quantification of data compromised, systems affected, financial cost, or expected downtime is disclosed. This is a genuine operational/reputational risk event (not boilerplate "general update" noise) because it can disrupt operations (production, invoicing, customer data) and carry remediation/legal costs, but with zero numbers disclosed the near-term financial impact cannot be sized from this filing alone.',
    thesisChain: [
      'Cyber-attack hits company IT infrastructure; affected systems are shut down as a containment measure',
      'Investigation with external cybersecurity experts is ongoing; scope/duration/cost not yet disclosed',
      'Any operational disruption (production, billing, customer/vendor systems) or remediation cost would be a near-term EPS drag, but magnitude is undisclosed',
    ],
    epsImpact: {
      direction: 'negative_risk',
      magnitude: 'unknown - no scope/cost disclosed',
      timeline: 'near-term, pending investigation update',
      confidence: 'low',
    },
    tags: ['cyber_attack', 'operational_risk', 'it_disruption', 'follow_up_required'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  })
);
run('NSE:YASHOPTICS markProcessed', () =>
  markProcessed('NSE:YASHOPTICS', 'to523qbxa60hrqugjqknj0jc.pdf', 'announcement-insights:standard')
);

// ---------------------------------------------------------------------------
// 3. NSE:ARHAM - celebrity brand marketing press release. Genuinely routine:
//    no new regulatory/NCLT substance, pure PR/marketing content.
// ---------------------------------------------------------------------------
run('NSE:ARHAM markProcessed (routine)', () =>
  markProcessed('NSE:ARHAM', 'ttgdted4k5ez336xfeg93xh6.pdf')
);

// ---------------------------------------------------------------------------
// 4. NSE:ZOTA - ocrFailed:true HARD STOP. Must write a note, cannot skip.
// ---------------------------------------------------------------------------
run('NSE:ZOTA addNote', () =>
  addNote('NSE:ZOTA', {
    depth: 'standard',
    announcementId: 'boqoqcv7syz8lm1hqtbq9xdw.pdf',
    announcementTitle: 'General Updates',
    pdfUrl: 'https://www.stockscans.in/document/boqoqcv7syz8lm1hqtbq9xdw.pdf',
    category: 'general',
    significance: 'low',
    headline:
      'OCR FAILED: Zota Health Care "Clarification regarding Increase in Volume" filing could not be read - manual follow-up required',
    insight:
      'The PDF text extraction failed for this filing (ocrFailed:true, scanned/image-only document) — no text could be recovered, so the actual content is unknown. The exchange description indicates it is a clarification regarding an increase in trading volume, which per standard SEBI practice typically asks the company to confirm whether it is aware of any undisclosed price-sensitive information behind unusual volume activity. Because the underlying text is unreadable, no insight or EPS read can be derived, and this item must not be treated as routine. Flagging for manual PDF review (fetch and read the source PDF directly) before this is closed out.',
    thesisChain: [
      'PDF OCR/text extraction failed - no content available for this announcement',
      'Exchange description suggests it is a volume-clarification response, which can sometimes precede or follow price-sensitive disclosures',
      'No insight or EPS linkage can be derived until the document is manually read',
    ],
    epsImpact: null,
    tags: ['ocr_failed', 'manual_review_required', 'volume_clarification', 'unresolved'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    numPages: null,
    isHeavyParse: false,
  })
);
run('NSE:ZOTA markProcessed', () =>
  markProcessed('NSE:ZOTA', 'boqoqcv7syz8lm1hqtbq9xdw.pdf', 'announcement-insights:standard')
);

// ---------------------------------------------------------------------------
// 5. NSE:AGARWALTUF - new WOS in Dubai. State change regardless of rupee size.
// ---------------------------------------------------------------------------
run('NSE:AGARWALTUF addNote', () =>
  addNote('NSE:AGARWALTUF', {
    depth: 'standard',
    announcementId: 'tbh0w27pivmtzcbn1yz56enp.pdf',
    announcementTitle: 'General Updates',
    pdfUrl: 'https://www.stockscans.in/document/tbh0w27pivmtzcbn1yz56enp.pdf',
    category: 'general',
    significance: 'low',
    headline:
      'Agarwal Toughened Glass approves a new wholly-owned subsidiary in Dubai (UAE) for trading/consulting services - first overseas entity',
    insight:
      'The Board approved incorporating and investing in a 100%-owned subsidiary in Dubai, UAE (proposed name "Agarwal Tuff" or similar), to be funded entirely in cash at face value and focused on general trading, professional and consulting services. This is a new corporate entity and a first step into international operations for a company that was previously a purely domestic (Jaipur-based) toughened-glass manufacturer. The disclosed amount (face-value share capital at incorporation) is immaterial in rupee terms, but per standing judgment the company\'s structural footprint has genuinely changed - this is a real strategic state-change (new geography, new legal entity, potential trading/distribution channel for exports), not boilerplate.',
    thesisChain: [
      'Board approves incorporating a wholly-owned trading/consulting subsidiary in Dubai, UAE',
      'Entity will be funded in cash at face value - no disclosed capital commitment of consequence yet',
      'This gives the company its first overseas corporate presence, which could become a channel for export trading or consulting revenue, but no revenue/timeline guidance is given',
    ],
    epsImpact: {
      direction: 'neutral_near_term',
      magnitude: 'immaterial at incorporation; unknown long-run',
      timeline: 'post-incorporation, no timeline disclosed',
      confidence: 'low',
    },
    tags: ['overseas_subsidiary', 'international_expansion', 'new_entity', 'uae'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  })
);
run('NSE:AGARWALTUF markProcessed', () =>
  markProcessed('NSE:AGARWALTUF', 'tbh0w27pivmtzcbn1yz56enp.pdf', 'announcement-insights:standard')
);

// ---------------------------------------------------------------------------
// 6. NSE:PARTH - quantified order win, order book disclosure.
// ---------------------------------------------------------------------------
run('NSE:PARTH addNote', () =>
  addNote('NSE:PARTH', {
    depth: 'standard',
    announcementId: 'b0rgg06bkur5wsyn7nqarrem.pdf',
    announcementTitle: 'General Updates',
    pdfUrl: 'https://www.stockscans.in/document/b0rgg06bkur5wsyn7nqarrem.pdf',
    category: 'order_book',
    significance: 'medium',
    headline:
      'Parth Electricals wins ~Rs85cr of new RMU orders in Gujarat, taking total executable order book to ~Rs471cr (~18% order-book refresh)',
    insight:
      'Parth Electricals secured new domestic orders of approximately Rs85 crore (ex-GST) for Ring Main Units (RMUs) from EPC contractors in Gujarat, to be executed over 2-14 months. This lifts the total executable order book to ~Rs471 crore (the new order is ~18% of the post-win order book), and management cites a combined RMU pipeline of ~2,500 units supporting base-load utilisation at the Vadodara facility over the next 12 months, with a newer Khordha, Odisha facility positioned to serve eastern-India demand. This is a quantified, real order-book addition (not routine PR) that supports near-term revenue visibility, though actual margin/EPS conversion depends on execution and pricing not disclosed here.',
    thesisChain: [
      'New domestic RMU orders of ~Rs85cr won from Gujarat EPC contractors, execution starting within 2 months and completing over the following 12 months',
      'Total executable order book rises to ~Rs471cr, providing ~12-14 months of revenue visibility per management',
      'Combined RMU pipeline of ~2,500 units supports base-load utilisation at the existing Vadodara plant, while the new Khordha (Odisha) facility opens an eastern-India growth avenue',
      'Revenue visibility is strengthened, but EPS impact depends on undisclosed execution margins and timing of billing/revenue recognition',
    ],
    epsImpact: {
      direction: 'positive',
      magnitude: 'Rs85cr new orders vs Rs471cr total book (~18% addition)',
      timeline: 'execution over next 12-14 months',
      confidence: 'medium',
    },
    tags: ['order_win', 'order_book_growth', 'rmu', 'capacity_utilisation', 'gujarat'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence:
        'Order pipeline supports utilisation of an existing facility and a newer Odisha facility, but no capex-commissioning or margin-inflection evidence is disclosed here',
      whatWouldConfirm:
        'Disclosed execution margins, capacity utilisation rates at Vadodara/Khordha, and confirmation that the Khordha facility has moved from capex to commercial production',
    },
  })
);
run('NSE:PARTH markProcessed', () =>
  markProcessed('NSE:PARTH', 'b0rgg06bkur5wsyn7nqarrem.pdf', 'announcement-insights:standard')
);

// ---------------------------------------------------------------------------
// 7. NSE:VERTIS - procedural InvIT board step (approving financials for an
//    already-disclosed, unitholder-approved public-conversion process).
// ---------------------------------------------------------------------------
run('NSE:VERTIS markProcessed (routine)', () =>
  markProcessed('NSE:VERTIS', 'y0l22ugfxj08etb4pury3q08.pdf')
);

// ---------------------------------------------------------------------------
// 8. NSE:CUPID (highConviction: acquisition) - DEEP. Completion of a warrant
//    conversion tranche into Baazar Style Retail equity; large cumulative
//    capital commitment relative to net worth.
// ---------------------------------------------------------------------------
run('NSE:CUPID addNote', () =>
  addNote('NSE:CUPID', {
    depth: 'deep',
    announcementId: '24y6qzw9j1bxy1brofb7rcma.pdf',
    announcementTitle: 'Announcement under Regulation 30 (LODR)-Updates on Acquisition',
    pdfUrl: 'https://www.stockscans.in/document/24y6qzw9j1bxy1brofb7rcma.pdf',
    category: 'acquisition',
    significance: 'high',
    headline:
      'Cupid completes a ~Rs98.5cr tranche converting Baazar Style Retail warrants into equity - cumulative deployment now ~Rs147.7cr, with a further ~Rs183.8cr (total ~Rs331.5cr, ~73% of FY26 net worth) still committed',
    insight:
      'Cupid has now actually EXECUTED (not just approved - the Sep-28 board approval is already on file) the conversion of 30,00,000 of its Baazar Style Retail warrants into equity shares at the pre-fixed price of Rs328.25/share, deploying real cash of ~Rs98.5cr in this tranche. Cumulative conversions now stand at 45,00,000 of the total 1,01,00,000 warrants originally allotted (~44.6% converted), implying ~Rs147.7cr already deployed into Baazar Style equity. The remaining 56,00,000 warrants, if converted at the same fixed price, would require a further ~Rs183.8cr, taking Cupid\'s total commitment to this single investee to ~Rs331.5cr - roughly 73% of the Rs451cr net worth Cupid itself disclosed at its Sep-22 AGM. This is a major capital-allocation event for a condoms/wellness manufacturer building a large equity stake in an unrelated listed retail company, continuing a programme first disclosed in Jan-2026. The filing discloses no accounting treatment (investment vs. associate), no stake percentage in Baazar Style, and no strategic rationale beyond "conversion" - so the EPS linkage (dividend income, mark-to-market, or associate-method profit share) cannot be sized from this document alone.',
    thesisChain: [
      'Cupid completes conversion of 30,00,000 Baazar Style Retail warrants into equity at the fixed Rs328.25/share price, deploying ~Rs98.5cr of cash in this tranche',
      'Cumulative conversion reaches 45,00,000 of 1,01,00,000 total warrants allotted (~44.6%), implying ~Rs147.7cr already deployed',
      "The remaining 56,00,000 warrants, if fully converted, would require a further ~Rs183.8cr - taking total commitment to ~Rs331.5cr, ~73% of Cupid's own disclosed FY26 net worth (Rs451cr)",
      'This scale of capital commitment to a single unrelated investee is a real balance-sheet and capital-allocation event, but the filing gives no accounting treatment, resulting stake %, or expected income stream, so EPS impact cannot be derived yet',
    ],
    epsImpact: {
      direction: 'uncertain',
      magnitude: 'large relative to balance sheet (~73% of net worth if fully converted)',
      timeline:
        'ongoing - 56,00,000 warrants (~Rs183.8cr) remain outstanding for future conversion',
      confidence: 'low',
    },
    tags: [
      'warrant_conversion',
      'capital_deployment',
      'baazar_style_retail',
      'capital_allocation_risk',
      'high_conviction',
    ],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    knowledgeGap:
      "The filing does not disclose: (a) the accounting treatment of the Baazar Style stake (financial investment vs. equity-method associate), (b) the resulting % stake in Baazar Style Retail after this tranche, (c) Baazar Style's own financial profile/growth outlook, or (d) Cupid's strategic rationale for committing up to ~73% of net worth to a single unrelated retail investee. Need Baazar Style Retail's financials and Cupid's own disclosure of accounting treatment to judge whether this is value-accretive capital allocation or a concentration risk.",
  })
);
run('NSE:CUPID markProcessed', () =>
  markProcessed('NSE:CUPID', '24y6qzw9j1bxy1brofb7rcma.pdf', 'announcement-insights:deep')
);

// ---------------------------------------------------------------------------
// 9. NSE:ANLON - SME-exchange corporate-governance-report exemption notice.
//    Genuinely routine compliance filing, no state change.
// ---------------------------------------------------------------------------
run('NSE:ANLON markProcessed (routine)', () =>
  markProcessed('NSE:ANLON', 'gk3fdzkm13gkxs3fvv3wzbqt.pdf')
);

// ---------------------------------------------------------------------------
// 10. NSE:ASIANENE (highConviction: demerger label, actually a MERGER) - DEEP.
//     NCLT final order received sanctioning merger-by-absorption of holding
//     company Oilmax Energy into AESL - the elbow event for 3 prior
//     contingent-asset notes.
// ---------------------------------------------------------------------------
run('NSE:ASIANENE addNote', () =>
  addNote('NSE:ASIANENE', {
    depth: 'deep',
    announcementId: 'bnbzj79xe782e375ewdm63jf.pdf',
    announcementTitle: 'Announcement under Regulation 30 (LODR)-Scheme of Arrangement',
    pdfUrl: 'https://www.stockscans.in/document/bnbzj79xe782e375ewdm63jf.pdf',
    category: 'demerger',
    significance: 'high',
    headline:
      'CATEGORY CORRECTION - this is a MERGER, not a demerger: NCLT issues final order sanctioning absorption of holding company Oilmax Energy into AESL, clearing the gate for 3 prior contingent-asset notes to consolidate',
    insight:
      'Despite being scan-tagged "demerger", the actual transaction (per the filing\'s own text and the NCLT order) is a Scheme of Merger by Absorption of the holding company, Oilmax Energy Private Limited (OEPL), INTO the listed Asian Energy Services Limited (AESL) - i.e. a reverse-merger consolidation, not a business split. The Hon\'ble NCLT Mumbai Bench pronounced its final order sanctioning the Scheme on 29-Sep-2026, and AESL received the certified true copy today (15-Oct-2026). This clears the single biggest conditionality flagged across three prior notes already on file for this company: the Aug-22 AOSL Energy JV restructuring, the Sep-2 award of a DSF-IV hydrocarbon block to Oilmax, and the Sep-7 Vanadium/Graphite mining LOI to Oilmax - all of which were explicitly described as "vesting in AESL only once the Scheme becomes effective." Oilmax brings proven oil & gas E&P assets across five blocks (incl. one CBM block), a quartzite mineral block, an agriculture-venture subsidiary, plus the newer DSF-IV block and Vanadium/Graphite licence, into AESL - transforming it from a pure oilfield-services provider into an integrated E&P-plus-services-plus-minerals group. The order text states the Appointed Date is "the 1st day of the month in which the Effective Date occurs," and the Effective Date itself (typically the date the order is filed with the Registrar of Companies) is not yet confirmed in this filing, so the precise consolidation timing and share-exchange/swap ratio are still unknown.',
    thesisChain: [
      'NCLT Mumbai Bench pronounces its final order (29-Sep-2026) sanctioning the Scheme of Merger by Absorption of holding company Oilmax Energy into AESL; AESL receives the certified copy today',
      'This resolves the single biggest conditionality across three prior notes (Aug-22 AOSL JV, Sep-2 DSF-IV block, Sep-7 Vanadium/Graphite LOI) that all explicitly depended on the Scheme becoming effective',
      "Oilmax's proven E&P assets (5 oil/gas blocks incl. 1 CBM), a quartzite mineral block, an agriculture subsidiary, plus the newer DSF-IV block and Vanadium/Graphite licence, now move toward consolidation into AESL once the Effective Date is registered",
      'AESL transforms from a pure oilfield-services provider into an integrated E&P + services + critical-minerals group - a business-model step-change, not a routine filing',
      "EPS impact is not yet derivable: the share-exchange ratio, Oilmax's standalone financials, and the confirmed Effective Date (ROC filing) are still needed",
    ],
    epsImpact: {
      direction: 'uncertain_pending_effective_date',
      magnitude:
        'potentially large - business-model transforming (adds proven E&P + mineral assets to a pure services company)',
      timeline:
        'next 1-2 quarters, once Effective Date is registered with ROC and consolidated financials are issued',
      confidence: 'low',
    },
    tags: [
      'merger',
      'nclt_final_order',
      'taxonomy_correction',
      'oil_gas_exploration',
      'minerals',
      'business_transformation',
      'high_conviction',
    ],
    jCurve: {
      isCandidate: true,
      shape: 'step_change_on_consolidation',
      elbowEvidence:
        'The NCLT final order is the concrete "drag ending" trigger: three prior notes each separately flagged a valuable asset (AOSL JV stake, DSF-IV hydrocarbon block, Vanadium/Graphite LOI) as held in limbo at the holding-company level purely because the merger scheme was not yet sanctioned. Today\'s final order removes that single blocking conditionality for all three at once - a real structural unlock, not management optimism.',
      whatWouldConfirm:
        "The Registrar-of-Companies filing confirming the Effective Date, the disclosed share-exchange/swap ratio, and the first post-merger consolidated financial statements showing Oilmax's E&P/mineral assets, revenue and any assumed debt now on AESL's books",
    },
    knowledgeGap:
      "Don't have Oilmax Energy's standalone financials, the merger's share-exchange/swap ratio, or the confirmed Effective Date - all needed to size the actual EPS/book-value impact of consolidating Oilmax's E&P, mineral and agriculture assets into AESL. Also unclear (not researched here, time-boxed) what typical market/analyst treatment is for a reverse-merger-by-absorption of a resource-holding parent into its listed services subsidiary in terms of valuation re-rating precedent.",
  })
);
run('NSE:ASIANENE markProcessed', () =>
  markProcessed('NSE:ASIANENE', 'bnbzj79xe782e375ewdm63jf.pdf', 'announcement-insights:deep')
);

console.log('\nDone.');
