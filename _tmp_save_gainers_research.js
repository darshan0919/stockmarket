const path = require('path');
const RUNTIME = path.join(__dirname, 'packages/jobs-runtime');
const db = require(path.join(RUNTIME, 'lib/db.js'));

const marketDate = '2026-08-28';
const modelUsed = 'claude-sonnet-5';

const records = [
  {
    companyId: 'BSE:NOVUS', tier: 'WATCH', research_axis: 'DELIVERY_PCT', linkage: 'unexplained',
    summary: 'Novus Loyalty +15.9%, 76% delivery (₹5.5 Cr of ₹7.2 Cr traded) but on tiny absolute value. No filing found (announcements API was down all day — cannot rule out a real filing). Concall from 2 months ago (Optimistic, ₹88 Cr Central Bank win, Dubai subsidiary Q2 launch) is stale corroboration, not a same-week trigger.',
    trigger: 'Unexplained delivery-backed move; nearest available corroboration is a 58-day-old Optimistic concall, too old to credit as the cause.',
    trigger_quantified: null,
    concallCorroboration: { sentiment: 'Optimistic', resultQualityScore: null, guidanceHighlights: ['₹88cr Central Bank win', 'Dubai subsidiary, Q2 launch', 'AI margin uplift unquantified'] },
    contextUsed: [],
  },
  {
    companyId: 'NSE:SIMPLEXINF', tier: 'WATCH', research_axis: 'DELIVERY_PCT', linkage: 'unexplained',
    summary: 'Simplex Infrastructures +7.3%, high 68% delivery (₹10.1 Cr of ₹14.8 Cr traded) — most of the day\'s volume converted to delivery, but on a small base. No filing found and no concall data available. Genuinely unexplained; worth a same-day announcement check once the announcements API recovers.',
    trigger: 'No discoverable trigger.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'BSE:CHANDRIMA', tier: 'WATCH', research_axis: 'DELIVERY_PCT', linkage: 'unexplained',
    summary: 'Chandrima Mercantiles +10%, 67% delivery on very small value (₹6 Cr) and small market cap (₹448 Cr). Stock is still 72% below its 65-day high despite the move (window high ₹47.5 vs close ₹13.5) — this looks like a bounce off a beaten-down base rather than a fresh catalyst. No filing found.',
    trigger: 'No discoverable trigger; move reads as a bounce off depressed levels.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'BSE:YASHHV', tier: 'WATCH', research_axis: 'DELIVERY_PCT', linkage: 'unexplained',
    summary: 'Yash Highvoltage +7.2%, 60% delivery (₹9.5 Cr of ₹15.7 Cr traded). No filing found, no concall data. Clean but unexplained delivery-backed move.',
    trigger: 'No discoverable trigger.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'NSE:KAPSTON', tier: 'WATCH', research_axis: 'DELIVERY_PCT', linkage: 'unexplained',
    summary: 'Kapston Services +11.6%, 59% delivery (₹7.6 Cr of ₹13 Cr traded) on modest volume (2.6x spike, lowest of this batch). No filing, no concall data. Would confirm/kill with a look at exchange bulk-deal data once available.',
    trigger: 'No discoverable trigger.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'NSE:MACPOWER', tier: 'WATCH', research_axis: 'DELIVERY_PCT', linkage: 'unexplained',
    summary: 'Macpower CNC +7.4%, 50% delivery (₹10.4 Cr of ₹20.6 Cr traded). Announcements API was down, but the Q1 FY27 concall (filed 31 days before this move — outside the 7-day corroboration window, though flagged by the classifier) shows genuinely strong fundamentals: record quarter (revenue ₹95.2 Cr +56.6% YoY, EBITDA ₹15.4 Cr +95% YoY margin 16.2%, PAT ₹9.6 Cr +110% YoY margin 10.1%), order book ₹456 Cr (+32% YoY, Nexa series ~40% of it), and a large capex commitment (13-acre "Green Zone" facility, 30-year lease, backward integration from 40-45% to 80% component manufacturing). This is real, but 31 days old — it explains why the stock could be in a Stage 2 uptrend, not why it moved today specifically. Treat as background support, not a same-day trigger.',
    trigger: 'No same-day trigger found; underlying fundamentals (record Q1 FY27, ₹456 Cr order book) support the broader uptrend but do not explain today\'s specific move.',
    trigger_quantified: 'Order book ₹456 Cr (+32% YoY); Q1 FY27 PAT ₹9.6 Cr (+110% YoY)',
    concallCorroboration: { sentiment: 'Optimistic', resultQualityScore: 83.7, guidanceHighlights: ['FY27 revenue guidance 30%+', '₹50cr assembly plant expansion', '4–6% price hike implemented', 'Order book ₹456 Cr, +32% YoY', 'Q1 FY27 record revenue/EBITDA/PAT'] },
    contextUsed: [],
  },
  {
    companyId: 'NSE:UNIPARTS', tier: 'WATCH', research_axis: 'DELIVERY_PCT', linkage: 'unexplained',
    summary: 'Uniparts India +8%, 43% delivery (₹17 Cr of ₹40 Cr traded). No same-day filing found. Concall from 25 days ago (Optimistic, resultQualityScore 76.9) flagged raised FY27 revenue guidance and 25% EBITDA margin with 55% YoY EBITDA growth, plus 6 undisclosed M&A targets under evaluation — real positive background but outside the 7-day window, so not a same-day cause.',
    trigger: 'No same-day trigger found; 25-day-old raised guidance is supportive background only.',
    trigger_quantified: 'EBITDA margin 25%, +55% YoY (per 25-day-old concall)',
    concallCorroboration: { sentiment: 'Optimistic', resultQualityScore: 76.9, guidanceHighlights: ['FY27 revenue growth guidance raised', 'EBITDA margin 25%, 55% YoY growth', 'M&A timeline undisclosed, 6 targets evaluated'] },
    contextUsed: [],
  },
  {
    companyId: 'NSE:MARINE', tier: 'WATCH', research_axis: 'DELIVERY_PCT', linkage: 'unexplained',
    summary: 'Marine Electricals +8.7%, 40% delivery (₹41.4 Cr of ₹103.3 Cr traded) — sizeable absolute value. No filing found, no concall data. Stock at a fresh 52-week high; worth a bulk-deal check.',
    trigger: 'No discoverable trigger; move at a fresh 52-week high with meaningful delivery value.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'NSE:EBGNG', tier: 'WATCH', research_axis: 'DELIVERY_PCT', linkage: 'unexplained',
    summary: 'GNG Electronics (Electronics Bazaar) +9.45%, 39% delivery (₹32.7 Cr of ₹83.7 Cr traded). No same-day filing found, but the Q1 FY27 concall (29 days old, Optimistic, resultQualityScore 78.5) laid out a strong structural thesis: refurbished-PC demand accelerating on new-hardware inflation (8GB DDR5 up 5x since Oct 2025; entry laptop price ₹40k→₹48k), FY27 revenue guidance of 30% growth, net PAT margin target 0.75-1%, and a 60,000-unit deal win with a US bank. Real, but the concall predates this move by a month — background support, not a same-day cause.',
    trigger: 'No same-day trigger found; 29-day-old bullish concall (refurb-PC inflation thesis) is supportive background only.',
    trigger_quantified: 'FY27 revenue guidance +30%; 60,000-unit US bank deal win',
    concallCorroboration: { sentiment: 'Optimistic', resultQualityScore: 78.5, guidanceHighlights: ['FY27 revenue guidance 30%', 'Net PAT margin 0.75%-1%', 'US bank 60,000-unit deal win', 'Refurbished-PC demand accelerating on component inflation (8GB DDR5 5x since Oct-25)'] },
    contextUsed: [],
  },
  {
    companyId: 'NSE:JUSTDIAL', tier: 'NOTED', research_axis: 'DELIVERY_PCT', linkage: 'unexplained',
    summary: 'Just Dial +10%, 35% delivery on modest value (₹18.3 Cr). No filing, no concall data. NOTED tier — logged only.',
    trigger: 'No discoverable trigger.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'NSE:ATHERENERG', tier: 'WATCH', research_axis: 'DELIVERY_VALUE', linkage: 'unexplained',
    summary: 'Ather Energy +8.1%, largest absolute delivery in this batch: ₹441.3 Cr of ₹2,314 Cr traded (19% delivery). Fresh 52-week high. No same-day filing found. Concall 27 days ago (Neutral tone) reported first-ever positive EBITDA and a ₹2,500 Cr capacity-expansion fundraise, but flagged 300bps margin compression from commodity headwinds — mixed, not a clean bull case, and too old to be today\'s cause.',
    trigger: 'No same-day trigger found; large absolute delivery value at a 52-week high is the headline fact.',
    trigger_quantified: 'Delivery ₹441 Cr on ₹2,314 Cr traded',
    concallCorroboration: { sentiment: 'Neutral', resultQualityScore: 75.1, guidanceHighlights: ['First-ever positive EBITDA achieved', '₹2,500cr fundraise for capacity expansion', 'Commodity headwinds → 300bps margin compression'] },
    contextUsed: [],
  },
  {
    companyId: 'NSE:LALITHAA', tier: 'WATCH', research_axis: 'DELIVERY_VALUE', linkage: 'unexplained',
    summary: 'Lalithaa Jewellery +7.7%, ₹190.6 Cr delivered of ₹632.9 Cr traded (30% delivery) — second-largest absolute delivery value in this batch, on below-average volume (0.63x, i.e. no volume spike at all despite the price move). No filing, no concall data. The lack of a volume spike alongside high delivery is unusual and worth flagging rather than smoothing over — suggests steady accumulation rather than a news-driven pop.',
    trigger: 'No discoverable trigger; unusual combination of high delivery value with below-average volume suggests steady accumulation, not a news event.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'NSE:TEJASNET', tier: 'WATCH', research_axis: 'DELIVERY_VALUE', linkage: 'unexplained',
    summary: 'Tejas Networks +7.6%, ₹173.2 Cr delivered of ₹2,418.8 Cr traded (7.2% delivery — high absolute value but low percentage, still below its 60-day MA). No same-day filing found. Concall 33 days ago (Optimistic, resultQualityScore 76.7) cited first international 5G shipments and an imminent BSNL 26k-site expansion, but also flagged a 12-18 month profitability timeline — real but stale and not unambiguously bullish.',
    trigger: 'No same-day trigger found; large absolute delivery value with mixed older concall commentary as background only.',
    trigger_quantified: 'Delivery ₹173 Cr on ₹2,419 Cr traded',
    concallCorroboration: { sentiment: 'Optimistic', resultQualityScore: 76.7, guidanceHighlights: ['First international 5G shipments', 'BSNL 26k-site expansion imminent', '12-18 month profitability timeline'] },
    contextUsed: [],
  },
  {
    companyId: 'NSE:FMGOETZE', tier: 'WATCH', research_axis: 'DELIVERY_VALUE', linkage: 'unexplained',
    summary: 'Federal-Mogul Goetze +10.4%, ₹143.5 Cr delivered of ₹1,082.3 Cr traded (13.3% delivery), fresh 52-week high. No filing, no concall data. Sizeable, clean, unexplained.',
    trigger: 'No discoverable trigger.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'NSE:MOREPENLAB', tier: 'WATCH', research_axis: 'DELIVERY_VALUE', linkage: 'unexplained',
    summary: 'Morepen Laboratories +9.8%, ₹121.9 Cr delivered of ₹400.4 Cr traded (30.4% delivery — both axes strong), at a fresh 52-week high, though volume ratio (1.15x) shows no real spike, meaning this is broad steady buying rather than a single-day event. No filing, no concall data.',
    trigger: 'No discoverable trigger; strong delivery on both axes without a volume spike suggests sustained accumulation.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'NSE:MVELECTRO', tier: 'WATCH', research_axis: 'DELIVERY_VALUE', linkage: 'unexplained',
    summary: 'MV Electrosystems +11.25%, ₹105.3 Cr delivered of ₹2,037.3 Cr traded (5.2% delivery). No same-day filing found, but the concall is the freshest in this whole batch — filed just 3 days before this move (Optimistic, resultQualityScore only 21.6 — a weak score despite the Optimistic label, worth flagging as a mismatch). Highlights: production ramp to 40 units/month from January, 10%+ PAT margin target, but EMU approval still 15-16 months away. The low resultQualityScore against an "Optimistic" tag is the kind of API-label vs substance mismatch this skill is supposed to catch — treat the sentiment tag with some skepticism here.',
    trigger: 'Freshest concall in the batch (3 days old) is directionally supportive but has an unusually low resultQualityScore (21.6) for an "Optimistic" label — flagged as a possible sentiment/substance mismatch, not a confirmed trigger.',
    trigger_quantified: 'Production ramp to 40 units/month from January; PAT margin target 10%+',
    concallCorroboration: { sentiment: 'Optimistic', resultQualityScore: 21.6, guidanceHighlights: ['Production ramp 40/month, January', '10%+ PAT margin target', 'EMU approval 15-16 months away'] },
    contextUsed: [],
  },
  {
    companyId: 'NSE:NEWGEN', tier: 'WATCH', research_axis: 'DELIVERY_VALUE', linkage: 'unexplained',
    summary: 'Newgen Software +8.4%, ₹90.8 Cr delivered of ₹588.7 Cr traded (15.4% delivery) on a strong 13.65x volume spike. No same-day filing found. Concall 45 days ago (Optimistic, resultQualityScore 52) noted insurance/healthcare revenue +58% but implementation revenue down 23%, and a board evaluating a share buyback — mixed and stale, not a same-day cause.',
    trigger: 'No same-day trigger found; strong volume spike with no discoverable news is the notable fact.',
    trigger_quantified: null,
    concallCorroboration: { sentiment: 'Optimistic', resultQualityScore: 52, guidanceHighlights: ['Insurance & healthcare revenue +58%', 'Implementation revenue down 23%', 'Board evaluating share buyback'] },
    contextUsed: [],
  },
  {
    companyId: 'NSE:NSLNISP', tier: 'WATCH', research_axis: 'DELIVERY_VALUE', linkage: 'unexplained',
    summary: 'NMDC Steel +9%, ₹74 Cr delivered of ₹274.3 Cr traded (27% delivery). No filing, no concall data.',
    trigger: 'No discoverable trigger.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'NSE:PRECWIRE', tier: 'WATCH', research_axis: 'DELIVERY_VALUE', linkage: 'unexplained',
    summary: 'Precision Wires India +20% (largest mover in the whole gainers list), ₹66.4 Cr delivered of ₹416.1 Cr traded (16% delivery), fresh 52-week high, 9.5x volume spike. No filing found and no concall data — this is the single most notable "unexplained" name in today\'s run given the size of the move; worth a same-day announcement check once the API recovers, and a bulk-deal check.',
    trigger: 'No discoverable trigger despite being the day\'s largest gainer — flagged as the top priority to re-check once the announcements API recovers.', trigger_quantified: null, concallCorroboration: null, contextUsed: [],
  },
  {
    companyId: 'NSE:MASTEK', tier: 'WATCH', research_axis: 'DELIVERY_VALUE', linkage: 'unexplained',
    summary: 'Mastek +18%, ₹65 Cr delivered of ₹1,002.9 Cr traded (6.5% delivery) but an extreme 73.7x volume spike, fresh 52-week high. No same-day filing found. Concall 39 days ago (Neutral) cited a $25mn Salesforce AI deal but also Middle East geopolitical pushouts and a ₹123.5 Cr tax assessment appeal — mixed, and stale.',
    trigger: 'No same-day trigger found; extreme volume spike (73.7x) with no discoverable news is the standout fact.',
    trigger_quantified: null,
    concallCorroboration: { sentiment: 'Neutral', resultQualityScore: 51.1, guidanceHighlights: ['$25mn Salesforce AI deal', 'Middle East geopolitical pushouts', '₹123.5cr tax assessment appeal'] },
    contextUsed: [],
  },
];

(async () => {
  let ok = 0, fail = 0;
  for (const r of records) {
    try {
      db.saveReport({
        creator: 'gainers-signal',
        type: 'gainers-trigger-research',
        date: marketDate,
        companyId: r.companyId,
        modelUsed,
        summary: r.summary,
        research_axis: r.research_axis,
        tier: r.tier,
        trigger: r.trigger,
        trigger_quantified: r.trigger_quantified,
        linkage: r.linkage,
        contextUsed: r.contextUsed,
        concallCorroboration: r.concallCorroboration,
      });
      ok++;
    } catch (e) {
      console.error('FAILED', r.companyId, e.message);
      fail++;
    }
  }
  console.log(`Saved ${ok} reports, ${fail} failures`);
})();
