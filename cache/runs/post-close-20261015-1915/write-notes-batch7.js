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
  console.log('[addNote]', companyId, note.announcementId, '->', out.trim().slice(0, 200));
  return out;
}

function markProcessed(companyId, annId, usecase) {
  const args = ['packages/jobs-runtime/watchlistInsights.js', 'mark-processed', companyId, annId];
  if (usecase) args.push(usecase);
  const out = execFileSync('node', args).toString('utf8');
  console.log(
    '[markProcessed]',
    companyId,
    annId,
    usecase || '(default)',
    '->',
    out.trim().slice(0, 200)
  );
  return out;
}

// ---------------------------------------------------------------------------
// 0. NSE:HITECHCORP — "general"-labelled but actually the Post-Offer Public
// Announcement confirming a SUCCESSFUL SEBI delisting, with a final exit
// price fixed. Real quantified corporate action, mis-categorized as general.
// ---------------------------------------------------------------------------
{
  const companyId = 'NSE:HITECHCORP';
  const announcementId = 'cqz7kfrpocv9nm5qp85xa82m.pdf';
  addNote(companyId, {
    depth: 'standard',
    announcementId,
    announcementTitle:
      'Post Offer Public Announcement Issued In Accordance Of Regulation 17(4) And Other Applicable Provisions Of SEBI Delisting Regulations For The Delisting Of The Equity Shares Of The Company.',
    pdfUrl: 'https://www.stockscans.in/document/cqz7kfrpocv9nm5qp85xa82m.pdf',
    category: 'general',
    significance: 'high',
    headline:
      "Hitech Corporation's voluntary delisting offer is SUCCESSFUL — promoter-group acquirer crossed 90% post-offer, final exit price fixed at Rs.426/share vs Rs.252 floor (~69% premium to floor).",
    insight:
      'Kreo Capital (Manager to the Delisting Offer) confirms the post-offer shareholding of the Acquirer (Geetanjali Trading and Investments, promoter group) along with Promoters/Promoter Group has crossed 90% of issued equity, making the voluntary delisting offer deemed successful under Regulation 21 of the SEBI Delisting Regulations. The floor price was Rs.252/share; the book-built Discovered Price came in at Rs.425/share; the Acquirer exercised discretion under Reg 20(6) to declare a final Exit Price of Rs.426/share (higher than the discovered price). This is a definitive cash special-situation outcome for remaining public shareholders (25.57% of equity, ~43.91 lakh shares were tendered) — the stock will be delisted from BSE and NSE. This is not an earnings/EPS event; it is a terminal cash-exit event for the listed entity.',
    thesisChain: [
      'Promoter-group acquirer launched a voluntary delisting offer with a Rs.252 floor price',
      'Reverse book-building produced a Discovered Price of Rs.425/share',
      'Acquirer accepted and bettered it, declaring a final Exit Price of Rs.426/share',
      'Post-offer promoter-group holding crossed the 90% threshold, so the offer is deemed successful under Reg 21',
      'Equity will be delisted from BSE/NSE; remaining public shareholders are cashed out at Rs.426/share rather than this being an ongoing-EPS story',
    ],
    epsImpact: null,
    tags: ['delisting', 'corporate_action', 'cash_exit', 'regulatory', 'under_categorized'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    numPages: null,
    isHeavyParse: false,
  });
  markProcessed(companyId, announcementId, 'announcement-insights:standard');
}

// ---------------------------------------------------------------------------
// 1. NSE:CYIENTDLM — routine board outcome: Q2 results + CHRO appointment
// (not a strategic/KMP-top role) + routine RSU/ESOP grants.
// ---------------------------------------------------------------------------
{
  const companyId = 'NSE:CYIENTDLM';
  const announcementId = 'u3223kd4kgl27qpeqh3hh4yx.pdf';
  markProcessed(companyId, announcementId);
}

// ---------------------------------------------------------------------------
// 2. BSE:SHREEREF — acquisition / highConviction. Actually incorporation of a
// second new wholly-owned subsidiary ("Aquilon Limited", Rs.2.5 Cr paid-up)
// in the SAME chillers/HVAC/refrigeration line as the parent, within ~6 weeks
// of an earlier Rs.5 Cr WOS incorporation (per prior note on file, 1-Sep-2026).
// Not a true third-party acquisition — read carefully per high-conviction rule.
// ---------------------------------------------------------------------------
{
  const companyId = 'BSE:SHREEREF';
  const announcementId = 'n167ga6q9mskdzvunxwkpzql.pdf';
  addNote(companyId, {
    depth: 'deep',
    announcementId,
    announcementTitle: 'Announcement under Regulation 30 (LODR)-Acquisition',
    pdfUrl: 'https://www.stockscans.in/document/n167ga6q9mskdzvunxwkpzql.pdf',
    category: 'acquisition',
    significance: 'medium',
    headline:
      'Shree Refrigerations incorporates a SECOND new wholly-owned subsidiary ("Aquilon Limited", Rs.2.5 Cr paid-up) in the same chillers/HVAC line within ~6 weeks of the first (Rs.5 Cr WOS, 1-Sep-2026) — a deliberate multi-entity structuring pattern, not an external acquisition.',
    insight:
      'This filing is tagged "acquisition" but is actually incorporation of a new 100%-owned subsidiary, Aquilon Limited, with Rs.2,50,00,000 paid-up capital (2.5 lakh shares of Rs.100 each), 100% cash-subscribed, in the identical line of business as the parent (chillers, heat pumps, industrial/marine refrigeration, HVAC). The company already incorporated a separate Rs.5 Cr WOS in the same business line on 1-Sep-2026 (per note on file). Two same-line-of-business WOS formations inside ~6 weeks, both pre-flagged in an 31-Aug-2026 intimation, suggests deliberate corporate structuring (e.g. splitting manufacturing/export/product lines into separate legal entities) rather than organic one-off capacity addition. No consideration beyond capital subscribed, no governmental approvals needed, no change in control or EPS-relevant disclosure. Given this is a recently-listed small-cap (2026 IPO) actively reorganizing its corporate structure, the pattern itself — not this single Rs.2.5 Cr filing — is what is worth tracking.',
    thesisChain: [
      'Shree Refrigerations incorporates Aquilon Limited, a second new WOS (Rs.2.5 Cr paid-up) in the same chillers/HVAC business as the parent',
      'This follows a separate Rs.5 Cr WOS incorporated in the same business line just ~6 weeks earlier (1-Sep-2026)',
      "Repeated same-line WOS formation in quick succession signals active corporate/legal restructuring, not an arm's-length acquisition",
      'No capital/control/earnings impact disclosed in this filing alone; the real read-through depends on what these entities are eventually used for (export vehicle, product-line carve-out, future stake sale/JV, or demerger prep)',
    ],
    epsImpact: {
      direction: 'neutral',
      magnitude: 'Rs.2.5 Cr capital infusion into new WOS — immaterial standalone',
      timeline: 'n/a — no revenue/earnings disclosed for the new entity yet',
      confidence: 'low',
    },
    tags: [
      'high_conviction',
      'wos_incorporation',
      'hvac_chillers',
      'corporate_structuring',
      'mislabeled_acquisition',
    ],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm:
        'Evidence that one of these new WOS entities begins commercial operations/revenue, or that they are being prepared for a stake sale, JV, or scheme of arrangement, would turn this into a real structural catalyst.',
    },
    knowledgeGap:
      'The filing does not explain WHY Shree Refrigerations is splitting its single chillers/HVAC business into multiple separate wholly-owned subsidiaries within weeks of each other (Rs.5 Cr WOS on 1-Sep, Rs.2.5 Cr "Aquilon" WOS now) — e.g. whether this is for export/SEZ incentive structuring, separate product-line certification, ring-fencing for a future JV/stake sale, or demerger preparation. Could not be answered from the text of either filing alone.',
    numPages: null,
    isHeavyParse: false,
  });
  markProcessed(companyId, announcementId, 'announcement-insights:deep');
}

// ---------------------------------------------------------------------------
// 3. NSE:INFOBEAN — pure board-meeting notice (future date to approve
// results). No content yet.
// ---------------------------------------------------------------------------
{
  const companyId = 'NSE:INFOBEAN';
  const announcementId = '4rwxfr0wo61zec8gi0tx9dps.pdf';
  markProcessed(companyId, announcementId);
}

// ---------------------------------------------------------------------------
// 4. BSE:ELLEN — pure board-meeting notice (future date to approve results).
// ---------------------------------------------------------------------------
{
  const companyId = 'BSE:ELLEN';
  const announcementId = 'x3drrkojpcapzgezloqucd5x.pdf';
  markProcessed(companyId, announcementId);
}

// ---------------------------------------------------------------------------
// 5. NSE:ORIENTHOT — routine quarterly results, nothing unusual (small
// exceptional item of Rs.70 lakh vs Rs.117.87 Cr quarterly revenue;
// no management/strategic change disclosed).
// ---------------------------------------------------------------------------
{
  const companyId = 'NSE:ORIENTHOT';
  const announcementId = 'r7phwpywuufs2min7z8cbp91.pdf';
  markProcessed(companyId, announcementId);
}

// ---------------------------------------------------------------------------
// 6. NSE:HMAAGRO — reclassification of an outgoing promoter (zero
// shareholding) to Public category pursuant to a Family Settlement
// Agreement among the promoter family. Zero near-term financial/control
// impact, but the existence of a Family Settlement Agreement among the
// promoter group is a governance fact worth flagging, not silently skipping.
// ---------------------------------------------------------------------------
{
  const companyId = 'NSE:HMAAGRO';
  const announcementId = 'hui5gjtol9iya52qrxy009qv.pdf';
  addNote(companyId, {
    depth: 'standard',
    announcementId,
    announcementTitle:
      'Outcome without intimation - Outcome of Board Meeting for Reclassification of category of person belonging to promoter and promoter group to Public Category.',
    pdfUrl: 'https://www.stockscans.in/document/hui5gjtol9iya52qrxy009qv.pdf',
    category: 'general',
    significance: 'low',
    headline:
      'HMA Agro reclassifies outgoing promoter Mr. Wajid Ahmed (who holds NIL shares) to Public category under a Family Settlement Agreement dated 20-Sep-2026 — zero shareholding/control impact today, but flags a promoter-family settlement worth watching.',
    insight:
      'The Board approved reclassification of Mr. Wajid Ahmed from Promoter & Promoter Group to Public category under Regulation 31A, pursuant to a Family Settlement Agreement dated 20-Sep-2026 with the remaining five promoters (Mohammad Kamil Qureshi, Zulfiqar Ahmad Qurashi, Mohammad Ashraf Qureshi, Mohammad Mehmood Qureshi, Gulzar Ahmad), who continue as promoters. The filing explicitly states the outgoing promoter holds NIL equity shares, is not a KMP or nominee director, and does not exercise control — so there is no change in voting rights, free float, or minimum-public-shareholding compliance from this step itself. The only substantive new fact is the existence of a Family Settlement Agreement governing an exit from the promoter group, which is a governance signal worth keeping on file even though this particular step carries no quantifiable impact.',
    thesisChain: [
      "A Family Settlement Agreement (20-Sep-2026) formalizes one promoter-family member's exit from the promoter group",
      'That individual holds zero shares, so the reclassification itself changes no voting rights or free float',
      'The remaining five named promoters continue unchanged, and MPS compliance is unaffected',
      'No direct EPS/earnings link; the item is tracked as a governance/promoter-structure data point, not a financial catalyst',
    ],
    epsImpact: null,
    tags: [
      'promoter_reclassification',
      'family_settlement',
      'governance',
      'no_shareholding_impact',
    ],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    numPages: null,
    isHeavyParse: false,
  });
  markProcessed(companyId, announcementId, 'announcement-insights:standard');
}

// ---------------------------------------------------------------------------
// 7. NSE:MINDSPACE — routine quarterly Unit Holding Pattern disclosure, no
// prior-quarter comparison available in the filing itself.
// ---------------------------------------------------------------------------
{
  const companyId = 'NSE:MINDSPACE';
  const announcementId = 'vq9kc3vii1y3ov6z8wb0cq74.pdf';
  markProcessed(companyId, announcementId);
}

// ---------------------------------------------------------------------------
// 8. NSE:IIFL — labelled "general" but actually contains a genuine
// management change (Joint MD -> Non-Executive Non-Independent Director,
// ceasing to be KMP) plus a minor related-party transfer of a Sec-8
// CSR foundation. Under-categorized per the known taxonomy gap.
// ---------------------------------------------------------------------------
{
  const companyId = 'NSE:IIFL';
  const announcementId = '655ll16j0xi98ss5fjto7owj.pdf';
  addNote(companyId, {
    depth: 'deep',
    announcementId,
    announcementTitle: 'Outcome of Board Meeting for Outcome Of The Board Meeting',
    pdfUrl: 'https://www.stockscans.in/document/655ll16j0xi98ss5fjto7owj.pdf',
    category: 'management_change',
    significance: 'medium',
    headline:
      'IIFL Finance re-designates Joint MD Mr. R Venkataraman to Non-Executive Non-Independent Director (ceasing to be KMP) — a real management change filed under the generic "general" label, alongside a minor related-party CSR-foundation transfer.',
    insight:
      "Based on the Nomination & Remuneration Committee's recommendation, the Board re-designated Mr. R Venkataraman (DIN 00011919) from Joint Managing Director to Non-Executive Non-Independent Director effective 15-Oct-2026, subject to shareholder approval; he ceases to be a Key Managerial Person of IIFL Finance. The filing clarifies his executive role continues at sister entity IIFL Capital Services Limited and that he never drew compensation from IIFL Finance — consistent with a board-composition cleanup likely tied to the group's earlier capital-markets/NBFC vertical separation, rather than a surprise departure. Separately, the Board approved acquiring India Infoline Foundation (a Section 8 company limited by guarantee, no share capital) from IIFL Capital Services — an internal CSR-vehicle transfer between group entities with no revenue/earnings attached, i.e. not a real business acquisition. Also approved: Q2/H1 FY27 unaudited results (not independently assessed here) and routine NCD-related disclosures (security cover certificate, issue-proceeds utilisation).",
    thesisChain: [
      'A Joint Managing Director and KMP steps down to a Non-Executive Non-Independent Director role at IIFL Finance',
      'He retains an executive role only at the sister entity IIFL Capital Services, and drew no comp from IIFL Finance even before this change',
      'This reads as formalizing an already-separated group structure (board cleanup) rather than a new operational disruption',
      'Watch the AGM/EGM for shareholder approval and whether this is followed by further board reconstitution tied to the capital-markets/NBFC split',
    ],
    epsImpact: null,
    tags: [
      'management_change',
      'kmp_change',
      'under_categorized',
      'group_restructuring',
      'related_party_transfer',
    ],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    knowledgeGap: null,
    numPages: null,
    isHeavyParse: false,
  });
  markProcessed(companyId, announcementId, 'announcement-insights:deep');
}

// ---------------------------------------------------------------------------
// 9. NSE:BAJAJCON — just the posted audio-link for an already-held earnings
// call; no new information content.
// ---------------------------------------------------------------------------
{
  const companyId = 'NSE:BAJAJCON';
  const announcementId = 'so09ocahp003kfdx09zwey0e.pdf';
  markProcessed(companyId, announcementId);
}

console.log('DONE');
