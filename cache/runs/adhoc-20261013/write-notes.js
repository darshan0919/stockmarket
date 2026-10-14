const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const WI_JOB = path.resolve('packages/jobs-runtime/watchlistInsights.js');

const MODEL = 'claude-sonnet-5';
const SOURCE_SKILL = 'post-close-scan-insights';
const USECASE = 'announcement-insights:standard';

function addNote(companyId, note) {
  const payload = {
    companyId,
    note: Object.assign({ sourceSkill: SOURCE_SKILL, usecase: USECASE, modelUsed: MODEL }, note),
  };
  const json = JSON.stringify(payload);
  const out = execFileSync('node', [WI_JOB, 'add-note'], {
    input: json,
    maxBuffer: 1024 * 1024 * 20,
  });
  return out.toString('utf8');
}
function markProcessed(companyId, annId, usecase) {
  const args = [WI_JOB, 'mark-processed', companyId, annId];
  if (usecase) args.push(usecase);
  execFileSync('node', args);
}

const RESULTS = [];

function run(label, fn) {
  try {
    fn();
    RESULTS.push({ label, ok: true });
    console.error('OK:', label);
  } catch (e) {
    RESULTS.push({ label, ok: false, err: String(e).slice(0, 2000) });
    console.error('FAIL:', label, String(e).slice(0, 500));
  }
}

// 1. PTCIL -- KNOWN info restated as press release (QIP already fully noted on file Oct 12)
run('PTCIL', () => {
  addNote('NSE:PTCIL', {
    announcementId: 'namimifni9p8cdu1vy62tiyj.pdf',
    announcementTitle: 'Announcement under Regulation 30 (LODR)-Press Release / Media Release',
    pdfUrl: 'https://www.stockscans.in/document/namimifni9p8cdu1vy62tiyj.pdf',
    category: 'fundraise',
    significance: 'low',
    headline:
      'PTC Industries press-releases its already-disclosed Rs 1,800cr QIP close (5x oversubscribed, global-investor mix) -- confirms, adds no new deal economics',
    insight:
      "This is PTC Industries' own press release restating the QIP it already closed on Oct 9 and fully disclosed in the Oct 10 corrigendum (8,54,700 shares at Rs 21,060/share, ~Rs 1,800cr, both already on file in the notes DB). The only incremental color here is qualitative: the issue was oversubscribed over 5x with a significant share of demand from global institutional investors, framed around the group's aerospace/defence/space/energy platform (Aerolloy Technologies, Trac Precision Solutions). No new share count, price, or use-of-proceeds figure is disclosed -- the live knowledge gap flagged on the prior note (use of proceeds, hence dilution-adjusted EPS read) remains open.",
    thesisChain: [
      'QIP already closed and sized in prior notes (Rs 1,800cr, 8,54,700 shares @ Rs 21,060)',
      "today's filing is the company's own press release restating the same transaction",
      'adds only qualitative color: 5x oversubscription, global institutional participation',
      'no new EPS-relevant figures -- use-of-proceeds still undisclosed',
    ],
    epsImpact: {
      direction: 'neutral',
      magnitude: 'no new figures vs prior note; dilution unsized pending use-of-proceeds',
      timeline: 'already effective (QIP closed Oct 9)',
      confidence: 'low',
    },
    tags: ['fundraise', 'press_release'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    infoClassification: {
      claims: [
        {
          claim: 'QIP raised Rs 1,800cr at Rs 21,060/share',
          bucket: 'KNOWN',
          basis:
            'Identical figures already on file from the Oct 9 closure / Oct 10 corrigendum notes.',
        },
        {
          claim: '5x oversubscription, global institutional investor mix',
          bucket: 'NEW',
          basis:
            'First disclosure of demand/subscription color; not in any prior note on this company.',
        },
      ],
      verdict: 'FOLLOW-UP',
      baselineCoverage: {
        note: "Checked this company's own notes DB thread directly (3 prior PTCIL notes, all QIP-related, most recent same deal) rather than a full concall/PPT walk -- sufficient given the claim is a same-day press-release restatement of an already-fully-noted transaction.",
      },
    },
  });
  markProcessed('NSE:PTCIL', 'namimifni9p8cdu1vy62tiyj.pdf', USECASE);
});

// 2. AIIL -- NCLT resolution plan formally implemented (Implementation Date declared)
run('AIIL', () => {
  addNote('NSE:AIIL', {
    announcementId: 'gqf7w4x33ol743l02on97402.pdf',
    announcementTitle: 'Announcement under Regulation 30 (LODR)-Updates on Acquisition',
    pdfUrl: 'https://www.stockscans.in/document/gqf7w4x33ol743l02on97402.pdf',
    category: 'acquisition',
    significance: 'medium',
    headline:
      "Authum/Inox Neo consortium's Wind World resolution plan is now formally implemented (Implementation Date Oct 8, 2026) -- closes the loop on the Rs 350cr payment already flagged",
    insight:
      'The Implementation and Monitoring Committee (IMC) of Wind World (India) Ltd has recorded, via a circular resolution communicated Oct 12, 2026, that the Authum + Inox Neo Energies consortium has successfully discharged all obligations required to implement the NCLT-approved resolution plan, and has declared October 8, 2026 as the formal "Implementation Date." This is a distinct procedural milestone from the Rs 350cr cash commitment Authum disclosed as paid on Oct 12 (per the prior note on file) -- payment and formal IMC certification of plan implementation are two separate steps in an NCLT process, and this filing is the second, confirming the first actually closed the deal rather than remaining a conditional payment. No new rupee figures or equity/debt split terms are disclosed here; the knowledge gap already flagged (VEPL/WWIL\'s eventual earnings profile and Authum\'s debt-vs-equity stake terms) remains open.',
    thesisChain: [
      'IMC circular resolution (communicated Oct 12) certifies the consortium discharged all Resolution Plan obligations',
      'Implementation Date formally declared as October 8, 2026',
      'this is the formal completion of the acquisition process, distinct from (and confirming) the Rs 350cr payment already on file',
      "EPS linkage still undetermined -- depends on undisclosed VEPL/WWIL earnings profile and Authum's final debt/equity terms there",
    ],
    epsImpact: null,
    tags: ['acquisition', 'high_conviction'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm:
        "disclosed VEPL/WWIL earnings profile and Authum's final debt/equity stake terms",
    },
    knowledgeGap:
      "Authum/WWIL/VEPL: final debt-vs-equity split and VEPL's own earnings profile remain undisclosed -- needed before this NCLT resolution can be read through to Authum's EPS.",
  });
  markProcessed('NSE:AIIL', 'gqf7w4x33ol743l02on97402.pdf', USECASE);
});

// 3. SHYAMMETL -- Phutamura coal block (backward integration)
run('SHYAMMETL', () => {
  addNote('NSE:SHYAMMETL', {
    announcementId: 'vo5b24mg3ttxiu095hftuk7u.pdf',
    announcementTitle: 'Announcement under Regulation 30 (LODR)-Press Release / Media Release',
    pdfUrl: 'https://www.stockscans.in/document/vo5b24mg3ttxiu095hftuk7u.pdf',
    category: 'capacity',
    significance: 'medium',
    headline:
      'Shyam Metalics secures Phutamura coal block (170MT reserves) via Alom Solar investment -- backward integration for captive power/steel, production from July 2027',
    insight:
      "Shyam Metalics Group, through an investment in Alom Solar Private Limited (declared successful bidder), has secured mining rights to the Phutamura Coal Block in the Mand-Raigarh coalfield (Chhattisgarh, ~7.324 sq km, ~170 million tonnes estimated reserves). Mining and coal production are expected to commence from July 2027. Management frames this as a backward-integration move to secure long-term, cost-effective captive coal supply for the company's 467MW captive power plants and core steel/ferro-alloy manufacturing (16.93 MTPA installed metal capacity). This is new information -- distinct from the already-flagged non-binding Chandrapur steel-complex MoU (Rs 50,000cr, pre-approval stage) and the September volume/realisation update. No acquisition cost, equity stake size in Alom Solar, or projected cost-per-tonne savings are disclosed in this press release.",
    thesisChain: [
      'Alom Solar Pvt Ltd (a Shyam Metalics Group investment) declared successful bidder for Phutamura Coal Block',
      '~170MT reserves secured for captive coal supply to power plants and steel operations',
      'production targeted from July 2027 -- a ~21-month lead time before any cost-base impact',
      'EPS impact not derivable now: no disclosed acquisition cost, stake size, or expected cost-per-tonne delta vs market-linked coal',
    ],
    epsImpact: null,
    tags: ['capacity', 'capex'],
    jCurve: {
      isCandidate: true,
      shape:
        'future backward-integration cost-base improvement on commissioning (not yet an elbow -- nothing sunk yet)',
      elbowEvidence: null,
      whatWouldConfirm:
        'disclosed captive coal cost per tonne meaningfully below market-linked coal once Phutamura starts supplying in/after July 2027',
    },
    knowledgeGap:
      "Captive-coal-block economics for integrated steel/ferro-alloy majors (typical capex per tonne of linked capacity, payback period, cost-per-tonne delta vs market-linked coal) -- not queried against the knowledge base this run; needed to size this investment's eventual margin impact.",
  });
  markProcessed('NSE:SHYAMMETL', 'vo5b24mg3ttxiu095hftuk7u.pdf', USECASE);
});

// 4. KPIL -- Rs 2,225cr new order wins
run('KPIL', () => {
  addNote('NSE:KPIL', {
    announcementId: 'zb0euaap9mbr1gqsr4b6983f.pdf',
    announcementTitle: 'Announcement under Regulation 30 (LODR)-Award_of_Order_Receipt_of_Order',
    pdfUrl: 'https://www.stockscans.in/document/zb0euaap9mbr1gqsr4b6983f.pdf',
    category: 'order_book',
    significance: 'medium',
    headline:
      'KPIL bags Rs 2,225cr new orders (Rs 2,031cr India/international T&D + Rs 194cr Sweden sub) -- FY27 YTD order inflow now ~Rs 20,000cr, +30% YoY',
    insight:
      "Kalpataru Projects International (KPIL) announced new order/letter-of-comfort wins of approximately Rs 2,031cr in its Power Transmission & Distribution business (India and international), plus a ~Rs 194cr (~SEK 200mn) order for Swedish subsidiary Linjemontage i Grastorp AB from Ellevio AB (130kV substation refurbishment, 3-year turnkey, final inspection due Oct 2029). Management states cumulative order wins of ~Rs 20,000cr YTD FY27, representing >30% YoY growth. Against KPIL's FY26 revenue base of Rs 27,143cr, this incremental Rs 2,225cr is a routine-sized addition to an already very large order book (not itself a step-change), but the YTD run-rate confirms continuing strong order momentum in T&D -- consistent with, and incremental to, the notes DB's existing LMG/Nasdaq-IPO thread for the same subsidiary group (different business line: core EPC order wins, not the listed-subsidiary equity story).",
    thesisChain: [
      'Rs 2,031cr in new India/international T&D orders + Rs 194cr Sweden-subsidiary order = Rs 2,225cr total',
      'YTD FY27 order inflow now ~Rs 20,000cr, +30% YoY per management',
      'confirms continuing order momentum in the core EPC T&D business, separate from the already-tracked LMG equity story',
      'revenue visibility extends but order book is already large relative to this single announcement -- no step-change EPS signal from this filing alone',
    ],
    epsImpact: {
      direction: 'positive',
      magnitude:
        'Rs 2,225cr added to order book (~8% of FY26 revenue base); margin/EPS timing depends on execution schedule, not disclosed here',
      timeline: 'multi-quarter execution, not immediate',
      confidence: 'low',
    },
    tags: ['order_win'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  });
  markProcessed('NSE:KPIL', 'zb0euaap9mbr1gqsr4b6983f.pdf', USECASE);
});

// 5. AIRFLOA (merged: press release + LOA intimation, same Rs 34.85cr ICF award)
run('AIRFLOA', () => {
  addNote('BSE:AIRFLOA', {
    announcementId: 'w85kyhaccj7glkf1228r3kuz.pdf',
    announcementTitle:
      'Airfloa Rail Technology-led consortium secures Rs 34.85cr ICF Vande Bharat sleeper interior-design contract',
    pdfUrl: 'https://www.stockscans.in/document/w85kyhaccj7glkf1228r3kuz.pdf',
    category: 'order_book',
    significance: 'low',
    headline:
      "Airfloa wins Rs 34.85cr LOA as lead member (with Italy's BLUE Engineering) for Vande Bharat sleeper trainset interior design -- a capability/positioning win, not a scale one",
    insight:
      "Airfloa Rail Technology has been awarded a Rs 34.85cr (incl. GST) Letter of Acceptance by Integral Coach Factory (ICF), Chennai, as the lead member of a consortium with Italy-based BLUE Engineering S.r.l., for interior design of the Vande Bharat sleeper trainset. The company's own press release claims this makes Airfloa the first Indian company to secure an interior-design contract of this scale and scope in Indian Railways history. Two filings (12-Oct intimation and 13-Oct press release) cover the identical Rs 34.85cr LOA -- merged into one card here. This is new information, distinct from the already-tracked KIN Railway acquisition and the non-binding KTK Group platform-screen-door MOU. The rupee value is modest against Airfloa's other activity, but per standing direction a new capability/counterparty relationship (first-of-kind design contract with ICF, international JV partner) is a genuine state-change worth logging even at this size -- it may open a pipeline of future execution orders tied to the same trainset programme.",
    thesisChain: [
      'ICF awards Rs 34.85cr LOA for Vande Bharat sleeper interior design to an Airfloa-led consortium with BLUE Engineering (Italy)',
      'company claims first-of-scale Indian win in this specific design category',
      'establishes Airfloa as lead member on a flagship national rail programme -- a capability/relationship marker, not a large order by itself',
      'no disclosed follow-on execution order value yet -- watch for subsequent ICF orders tied to the same Vande Bharat sleeper rollout',
    ],
    epsImpact: {
      direction: 'positive',
      magnitude:
        '~Rs 34.85cr order, modest relative to EPS; strategic/positioning value exceeds immediate rupee size',
      timeline: 'execution schedule not disclosed',
      confidence: 'low',
    },
    tags: ['order_win'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm:
        'follow-on ICF orders in the same Vande Bharat sleeper programme, which would confirm this as a pipeline opener rather than a one-off',
    },
  });
  markProcessed('BSE:AIRFLOA', 'w85kyhaccj7glkf1228r3kuz.pdf', USECASE);
  markProcessed('BSE:AIRFLOA', '1u65z8ylphsstfh8o1xasgj3.pdf', 'duplicate-of-existing-note');
});

// 6. AARTIIND (merged: Reg 30 letter + press release, same 10yr agreement)
run('AARTIIND', () => {
  addNote('NSE:AARTIIND', {
    announcementId: 'hiva4x7u7ndba5wkvp2mwh92.pdf',
    announcementTitle: 'Agreement With A Global Speciality Chemical Company.',
    pdfUrl: 'https://www.stockscans.in/document/hiva4x7u7ndba5wkvp2mwh92.pdf',
    category: 'order_book',
    significance: 'medium',
    headline:
      'Aarti Industries signs 10+ year dedicated manufacturing & supply deal with a global speciality-chemical major -- ~Rs 1,500cr revenue potential, <$25mn capex via structured financing',
    insight:
      "Aarti Industries has entered a 10+ year dedicated manufacturing and supply agreement with an unnamed global speciality chemical company, establishing a new customer relationship. AIL will set up, commission and operate a dedicated facility in India for a speciality chemical used in high-performance applications, built on the customer's proprietary process technology, with a cumulative revenue potential of ~Rs 1,500cr over the contract term. Capex is capped below US$25mn (~Rs 210cr) and is financed via \"a structured financial arrangement\" (likely customer-backed/take-or-pay-style financing, not disclosed in detail) -- a low-capex-intensity, long-duration, dedicated-capacity model similar in spirit to AIL's existing CRAMS-style dedicated-plant relationships. Two filings (the Reg 30 Annexure-A disclosure and the company's press release) cover the identical agreement -- merged into one card. This is new information, distinct from the already-tracked Zone IV Phase I commissioning and the promoter-group exit note.",
    thesisChain: [
      '10+ year dedicated manufacturing & supply agreement signed with a new global speciality-chemical customer',
      '~Rs 1,500cr cumulative revenue potential over the contract term (~Rs 150cr/yr average run-rate once ramped)',
      'capex capped below $25mn and financed via a structured arrangement -- low balance-sheet intensity for AIL relative to the revenue potential',
      'EPS impact not quantifiable yet -- ramp timeline, margin profile and financing-arrangement terms are not disclosed',
    ],
    epsImpact: {
      direction: 'positive',
      magnitude:
        '~Rs 1,500cr revenue potential over 10+ years (~Rs 150cr/yr average) on <$25mn capex; margin and ramp timeline undisclosed',
      timeline: 'commissioning timeline not disclosed',
      confidence: 'low',
    },
    tags: ['order_win', 'capex'],
    jCurve: {
      isCandidate: true,
      shape:
        'dedicated-plant capacity commissioning, low capex -- a future margin-accretive elbow once operational given the low capex-to-revenue ratio',
      elbowEvidence: null,
      whatWouldConfirm:
        'commissioning date and first-year revenue run-rate against the disclosed <$25mn capex base',
    },
  });
  markProcessed('NSE:AARTIIND', 'hiva4x7u7ndba5wkvp2mwh92.pdf', USECASE);
  markProcessed('NSE:AARTIIND', 'v4ymtbgrmy28khid5jjir0kr.pdf', 'duplicate-of-existing-note');
});

// 7. CEIGALL -- NH-709B completion certificate (legacy road EPC wind-down)
run('CEIGALL', () => {
  addNote('NSE:CEIGALL', {
    announcementId: 'g4kaolhr9edtwox6oaxj4hvu.pdf',
    announcementTitle: 'Issuance Of Completion Certificate For EPC Project',
    pdfUrl: 'https://www.stockscans.in/document/g4kaolhr9edtwox6oaxj4hvu.pdf',
    category: 'order_book',
    significance: 'low',
    headline:
      'Ceigall/Gayatri get completion certificate on the NH-709B (Delhi-Saharanpur) EPC road, closing a legacy dispute via an Oct-9 NHAI settlement -- not part of the active Gujarat-transmission diversification thread',
    insight:
      "Ceigall India and Gayatri Projects received a Completion Certificate from the Authority's Engineer for the six-lane Delhi/UP-border-to-EPE-Junction section of NH-709B (revised estimated project cost Rs 1,659.84cr; EPC portion Rs 1,323.52cr; awarded April 2022), declaring the highway fit for operation retroactive to September 12, 2024 -- inside the cure period of an approved extension-of-time. The certificate explicitly excludes items covered by a separate settlement agreement between Gayatri, Ceigall and NHAI dated October 9, 2026, implying this was a disputed/delayed legacy project only now being formally closed out. This is new information but is a wind-down of an older roads-EPC asset, not connected to the company's actively-tracked Gujarat power-transmission diversification (Rs 5,300cr LOI, JKJTL SPV acquisition) already carrying most of the recent notes-DB signal for this name. Formal completion typically unlocks retention-money release and bank-guarantee discharge, though no rupee figure for that is disclosed here.",
    thesisChain: [
      'Completion Certificate issued for the NH-709B EPC road project (Rs 1,659.84cr), formally declaring it fit for operation',
      'certificate carves out items covered by an Oct 9, 2026 NHAI settlement -- confirms this was a delayed/disputed legacy project',
      'formal completion typically triggers release of retention money and bank guarantees, though no figure is disclosed',
      "this is a legacy-roads wind-down, separate from the company's larger, already-tracked transmission-diversification thesis",
    ],
    epsImpact: null,
    tags: ['order_win'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm:
        'disclosed retention-money/BG release amount, if any, in a follow-up filing',
    },
  });
  markProcessed('NSE:CEIGALL', 'g4kaolhr9edtwox6oaxj4hvu.pdf', USECASE);
});

// 8. NGLFINE -- SEBI exemption order, intra-family trust transfer (SAST, nets to zero promoter change)
run('NGLFINE', () => {
  addNote('NSE:NGLFINE', {
    announcementId: '5le3hqk1dh4gwddddwo81qqq.pdf',
    announcementTitle:
      'Intimation Regarding Receipt Of SEBI Exemption Order Under Regulation 11(5)',
    pdfUrl: 'https://www.stockscans.in/document/5le3hqk1dh4gwddddwo81qqq.pdf',
    category: 'shareholding_change',
    significance: 'low',
    headline:
      'NGL Fine-Chem: SEBI exempts intra-family transfer of 29.09% stake into two Nachane family trusts from open-offer trigger -- succession planning, zero net promoter-group change',
    insight:
      'SEBI (order dated Oct 9, 2026, received by the company Oct 12) has granted Ajita Nachane Family Trust and Rahul Nachane Family Trust an exemption under Reg 3(1)/4 of the SAST Regulations for the proposed transfer of 17,96,899 equity shares (29.09% of paid-up capital) -- 11.55% from Mrs. Ajita Nachane and 17.54% from Mr. Rahul Nachane -- into their respective family trusts, with no change in total Promoter and Promoter Group holding before or after. Checked against this standing rule: this is below the kind of value dealsDigest prices (an inter-se transfer netting to zero), but per the Aug-24 standing direction on SAST filings, an intra-promoter transfer into family trusts still warrants governance/succession-context logging even at zero net change (the IVG Trust/Vadilal precedent). No pledge, no change of control, no third-party acquirer -- this reads as estate/succession structuring, not a market-moving event.',
    thesisChain: [
      'SEBI grants open-offer exemption for a 29.09% stake transfer from two individual promoters into their own family trusts',
      'total Promoter/Promoter Group holding is unchanged before and after',
      'reads as succession/estate planning, not a change of control or economic transfer',
      'no EPS or market-structure impact derivable -- flagged for governance-context record only',
    ],
    epsImpact: null,
    tags: ['regulatory'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  });
  markProcessed('NSE:NGLFINE', '5le3hqk1dh4gwddddwo81qqq.pdf', USECASE);
});

// 9. YASHHV -- US representation network expansion (22->27 states), continuation of tracked pattern
run('YASHHV', () => {
  addNote('BSE:YASHHV', {
    announcementId: '91wr9oo1cp6qqbvc3jifjsx6.pdf',
    announcementTitle: 'Press Release -- Yash Highvoltage Expands US Representation Network',
    pdfUrl: 'https://www.stockscans.in/document/91wr9oo1cp6qqbvc3jifjsx6.pdf',
    category: 'general',
    significance: 'low',
    headline:
      "Yash Highvoltage's US sub adds EHV Solutions as rep for 5 more states (22->27) -- same distribution-expansion cadence already tracked, not a firm order",
    insight:
      "YASH HV USA INC. signed a 36-month Representation Agreement with EHV Solutions LLC (effective Oct 12, 2026) covering five additional Western/South-Central US states, taking the subsidiary's representation network from 22 to 27 states. This continues the same distribution-access pattern already on file (19-state ENSALES deal flagged mid-September; the network had already grown from 19 to 22 states by this filing, not separately noted in between). As flagged previously, a representation agreement is distribution access, not a firm order -- no revenue commitment is disclosed. Per standing direction this state-change in operating footprint is still worth a cadence entry even though immaterial individually, especially set against the September 30 note that commercial production has now started at the new bushings plant (capacity and distribution reach both expanding in parallel).",
    thesisChain: [
      'YASH HV USA INC. signs 36-month rep agreement with EHV Solutions LLC, adding 5 US states',
      'US representation network grows from 22 to 27 states',
      'continues the distribution-expansion cadence already tracked (19-state ENSALES deal, mid-Sept)',
      'no firm order or revenue figure -- distribution access only, pairs with the already-noted new-plant production ramp',
    ],
    epsImpact: null,
    tags: ['international_expansion'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm:
        'a disclosed order flowing through one of these new representation territories',
    },
  });
  markProcessed('BSE:YASHHV', '91wr9oo1cp6qqbvc3jifjsx6.pdf', USECASE);
});

// 10. UNIVASTU -- new Rs 15.39cr metro telephone-system order (Colossus Infra, distinct from L&T order)
run('UNIVASTU', () => {
  addNote('NSE:UNIVASTU', {
    announcementId: '19y7pjdpnm9le1risisd4f93.pdf',
    announcementTitle: 'Bagging/Receiving of orders/contracts',
    pdfUrl: 'https://www.stockscans.in/document/19y7pjdpnm9le1risisd4f93.pdf',
    category: 'order_book',
    significance: 'low',
    headline:
      'Univastu wins Rs 15.39cr (incl. GST) metro telephone-system order from Colossus Infra for MMRDA Lines 5 & 6 -- new client, adjacent to the tracked L&T CCTV order',
    insight:
      'Univastu India received a Rs 13.04cr (Rs 15.39cr incl. 18% GST) purchase order from Colossus Infra Project Pvt Ltd for design, supply, installation, testing and commissioning of telephone systems for MMRDA Metro Lines 5 and 6, with a 2-year defect-liability period. This is a new client (Colossus Infra, not L&T) and a different system type (telephone systems, not the CCTV systems covered in the already-tracked Rs 23.74cr L&T order for Metro Line 4/4A) -- genuinely incremental order-book addition, not a restatement. Company remains in metro-systems-integration execution mode alongside its newer UK/Cambium Networks wireless-hardware diversification already on file.',
    thesisChain: [
      'Rs 15.39cr (incl. GST) order from Colossus Infra for metro telephone systems on MMRDA Lines 5 & 6',
      'new client relationship, distinct from the already-tracked L&T CCTV order on a different metro line',
      "adds to order book in the company's core systems-integration business",
      'EPS impact modest and not separately quantifiable from this filing alone',
    ],
    epsImpact: {
      direction: 'positive',
      magnitude:
        '~Rs 15.4cr order (incl. GST); small relative to prior L&T order, execution timeline not disclosed beyond the 2-year DLMP',
      timeline: 'not disclosed',
      confidence: 'low',
    },
    tags: ['order_win'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
  });
  markProcessed('NSE:UNIVASTU', '19y7pjdpnm9le1risisd4f93.pdf', USECASE);
});

// 11. TDPOWERSYS -- QIP closes at ~Rs 600cr (follow-through on already-tracked floor pricing)
run('TDPOWERSYS', () => {
  addNote('NSE:TDPOWERSYS', {
    announcementId: 'xlykx3f9g6cbqk9cpk5bduob.pdf',
    announcementTitle:
      'Disclosure Under Regulation 30 -- Outcome of Fund Raising Committee (QIP closure)',
    pdfUrl: 'https://www.stockscans.in/document/xlykx3f9g6cbqk9cpk5bduob.pdf',
    category: 'fundraise',
    significance: 'medium',
    headline:
      'TD Power Systems QIP closes at ~Rs 600cr -- 77.42L shares @ Rs 775 (0.05% discount to floor) -- resolves the size that was still open at the Oct 7 floor-pricing stage',
    insight:
      'TD Power Systems\' Fund Raising Committee closed its QIP on Oct 12, 2026, allocating 77,41,935 equity shares at Rs 775/share (Rs 774 premium over Rs 1 face value), a 0.05% discount to the Rs 775.35 floor price -- an aggregate raise of ~Rs 600cr. This resolves the open question flagged on the Oct 7 note ("QIP opens at floor price Rs 775.35; up to 5% discount permitted") -- the actual discount taken was negligible (0.05%, not the full 5% headroom), suggesting strong demand near the floor. Use of proceeds is not stated in this filing (no debt-repayment or specific capex figure disclosed), so the deterministic PAT-bridge accretion/dilution calculation cannot be run with real inputs this run -- current PAT and share count were not pulled from company context, so epsImpact confidence is marked low rather than guessed. This follows the already-tracked Rs 192cr US order win (Oct 1) and the Rs 75cr promoter preferential issue (Sept 13) -- a company actively both raising capital and winning export orders this quarter.',
    thesisChain: [
      'QIP closes: 77,41,935 shares allotted at Rs 775/share (0.05% discount to Rs 775.35 floor), ~Rs 600cr raised',
      'resolves the size/pricing that was still open at the Oct 7 floor-pricing note',
      'negligible discount taken (0.05% of a permitted 5%) signals strong QIB demand near the floor',
      'EPS impact not sized -- use of proceeds (debt paydown vs growth capex) and current PAT/share count are not disclosed in this filing; flagged as a knowledge gap rather than estimated',
    ],
    epsImpact: {
      direction: 'neutral',
      magnitude:
        '~Rs 600cr raised via 77.42L shares at Rs 775/share; dilution % and PAT impact need current share count/use-of-proceeds, not in this filing',
      timeline: 'effective Oct 12, 2026 (QIP closed)',
      confidence: 'low',
    },
    tags: ['fundraise', 'equity_dilution'],
    jCurve: { isCandidate: false, shape: null, elbowEvidence: null, whatWouldConfirm: null },
    knowledgeGap:
      'TD Power Systems QIP: use-of-proceeds (debt repayment vs growth capex) and current PAT/share count were not pulled from company context this run -- needed to run the deterministic pat-bridge and give a real EPS-accretion/dilution read instead of leaving epsImpact at low confidence.',
  });
  markProcessed('NSE:TDPOWERSYS', 'xlykx3f9g6cbqk9cpk5bduob.pdf', USECASE);
});

// 12. RNFI -- OCR FAILED hard stop. Flag explicitly, do not mark routine. Note built only from title/description, caveated.
run('RNFI', () => {
  addNote('NSE:RNFI', {
    announcementId: 'bx4hzj07exuf5ltdm55xqkrb.pdf',
    announcementTitle: 'General Updates (favourable appellate order, Income Tax, AY2024-25)',
    pdfUrl: 'https://www.stockscans.in/document/bx4hzj07exuf5ltdm55xqkrb.pdf',
    category: 'regulatory',
    significance: 'low',
    headline:
      'FLAG FOR MANUAL FOLLOW-UP: RNFI Services PDF is OCR-blocked (scanned/image-only) -- description claims a favourable Income Tax appellate order for AY2024-25, unverified against the actual document',
    insight:
      'read-pdf-with-meta returned ocrFailed:true for this filing (near-empty text layer, scanned/image-only PDF) -- per the standing hard-stop rule, this is explicitly NOT being marked routine despite the scan-provided description sounding positive ("favorable appellate order in Income Tax Matter for Assessment Year 2024-25"). The description alone is not verified against the document body: no tax amount, provision-reversal figure, or appellate authority name could be confirmed. This needs a manual re-read (the stockscans PDF viewer, or a retry once OCR succeeds) before any EPS read is attempted. A duplicate filing on the same event (xri7yns19g6mili6bdek7lhu.pdf) is routed to this note without an independent read.',
    thesisChain: [
      'Filing PDF failed OCR extraction (scanned/image-only, near-empty text layer)',
      'description claims a favourable Income Tax appellate order for AY2024-25',
      'claim is unverified -- no tax amount or provision-reversal figure confirmed from the actual document',
      'flagged for manual follow-up rather than marked routine, per the ocrFailed hard-stop rule',
    ],
    epsImpact: null,
    tags: ['regulatory'],
    jCurve: {
      isCandidate: false,
      shape: null,
      elbowEvidence: null,
      whatWouldConfirm:
        'a successful OCR re-read or manual review of the actual order, confirming the tax amount/provision impact if any',
    },
  });
  markProcessed('NSE:RNFI', 'bx4hzj07exuf5ltdm55xqkrb.pdf', USECASE);
  markProcessed('NSE:RNFI', 'xri7yns19g6mili6bdek7lhu.pdf', 'duplicate-of-existing-note');
});

fs.writeFileSync(process.argv[2] || 'write-notes-results.json', JSON.stringify(RESULTS, null, 2));
console.log('DONE', RESULTS.filter((r) => r.ok).length, '/', RESULTS.length);
