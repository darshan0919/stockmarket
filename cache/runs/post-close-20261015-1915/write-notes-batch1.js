const { execFileSync } = require('child_process');

function execWithRetry(cmd, args, opts, label) {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return execFileSync(cmd, args, opts).toString('utf8');
    } catch (e) {
      const stderr = e.stderr ? e.stderr.toString() : '';
      if (stderr.includes('Could not acquire lock') && attempt < maxAttempts) {
        console.log(`   [retry ${attempt}/${maxAttempts}] lock busy for ${label}, waiting 5s...`);
        execFileSync('sleep', ['5']);
        continue;
      }
      throw e;
    }
  }
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
  return execWithRetry(
    'node',
    ['packages/jobs-runtime/watchlistInsights.js', 'add-note'],
    {
      input: JSON.stringify(payload),
      maxBuffer: 1024 * 1024 * 20,
    },
    `add-note:${companyId}`
  );
}

function markProcessed(companyId, annId, usecase) {
  const args = ['packages/jobs-runtime/watchlistInsights.js', 'mark-processed', companyId, annId];
  if (usecase) args.push(usecase);
  return execWithRetry('node', args, {}, `mark-processed:${companyId}`);
}

function run(label, fn) {
  try {
    const out = fn();
    console.log(`[OK] ${label}`);
    if (out && out.trim()) console.log('   ' + out.trim().slice(0, 300));
  } catch (e) {
    console.error(`[FAIL] ${label}`);
    console.error('   STDOUT:', e.stdout ? e.stdout.toString().slice(0, 1000) : '');
    console.error('   STDERR:', e.stderr ? e.stderr.toString().slice(0, 1000) : '');
    throw e;
  }
}

// ---------- ITEM 0: NSE:PFOCUS - cessation of control over Brahma AI Holdings/India ----------
run('PFOCUS addNote', () =>
  addNote('NSE:PFOCUS', {
    announcementId: 'pmquik8t7m85zh5gplwbxlxa.pdf',
    announcementTitle:
      'Board Meeting Outcome for Outcome Of Board Meeting And Disclosure Under Regulation 30 Of Schedule III Of The Securities And Exchange Board Of India (Listing Obligations And Disclosure Requirements) Regulations 2015 As Amended (Listing Regulations)',
    pdfUrl:
      'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/pmquik8t7m85zh5gplwbxlxa.pdf',
    category: 'general',
    significance: 'high',
    headline:
      'Prime Focus board approves cessation of control over its Brahma AI Holdings/Brahma India material subsidiaries as Multiples PE subscribes to CCPS, convening a Nov-7 EOGM with special-resolution RPT indemnities attached to DNEG',
    insight:
      'Filed under a generic "Board Meeting Outcome / Regulation 30 disclosure" title, this is a material corporate-structure event, not routine: the board approved (for member vote) the transaction structure under which Multiples Private Equity (via Gift Fund IV and Fund IV) subscribes to CCPS of Brahma AI Holdings and Brahma AI Services India, resulting in Prime Focus (through DNEG Parent/DNEG Holdings) ceasing control over both entities. An EOGM is set for Nov 7, 2026 to pass a Regulation 24(5) special resolution approving the deconsolidation, plus three material related-party transactions: DNEG Parent indemnifying Brahma Holdings/Group companies, a cross-shareholder tax-indemnity SHA, and an annual-fee platform-license deal for the Brahma AI Platform between DNEG Parent and Brahma Holdings whose value is expected to exceed Reg 23(4) materiality thresholds. No consideration/valuation figures are disclosed in this filing. The combination of (a) losing consolidation control over a subsidiary it has been actively building out (per the Sept 23 Earlier Disclosure) and (b) layering in recurring platform-license and indemnity obligations back onto the Prime Focus/DNEG side is a structure investors should read carefully before the Nov 7 vote -- it changes both what shows up in future consolidated financials and the RPT risk profile.',
    thesisChain: [
      'Multiples PE subscribes to CCPS of Brahma AI Holdings and Brahma AI Services India (material subsidiaries)',
      'This subscription causes Prime Focus (via DNEG Parent/DNEG Holdings) to cease control over both entities, removing them from consolidation going forward',
      'Simultaneously, DNEG Parent takes on indemnity obligations to Brahma Holdings/Group and enters an annual platform-license fee arrangement for the Brahma AI Platform -- a continuing RPT revenue/cost line even after control is ceded',
      'EOGM on Nov 7, 2026 must pass a special resolution (Reg 24(5)) for the deconsolidation plus Reg 23(4) RPT approvals before this is final',
      'If approved, consolidated P&L loses/gains whatever Brahma Holdings/India currently contribute, replaced by a licensing-fee revenue/cost line and contingent indemnity exposure -- net EPS direction is not quantifiable from this filing alone',
    ],
    epsImpact: {
      direction: 'uncertain',
      magnitude: 'unknown',
      timeline: 'post Nov-7 EOGM, FY27 reporting',
      confidence: 'low',
    },
    tags: [
      'deconsolidation',
      'related_party_transaction',
      'ai_subsidiary',
      'eogm',
      'taxonomy_undercategorized',
    ],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    numPages: null,
    isHeavyParse: false,
  })
);
run('PFOCUS markProcessed', () =>
  markProcessed('NSE:PFOCUS', 'pmquik8t7m85zh5gplwbxlxa.pdf', 'announcement-insights:standard')
);

// ---------- ITEM 1: NSE:CHENNPETRO - routine board meeting intimation for possible interim dividend ----------
run('CHENNPETRO markProcessed (routine)', () =>
  markProcessed('NSE:CHENNPETRO', 'gjk868lk6obamzcs55ig4lhc.pdf')
);

// ---------- ITEM 2 + 3: NSE:KABRAEXTRU - Q2 FY27 results press release (primary) + board outcome incl. CEO succession (subordinate) ----------
run('KABRAEXTRU item2 addNote (primary, Q2 results)', () =>
  addNote('NSE:KABRAEXTRU', {
    announcementId: '3kjb6mr11azov2lnpzvyoxja.pdf',
    announcementTitle: 'Announcement under Regulation 30 (LODR)-Press Release / Media Release',
    pdfUrl:
      'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/3kjb6mr11azov2lnpzvyoxja.pdf',
    category: 'general',
    significance: 'high',
    headline:
      'Kabra Extrusiontechnik: Geon battery/BESS arm swings H1 FY27 PAT to +Rs22mn (from a Rs73mn loss) as its revenue mix jumps from 34% to 68-75%, with multiple BESS projects already commissioned (not just announced) and the Rs141cr preferential raise funding UAE/Vietnam expansion -- a genuine margin-accretive inflection, not a one-off quarter',
    insight:
      'Filed generically as a "Press Release" under Reg 30 (a known taxonomy gap for this feed), the actual content is a quantified step-change: Q2 FY27 revenue +64.2% YoY to Rs2,210mn, EBITDA +116.0% YoY to Rs194mn (already exceeding full-year FY26 EBITDA of Rs104mn in one quarter), and PAT +1,084.8% YoY to Rs39mn. H1 FY27 PAT turned positive at Rs22mn versus a Rs73mn loss in H1 FY26 and a Rs54mn full-year FY26 loss. The swing is driven by Geon (battery-pack/BESS), whose revenue grew 2.1x YoY and now contributes 68% of H1 (75% in Q2) revenue, up from 34% a year ago. Critically, the margin improvement is tied to assets already commissioned, not pipeline: two 10MW/20MWh grid-scale BESS projects in Rajasthan (Phalodi, Jaisalmer) and Phase 1 (2.88GWh) of the Khavda hub are operational, and growth is being funded by a preferential equity issue of Rs141cr (37.6 lakh shares at Rs375/share, per the Aug-Sept 2026 board approvals already on file) rather than fresh debt. New LOI/LON wins (a top-3 Indian 2W OEM, a top Vietnamese PV maker, entry into high-voltage passenger-car packs) and a new UAE holding subsidiary (Geon International FZ-LLC, incorporated Oct 5, 2026) extend the pipeline further. The one material unknown for EPS purposes is the current total share count, so per-share dilution from the 37.6 lakh new shares cannot be quantified here.',
    thesisChain: [
      'Geon revenue grows 2.1x YoY and its mix rises from 34% (H1FY26) to 68% (H1FY27)/75% (Q2FY27 alone) of consolidated revenue',
      'Two BESS projects (Phalodi, Jaisalmer) and Khavda Phase 1 are already commissioned and generating revenue, not just guided -- this is realized operating leverage, not optimism',
      'EBITDA margin expands 468bps YoY to 7.4% in H1; EBITDA alone is already 2.5x the full FY26 EBITDA',
      'Consolidated PAT swings from a Rs73mn H1FY26 loss to a Rs22mn H1FY27 profit -- the loss-making drag from Extrusion Machinery/early-stage Geon appears to be ending',
      'Growth (UAE subsidiary, Vietnam plant, 2W/PV OEM wins) is funded by the already-approved Rs141cr preferential equity raise rather than debt, so there is no new interest-cost tailwind, only equity dilution of unknown per-share magnitude',
      'If Geon sustains >=65-70% revenue mix and margin expansion for 2 more quarters, consolidated EPS inflects structurally upward, net of the share-count dilution from the preferential issue',
    ],
    epsImpact: {
      direction: 'positive',
      magnitude: 'medium-high',
      timeline: '2-4 quarters',
      confidence: 'medium',
    },
    patBridge: null,
    tags: [
      'battery_storage',
      'bess',
      'margin_expansion',
      'pat_turnaround',
      'preferential_issue',
      'taxonomy_undercategorized',
    ],
    jCurve: {
      isCandidate: true,
      shape: 'inflection',
      elbowEvidence:
        'Two 10MW/20MWh BESS projects (Phalodi, Jaisalmer) plus Khavda Phase 1 (2.88GWh) are already commissioned and operating, not pipeline; Geon revenue mix jumped from 34% to 68-75% of consolidated revenue in one year; EBITDA margin expanded 468bps YoY to 7.4% and PAT swung from a Rs73mn H1 loss to a Rs22mn H1 profit -- evidence of fixed-cost absorption from assets already placed in service, not management guidance alone.',
      whatWouldConfirm:
        'Q3/Q4 FY27 sustaining EBITDA margin at or above ~8% with Geon mix holding above 65-70% of revenue and PAT growth outpacing revenue growth (operating leverage continuing), absent one-off items.',
    },
    knowledgeGap:
      'Total post-raise share count and resulting dilution percentage from the 37.6 lakh share preferential issue are not disclosed in this filing or prior notes; would need the latest shareholding pattern to quantify per-share EPS impact precisely.',
    numPages: null,
    isHeavyParse: false,
  })
);
run('KABRAEXTRU item2 markProcessed', () =>
  markProcessed('NSE:KABRAEXTRU', '3kjb6mr11azov2lnpzvyoxja.pdf', 'announcement-insights:standard')
);

run('KABRAEXTRU item3 addNote (subordinate, CEO succession)', () =>
  addNote('NSE:KABRAEXTRU', {
    announcementId: '70akqzgygndomrnstrmm9w8w.pdf',
    announcementTitle:
      'Board Meeting Outcome for Outcome Of Board Meeting Of The Company Held On October 15 2026',
    pdfUrl:
      'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/70akqzgygndomrnstrmm9w8w.pdf',
    category: 'general',
    significance: 'low',
    headline:
      "Routine internal succession at Kabra Extrusiontechnik: CEO-Extrusion Division retires, replaced by an internal 40-year sales/marketing veteran -- no disruption signal; the real news from today's board meeting is the Q2 FY27 results inflection covered in the linked press-release note",
    insight:
      'This board-outcome filing approves the same Q2/H1 FY27 unaudited results covered in the companion press-release filing from the same company today (see that note for the Geon-driven revenue/EBITDA/PAT inflection), and additionally discloses one new fact: Mr. Yogesh Deo retires as CEO - Extrusion Division effective Oct 22, 2026, succeeded by Mr. Mahaboob Ali Khan (currently SVP - Sales & Marketing, 40+ years in plastics-extrusion machinery, internal promotion) effective Oct 23, 2026. This is a divisional (not whole-company) leadership change, framed as a planned retirement with an internal successor already in place -- low disruption risk. Internal auditor re-appointments for both divisions are pure housekeeping.',
    thesisChain: [
      'CEO - Extrusion Division retires with an internal successor already named and starting the next day',
      'Succession is planned/orderly (retirement, not removal) with a long-tenured internal candidate -- limited execution risk to the legacy Extrusion Machinery business',
      "No read-through to the Geon growth story, which is the actual driver of this company's forward EPS (see companion press-release note)",
    ],
    epsImpact: null,
    tags: ['management_succession', 'divisional_ceo', 'routine_housekeeping'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    numPages: null,
    isHeavyParse: false,
  })
);
run('KABRAEXTRU item3 markProcessed', () =>
  markProcessed('NSE:KABRAEXTRU', '70akqzgygndomrnstrmm9w8w.pdf', 'announcement-insights:standard')
);

// ---------- ITEM 4: BSE:VINCOFE - routine board meeting intimation (no terms/amount) ----------
run('VINCOFE markProcessed (routine)', () =>
  markProcessed('BSE:VINCOFE', 'v1skwqzdfls1pr3y11sipgdr.pdf')
);

// ---------- ITEM 5: NSE:CONNPLEX - routine SME compliance non-applicability notice ----------
run('CONNPLEX markProcessed (routine)', () =>
  markProcessed('NSE:CONNPLEX', '7sjcp8jod9bnp4yppzgxcz63.pdf')
);

// ---------- ITEM 6: NSE:AKIKO - routine in-principle ESOP listing approval ----------
run('AKIKO markProcessed (routine)', () =>
  markProcessed('NSE:AKIKO', 'oeqsw5n899z5woled8ff8oa2.pdf')
);

// ---------- ITEM 7: NSE:KODYTECH - routine trading approval for already-converted warrant shares ----------
run('KODYTECH markProcessed (routine)', () =>
  markProcessed('NSE:KODYTECH', 'u5l5pdrl40ewz2vtmybsx1ba.pdf')
);

// ---------- ITEM 8: NSE:VIVIANA - board decides NOT to proceed with proposed warrant preferential issue ----------
run('VIVIANA addNote', () =>
  addNote('NSE:VIVIANA', {
    announcementId: 'bumsb723prurlq12cp24liap.pdf',
    announcementTitle: 'Outcome of Board Meeting',
    pdfUrl:
      'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/bumsb723prurlq12cp24liap.pdf',
    category: 'general',
    significance: 'low',
    headline:
      'Viviana Power Tech board reverses course and will NOT proceed with its previously proposed preferential issue of fully convertible warrants -- avoids near-term dilution but removes an expected capital-raising catalyst',
    insight:
      'After "comprehensive deliberation," the board unanimously decided not to proceed with the proposed fully-convertible-warrant preferential issue it had earlier floated. No reason beyond generic "financial prudence/capital structure alignment" language is disclosed, and no financial figures are given. The practical effect is two-sided: existing shareholders avoid the dilution that would have come with the warrant issue, but a previously signaled funding avenue for this EPC (power transmission/distribution) business is now off the table, which could matter if the company has near-term working-capital or growth-capex needs that this raise was meant to cover.',
    thesisChain: [
      'Board had previously proposed a preferential warrant issue as a fund-raising route',
      'Board now unanimously withdraws that proposal after evaluating alternatives',
      'No new equity dilution occurs from this specific route -- near-term EPS is protected from this source of dilution',
      'However, the company now has one fewer disclosed funding avenue for its EPC growth capital needs, which is a watch-item if working-capital/capex requirements were the original rationale for proposing the warrants',
    ],
    epsImpact: {
      direction: 'neutral_to_slightly_positive',
      magnitude: 'low',
      timeline: 'immediate (avoided dilution)',
      confidence: 'low',
    },
    tags: ['fundraise_withdrawn', 'warrants', 'capital_structure'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    numPages: null,
    isHeavyParse: false,
  })
);
run('VIVIANA markProcessed', () =>
  markProcessed('NSE:VIVIANA', 'bumsb723prurlq12cp24liap.pdf', 'announcement-insights:standard')
);

// ---------- ITEM 9: NSE:SIS - routine daily buyback report ----------
run('SIS markProcessed (routine)', () => markProcessed('NSE:SIS', 'mzr4ea5gv0z97k6lgd6crav5.pdf'));

console.log('\nALL DONE');
