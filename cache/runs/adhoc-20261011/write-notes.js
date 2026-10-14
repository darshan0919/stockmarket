const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const WI_JOB = path.resolve('packages/jobs-runtime/watchlistInsights.js');
const { signalTierFor } = require(path.resolve('packages/jobs-runtime/lib/thesisCardEmail.js'));

const MODEL = 'claude-sonnet-5';
const SOURCE_SKILL = 'post-close-scan-insights';

function addNote(payload) {
  const json = JSON.stringify(payload);
  const out = execFileSync('node', [WI_JOB, 'add-note'], {
    input: json,
    maxBuffer: 1024 * 1024 * 20,
  });
  return JSON.parse(out.toString('utf8'));
}
function markProcessed(companyId, annId, usecase) {
  execFileSync('node', [WI_JOB, 'mark-processed', companyId, annId, usecase]);
}

// companyId -> {ticker, name, pdfUrl-primary} plus note fields.
const ITEMS = [
  {
    companyId: 'NSE:STYLEBAAZA',
    name: 'Baazar Style Retail Ltd',
    announcementIds: ['2z9aanabp8bsx0epj8j9h4wo.pdf', 'exfjgfxb42y6sqfitz75uv7s.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/2z9aanabp8bsx0epj8j9h4wo.pdf',
    category: 'capacity',
    significance: 'low',
    headline:
      'Baazar Style Retail opens 2 more stores (Naini-Prayagraj, Raniganj), taking count to 286 -- steady expansion cadence, no new catalyst',
    insight:
      'Two new Style Baazar stores opened Oct 10-11 (Naini, Prayagraj UP and Raniganj, WB), taking the network from 284 to 286 stores. Per notes-DB history this company opens several stores per week at a steady, previously-flagged LOW-significance cadence (e.g. "283rd store... steady expansion continues", "3rd new store in 2 days"); these two filings are the same recurring pattern, not a new catalyst. Per standing direction a new store opening is a genuine state-change/operating-cadence signal worth logging even though individually immaterial, so this stays on-cadence rather than being skipped.',
    thesisChain: [
      'Two new stores opened in 48 hours',
      'network reaches 286 stores, consistent with recent run-rate',
      'same-store-sales trend (last flagged -25% YoY on festive-calendar shift) is the real swing factor, not store count',
      'no EPS linkage derivable from store count alone without revenue-per-store data',
    ],
    epsImpact: null,
    tags: ['retail-expansion', 'recurring'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm: 'same-store-sales inflection, not store count',
    },
  },
  {
    companyId: 'NSE:PNGJL',
    name: 'P N Gadgil Jewellers Ltd',
    announcementIds: ['oqpkr8tbiad0cgrfh0efvxvb.pdf', '9a2dk0g78sstx0e8ucli578w.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/9a2dk0g78sstx0e8ucli578w.pdf',
    category: 'general',
    significance: 'low',
    headline:
      'PNGJL opens flagship "Legacy" FOCO store in Ayodhya (religious-tourism catchment), total count to 81 -- distinct from the pending Silvostyle acquisition',
    insight:
      'PNGJL opened a new "Legacy" format, Franchise-Owned-Company-Operated store in Ayodhya (Ram Path Road), taking its network to 81 stores (67 Legacy + 14 YOOU). The press release frames it around the brand\'s "194-year legacy." This is a routine but genuine physical-expansion state-change (new location, pilgrimage-tourism catchment) and is unrelated to the already-flagged, medium-significance Silvostyle Jewellers acquisition (Rs 27.96cr) sitting in the notes DB -- two separate growth levers for the same company, not duplicated news.',
    thesisChain: [
      'New flagship store opened in a high-footfall pilgrimage city',
      'adds to store count (81 total)',
      "FOCO model keeps PNGJL's own capex low for this specific store",
      'no quantified revenue/EPS contribution disclosed for a single new store',
    ],
    epsImpact: null,
    tags: ['retail-expansion'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  },
  {
    companyId: 'NSE:AEROFLEX',
    name: 'Aeroflex Industries Ltd',
    announcementIds: ['c0l5rf05p8l8e15c7yq7tne9.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/c0l5rf05p8l8e15c7yq7tne9.pdf',
    category: 'anticipation',
    significance: 'low',
    headline:
      'Aeroflex board to meet Oct 14 to consider capacity-expansion plans -- watch item, no numbers yet',
    insight:
      'Board meeting scheduled Oct 14, 2026 specifically to consider and approve "expansion plans including further capacity enhancements." This is a forward-looking watch item only -- no capex figure, location, or capacity addition disclosed yet. Flagging now so the Oct 14 outcome filing is read with full context on arrival.',
    thesisChain: [
      'Board meeting called specifically for capacity-expansion approval',
      'outcome due Oct 14, 2026',
      'no figures yet, nothing to size until the outcome filing',
    ],
    epsImpact: null,
    tags: ['watch', 'capacity-expansion-pending'],
    jCurve: {
      isCandidate: true,
      shape: 'possible future capex-driven inflection',
      elbowEvidence: null,
      whatWouldConfirm: 'the Oct 14 outcome filing with actual capex/capacity numbers',
    },
  },
  {
    companyId: 'NSE:VIVIANA',
    name: 'Viviana Power Tech Ltd',
    announcementIds: ['vj65n8q04dnd9090wjb97qnn.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/vj65n8q04dnd9090wjb97qnn.pdf',
    category: 'order_book',
    significance: 'high',
    headline:
      'Viviana Power Tech bags Rs 466.73cr turnkey order from existing client MGVCL -- large single order, no notes-DB history to calibrate against',
    insight:
      "Viviana Power Tech Limited has been awarded a new turnkey contract worth Rs 466,73,61,738 (~Rs 466.73cr, inclusive of taxes) from Madhya Gujarat Vij Company Limited (MGVCL), an existing client. This is the company's first entry in the notes DB (zero prior notes), so there is no internal baseline for order-book size or revenue run-rate to size this against -- treating the absolute value as the signal: a single order approaching Rs 467cr is large for any company below the Rs 70,000cr market-cap scan ceiling, and existing-client repeat business reduces execution/relationship risk versus a new-logo win.",
    thesisChain: [
      'New Rs 466.73cr turnkey order awarded by an existing client (MGVCL)',
      'adds directly to order book/revenue visibility for coming quarters',
      'repeat-client nature lowers execution risk vs a first-time counterparty',
      'EPS impact not derivable without current order book size, margin profile or execution timeline -- flagged as a knowledge gap',
    ],
    epsImpact: null,
    tags: ['order-win', 'repeat-client'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    knowledgeGap:
      "Viviana Power Tech: no prior notes/financial baseline on file -- need current order book size and typical EPC margin to size this Rs 466.73cr order's EPS contribution.",
  },
  {
    companyId: 'NSE:SHEETAL',
    name: 'Sheetal Universal Ltd',
    announcementIds: ['hgqp0rqdfjy0stbwbzmxq396.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/hgqp0rqdfjy0stbwbzmxq396.pdf',
    category: 'fundraise',
    significance: 'medium',
    headline:
      'Sheetal Universal completes Rs 14.18cr warrant-conversion tranche (9L of 14.2L warrants now fully exercised) -- distinct from the already-flagged UAE export order',
    insight:
      'Board approved allotment of 9,00,000 equity shares on conversion of 9,00,000 convertible warrants (face value Rs 10, issue price Rs 210/share incl. Rs 200 premium), for cash consideration of Rs 14,17,50,000. Combined with the 5,20,000 warrants converted earlier, all 14,20,000 originally-issued warrants are now fully converted. Paid-up capital rises ~7.5% (Rs 11.98cr to Rs 12.88cr; 1,19,75,999 to 1,28,75,999 shares). This is a separate capital-structure event from the Rs 10.2cr UAE export order already in the notes DB -- the warrant program completing in full is the news here, not a new order.',
    thesisChain: [
      'Final tranche of a multi-year warrant program converts',
      'Rs 14.18cr cash comes in, paid-up capital +7.5%',
      'warrant program now fully exhausted -- no further scheduled dilution from this source',
      'EPS impact is mildly dilutive near-term (~7.5% share-count increase) offset by fresh cash; net effect undetermined without knowing deployment plan',
    ],
    epsImpact: {
      direction: 'neutral',
      magnitude: '~7.5% share-count increase, Rs 14.18cr cash in',
      timeline: 'immediate',
      confidence: 'medium',
    },
    tags: ['warrant-conversion', 'capital-raise'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  },
  {
    companyId: 'NSE:AIIL',
    name: 'Authum Investment & Infrastructure Ltd',
    announcementIds: ['1zk0nfpr4ja099orjfjgf2y7.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/1zk0nfpr4ja099orjfjgf2y7.pdf',
    category: 'shareholding_change',
    significance: 'high',
    headline:
      'Authum completes Rs 350cr cash commitment under NCLT-approved Wind World (India) resolution plan, routed via ICD into Vibhav Energy',
    insight:
      "Authum Investment & Infrastructure has fulfilled its Rs 350,00,00,000 (Rs 350cr) financial commitment under the NCLT-approved (July 27, 2026) resolution plan for Wind World (India) Ltd (WWIL), remitting the consideration net of statutory deductions. Because the original scheme-of-arrangement structure for WWIL itself was NOT approved by NCLT, the consortium (Authum + Inox Neo Energies) revised the implementation structure, and Authum's debt/equity infusion is now routed via an inter-corporate deposit into Vibhav Energy Private Limited (VEPL), one of Inox Neo's implementation entities, rather than directly into WWIL. Per routing-rules.md this sits in the demerger/NCLT family where the category label (shareholding_change) undersells the event -- the PDF, not the taxonomy tag, is what established this is a Rs 350cr completed cash deployment into a long-running distressed-wind-asset IBC resolution, not a routine shareholding filing.",
    thesisChain: [
      'NCLT approved the WWIL resolution plan on July 27, 2026',
      'scheme-of-arrangement piece was NOT approved, forcing a revised implementation structure',
      'Authum has now actually paid its Rs 350cr commitment, via ICD into VEPL (an Inox Neo entity), not directly into WWIL',
      "EPS/earnings linkage depends on VEPL/WWIL's wind-asset cash flows and Authum's eventual debt/equity terms there -- neither disclosed in this filing",
    ],
    epsImpact: null,
    tags: ['nclt-resolution', 'distressed-asset', 'completed-payment'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm:
        "disclosed terms of Authum's eventual debt/equity stake in VEPL/WWIL and that entity's earnings profile",
    },
    knowledgeGap:
      "Authum/WWIL/VEPL: the final debt-vs-equity split and VEPL's own earnings profile are not yet disclosed -- needed before this Rs 350cr commitment can be read through to Authum's own EPS.",
  },
  {
    companyId: 'NSE:STLNETWORK',
    name: 'STL Networks Ltd',
    announcementIds: ['bugvyuowldx6zctagyv9vmz6.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/bugvyuowldx6zctagyv9vmz6.pdf',
    category: 'acquisition',
    significance: 'low',
    headline:
      'STL Networks DC Limited (data-centre WOS) incorporation now COMPLETE -- confirms a plan already flagged low-significance, not new information',
    insight:
      'STL Networks has incorporated "STL Networks DC Limited," a wholly-owned subsidiary for data-centre and telecom-connectivity infrastructure, with MCA issuing the Certificate of Incorporation on Oct 10, 2026. Taxonomy tags this "acquisition" (forcing a medium significance floor per the high-conviction-category guard), but the notes DB already has a prior LOW-significance note -- "STL Networks to incorporate new WOS for data centre and connectivity infrastructure" -- flagging this exact plan. This filing is the completion/confirmation step (certificate issued), not a new acquisition or new information; no target company was bought, no consideration was paid. Written up at medium per the code-level HC floor, but the actual informational content is FOLLOW-UP, not NEW.',
    thesisChain: [
      'Previously-announced WOS plan is now legally incorporated',
      'no capital deployed yet beyond incorporation formalities',
      'data-centre buildout remains a pre-revenue, early-stage optionality until capex/contracts are disclosed',
      'no EPS linkage derivable at the incorporation stage',
    ],
    epsImpact: null,
    tags: ['high_conviction', 'follow-up', 'data-centre'],
    jCurve: {
      isCandidate: true,
      shape: 'early-stage, pre-revenue optionality (data-centre capex cycle)',
      elbowEvidence: null,
      whatWouldConfirm:
        'first disclosed capex commitment or anchor customer contract for STL Networks DC Limited',
    },
  },
  {
    companyId: 'BSE:FABCLEAN',
    name: 'Fabtech Cleanrooms Ltd',
    announcementIds: ['xq1i9ra0wox1jacwnq323iv0.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/xq1i9ra0wox1jacwnq323iv0.pdf',
    category: 'order_book',
    significance: 'medium',
    headline:
      'Fabtech Cleanrooms: September bookings re-accelerate to Rs 35.6cr (vs a "modest" Rs 5.39cr in August) -- order book steady at Rs 468.18cr',
    insight:
      'September 2026 order intake was Rs 35.60cr (Pharma Rs 7.22cr, Data Centres Rs 4.83cr, Semiconductors Rs 2.51cr, Others Rs 21.04cr; by vertical: Cleanroom Partitions Rs 7.34cr, HVAC Systems Rs 28.26cr) -- a >6x jump from the Rs 5.39cr the notes DB already flagged as "modest" for August. Consolidated order book stands at Rs 468.18cr (Renewable Energy Rs 195.44cr, Pharma Rs 217.15cr, Data Centres Rs 26.91cr, Semiconductors and other lines making up the balance), essentially flat versus the prior Rs 469cr snapshot -- meaning September\'s fresh bookings are running close to the pace of execution/billing, not accumulating. The MoM booking re-acceleration is the actionable read here, not the order-book total.',
    thesisChain: [
      'August bookings were weak (Rs 5.39cr)',
      'September bookings jumped to Rs 35.6cr, a clear re-acceleration',
      'order book size held flat (~Rs 468-469cr), implying bookings roughly matched execution pace in September',
      'if the September pace holds, book-to-bill improves; one month is not yet a trend',
    ],
    epsImpact: {
      direction: 'positive',
      magnitude: 'Rs 35.6cr monthly bookings vs Rs 5.39cr prior month',
      timeline: 'execution over FY27',
      confidence: 'low',
    },
    tags: ['order-book', 'monthly-cadence'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm: 'a second consecutive strong-booking month',
    },
  },
  {
    companyId: 'NSE:ADFFOODS',
    name: 'ADF Foods Ltd',
    announcementIds: ['fuz3ca97pk950bbb8gdxu74g.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/fuz3ca97pk950bbb8gdxu74g.pdf',
    category: 'general',
    significance: 'medium',
    headline:
      'ADF Foods (USA) subsidiary receives first $450k cash under a Forbearance Agreement settling a $2.31mn US litigation judgment for $1.75mn',
    insight:
      "ADF Foods (USA) Ltd, a step-down WOS, executed a Forbearance Agreement (Oct 9, 2026) with Ascot Valley Foods Ltd, conditionally settling monetary judgments of ~US$2.31mn (plus interest) for US$1.75mn plus interest. An initial US$450,000 was received on Oct 9; the balance of US$1.30mn plus interest is payable in monthly instalments of at least US$25,000 over up to 52 months from November 2026. Ascot must withdraw its appeal, and the permanent injunction protecting the subsidiary's proprietary recipes/trade secrets remains fully effective; full satisfaction of the judgment is conditional on complete payment, and the subsidiary keeps enforcement rights on the original (larger) judgment if Ascot defaults. This is the first actual cash receipt in a litigation thread the notes DB has tracked since June 2026 -- genuinely new information (cash in hand), not merely a repeat of the dispute's existence.",
    thesisChain: [
      'Multi-year US litigation reaches a structured settlement',
      'first tranche (US$450k, ~Rs 3.75cr) received immediately',
      'remaining US$1.3mn+interest recoverable over up to 52 months if Ascot performs',
      'IP protection (recipes/trade secrets) preserved regardless of payment outcome',
      'modest, drawn-out positive cash/EPS contribution; discount for counterparty-default risk over a 52-month tail',
    ],
    epsImpact: {
      direction: 'positive',
      magnitude:
        '~US$1.75mn total recovery (~Rs 14.6cr) over up to 52 months; ~US$450k (~Rs 3.75cr) received now',
      timeline: 'Nov 2026 - up to 52 months out',
      confidence: 'medium',
    },
    tags: ['litigation-recovery', 'cash-in'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  },
  {
    companyId: 'NSE:PTCIL',
    name: 'PTC Industries Ltd',
    announcementIds: ['fhb2smw44cibxz86yvobdd3c.pdf', 'tbz7mq0vz7v4l6w0reh1tap1.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/tbz7mq0vz7v4l6w0reh1tap1.pdf',
    category: 'fundraise',
    significance: 'high',
    headline:
      'PTC Industries closes QIP at ~Rs 1,800cr (8,54,700 shares @ Rs 21,060, 4.92% discount to floor) -- resolves the "raise size still undisclosed" item flagged at the floor-pricing stage',
    insight:
      'The Listing and Fund Raising Committee closed PTC Industries\' QIP on Oct 9, 2026, allocating 8,54,700 equity shares at Rs 21,060/share (a Rs 1,090, 4.92% discount to the Rs 22,150 floor price, including a Rs 21,050 premium) -- an aggregate raise of ~Rs 1,799.99cr (corrected via an Oct 10 corrigendum from a typo\'d "Rs 17,999.99cr" in the words-form of the same figure; the numeral and the final confirmed amount were always ~Rs 1,800cr). This directly resolves the open question the notes DB already flagged at the floor-pricing stage ("QIP floor at Rs 22,150/share... raise size still undisclosed") -- the size is now known and it is large: ~Rs 1,800cr against PTC Industries\' market cap is a material capital infusion. Use of proceeds is not stated in this filing; that is the live knowledge gap before this can be read through to per-share dilution/EPS.',
    thesisChain: [
      'QIP floor price fixed at Rs 22,150/share (previously flagged, size unknown)',
      'Issue now closed: 8,54,700 shares allotted at Rs 21,060/share, ~Rs 1,800cr raised',
      'corrigendum corrects a typo in the words-form of the amount (numeral always read ~Rs 1,800cr)',
      "dilution impact = 8,54,700 new shares against PTC Industries' existing share count (not independently verified here)",
      'EPS impact depends on announced use of proceeds (capex vs debt paydown), which is not disclosed in this filing -- flagged as a knowledge gap for the next slot/send-digest enrichment',
    ],
    epsImpact: {
      direction: 'neutral',
      magnitude:
        '~Rs 1,800cr raised via 8,54,700 shares at Rs 21,060/share; dilution % needs current share count',
      timeline: 'immediate (QIP closed Oct 9, 2026)',
      confidence: 'medium',
    },
    tags: ['qip', 'capital-raise', 'resolves-prior-flag'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm:
        'disclosed use of proceeds (capex vs debt retirement) and resulting dilution %',
    },
    knowledgeGap:
      'PTC Industries QIP: use of proceeds (capex vs debt-paydown) is not disclosed in either the outcome or corrigendum filing -- needed to run a PAT-to-EPS accretion/dilution bridge.',
  },
  {
    companyId: 'NSE:KRYSTAL',
    name: 'Krystal Integrated Services Ltd',
    announcementIds: ['tduuvzp038wt7ck82qygpxif.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/tduuvzp038wt7ck82qygpxif.pdf',
    category: 'general',
    significance: 'low',
    headline:
      'Krystal Integrated plans 10,000+ hires across 25+ cities in next 6 months, marking 25 years -- growth-cadence PR, consistent with its established low-significance newsflow',
    insight:
      "Krystal Integrated Services (facility management) issued a press release targeting 10,000+ new jobs across 25+ cities between Oct 2026-Mar 2027, building on 9,500 jobs already created in FY26-27, timed to its 25th anniversary. Hiring at this scale in a labour-intensive facility-management business is a genuine growth-cadence signal (more contracts/sites being staffed), but the notes DB shows this company's order-win newsflow (Mumbai Monorail contract, twice logged) also sits at LOW significance -- this PR fits that same pattern: directionally positive, no quantified revenue/contract figure attached.",
    thesisChain: [
      'PR targets 10,000+ hires in 6 months, on top of 9,500 already added this FY',
      'hiring at this pace in FM services typically tracks new-site/contract wins',
      'no specific contract value or margin given -- directional signal only',
      "consistent with company's established LOW-significance newsflow pattern",
    ],
    epsImpact: {
      direction: 'positive',
      magnitude: 'directional only -- no revenue/contract figure given',
      timeline: 'Oct 2026 - Mar 2027',
      confidence: 'low',
    },
    tags: ['hiring', 'growth-cadence'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  },
  {
    companyId: 'NSE:GRWRHITECH',
    name: 'Garware Hi Tech Films Ltd',
    announcementIds: ['tt5bwvyxtscufjxn1dksbtos.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/tt5bwvyxtscufjxn1dksbtos.pdf',
    category: 'general',
    significance: 'medium',
    headline:
      'Garware Hi-Tech reports a PIT Code-of-Conduct violation by a Designated Person (GM-Production) -- first such governance flag in recent history; transaction specifics not in this extract',
    insight:
      "Garware Hi-Tech Films filed a SEBI PIT (Prohibition of Insider Trading) Code-of-Conduct violation report for Mr. Ashok Narayan Dane, General Manager-Production (not a promoter/promoter-group member), per Schedule B/Regulation 9(1). The extracted PDF text cuts off before the actual transaction details/value (Annexure continues past what was captured). This is the first compliance/governance flag of this kind in the company's recent notes-DB history (prior items were a CARE ratings upgrade, routine board re-appointments, and a dividend-IEPF reminder, all unrelated), so it is flagged at medium rather than folded into those routine patterns -- a Code of Conduct violation by a production-side Designated Person, even without a confirmed trade value yet, is a governance item worth a human follow-up read of the full annexure.",
    thesisChain: [
      "A Designated Person violated the company's PIT Code of Conduct",
      'the DP is a GM-Production (non-promoter), not a board member or senior finance executive',
      'disclosed transaction value is not visible in the extracted text -- genuine information gap, not an ocrFailed case (the rest of the document read cleanly)',
      'no EPS linkage; this is a governance/compliance signal, not an earnings one',
    ],
    epsImpact: null,
    tags: ['governance', 'pit-violation', 'needs-follow-up'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    knowledgeGap:
      'Garware Hi-Tech PIT violation: the transaction value/nature for the flagged Designated Person is not visible in the captured PDF text -- re-read the full Annexure A on the next slot to confirm whether this is immaterial or needs escalation.',
  },
  {
    companyId: 'BSE:AIRFLOA',
    name: 'Airfloa Rail Technology Ltd',
    announcementIds: ['4v6dzrkfpdduc10ecx7gti4m.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/4v6dzrkfpdduc10ecx7gti4m.pdf',
    category: 'general',
    significance: 'low',
    headline:
      "Airfloa signs non-binding MOU with China's KTK Group for joint Platform Screen Door metro tenders -- new adjacency, incremental to the already-tracked KIN acquisition and order wins",
    insight:
      'Airfloa Rail Technology signed an MOU with KTK Group Co. Ltd (China, India office in Coimbatore) for joint tendering/execution of Platform Screen Door (PSD) projects in India. The MOU is explicitly tender-specific and non-binding: no equity stake, no agency/employment relationship, and consideration/size is "tender specific" (not yet quantified). This is a new business adjacency (PSD, distinct from Airfloa\'s existing rail-coach-component order book and the pending ~Rs 48cr KIN Railway Equipment acquisition already in the notes DB) -- genuinely new information, but at the MOU stage with zero committed value, so it stays LOW alongside Airfloa\'s existing small-order-win pattern until an actual tender is won.',
    thesisChain: [
      'MOU signed for a new product adjacency (PSD systems) via a China JV partner',
      'no capital/equity commitment at this stage',
      'real upside depends entirely on winning specific PSD tenders, none identified yet',
      'incremental optionality on top of the already-tracked KIN acquisition and existing order wins',
    ],
    epsImpact: null,
    tags: ['mou', 'new-adjacency', 'non-binding'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm: 'first actual PSD tender win under this MOU',
    },
  },
  {
    companyId: 'NSE:HERITGFOOD',
    name: 'Heritage Foods Ltd',
    announcementIds: ['quc9yq97s4nc1zn0r4s79quh.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/quc9yq97s4nc1zn0r4s79quh.pdf',
    category: 'acquisition',
    significance: 'medium',
    headline:
      'Heritage Foods pays consideration for its already-flagged 5.60% HNFL stake-up; transfer now processing -- confirms progress, no new terms',
    insight:
      'Heritage Foods Limited has paid the purchase consideration (Oct 9, 2026) for its previously-disclosed (July 16 and Aug 29, 2026) further acquisition of 5.60% equity in subsidiary Heritage Novandie Foods Limited (HNFL); share transfer is now under process. The notes DB already carries this exact thread at medium significance ("still in process, due within 45 days -- status update only, no new terms") -- today\'s filing is the next incremental step (payment made) in that same, already-known transaction. Written at medium because HNFL/the acquisition categories carry a code-level significance floor for high-conviction categories, but the actual informational content is a progress confirmation, not new terms or a new deal.',
    thesisChain: [
      'Previously-announced 5.60% stake-up in subsidiary HNFL',
      'consideration now paid, transfer processing',
      'no new price, no new stake percentage -- same deal, next step',
      'no incremental EPS information beyond what was already known',
    ],
    epsImpact: null,
    tags: ['high_conviction', 'follow-up', 'intra-group'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  },
  {
    companyId: 'NSE:SHILPAMED',
    name: 'Shilpa Medicare Ltd',
    announcementIds: ['oka4950ils5a2mb75y0hst6g.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/oka4950ils5a2mb75y0hst6g.pdf',
    category: 'general',
    significance: 'low',
    headline:
      'Shilpa Medicare Unit 4 (Jadcherla) receives Europe GMP certification from AGES Austria -- positive regulatory news, consistent with its established low-significance regulatory newsflow',
    insight:
      "Shilpa Medicare's Unit 4 (Jadcherla, Telangana), which manufactures sterile injectable and non-sterile tablet/capsule dosage forms for Europe and other markets, was inspected by AGES (Austria) from July 27-30, 2026 and has now received GMP certification following a successful inspection. This keeps/extends European market access for the site. Consistent with this company's recent regulatory newsflow pattern (a prior USFDA Unit VII inspection closing with 1 minor observation was also logged LOW), this is a real but incremental positive, not a step-change.",
    thesisChain: [
      "Unit 4 inspected by Austria's AGES in late July 2026",
      'inspection concluded successfully, GMP certification issued',
      'maintains/extends Europe market access for sterile injectables and oral solids from this site',
      'no quantified revenue contribution disclosed',
    ],
    epsImpact: {
      direction: 'positive',
      magnitude: 'market-access maintenance, not quantified',
      timeline: 'ongoing',
      confidence: 'low',
    },
    tags: ['regulatory', 'gmp-approval'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  },
  {
    companyId: 'NSE:CGCL',
    name: 'Capri Global Capital Ltd',
    announcementIds: ['c79yg0waudk7u8nlcgydmism.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/c79yg0waudk7u8nlcgydmism.pdf',
    category: 'fundraise',
    significance: 'low',
    headline:
      'Capri Global board to meet Oct 14 on a funds-raising proposal -- watch item, amount undisclosed, consistent with its active capital-markets cadence',
    insight:
      "Capri Global Capital's board meets Oct 14, 2026 to consider a proposal for raising funds; no instrument, amount or purpose disclosed yet. The notes DB shows CGCL has been actively tapping capital markets recently (a US$300mn/~Rs 2,500cr AAA-rated senior secured notes raise under its GMTN programme, plus a bank-facility/NCD rating upgrade to AA+/Stable) -- this NBFC raising funds again is consistent with an established, ongoing cadence rather than a surprise, so it stays a low-significance watch item until the outcome filing discloses size and instrument.",
    thesisChain: [
      'Board meeting called specifically to consider a funds-raising proposal',
      "fits CGCL's recent pattern of active, rated capital-markets issuance",
      'no amount/instrument yet -- nothing to size',
      'watch the Oct 14 outcome filing for the actual terms',
    ],
    epsImpact: null,
    tags: ['watch', 'fundraise-pending'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  },
  {
    companyId: 'BSE:TEJASSVI',
    name: 'Tejassvi Aaharam Ltd',
    announcementIds: ['jvmkgtwuitbhpoys2ayel3lp.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/jvmkgtwuitbhpoys2ayel3lp.pdf',
    category: 'general',
    significance: 'high',
    headline:
      'Tejassvi Aaharam: trading approval for 5,11,62,204 shares issued AT PAR takes paid-up capital from Rs 7cr to Rs 58.16cr (8.3x) -- major dilution flag, no notes-DB history to calibrate against',
    insight:
      "BSE granted trading approval for 5,11,62,204 new equity shares (face value Rs 10, issued AT PAR with no premium disclosed) allotted to Promoters and Non-Promoters on a preferential basis, effective Oct 12, 2026. This takes the company's paid-up equity capital from 70,00,000 shares (Rs 7cr) to 5,81,62,204 shares (Rs 58.16cr) -- an 8.3x increase in share count in one allotment. Issuing at par (no premium) for a dilution of this scale is an unusual pattern worth flagging as a standalone governance/dilution item: this is the company's first entry in the notes DB, so there is no prior context on why such a large at-par issue was undertaken or what it funds.",
    thesisChain: [
      '5.11 crore new shares allotted at par (face value only, zero premium)',
      'paid-up share count rises 8.3x in this single allotment (70L to 581.62L shares)',
      'at-par pricing for an allotment this large is atypical and not explained in this filing',
      'severe dilution for any non-participating existing shareholder; need the original preferential resolution (outside this window) for rationale/use-of-funds',
    ],
    epsImpact: {
      direction: 'negative',
      magnitude: '~8.3x increase in share count from this allotment alone',
      timeline: 'effective Oct 12, 2026',
      confidence: 'high',
    },
    tags: ['dilution', 'at-par-issue', 'governance-watch'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    knowledgeGap:
      "Tejassvi Aaharam: the original preferential-issue resolution (rationale, use of proceeds, allottee identities) is outside this run's window -- pull it to assess whether this at-par 8.3x dilution is benign (e.g. promoter infusion) or a red flag.",
  },
  {
    companyId: 'BSE:TANFACIND',
    name: 'Tanfac Industries Ltd',
    announcementIds: ['opi0wqxbx03gn1ijwhnd11ub.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/opi0wqxbx03gn1ijwhnd11ub.pdf',
    category: 'general',
    significance: 'low',
    headline:
      'Tanfac Industries: trading approval is the final mechanical step of the ALREADY-fully-disclosed Rs 99.4cr preferential issue -- FOLLOW-UP, no new information',
    insight:
      'BSE granted trading approval for 4,24,647 equity shares (face value Rs 5, issue price Rs 2,341/share) issued on preferential basis. The notes DB already has two prior entries on this exact raise -- "TANFAC gets BSE in-principle nod for Rs 99.4cr preferential issue at Rs 2,341/share" and "listing approval confirms completed ~Rs 99.4 Cr preferential issue" -- so today\'s trading approval is simply the shares becoming tradeable, the last of three sequential regulatory steps (in-principle nod -> listing approval -> trading approval) for a raise whose size and price were already fully known. No new figure, no new information.',
    thesisChain: [
      'Rs 99.4cr preferential issue at Rs 2,341/share already disclosed and noted twice',
      "today's filing is trading approval -- the shares can now be traded",
      'nothing new to size or re-assess versus the prior two notes',
    ],
    epsImpact: null,
    tags: ['follow-up', 'already-known'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  },
  {
    companyId: 'NSE:RUBICON',
    name: 'Rubicon Research Ltd',
    announcementIds: ['d72ylcbszmtfyyo6mkwpebdz.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/d72ylcbszmtfyyo6mkwpebdz.pdf',
    category: 'regulatory',
    significance: 'medium',
    headline:
      'Rubicon Research: US FDA unannounced inspection at Satara closes with just 1 procedural (non-data-integrity) observation -- reassuring given the live General Atlantic sell-down overhang',
    insight:
      "The US FDA's unannounced inspection of Rubicon Research's Satara, Maharashtra manufacturing facility (Oct 5-9, 2026) concluded with a Form 483 carrying 1 observation, which the company states is \"procedural in nature and does not relate to data integrity.\" If successfully closed, this would be the site's first successful UNANNOUNCED inspection (the January 2023 inspection was pre-announced) and the company's third successful unannounced US FDA inspection in FY26-27 (after Toronto R&D in April and Pithampur manufacturing in July), plus the recently-acquired East Brunswick, NJ facility was inspected in May just before Rubicon's July acquisition of it. Flagged at medium rather than the low the prior routine-inspection pattern would suggest, because the notes DB already carries a live, unresolved risk thread here -- promoter General Atlantic cutting its stake from 35.79% to 27.34% in two days (medium, \"overhang risk from further sell-down\") -- and a clean-ish regulatory outcome is directly relevant context for anyone weighing that overhang.",
    thesisChain: [
      'Unannounced US FDA inspection at a key manufacturing site concludes with only 1 minor, non-data-integrity observation',
      'reduces near-term regulatory risk at this specific site',
      'third successful unannounced US FDA inspection in FY27 for the group -- a credibility pattern, not a one-off',
      'relevant backdrop to the already-flagged General Atlantic sell-down/overhang risk, though the two are separate axes (regulatory vs. ownership)',
    ],
    epsImpact: null,
    tags: ['fda-inspection', 'regulatory-clean', 'context-for-overhang'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  },
  {
    companyId: 'NSE:VIJIFIN',
    name: 'Viji Finance Ltd',
    announcementIds: ['upe1pbl3h5fbnrt14ivc89g2.pdf'],
    pdfUrl: 'https://www.stockscans.in/document/upe1pbl3h5fbnrt14ivc89g2.pdf',
    category: 'fundraise',
    significance: 'low',
    headline:
      'Viji Finance: listing approval for 1 crore warrant-conversion shares at Rs 2.80/share (~Rs 2.8cr raised) -- small capital-structure update, no notes-DB history',
    insight:
      'BSE and NSE granted listing approval for 1,00,00,000 equity shares (face value Re 1, issued at a Rs 1.80 premium, i.e. Rs 2.80/share) allotted to the non-promoter/public category on conversion of warrants, raising roughly Rs 2.8cr. This is a small, mechanical capital-structure step (warrant conversion completing) for a company with no prior notes-DB history -- logged at low significance given the small absolute size.',
    thesisChain: [
      '1 crore warrants convert to equity at Rs 2.80/share',
      '~Rs 2.8cr raised, small in absolute terms',
      'listing approval is the final step before the shares trade',
    ],
    epsImpact: {
      direction: 'neutral',
      magnitude: '~Rs 2.8cr raised, 1cr new shares',
      timeline: 'immediate',
      confidence: 'medium',
    },
    tags: ['warrant-conversion', 'small-raise'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  },
];

const results = [];
const knowledgeGaps = [];
for (const item of ITEMS) {
  const notePayload = {
    companyId: item.companyId,
    ticker: item.companyId.split(':')[1] || '',
    name: item.name,
    note: {
      type: 'announcement',
      announcementId: item.announcementIds[0],
      announcementTitle: item.headline,
      pdfUrl: item.pdfUrl,
      insight: item.insight,
      headline: item.headline,
      thesisChain: item.thesisChain,
      epsImpact: item.epsImpact,
      significance: item.significance,
      tags: item.tags,
      category: item.category,
      announcementDescription: item.headline,
      usecase: 'announcement-insights:standard',
      sourceSkill: SOURCE_SKILL,
      modelUsed: MODEL,
      jCurve: item.jCurve,
    },
  };
  const res = addNote(notePayload);
  for (const annId of item.announcementIds) {
    markProcessed(item.companyId, annId, 'announcement-insights:standard');
  }
  const score = signalTierFor({ significance: item.significance, category: item.category }).score;
  results.push({
    companyId: item.companyId,
    name: item.name,
    category: item.category,
    significance: item.significance,
    headline: item.headline,
    insight: item.insight,
    thesisChain: item.thesisChain,
    epsImpact: item.epsImpact,
    tags: item.tags,
    pdfUrl: item.pdfUrl,
    announcementIds: item.announcementIds,
    noteId: res.noteId,
    signalScore: score,
  });
  if (item.knowledgeGap) knowledgeGaps.push({ companyId: item.companyId, gap: item.knowledgeGap });
  console.error('added note:', item.companyId, 'score=', score, 'sig=', item.significance);
}

fs.writeFileSync('cache/runs/adhoc-20261011/insights-array.json', JSON.stringify(results, null, 2));
fs.writeFileSync(
  'cache/runs/adhoc-20261011/knowledge-gaps.json',
  JSON.stringify(knowledgeGaps, null, 2)
);
console.log('wrote', results.length, 'insights,', knowledgeGaps.length, 'knowledge gaps');
