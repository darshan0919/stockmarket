'use strict';
const db = require('./lib/db');

const MODEL = 'claude-sonnet-5';
const DATE = '2026-08-28';

function cc(nt, concall) {
  if (!nt || !concall) return null;
  return {
    sentiment: concall.sentiment,
    resultQualityScore: concall.resultQualityScore,
    guidanceHighlights: concall.highlights || [],
  };
}

const records = [
  {
    companyId: 'BSE:KALIND',
    tier: 'ACT',
    research_axis: 'DELIVERY_PCT',
    summary:
      'Kalind Ltd +4.76% on 66% delivery (₹8.4 Cr of ₹12.7 Cr traded, 13.4x volume). Board approved a preferential warrant issue of 27.48 Cr warrants at ₹11.50/warrant (₹316.02 Cr aggregate) to public non-promoter allottees, convertible within 18 months; also re-appointed statutory auditors and called the AGM for Sep 29, 2026.',
    trigger: 'Preferential warrant issue (fundraise) approved same-day at board meeting.',
    trigger_quantified:
      '27,48,00,000 warrants at ₹11.50/warrant = ₹316.02 Cr aggregate raise to public/non-promoter category, convertible into equity within 18 months of allotment; relevant date Aug 28, 2026. Both PDFs read were duplicate filings of the same board outcome — no separate new information in the second.',
    linkage: 'explained',
    contextUsed: [],
    concallCorroboration: null,
  },
  {
    companyId: 'NSE:KPITTECH',
    tier: 'ACT',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'KPIT Technologies +3.64% on 27.9% delivery (₹95.5 Cr of ₹342.1 Cr traded, 3.1x volume). The "order_book"-tagged strong filing is actually a stamp-duty penalty disclosure (₹1.23 Cr) tied to the Birlasoft demerger scheme — not an order win; category tag is a mismatch. Concall 32 days old was Cautious (resultQualityScore 29): revenue -3.6% QoQ, first-ever wage delay, top-2-client revenue shock, Q4 turnaround guided.',
    trigger:
      'Delivery-backed move with no corroborating positive announcement; filing category mislabeled.',
    trigger_quantified:
      'Only "strong" filing: Collector of Stamps penalty of ₹1,23,14,040 on KPIT + Birlasoft for a 4-day delay in lodging the NCLT demerger order (received Aug 26, 2026) — immaterial and not order-related despite the order_book category tag. No fresh order win disclosed. Underlying concall (Jul 29) was Cautious with a wage delay and client concentration shock flagged.',
    linkage: 'mismatched',
    contextUsed: [],
    concallCorroboration: null,
  },
  {
    companyId: 'NSE:ATHERENERG',
    tier: 'ACT',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Ather Energy +8.09% at 52-week high on 19.1% delivery but massive absolute value (₹441.3 Cr of ₹2,314.2 Cr traded, 3.3x volume, RSI 73 overbought). Board approved allotment of preferential securities: 16,26,016 equity shares at ₹1,230/share (~₹200 Cr) and 79,36,507 convertible warrants at ₹1,260/warrant (~₹1,000 Cr) — combined ~₹1,200 Cr capital raise to anonymous/institutional allottees including India Japan Equity Fund. Concall (27d old) was Neutral: first-ever positive EBITDA, but commodity headwinds compressed AGM 300bps.',
    trigger:
      'Large preferential allotment (equity + warrants) completed same-week as EGM approval, confirming a large capital raise.',
    trigger_quantified:
      '16,26,016 equity shares @ ₹1,230 (≈₹199.99 Cr) + 79,36,507 convertible warrants @ ₹1,260 (≈₹999.99 Cr) = ~₹1,200 Cr preferential allotment approved Aug 25, 2026, following EGM approval Aug 14, 2026; only 25% of warrant price paid upfront, balance at conversion (within 18 months). Concall corroboration: first-ever positive EBITDA quarter plus a ₹2,500 Cr fundraise-for-capacity narrative already flagged pre-move — this raise executes that plan, so the move is a "known" catalyst crystallizing, not a surprise.',
    linkage: 'explained',
    contextUsed: [],
    concallCorroboration: null,
  },
  {
    companyId: 'NSE:PRECWIRE',
    tier: 'ACT',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Precision Wires India +20% (upper circuit) on 15.9% delivery (₹66.4 Cr of ₹416.1 Cr traded, 9.5x volume, 52-week high breakout). The strong filing read is a boilerplate compliance confirmation tied to the preferential issue first disclosed Aug 12 and Aug 21, 2026 — it contains no new size/pricing figures, just a confirmation that proceeds will comply with NSE circular NSE/CML/2022/56. A separate "Clarification on Spurt in Volume" filing exists but was not in the strong-filing list.',
    trigger:
      'Follow-up compliance filing on an already-disclosed preferential issue; underlying deal terms not in this PDF.',
    trigger_quantified:
      'No new quantified terms in the read filing — it references but does not restate the preferential issue size from the Aug 12/21 filings. The +20% circuit with 9.5x volume is therefore only partially explained by this filing; the "Clarification on Spurt in Volume" announcement (not read, per STRONG-only budget) likely carries the actual explanation and should be prioritized in a follow-up pass.',
    linkage: 'mismatched',
    contextUsed: [],
    concallCorroboration: null,
  },
  {
    companyId: 'NSE:TEJASNET',
    tier: 'ACT',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Tejas Networks +7.63% on low 7.2% delivery but huge value (₹173.2 Cr of ₹2,418.8 Cr traded, 39.1x volume spike — extreme). Received a Letter of Intent from TCS for BSNL 4G RAN equipment across 18,685 sites valued at ₹1,537 Cr; detailed PO to follow. Concall 33d old was Optimistic (resultQualityScore 76.7): first international 5G shipments, BSNL 26k-site expansion flagged as imminent, but 12-18 month profitability timeline.',
    trigger:
      'Letter of Intent confirming a large BSNL 4G order via TCS, directly corroborating concall guidance.',
    trigger_quantified:
      'LOI from TCS dated Aug 27, 2026 for RAN equipment/installation across 18,685 BSNL 4G sites, valued at ₹1,537 Cr — this is a partial realization of the ~26,000-site BSNL expansion flagged as "imminent" in the Jul 28 concall (25d prior), so the move is a known catalyst materializing rather than a surprise. 39.1x volume spike is the largest in this batch. Novelty check flagged this as a follow-up to a prior disclosure (score 1.0), consistent with staged order confirmation.',
    linkage: 'explained',
    contextUsed: [],
    concallCorroboration: cc(true, {
      sentiment: 'Optimistic',
      resultQualityScore: 76.7,
      highlights: [
        'First international 5G shipments',
        'BSNL 26k-site expansion imminent — now partially confirmed via ₹1,537 Cr TCS LOI for 18,685 sites',
        '12–18 month profitability timeline',
      ],
    }),
  },
  {
    companyId: 'NSE:MVELECTRO',
    tier: 'ACT',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'MV Electrosystems +11.25% on low 5.2% delivery but large value (₹105.3 Cr of ₹2,037.3 Cr traded, 7.1x volume). Category tag "management_change" is a mismatch: the PDF read is the routine Aug 25 board meeting outcome (Q1FY27 unaudited results, secretarial/internal auditor appointments, AGM notice for Sep 29) — it does not contain the change-in-management disclosure itself, which is a separate filing not in the strong list. Concall from Aug 27 (only 3 days old) was Optimistic, resultQualityScore just 21.6: production ramp to 40/month by January, 10%+ PAT margin target, EMU approval 15-16 months away.',
    trigger:
      'Delivery-backed move around a fresh, very recent Optimistic concall plus routine board outcome; the actual management-change filing driving the category tag was not captured in this PDF.',
    trigger_quantified:
      'Q1FY26 (Jun 30, 2026) unaudited revenue from operations ₹127.7 Mn (~₹12.8 Cr) per the board outcome filing. Concall corroboration (3 days old, Optimistic, resultQualityScore only 21.6 — a low score despite the bullish label, worth flagging as a tone/score mismatch): production ramp target 40 units/month by January and 10%+ PAT margin target, but EMU regulatory approval still 15-16 months out. The named "management change" driver could not be verified from the PDF actually fetched — recommend re-pulling the specific Change-in-Management filing before citing it as the trigger.',
    linkage: 'mismatched',
    contextUsed: [],
    concallCorroboration: cc(true, {
      sentiment: 'Optimistic',
      resultQualityScore: 21.6,
      highlights: [
        'Production ramp to 40/month by January',
        '10%+ PAT margin target',
        'EMU approval still 15-16 months away',
      ],
    }),
  },
  {
    companyId: 'NSE:MANINFRA',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Man Infraconstruction +6.37% at 52-week high on 42.9% delivery (₹38.4 Cr of ₹89.5 Cr traded, 3.0x volume, RSI 71 overbought). No STRONG-filing PDF was read (announcements_to_read empty) — evidence shows a buyback board-meeting intimation, an investor-meet transcript/outcome, and an AGM postal-ballot notice, but these were classified as supporting-only. Concall just 9 days old was Bullish (resultQualityScore 63.7).',
    trigger:
      'Unexplained delivery-backed move; buyback intimation and a very recent Bullish concall are the closest corroborating context.',
    trigger_quantified:
      'No PDF read (empty strong-filing list) — per protocol, no fabricated narrative. Delivery facts: 42.9% delivery, ₹38.4 Cr on a single-day streak, RSI 71 overbought, fresh 52-week high. Concall corroboration (9d old, Bullish, resultQualityScore 63.7): ₹6,600 Cr GDV launch pipeline, ₹3,000 Cr three-year cash generation guided, Tardeo 2.0 launch pulled forward — a live buyback board intimation sits alongside this bullish guidance. What would confirm the thesis: an actual buyback announcement with price/size; what would kill it: the move fading without a buyback follow-through filing.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: cc(true, {
      sentiment: 'Bullish',
      resultQualityScore: 63.7,
      highlights: [
        '₹6,600cr GDV launch pipeline',
        '₹3,000cr three-year cash generation guided',
        'Tardeo 2.0 launch pulled forward',
      ],
    }),
  },
  {
    companyId: 'NSE:NAZARA',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Nazara Technologies +5.67% at 52-week high on 40.7% delivery (₹121.3 Cr of ₹298.3 Cr traded, 2.7x volume, RSI 74 overbought). No STRONG-filing PDF read — only an EGM outcome and a generic Reg 30 disclosure in supporting list. Concall 26d old was Optimistic (resultQualityScore only 18.2 — low despite the label).',
    trigger:
      'Unexplained delivery-backed move at a 52-week high; EGM outcome and prior M&A guidance are the closest context.',
    trigger_quantified:
      'No PDF read (empty strong-filing list). Delivery facts: 40.7% delivery, ₹121.3 Cr on a single-day streak, fresh 52-week high, RSI 74 overbought. Concall corroboration (26d old, Optimistic, resultQualityScore 18.2 — a tone/score mismatch worth flagging, label says Optimistic but the quality score is weak): Moonshine investment fully written off, $303mn Bluetile all-cash acquisition, Raymond Stauffer appointed Group CEO. What would confirm: EGM outcome details revealing a corporate-action specifics tied to the Bluetile deal; what would kill it: the move being pure momentum with no EGM substance.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: cc(true, {
      sentiment: 'Optimistic',
      resultQualityScore: 18.2,
      highlights: [
        'Moonshine investment fully written off',
        '$303mn Bluetile all-cash acquisition',
        'Raymond Stauffer appointed Group CEO',
      ],
    }),
  },
  {
    companyId: 'NSE:JTLIND',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'JTL Industries +8.84% at 52-week high on 32.6% delivery (₹53.4 Cr of ₹164.0 Cr traded, 6.6x volume, RSI 75 overbought). No STRONG-filing PDF read — investor-meet intimation and a press release are supporting-only. Concall 25d old was Optimistic (resultQualityScore 80.3, the strongest in this batch).',
    trigger: 'Unexplained delivery-backed move corroborated by a high-quality Optimistic concall.',
    trigger_quantified:
      'No PDF read (empty strong-filing list). Delivery facts: 32.6% delivery, ₹53.4 Cr, fresh 52-week high, RSI 75 overbought, novelty check found 1 genuinely new item (not a follow-up). Concall corroboration (25d old, Optimistic, resultQualityScore 80.3): record volume/revenue/EBITDA, but defence revenue guidance was cut, and primary-secondary spread guided at ₹8-12/kg. What would confirm the thesis: a follow-up order/press-release filing with volume/pricing specifics; what would kill it: the spread compressing below the guided range.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: cc(true, {
      sentiment: 'Optimistic',
      resultQualityScore: 80.3,
      highlights: [
        'Record volume, revenue, EBITDA',
        'Defence revenue guidance cut',
        'Primary-secondary spread guided ₹8–12/kg',
      ],
    }),
  },
  {
    companyId: 'NSE:EXICOM',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Exicom Tele-Systems +7.55% on 30.9% delivery (₹27.4 Cr of ₹88.5 Cr traded, 4.0x volume). No STRONG-filing PDF read — annual report dispatch and AGM notice are routine/supporting only. Concall 20d old was Neutral (resultQualityScore 67.3).',
    trigger: 'Unexplained delivery-backed move; only routine AR/AGM filings on record.',
    trigger_quantified:
      'No PDF read (empty strong-filing list — AR dispatch and AGM notice are routine, not causative). Delivery facts: 30.9% delivery, ₹27.4 Cr, 4.0x volume spike. Concall context (20d old, Neutral, resultQualityScore 67.3, no needs_transcript_research flag so no forced transcript pull): Hyderabad plant commissioned at 3x capacity, but consolidated EBITDA loss of ₹22.5 Cr; Tritium bookings at $21mn (2x growth) is the standout positive. What would confirm: a follow-up order or capacity-utilization filing; what would kill it: the EBITDA loss widening next quarter.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: null,
  },
  {
    companyId: 'NSE:SYNCOMF',
    tier: 'WATCH',
    research_axis: 'DELIVERY_PCT',
    summary:
      'Syncom Formulations +12.23% on 22.7% delivery (₹25.2 Cr of ₹110.8 Cr traded, 7.0x volume, RSI 81 heavily overbought). No announcements and no concall data at all.',
    trigger: 'Unexplained delivery-backed move with no corroborating filings or concall.',
    trigger_quantified:
      'No PDF, no concall. Delivery facts: 22.7% delivery, ₹25.2 Cr delivered, 7.0x volume spike, RSI 81 (deeply overbought) — the streak is only 1 day. What would confirm the thesis: any forthcoming corporate announcement in the next 1-2 sessions; what would kill it: the move being pure speculative churn given the overbought RSI with zero fundamental backing so far.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: null,
  },
  {
    companyId: 'NSE:NEWGEN',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Newgen Software +8.43% on 15.4% delivery (₹90.8 Cr of ₹588.7 Cr traded, 13.7x volume spike). No STRONG-filing PDF read — only an investor-meet intimation (supporting-only). Concall 45d old was Optimistic (resultQualityScore 52).',
    trigger:
      'Unexplained delivery-backed move corroborated by dated but Optimistic concall commentary.',
    trigger_quantified:
      'No PDF read (empty strong-filing list). Delivery facts: 15.4% delivery, ₹90.8 Cr, 13.7x volume spike — one of the largest volume multiples in this batch. Concall corroboration (45d old — older than most in this batch, Optimistic, resultQualityScore 52, middling): Insurance & healthcare revenue +58%, but implementation revenue down 23%; board evaluating a share buyback. What would confirm: a buyback board resolution filing; what would kill it: the move being unrelated momentum given the concall is 45 days stale.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: cc(true, {
      sentiment: 'Optimistic',
      resultQualityScore: 52,
      highlights: [
        'Insurance & healthcare revenue +58%',
        'Implementation revenue down 23%',
        'Board evaluating share buyback',
      ],
    }),
  },
  {
    companyId: 'NSE:MASTEK',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Mastek +17.98% at 52-week high on low 6.5% delivery but huge volume spike (₹65.0 Cr of ₹1,002.9 Cr traded, 73.7x volume — the highest multiple in this batch). No STRONG-filing PDF read — an investor-meet intimation and its own cancellation are supporting-only. Concall 39d old was Neutral (resultQualityScore 51.1).',
    trigger:
      'Unexplained, low-delivery, extreme-volume move; investor-meet was intimated then cancelled, an odd combination worth flagging.',
    trigger_quantified:
      'No PDF read (empty strong-filing list). Delivery facts: only 6.5% delivery against ₹1,002.9 Cr traded value — a low-conviction, high-churn profile despite the 52-week-high breakout, and 73.7x volume spike is extreme. Concall corroboration (39d old, Neutral, resultQualityScore 51.1): a $25mn Salesforce AI deal is the highlight, offset by Middle East geopolitical pushouts and a ₹123.5 Cr tax assessment under appeal. The investor-meet cancellation alongside an intimation is a minor governance-process flag. What would confirm: a genuine new order/deal filing; what would kill it: the move being intraday-churn/speculative given the low delivery ratio.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: null,
  },
  {
    companyId: 'NSE:JGCHEM',
    tier: 'WATCH',
    research_axis: 'DELIVERY_PCT',
    summary:
      'JG Chemicals +11.24% on 9.4% delivery (₹36.4 Cr of ₹387.9 Cr traded, 5.9x volume). No announcements filed. Concall 20d old was Optimistic (resultQualityScore 73.7).',
    trigger: 'Unexplained delivery-backed move corroborated by a strong recent concall.',
    trigger_quantified:
      'No PDF, no filings at all. Delivery facts: only 9.4% delivery against ₹387.9 Cr traded — a low-conviction ratio despite the move. Concall corroboration (20d old, Optimistic, resultQualityScore 73.7 — solid): record quarterly revenue/EBITDA/PAT, Lab Pure and JDZRA product launches, but Dahej Phase 1 capacity delayed to Q3. What would confirm: a fresh order or capacity-commissioning filing; what would kill it: the low delivery ratio meaning this is speculative churn rather than accumulation.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: cc(true, {
      sentiment: 'Optimistic',
      resultQualityScore: 73.7,
      highlights: [
        'Record quarterly revenue, EBITDA, PAT',
        'Dahej Phase 1 capacity delayed to Q3',
        'Lab Pure and JDZRA products launched',
      ],
    }),
  },
  {
    companyId: 'NSE:OMAXE',
    tier: 'WATCH',
    research_axis: 'DELIVERY_PCT',
    summary:
      'Omaxe +16.19% at 52-week high on low 6.8% delivery (₹21.4 Cr of ₹317.4 Cr traded, 7.0x volume, RSI 81 heavily overbought). No announcements and no concall.',
    trigger: 'Unexplained, low-delivery move with no corroborating filings or concall.',
    trigger_quantified:
      'No PDF, no concall. Delivery facts: only 6.8% delivery against ₹317.4 Cr traded — low conviction despite the 52-week-high breakout, RSI 81 deeply overbought. What would confirm the thesis: any forthcoming project launch or debt-resolution filing (a known thematic driver for this name in real estate); what would kill it: the move fading without a filing given the thin delivery support.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: null,
  },
  {
    companyId: 'NSE:INFOBEAN',
    tier: 'WATCH',
    research_axis: 'DELIVERY_PCT',
    summary:
      'InfoBeans Technologies +7.13% on 13.2% delivery (₹20.1 Cr of ₹152.0 Cr traded, 42.3x volume — a very extreme spike). No announcements filed. Concall 39d old was Neutral (resultQualityScore 61).',
    trigger:
      'Unexplained, extreme-volume move with thin delivery support; concall management declined to guide FY27 revenue.',
    trigger_quantified:
      'No PDF, no filings. Delivery facts: 13.2% delivery, ₹20.1 Cr, but a 42.3x volume spike — the second-highest multiple in this batch — against thin delivery is a speculative-churn signature. Concall corroboration (39d old, Neutral, resultQualityScore 61): AI revenue +43% for a sixth consecutive quarter of growth, but management explicitly declined FY27 revenue guidance and AI/sales investment compressed EBITDA to 23%. What would confirm: a fresh order or contract-win filing; what would kill it: the extreme volume being pure momentum given zero delivery-backed conviction and no fresh filing.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: null,
  },
  {
    companyId: 'NSE:EXIDEIND',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Exide Industries +1.56% (mild move) on 40.2% delivery (₹108.9 Cr of ₹271.1 Cr traded) — high delivery ratio but small price move. No STRONG-filing PDF (empty list). Concall 27d old was Cautious (resultQualityScore 63).',
    trigger: 'High-delivery but small-magnitude move with no corroborating fresh filing.',
    trigger_quantified:
      'No PDF read (empty strong-filing list). Delivery facts: 40.2% delivery is high-conviction relative to the modest +1.56% price move — accumulation without a matching price pop. Concall context (27d old, Cautious, resultQualityScore 63): Li-ion cell samples delivered, but the Hyundai/Kia co-investment is delayed; solar revenue hit a record ₹400 Cr. What would confirm: a follow-up filing on the delayed co-investment status; what would kill it: continued delays feeding into weaker next-quarter guidance.',
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: null,
  },
];

(async () => {
  const results = [];
  for (const r of records) {
    const dto = {
      creator: 'volume-rocketing',
      type: 'volume-rocketing-trigger-research',
      date: DATE,
      companyId: r.companyId,
      modelUsed: MODEL,
      summary: r.summary,
      research_axis: r.research_axis,
      tier: r.tier,
      trigger: r.trigger,
      trigger_quantified: r.trigger_quantified,
      linkage: r.linkage,
      contextUsed: r.contextUsed || [],
      concallCorroboration: r.concallCorroboration || null,
    };
    const saved = db.saveReport(dto);
    results.push({ companyId: r.companyId, id: saved.id || saved });
  }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
