// Batch processor for post-close-scan-insights adhoc (morning) run — 2026-10-13
'use strict';
const path = require('path');
const WI = require(path.join(process.cwd(), 'packages/jobs-runtime/watchlistInsights.js'));

const MODEL = 'claude-sonnet-5';
const SOURCE_SKILL = 'post-close-scan-insights';

function usecase(depth) {
  return `announcement-insights:${depth}`;
}

// ---------- ROUTINE ITEMS (mark-processed only, no note) ----------
const ROUTINE = [
  [
    'NSE:3IINFOLTD',
    '8cq29yqiedt633udh3n72pzx.pdf',
    '3i Infotech Limited',
    'Grant of Stock Options Under ESOP 2023',
    'general',
    'ESOP grant of 8,75,000 options to employees — routine compensation mechanics, no financial materiality',
  ],
  [
    'BSE:PURPLEFIN',
    'ycnusvfi4td933amwbt1jnt7.pdf',
    'Purple Financial Services',
    'Half Yearly Statement of Debt Securities',
    'general',
    'Routine half-yearly ISIN/debt-securities statement under Reg 17 NCS Regulations',
  ],
  [
    'BSE:TOTEM',
    'fm9ypvteplaic4ud2qc2ifgh.pdf',
    'Totem Infrastructure',
    'Statutory auditor conversion to LLP',
    'general',
    'Statutory auditor firm converted to an LLP; no change in engagement, scope or terms',
  ],
  [
    'NSE:SOFTTECH',
    'cqnvxezujpl83kec5yl5ncn0.pdf',
    'Softtech Engineers',
    'Share Capital Reconciliation Audit Cert.',
    'general',
    'Routine quarterly Reg 76 share-capital reconciliation audit certificate',
  ],
  [
    'NSE:SPORTKING',
    '78ggic7q7h1x1lxd1wjh8j4z.pdf',
    'Sportking India',
    'Board Meeting Intimation (Q2 results)',
    'anticipation',
    'Standard board-meeting-for-results intimation, no other agenda disclosed',
  ],
  [
    'NSE:HFCL',
    'ib8aci91jd22mxd72k9be8tw.pdf',
    'HFCL Limited',
    'Board Meeting Intimation',
    'shareholding_change',
    'Generic board-meeting intimation under Reg 29(1); no agenda specifics disclosed in this filing',
  ],
  [
    'NSE:ANZEN',
    'l46nvquu1we1lk6bi46n3u58.pdf',
    'Anzen India Energy Yield Plus Trust',
    'Quarterly CG Compliance Report',
    'general',
    'Routine quarterly corporate-governance compliance report (InvIT Reg 26K)',
  ],
  [
    'NSE:PAISALO',
    '35v9gh89glvxhvv4q2uhn259.pdf',
    'Paisalo Digital',
    'Allotment of Commercial Papers (~Rs 10cr)',
    'general',
    'Routine CP allotment of Rs ~10cr — small relative to an NBFC treasury programme, standard financing mechanics',
  ],
  [
    'NSE:ADVANCE',
    'o2hn9i3hhk0cf262r4o8gwc9.pdf',
    'Advance Agrolife',
    'Clarification on Price Movement',
    'general',
    'Standard Reg 30(11) price-movement clarification; company states no undisclosed price-sensitive event',
  ],
  [
    'NSE:DHANBANK',
    '5z7baced58a08qubcbxdwfbk.pdf',
    'Dhanlaxmi Bank',
    'Board Meeting Intimation (Reg 29/50)',
    'shareholding_change',
    'Generic board-meeting intimation for quarterly results; no other agenda disclosed',
  ],
  [
    'NSE:NELCO',
    'i67by1rbeg53uvy27oh1mugt.pdf',
    'Nelco Limited',
    'Board Meeting Intimation (Q2 results)',
    'anticipation',
    'Standard board-meeting-for-results intimation',
  ],
  [
    'NSE:SENORES',
    '1ahbh6j3crh32r4h8sqfq6hp.pdf',
    'Senores Pharmaceuticals',
    'Re-appointment of existing MD',
    'general',
    'Re-appointment of incumbent Managing Director (continuity, not a new appointment) — routine governance',
  ],
  [
    'NSE:EMUDHRA',
    '1pggblhh71j0qrasdk7pbjvq.pdf',
    'eMudhra Limited',
    'Board Meeting Intimation (Q2 results)',
    'anticipation',
    'Standard board-meeting-for-results intimation',
  ],
  [
    'NSE:MSTCLTD',
    'ia15r7op0eccpnsddcem1f6z.pdf',
    'MSTC Limited',
    'Share Capital Reconciliation Audit',
    'general',
    'Routine quarterly Reg 76 share-capital reconciliation audit report',
  ],
  [
    'NSE:MGEL',
    'uojer03c1545y1cq6qqrchvo.pdf',
    'Mangalam Global Enterprise',
    'New retail store opening',
    'general',
    'Single new retail-store opening under "NEAT EVERYDAY" brand — immaterial scale, routine operational update',
  ],
  [
    'NSE:CGCL',
    'y59gu3wu8waem5kji5gnagzn.pdf',
    'Capri Global Capital',
    'Navratri promotional offer press release',
    'general',
    'Seasonal promotional offer (processing-fee waiver) — marketing press release, not a new business development; candidate for noise-keyword list ("Navratri", "processing fee waiver", "Special Offer")',
  ],
  [
    'NSE:BOSCH-HCIL',
    'ditr86ck8ye9xdm757drrjf0.pdf',
    'Bosch Home Comfort India',
    'Board Meeting Notice (results)',
    'anticipation',
    'Standard board-meeting-for-results notice',
  ],
  [
    'BSE:PSPLATINA',
    '7arma4hcjut7av7cwt1dpgki.pdf',
    'PropShare Platina REIT',
    'Tenant change in Prestige Tech Platina',
    'general',
    'Routine REIT occupancy/tenancy update for one floor of one building in the asset',
  ],
  [
    'BSE:PSPLATINA',
    '3iugsmg7noskas1fltrd6oju.pdf',
    'PropShare Platina REIT',
    'Half-yearly valuation report (NAV ~Rs103/unit)',
    'general',
    'Routine periodic REIT valuation report; NAV ~Rs 103.17/unit, no surprise vs. prior disclosures',
  ],
  [
    'NSE:DENTALKART',
    '6jm9bxom8asvxpjapvn8so4m.pdf',
    'Vasa Denticity (Dentalkart)',
    'Quarterly CG Compliance Report',
    'general',
    'Routine quarterly corporate-governance compliance report',
  ],
  [
    'NSE:JUSTDIAL',
    'fdee5mcu2hewuv7jkh18aen1.pdf',
    'Just Dial Limited',
    'Board Meeting Intimation (Q2 results)',
    'anticipation',
    'Standard board-meeting-for-results intimation',
  ],
  [
    'NSE:J&KBANK',
    'ne59t5c8e9ophnu1tz2ek69n.pdf',
    'Jammu & Kashmir Bank',
    'Board Meeting Intimation (Q2 results)',
    'anticipation',
    'Standard board-meeting-for-results intimation',
  ],
  [
    'NSE:SPUNWEB',
    'yp46b7zelxur5hq41dlhm1un.pdf',
    'Spunweb Nonwoven',
    'Clarification on Price Movement',
    'general',
    'Standard price-movement clarification citing continued compliance; no new disclosure',
  ],
  [
    'NSE:ETL',
    'wup1uflnocl2akqgaustalbg.pdf',
    'Emkay Tools Limited',
    'Auditor change + MD continuation beyond 70',
    'general',
    'Routine statutory-auditor replacement (casual vacancy filled same meeting) and standard age-70 MD continuation subject to shareholder approval',
  ],
  [
    'NSE:COMMITTED',
    '9ub0om3pipzkqjuwkazr8hkn.pdf',
    'Committed Cargo Care',
    'Non-applicability of CG provisions (SME)',
    'general',
    'Routine SME-platform corporate-governance non-applicability notice',
  ],
  [
    'NSE:MAXVOLT',
    'dor2r00djjy8021r21qikw4i.pdf',
    'Maxvolt Energy Industries',
    'Internal auditor change + KMP appointment',
    'general',
    'Routine internal-auditor resignation/replacement and KMP appointment, no stated irregularity',
  ],
  [
    'NSE:VERTIS',
    'k1am2aj5wrcqja0pvp9m0ift.pdf',
    'Vertis Infrastructure Trust',
    'Compliance Officer / RTA quarterly details',
    'general',
    'Routine quarterly compliance-officer/RTA disclosure',
  ],
  [
    'NSE:PRIMECAB',
    '3x943vfd7hiowl6sn5dnzwcx.pdf',
    'Prime Cable Industries',
    'Market Maker change',
    'general',
    'Administrative change of NSE Emerge market maker, no financial impact',
  ],
  [
    'NSE:CAPINVIT',
    '2hdq81je4qdm9h53x9vqjucn.pdf',
    'Capital Infra Trust',
    'Quarterly asset valuation report',
    'general',
    'Routine periodic InvIT asset-valuation report',
  ],
];

async function runRoutine() {
  for (const [companyId, annId, name, title, category, reason] of ROUTINE) {
    await WI.cmdMarkProcessed(companyId, annId); // default usecase
  }
}

// ---------- INSIGHT-WORTHY ITEMS ----------
const INSIGHTS = [
  {
    companyId: 'NSE:PTCIL',
    name: 'PTC Industries Limited',
    annIds: ['namimifni9p8cdu1vy62tiyj.pdf'],
    category: 'fundraise',
    significance: 'high',
    depth: 'standard',
    headline:
      'PTC Industries raises Rs 1,800 crore via QIP — large capital infusion for aerospace/defence titanium-casting capacity',
    insight:
      "PTC Industries (titanium/superalloy precision-casting supplier to aerospace & defence) closed a Rs 1,800 crore Qualified Institutions Placement. The filing is only the press-release intimation — pricing, allottee list and use-of-proceeds detail were not in this specific disclosure and should be cross-checked against the placement document when filed. A raise of this size for a company of PTCIL's scale is a strong signal of either aggressive capacity expansion (new foundry/forging lines) or deleveraging; EPS impact in the near term is dilutive, with the offset depending on deployment speed and whether proceeds fund revenue-accretive capacity versus debt paydown.",
    thesisChain: [
      'PTCIL announces Rs 1,800cr QIP has been raised',
      'Large primary capital infusion relative to company scale',
      'Near-term EPS dilution from new share issuance',
      'Medium-term accretion depends on capacity deployment timeline and revenue ramp from aerospace/defence order book',
      'Needs placement-document follow-up for pricing/use-of-proceeds specifics',
    ],
    epsImpact: {
      direction: 'mixed',
      confidence: 'low',
      timeline:
        'needs placement document for use-of-proceeds; near-term dilutive, medium-term capacity-dependent',
    },
    tags: ['fundraise', 'qip', 'capacity-expansion', 'follow-up-needed'],
  },
  {
    companyId: 'NSE:AARTIIND',
    name: 'Aarti Industries Limited',
    annIds: ['hiva4x7u7ndba5wkvp2mwh92.pdf', 'v4ymtbgrmy28khid5jjir0kr.pdf'],
    category: 'order_book',
    significance: 'high',
    depth: 'standard',
    headline:
      'Aarti Industries signs 10+ year dedicated manufacturing & supply agreement, Rs 1,500cr revenue potential, with unnamed global speciality chemical major',
    insight:
      'Aarti Industries entered a 10+ year strategic, dedicated manufacturing & supply agreement with an unnamed "leading global speciality chemical company." Under the contract, Aarti will build, commission and operate a dedicated facility for a speciality chemical based on the customer\'s proprietary process technology, with aggregate revenue potential of ~Rs 1,500 crore over the contract term (~Rs 150cr/year average run-rate, back-loaded once the facility ramps). Company confirms no related-party or promoter interest and not a related-party transaction. This is a genuine long-duration, dedicated-asset order — a strong revenue-visibility and operating-leverage signal once the facility is commissioned, though capex/commissioning timeline (and therefore the J-curve inflection point) is not disclosed in this filing.',
    thesisChain: [
      'Aarti signs 10+yr dedicated supply agreement, Rs1500cr revenue potential',
      "New dedicated manufacturing facility to be built for a single customer's proprietary chemistry",
      'Multi-year revenue visibility once facility commissions',
      'Operating leverage/EPS accretion materializes only after capex + commissioning — timeline undisclosed',
      'Follow up for capex quantum and commissioning schedule',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'medium',
      timeline: 'multi-year, contingent on undisclosed commissioning timeline',
    },
    tags: [
      'order_book',
      'strategic-partnership',
      'high_conviction_candidate',
      'capacity-expansion',
    ],
  },
  {
    companyId: 'NSE:AIIL',
    name: 'Authum Investment & Infrastructure Limited',
    annIds: ['gqf7w4x33ol743l02on97402.pdf'],
    category: 'acquisition',
    significance: 'high',
    depth: 'deep',
    headline:
      'Authum/Inox Neo consortium completes implementation of Wind World (India) resolution plan — acquisition formally closed (Implementation Date Oct 8, 2026)',
    insight:
      'The Implementation and Monitoring Committee of Wind World (India) Ltd (WWIL) has recorded that the Inox Neo Energies + Authum Investment & Infrastructure consortium has discharged all obligations under its IBC resolution plan (dated Feb 13, 2026, amended May 20, 2026) and declared October 8, 2026 as the Implementation Date. This is the formal closing of an NCLT-driven acquisition of a wind-energy asset that has been in process since at least July 2026. Being a HIGH_CONVICTION category (acquisition), this deserves deep tracking: the deal is now complete rather than pending, which de-risks the earlier thesis (if any was built on "deal completion risk") and shifts focus to WWIL\'s post-acquisition integration, balance-sheet impact and consolidation treatment in Authum\'s next results.',
    thesisChain: [
      'Resolution plan for WWIL acquisition formally implemented, Oct 8 2026',
      'Consortium (Inox Neo Energies + Authum) now controls WWIL per IBC process',
      'Completion removes deal-closing risk/uncertainty',
      'Next catalyst: WWIL consolidation into Authum financials / integration updates',
      "EPS impact depends on WWIL's standalone financials and deal structure, not disclosed here",
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'next 1-2 quarters as consolidation/integration details emerge',
    },
    tags: ['acquisition', 'high_conviction', 'ibc-resolution', 'deal-closed'],
  },
  {
    companyId: 'NSE:GULFPETRO',
    name: 'GP Petroleums Limited',
    annIds: ['ufglcxnvkqy83c2ne40pe78y.pdf'],
    category: 'acquisition',
    significance: 'medium',
    depth: 'standard',
    headline:
      'GP Petroleums to acquire Incubit Pipavav Terminal (ex-Gulf Petrochem India) for Rs 44.27cr strategic infra synergy; same-day CFO transition',
    insight:
      'GP Petroleums\' board approved acquiring equity of Incubit Pipavav Terminal Pvt Ltd (IPTPL, formerly Gulf Petrochem India) for an aggregate Rs 44,26,97,141 (~Rs 44.27cr), funded from internal reserves over up to one year in tranches. IPTPL operates a bulk-liquid storage terminal at Pipavav Port, Gujarat (FY26 turnover Rs 38.48cr, FY25 Rs 25.32cr, FY24 Rs 37.20cr) — the stated rationale is strategic/operational synergy (tank storage, terminal infrastructure access) rather than a pure financial investment. This item was categorised "general" by the taxonomy (generic "Outcome of Board Meeting" title hid the real acquisition) — a taxonomy gap worth flagging for CATEGORY_RULES. Same board meeting also approved CFO transition (Arjun Verma resigns as CFO w.e.f. Oct 15 but remains Executive Director/KMP; Shirish Suvagia appointed CFO) — routine succession, no stated irregularity.',
    thesisChain: [
      'GP Petroleums approves Rs44.27cr acquisition of Pipavav terminal operator IPTPL',
      'Strategic infrastructure synergy (storage/terminal access) rather than pure financial stake',
      'Funded from internal reserves, staged over up to 1 year — low balance-sheet strain',
      'Target is modestly profitable (~Rs25-38cr revenue range historically) — immediate EPS impact small',
      'CFO transition same day is routine, no impact on thesis',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'modest, target scale is small relative to likely GP Petroleums base',
    },
    tags: ['acquisition', 'taxonomy-gap-general-hid-acquisition', 'strategic-infra'],
  },
  {
    companyId: 'NSE:KPIL',
    name: 'Kalpataru Projects International Limited',
    annIds: ['zb0euaap9mbr1gqsr4b6983f.pdf'],
    category: 'order_book',
    significance: 'high',
    depth: 'standard',
    headline: 'Kalpataru Projects (KPIL) announces new order wins of Rs 2,225 crore',
    insight:
      'KPIL press release confirms new order wins totalling Rs 2,225 crore, received in the normal course of business (no single-customer concentration flagged, no further project-level breakup in this specific filing). For an EPC/infrastructure major, an order win of this size is a meaningful book-to-bill contributor; run enrich-orders for updated backlog/book-to-bill context before concluding magnitude relative to existing order book.',
    thesisChain: [
      'KPIL announces Rs2,225cr new order wins',
      'Adds to existing order book — positive for revenue visibility',
      'Needs order-book enrichment (book-to-bill) for full context on magnitude',
      'Execution timeline / margin profile not disclosed in this release',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'medium',
      timeline: 'multi-quarter execution, standard EPC recognition',
    },
    tags: ['order_book', 'order-win'],
  },
  {
    companyId: 'NSE:KOLTEPATIL',
    name: 'Kolte-Patil Developers Limited',
    annIds: ['sz3iybtbo3q5tovafiyjvgp3.pdf'],
    category: 'general',
    significance: 'high',
    depth: 'standard',
    headline:
      'Kolte-Patil posts record Q2/H1 FY27 sales (Rs1,019cr/Rs1,636cr, +52%/+27% YoY) and collections, plus Rs6,000cr Mumbai GDV expansion',
    insight:
      "Kolte-Patil Developers' Q2&H1 FY27 operational update shows its highest-ever quarterly sales (Rs 1,019cr, +52% YoY) and highest-ever half-yearly sales (Rs 1,636cr, +27% YoY), with collections up 32% YoY to Rs 1,509cr in H1 and average realization up 10% YoY to ~Rs 8,368/sq.ft. The single project 'Vyana at The Reserve' (Pune) contributed Rs 616cr of sales alone — the company's strongest-ever single-project launch. Separately, KPDL signed six new redevelopment projects in Mumbai Metropolitan Region worth a combined Rs 6,000cr GDV — its largest-ever annual Mumbai business-development addition. This is a strong, multiple-data-point operating-leverage/J-curve signal for a real-estate developer: record bookings translate into revenue over the typical 2-4 year completion cycle (percentage-completion), so near-term P&L impact lags the booking strength shown here. Management flagged softer near-term demand in Pune specifically even while reporting record aggregate numbers — a nuance worth tracking next quarter.",
    thesisChain: [
      'Record Q2/H1 sales and collections, well ahead of YoY comps',
      'Strongest-ever single project launch (Vyana at The Reserve, Rs616cr)',
      'Rs6,000cr GDV Mumbai expansion — largest-ever annual MMR addition for KPDL',
      'Booking strength will flow to revenue with a multi-year lag under percentage-completion accounting',
      'Management notes softening Pune demand despite headline strength — watch next quarter for confirmation/contradiction',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'medium',
      timeline:
        '2-4 year revenue recognition lag typical for real estate; near-term cash-flow/pre-sales strength is the immediate signal',
    },
    tags: ['operational-update', 'real-estate', 'j-curve-candidate', 'record-sales'],
    jCurve: {
      isCandidate: true,
      shape: 'bookings-led-multi-year-ramp',
      elbowEvidence: 'Rs616cr single-project launch + Rs6,000cr new Mumbai GDV additions',
      whatWouldConfirm:
        'revenue recognition catching up to bookings over FY28-FY30 as MMR projects reach percentage-completion thresholds',
    },
  },
  {
    companyId: 'NSE:TDPOWERSYS',
    name: 'TD Power Systems Limited',
    annIds: ['wlx4hw9d09kaw0v39lqncalq.pdf'],
    category: 'fundraise',
    significance: 'high',
    depth: 'standard',
    headline: 'TD Power Systems closes QIP: 77.42 lakh shares at Rs 775/share (~Rs 600cr raised)',
    insight:
      "TD Power Systems' Fund Raising Committee closed its QIP, allocating 77,41,935 equity shares (face value Rs 1) at Rs 775/share — a 0.05% discount to the floor price of Rs 775.35 — implying gross proceeds of approximately Rs 600 crore. This is a material primary capital raise for a mid-cap industrial equipment maker; near-term EPS is diluted by the new share count, with accretion contingent on capacity/working-capital deployment (use-of-proceeds not detailed in this specific filing — check the placement document). Flag for a yarn pat-bridge run once current PAT and pre-issue share count are pulled from the latest financials, rather than approximating dilution in prose.",
    thesisChain: [
      'QIP closes: 77.42L shares issued at Rs775/share',
      '~Rs600cr gross proceeds raised',
      'Immediate share-count dilution',
      'EPS accretion/dilution net effect depends on use of proceeds — needs pat-bridge with current financials',
      'Follow up placement document for use-of-proceeds detail',
    ],
    epsImpact: {
      direction: 'mixed',
      confidence: 'low',
      timeline:
        'needs pat-bridge analysis with current PAT/share-count; dilutive near-term by construction',
    },
    tags: ['fundraise', 'qip', 'follow-up-needed-patbridge'],
  },
  {
    companyId: 'NSE:SHYAMMETL',
    name: 'Shyam Metalics and Energy Limited',
    annIds: ['vo5b24mg3ttxiu095hftuk7u.pdf'],
    category: 'general',
    significance: 'medium',
    depth: 'standard',
    headline:
      'Shyam Metalics secures Phutamura coal block mining rights (~170MT reserves) via Alom Solar investment — backward integration for captive power/steel',
    insight:
      "Shyam Metalics Group has secured mining rights to the Phutamura Coal Block (Mand-Raigarh coalfield, Chhattisgarh; ~7.324 sq km, ~170 million tonnes estimated reserves) through an investment in Alom Solar Private Limited, the successful bidder. Mining and coal production are expected to commence July 2027. This is a backward-integration move to secure long-term, cost-effective captive coal supply for the group's captive power plants and core steel manufacturing — a multi-year cost-structure/margin-protection story rather than an immediate revenue event. No investment quantum or stake percentage in Alom Solar was disclosed in this release; useful to follow up for capital commitment size.",
    thesisChain: [
      'Shyam Metalics secures Phutamura coal block mining rights via Alom Solar stake',
      '~170MT reserves, production start ~July 2027',
      'Backward integration secures captive coal supply for power/steel ops',
      'Margin protection/cost-structure benefit materializes from mid-2027 onward',
      'Investment quantum in Alom Solar not disclosed — follow up needed',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'from ~July 2027 production start, cost-side benefit',
    },
    tags: ['backward-integration', 'raw-material-security', 'follow-up-needed'],
  },
  {
    companyId: 'NSE:CEIGALL',
    name: 'Ceigall India Limited',
    annIds: ['g4kaolhr9edtwox6oaxj4hvu.pdf'],
    category: 'order_book',
    significance: 'medium',
    depth: 'standard',
    headline:
      'Ceigall India (JV with Gayatri Projects) receives Completion Certificate for Rs 1,323.52cr Delhi-Saharanpur EPC highway project',
    insight:
      'Ceigall India Limited (jointly with Gayatri Projects Limited) received the Completion Certificate for the Delhi/UP-border-to-EPE-Junction stretch of the Delhi-Saharanpur Economic Corridor (National Highway 709B, Bharatmala Phase-1), with the project declared fit for operation effective Sept 12, 2024 (within the cure period of the approved extension-of-time to Aug 15, 2024). The underlying EPC contract value was Rs 1,323.52cr (revised project cost Rs 1,659.84cr per the bid cost table). Completion-certificate issuance typically de-risks final milestone payments/retention release and removes execution/LD (liquidated-damages) risk that had been outstanding since the original scheduled completion date of Nov 7, 2023 was missed and an EOT was required. This is a positive derisking event rather than fresh order-book addition.',
    thesisChain: [
      'Completion certificate issued for Rs1,323.52cr EPC highway project',
      'Removes remaining execution/LD risk on a project that had required an EOT',
      'Enables final milestone billing / retention-money release',
      'No new order value — this is project closure/derisking, not a fresh win',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'near-term, via retention release and removal of contingent LD liability',
    },
    tags: ['order_book', 'project-completion', 'derisking'],
  },
  {
    companyId: 'NSE:GOODLUCK',
    name: 'Goodluck India Limited',
    annIds: ['s2v80jnoj4zzwtgxgn7b2qz3.pdf'],
    category: 'general',
    significance: 'medium',
    depth: 'standard',
    headline:
      "Goodluck India's defence subsidiary (GDAL) emerges as sole technically qualified bidder for 155mm artillery shells to Munitions India Ltd",
    insight:
      'Goodluck Defence & Aerospace Ltd (GDAL), a subsidiary of Goodluck India, has been identified as the SOLE technically qualified bidder for specialised 155mm HE M1A4 Ready-to-Fill Artillery Shells to Munitions India Limited (MIL), following an audit/technical evaluation of existing suppliers. This is a pre-order qualification milestone, not a confirmed order — the company explicitly states the opportunity remains "subject to applicable procurement procedures, commercial terms, contractual requirements, and orders from MIL." GDAL\'s defence plant has 1,50,000 shells/year capacity, being expanded to 4,00,000/year. Sole-qualified-bidder status in a specialised ordnance category meaningfully improves conversion odds on any eventual MIL order, but no order value or timeline is yet committed — flag as a FOLLOW-UP item to track for the actual purchase order.',
    thesisChain: [
      'GDAL named sole technically qualified bidder for 155mm artillery shells to MIL',
      'Significantly improves probability of eventual order award (no competing qualified bidder)',
      'No order value or award date committed yet — pre-order milestone only',
      'Capacity exists/is expanding (1.5L to 4L shells/yr) to support an eventual order',
      'Track for confirmed purchase order as the next catalyst',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'contingent on an actual order being placed — no committed date',
    },
    tags: ['defence', 'pre-order-milestone', 'follow-up-needed'],
  },
  {
    companyId: 'BSE:AIRFLOA',
    name: 'Airfloa Rail Technology Limited',
    annIds: ['w85kyhaccj7glkf1228r3kuz.pdf', '1u65z8ylphsstfh8o1xasgj3.pdf'],
    category: 'order_book',
    significance: 'medium',
    depth: 'standard',
    headline:
      "Airfloa Rail Technology secures Rs 34.85cr LOA for Vande Bharat sleeper interior work via consortium with Italy's BLUE Engineering",
    insight:
      'Airfloa Rail Technology (formerly Airflow Equipments India), as lead member of a consortium with Italy-based BLUE Engineering S.r.l., received a Letter of Acceptance from Integral Coach Factory (ICF), Chennai, for interior design work on the Vande Bharat sleeper trainset, valued at Rs 34.85 crore. This is a modest-sized order in absolute terms but prestigious/reference-value given the Vande Bharat programme profile, and establishes Airfloa in a specialised rail-interior niche alongside an international technical partner — potentially opening further orders in the same programme.',
    thesisChain: [
      'Airfloa (with Italian partner BLUE Engineering) wins Rs34.85cr LOA from ICF',
      'Vande Bharat sleeper interior-design work — prestigious reference project',
      'Modest absolute order size but strategic positioning in a growing rail-modernisation programme',
      'Watch for repeat/larger orders in the same Vande Bharat interior-fit-out category',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'order execution timeline not disclosed',
    },
    tags: ['order_book', 'railways', 'small-order-strategic-positioning'],
  },
  {
    companyId: 'NSE:NGLFINE',
    name: 'NGL Fine-Chem Limited',
    annIds: ['5le3hqk1dh4gwddddwo81qqq.pdf'],
    category: 'shareholding_change',
    significance: 'medium',
    depth: 'standard',
    headline:
      'NGL Fine-Chem: SEBI grants SAST Reg 11(5) exemption for promoter-family-trust share transfer (Ajita Nachane / Rahul Nachane Family Trusts)',
    insight:
      'NGL Fine-Chem received a SEBI order (WTM/KCV/CFD/11/2025-26, dated Oct 9, 2026) granting exemption under Regulation 11(5) of the SAST Regulations for a proposed acquisition of shares/voting rights by Ajita Nachane Family Trust and Rahul Nachane Family Trust — i.e. an open-offer exemption for what appears to be an intra-promoter-family restructuring into family trusts. Per standing routing rules, unpriced intra-promoter transfers into family trusts still warrant governance review even though no external change-of-control or public shareholder impact is implied. No consideration/pricing was disclosed in the extracted text; this is a structural/succession-type promoter reorganisation, not a new economic transaction for outside shareholders to react to directly, but worth tracking for any subsequent disclosure of trust beneficiaries/terms.',
    thesisChain: [
      'SEBI grants SAST exemption for promoter family-trust share transfer at NGL Fine-Chem',
      'Appears to be intra-promoter-group succession/estate-planning restructuring',
      'No change of control or new economic transaction for public shareholders implied',
      'Governance-review flag per routing rules even though unpriced/intra-family',
      'Watch for subsequent trust-deed/beneficiary disclosures',
    ],
    epsImpact: {
      direction: 'neutral',
      confidence: 'medium',
      timeline: 'n/a — governance/structural item, not an earnings catalyst',
    },
    tags: ['sast', 'promoter-restructuring', 'governance-review'],
  },
  {
    companyId: 'BSE:SHARDUL',
    name: 'Shardul Securities Limited',
    annIds: ['l4f7gpqf8rq3vbb2unfktxme.pdf'],
    category: 'buyback',
    significance: 'medium',
    depth: 'standard',
    headline:
      'Shardul Securities submits Letter of Offer for Rs 115.2cr buyback (1.92cr shares at Rs60/share) — follow-up to Oct 1 announcement',
    insight:
      'Shardul Securities filed the formal Letter of Offer for its previously announced buyback (public announcement made Oct 1, 2026): 1,92,00,000 equity shares (face value Rs 2) at Rs 60/share, aggregating Rs 115.2 crore. Since the buyback itself was already publicly known from the Oct 1 announcement, this filing is procedural follow-through (KNOWN, not NEW information) rather than a fresh catalyst — flag accordingly in info-classification. Buyback size relative to company scale and the implied yield/EPS-accretion from reduced share count would need current market-cap and share-count context to quantify.',
    thesisChain: [
      'Formal Letter of Offer filed for Rs115.2cr buyback (already announced Oct 1)',
      'Procedural confirmation step, not new information',
      'EPS accretion from reduced share count — magnitude needs current share-count/market-cap context',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'accretive once buyback completes; this filing is a procedural step',
    },
    tags: ['buyback', 'known-not-new', 'follow-through'],
  },
  {
    companyId: 'NSE:UHTL',
    name: 'United Heat Transfer Limited',
    annIds: ['8qwqxh3myo6t1jti7nmerohe.pdf'],
    category: 'fundraise',
    significance: 'medium',
    depth: 'standard',
    headline:
      'UHTL allots 29,68,000 equity shares at Rs 105.50/share (~Rs 31.3cr) on preferential basis',
    insight:
      'United Heat Transfer Limited allotted 29,68,000 equity shares (face value Rs 10) at Rs 105.50/share, implying proceeds of approximately Rs 31.3 crore, following its earlier in-principle NSE approval (Oct 1, 2026). Allottee category/investor identity was not fully captured in the extracted text — follow up to confirm whether promoter or non-promoter, which affects the governance read (stake-building signal vs. pure capital raise).',
    thesisChain: [
      'UHTL allots shares at Rs105.50/share, raising ~Rs31.3cr',
      'Preferential allotment following Oct 1 in-principle approval',
      'Allottee identity (promoter vs non-promoter) not confirmed in this filing — follow up needed',
    ],
    epsImpact: {
      direction: 'mixed',
      confidence: 'low',
      timeline: 'dilutive near-term; capital use not disclosed in this filing',
    },
    tags: ['fundraise', 'preferential-allotment', 'follow-up-needed'],
  },
  {
    companyId: 'BSE:MITSU',
    name: 'Mitsu Chem Plast Limited',
    annIds: ['uqr86yjon29a32yrnqtvya3s.pdf'],
    category: 'fundraise',
    significance: 'medium',
    depth: 'standard',
    headline:
      'Mitsu Chem Plast gets BSE in-principle approval for 10 lakh preferential warrants to promoter/non-promoter at min Rs 151/warrant',
    insight:
      'Mitsu Chem Plast received BSE in-principle approval for issuing 10,00,000 warrants (convertible into equal equity shares, face value Rs 10) to promoter and non-promoter categories on a preferential basis, at an issue price of not less than Rs 151/warrant — implying minimum gross proceeds of ~Rs 15.1cr once warrants are subscribed/exercised (only 25% typically payable upfront under ICDR norms). Promoter participation in preferential warrants is generally read as a stake-building/confidence signal; exact promoter vs non-promoter split was not fully captured in extracted text — follow up for the allottee breakdown.',
    thesisChain: [
      'BSE in-principle approval for 10L preferential warrants at min Rs151/warrant',
      'Promoter + non-promoter categories — allottee split not confirmed',
      'Minimum ~Rs15.1cr potential proceeds on full conversion',
      'Promoter participation (if any) reads as a stake-building signal — confirm split',
    ],
    epsImpact: {
      direction: 'mixed',
      confidence: 'low',
      timeline: 'dilutive on conversion; small relative scale',
    },
    tags: ['fundraise', 'warrants', 'promoter-stake-watch', 'follow-up-needed'],
  },
  {
    companyId: 'NSE:EIMCOELECO',
    name: 'Eimco Elecon (India) Limited',
    annIds: ['iw36obs9caepm554w8g548a3.pdf'],
    category: 'results',
    significance: 'medium',
    depth: 'standard',
    headline:
      'Eimco Elecon approves Q2/H1 FY27 results (clean auditor review) and CFO resignation (no material reason stated)',
    insight:
      "Eimco Elecon's board approved unaudited Q2/H1 FY27 results; the statutory auditor's limited review found nothing causing them to believe the statement contains a material misstatement. Separately, CFO Vishal C. Begwani resigned effective Oct 30, 2026 to pursue another opportunity, with the company confirming no material reasons beyond those in his resignation letter. The headline financial figures (revenue/EBITDA/PAT) were not captured in the extracted PDF text for this specific filing (likely embedded as an image/table); the companion full results PDF was separately flagged as a heavy document with no Filing Extract available — recommend running quarterly-result-extractor/quarterly-result-analysis on this company for the actual numbers.",
    thesisChain: [
      'Q2/H1 FY27 results approved, clean limited-review opinion',
      'CFO resignation effective Oct 30, stated non-material reason',
      "Actual financial figures not available from this filing's extracted text",
      'Recommend quarterly-result-extractor follow-up for headline numbers',
    ],
    epsImpact: {
      direction: 'neutral',
      confidence: 'low',
      timeline: 'n/a — figures unavailable from this filing',
    },
    tags: ['results', 'cfo-transition', 'follow-up-needed-financials'],
  },
  {
    companyId: 'NSE:SMCGLOBAL',
    name: 'SMC Global Securities Limited',
    annIds: ['biumkdrz2lvn91u686tmyqdh.pdf'],
    category: 'fundraise',
    significance: 'low',
    depth: 'quick',
    headline: 'SMC Global Securities closes Rs 150cr NCD issue (Rs75cr base + Rs75cr green-shoe)',
    insight:
      "SMC Global Securities' public NCD issue closed at its full issue limit: Rs 75cr base issue plus Rs 75cr green-shoe option exercised, aggregating Rs 150cr. Routine treasury/capital-markets financing for a broking/financial-services firm — green-shoe exercise (oversubscription) is a mild positive signal on investor demand for the paper but not a company-specific catalyst.",
    thesisChain: [
      'NCD issue closes at full Rs150cr limit including green-shoe',
      'Oversubscription (green-shoe exercised) is a mild positive demand signal',
      'Routine financing, not an operational catalyst',
    ],
    epsImpact: { direction: 'neutral', confidence: 'low', timeline: 'n/a' },
    tags: ['fundraise', 'ncd', 'routine-financing'],
  },
  {
    companyId: 'BSE:REGENCY',
    name: 'Regency Fincorp Limited',
    annIds: ['tzrnzsiulyey5r90yz6bg9n9.pdf'],
    category: 'fundraise',
    significance: 'low',
    depth: 'quick',
    headline:
      'Regency Fincorp board approves Rs 45cr NCD issuance proposal at 13% coupon (not yet allotted)',
    insight:
      "Regency Fincorp's board approved a proposal to issue up to Rs 45cr of secured NCDs (Rs15cr base + Rs30cr green-shoe) at 13% p.a. via private placement, and appointed a trustee and merchant banker. This is board authorisation to proceed, not a completed allotment — small-scale NBFC treasury financing at a relatively high coupon (13%) reflecting the company's size/credit profile.",
    thesisChain: [
      'Board approves Rs45cr NCD programme at 13% coupon',
      'Trustee/merchant banker appointed — process initiated, not yet allotted',
      'High coupon (13%) reflects small-NBFC credit profile',
      'Follow up for actual allotment/subscription outcome',
    ],
    epsImpact: { direction: 'neutral', confidence: 'low', timeline: 'n/a — proposal stage' },
    tags: ['fundraise', 'ncd', 'proposal-stage'],
  },
  {
    companyId: 'NSE:UNIVASTU',
    name: 'Univastu India Limited',
    annIds: ['19y7pjdpnm9le1risisd4f93.pdf'],
    category: 'order_book',
    significance: 'low',
    depth: 'quick',
    headline:
      'Univastu India wins Rs 15.39cr (incl. GST) Mumbai Metro Line 5/6 telephone-system order',
    insight:
      'Univastu India received a purchase order from Colossus Infra Project Pvt Ltd for design/supply/installation/commissioning of telephone systems for Mumbai Metro Lines 5 & 6 (MMRDA) stations, contract value Rs 13.04cr plus 18% GST (~Rs 15.39cr total). Small-scale order in absolute terms but adds to metro-infrastructure order book for a niche systems-integration player.',
    thesisChain: [
      'Univastu wins Rs15.39cr Metro Line 5/6 telephone-systems order',
      'Modest absolute size, adds to metro infrastructure exposure',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'execution timeline not disclosed',
    },
    tags: ['order_book', 'small-order'],
  },
  {
    companyId: 'BSE:SHRADDHA',
    name: 'Shraddha Prime Projects Limited',
    annIds: ['4foyrba7oz2x2pqmwd2etle0.pdf'],
    category: 'general',
    significance: 'low',
    depth: 'quick',
    headline:
      'Shraddha Prime Projects launches "Param Adarsh" in Mulund West, Mumbai (~Rs 120cr GDV)',
    insight:
      'Shraddha Prime Projects (formerly Towa Sokki) issued a press release on the launch of its "Param Adarsh" residential project in Mulund West, Mumbai, with an approximate Rs 120cr value cited in the release. A new project launch with disclosed value is a genuine, if modest-scale, real-estate development; actual pre-sales/booking traction is the item to track next, not the launch itself.',
    thesisChain: [
      'New project "Param Adarsh" launched, ~Rs120cr value',
      'Pre-sales/booking traction (not yet available) is the real signal to track next',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'multi-quarter, contingent on actual pre-sales',
    },
    tags: ['real-estate', 'project-launch', 'follow-up-needed'],
  },
  {
    companyId: 'NSE:FROG',
    name: 'Frog Innovations Limited',
    annIds: ['3793v491dkkn4g5ep490jkc5.pdf'],
    category: 'general',
    significance: 'low',
    depth: 'quick',
    headline:
      'Frog Innovations enters wireless broadband/Wi-Fi manufacturing via partnership with US-based LigoWave',
    insight:
      'Frog Innovations (formerly Frog Cellsat) signed a strategic manufacturing and business partnership with US-based LigoWave to manufacture PtP/PtMP wireless broadband radios and enterprise Wi-Fi access points in India (Noida facility), marketed under the "FROG LigoWave" brand, with manufacturing expected to start in CY2026. This is a new market-segment entry (beyond Frog\'s existing wireless-coverage/DAS portfolio) with a large cited addressable market (~Rs4,000cr today, ~Rs8,300cr by FY2032 per third-party estimates cited by the companies) — but no company-specific revenue guidance or contract value was disclosed, so near-term EPS impact is not quantifiable from this filing alone.',
    thesisChain: [
      'Frog Innovations partners with LigoWave for India-manufactured wireless broadband/WiFi products',
      'New market-segment entry, large cited TAM but no company-specific revenue figures',
      'Manufacturing to start CY2026 at Noida facility',
      'EPS impact not quantifiable from this filing — track for actual order/revenue disclosure',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'unclear — no revenue guidance disclosed',
    },
    tags: ['new-segment-entry', 'telecom-equipment', 'follow-up-needed'],
  },
  {
    companyId: 'NSE:JTLIND',
    name: 'JTL Industries Limited',
    annIds: ['j6z81iu377x8wuu708yidz69.pdf'],
    category: 'general',
    significance: 'low',
    depth: 'quick',
    headline:
      'JTL Industries gains CPWD empanelment — approved-vendor status, not yet a booked order',
    insight:
      "JTL Industries received approval from the Chief Engineer, CPWD (NDZ-III, New Delhi), for inclusion of its products in the approved list of preferred makers for CPWD-jurisdiction works. This expands JTL's addressable government-tender/bidding pool but is an eligibility/empanelment milestone, not a committed order — no revenue impact until actual tenders are won.",
    thesisChain: [
      'JTL gains CPWD approved-vendor empanelment',
      'Expands addressable bidding pool for government works',
      'No committed revenue until actual orders are won under this empanelment',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'indirect — enables future bidding, no committed order',
    },
    tags: ['empanelment', 'pre-order-milestone'],
  },
  {
    companyId: 'BSE:YASHHV',
    name: 'Yash Highvoltage Limited',
    annIds: ['91wr9oo1cp6qqbvc3jifjsx6.pdf'],
    category: 'general',
    significance: 'low',
    depth: 'quick',
    headline:
      'Yash Highvoltage US subsidiary adds 5 states via new representation agreement with EHV Solutions',
    insight:
      'Yash HV USA Inc. (subsidiary of Yash Highvoltage) signed a representation agreement with EHV Solutions LLC, adding coverage across five Western and South-Central US states. This is a distribution/market-access expansion with no committed order value or revenue figure disclosed.',
    thesisChain: [
      'US subsidiary signs representation agreement adding 5 states',
      'Distribution/market-access expansion, no revenue figures disclosed',
    ],
    epsImpact: {
      direction: 'positive',
      confidence: 'low',
      timeline: 'indirect — market access expansion only',
    },
    tags: ['distribution-expansion', 'us-subsidiary'],
  },
  {
    companyId: 'NSE:KODYTECH',
    name: 'Kody Technolab Limited',
    annIds: ['ld70ubs4fo3i90pbw72fmo76.pdf'],
    category: 'fundraise',
    significance: 'low',
    depth: 'quick',
    headline:
      'Kody Technolab: non-promoter converts 1.4 lakh warrants at Rs 975/share (~Rs 10.24cr tranche)',
    insight:
      'A non-promoter warrant-holder (Nishid Babulal Shah) converted 1,40,000 of a previously-issued batch of convertible warrants into equity at Rs 975/share (including premium), paying the balance 75% exercise price of Rs 731.25/warrant, aggregating ~Rs 10.24cr this tranche. This is a pre-committed, scheduled conversion (not a fresh capital-raise decision) — the high conversion price (Rs975/share) for a small/SME-platform company is a mild positive signal of continued investor conviction, but it is mechanical exercise of existing rights, not new information about the business.',
    thesisChain: [
      'Non-promoter exercises 1.4L warrants at Rs975/share, ~Rs10.24cr this tranche',
      'Pre-committed conversion schedule, not a new capital-raise decision',
      'High conversion price is a mild positive investor-conviction signal',
    ],
    epsImpact: {
      direction: 'mixed',
      confidence: 'low',
      timeline: 'minor dilution, already anticipated from original warrant issuance',
    },
    tags: ['fundraise', 'warrant-conversion', 'non-promoter'],
  },
  {
    companyId: 'NSE:MANBA',
    name: 'Manba Finance Limited',
    annIds: ['7prxjyr04cydqh0nxk2xobb4.pdf'],
    category: 'fundraise',
    significance: 'low',
    depth: 'quick',
    headline: 'Manba Finance allots Rs 60cr secured NCDs at 10.50% coupon (27-month tenure)',
    insight:
      "Manba Finance (vehicle-financing NBFC) allotted 60,000 secured, rated NCDs of Rs 10,000 face value each, aggregating Rs 60cr, at 10.50% coupon, 27-month tenure, secured by a hypothecation of receivables (1.10x cover). Routine on-balance-sheet refinancing for an NBFC's lending book — not a company-specific catalyst.",
    thesisChain: [
      'Rs60cr secured NCD allotment at 10.50%, 27-month tenure',
      'Routine receivables-backed refinancing for NBFC lending book',
    ],
    epsImpact: { direction: 'neutral', confidence: 'low', timeline: 'n/a — routine financing' },
    tags: ['fundraise', 'ncd', 'routine-financing'],
  },
];

async function runInsights() {
  for (const item of INSIGHTS) {
    const note = {
      sourceSkill: SOURCE_SKILL,
      type: 'manual',
      announcementId: item.annIds[0],
      announcementTitle: item.headline,
      pdfUrl: null,
      insight: item.insight,
      headline: item.headline,
      thesisChain: item.thesisChain || [],
      epsImpact: item.epsImpact || null,
      significance: item.significance,
      tags: item.tags || [],
      category: item.category,
      announcementDescription: item.headline,
      usecase: usecase(item.depth),
      modelUsed: MODEL, // NOTE: current cmdAddNote does not persist this field onto the note entry (see report)
    };
    if (item.jCurve) note.jCurve = item.jCurve;
    await WI.cmdAddNote(JSON.stringify({ companyId: item.companyId, name: item.name, note }));
    for (const annId of item.annIds) {
      await WI.cmdMarkProcessed(item.companyId, annId, usecase(item.depth));
    }
  }
}

// ---------- SPECIAL CASE: RNFI — ocrFailed hard stop ----------
const rnfiNote = {
  sourceSkill: SOURCE_SKILL,
  type: 'manual',
  announcementId: 'bx4hzj07exuf5ltdm55xqkrb.pdf',
  announcementTitle: 'General Updates (OCR failed — needs manual review)',
  pdfUrl: null,
  insight:
    'PDF text extraction failed (ocrFailed=true) for this "General Updates" filing from RNFI (Redington/other — company context unavailable since OCR failed). Per routing rules, an OCR failure is a HARD STOP and must never be marked routine. No content could be read to judge materiality. Flagging for manual/human review and for a possible re-fetch or alternate-source read (e.g. exchange website) rather than silently dropping it.',
  headline: 'OCR FAILED — content unreadable, needs manual review before any materiality judgment',
  thesisChain: [
    'PDF OCR failed, zero extractable text',
    'Cannot judge materiality from title alone ("General Updates" is uninformative)',
    'Flagged for manual review / alternate-source fetch',
  ],
  epsImpact: null,
  significance: 'medium', // forced non-routine visibility per hard-stop rule, not a materiality judgment
  tags: ['ocr-failed', 'needs-manual-review', 'hard-stop'],
  category: 'general',
  announcementDescription: 'General Updates',
  usecase: usecase('quick'),
  modelUsed: MODEL,
};
async function runSpecial() {
  await WI.cmdAddNote(JSON.stringify({ companyId: 'NSE:RNFI', name: 'RNFI', note: rnfiNote }));
  await WI.cmdMarkProcessed('NSE:RNFI', 'bx4hzj07exuf5ltdm55xqkrb.pdf', usecase('quick'));
}

(async () => {
  await runRoutine();
  await runInsights();
  await runSpecial();
  console.log(
    JSON.stringify({
      status: 'batch-complete',
      routineCount: ROUTINE.length,
      insightCount: INSIGHTS.length,
      specialCount: 1,
    })
  );
})().catch((err) => {
  console.error('BATCH_FAILED', (err && err.stack) || err);
  process.exit(1);
});
