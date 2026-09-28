// Saves gainers-trigger-research DTOs for the ACT-tier companies researched
// in the 2026-09-25 gainers-signal run (Step 4, per SKILL.md).
const db = require('./packages/jobs-runtime/lib/db.js');

const MODEL = 'claude-sonnet-5';
const DATE = '2026-09-25';

const reports = [
  {
    companyId: 'NSE:WHIRLPOOL',
    research_axis: 'DELIVERY_VALUE',
    tier: 'ACT',
    trigger:
      'Promoter Whirlpool Corp confirmed exploring a full control-transaction stake sale to a third party',
    trigger_quantified:
      'Rs 636 Cr N/A -- corporate action, not a financial figure; board informed 22-Sep 7:17pm IST, more than one counterparty in discussion',
    linkage: 'explained',
    why: {
      text: 'BSE/NSE-mandated rumour clarification (24-Sep-2026) confirms promoter Whirlpool Corp, via Whirlpool Mauritius, is actively exploring a full stake sale to a third-party buyer as a control transaction (board informed 22-Sep, 7:17 PM IST). Not yet a signed deal.',
      basis: 'filing',
      sources: ['BSE/NSE Reg 30(11) rumour clarification, 24-Sep-2026'],
    },
    summary:
      'Promoter Whirlpool Corp confirmed to exchanges (24-Sep) it is exploring a full control-transaction stake sale, following a 17-20% media-driven surge on 23-Sep. Cached rerating-catalysts brief (served, asOf 2026-09-25) separately flags Elica integration and Luxuriem premiumization as the operating EPS thesis.',
    contextUsed: [],
    concallCorroboration: null,
    narrative: {
      thesisChain: [
        '24-Sep BSE/NSE clarification: Whirlpool Mauritius told the board on 22-Sep it continues to explore a third-party sale as a control transaction',
        'Follows a 17-20% media-driven surge on 23-Sep that the company was responding to, not originating',
        'A completed sale would typically trigger a mandatory open offer',
      ],
    },
  },
  {
    companyId: 'NSE:SHANTIGOLD',
    research_axis: 'DELIVERY_VALUE',
    tier: 'ACT',
    trigger: 'Secondary-market purchase of a stake in listed Ratnaveer Precision Engineering',
    trigger_quantified:
      "Rs 8.83 Cr (2,65,000 shares) -- approx 0.35% of Shanti Gold's own Rs 2,499 Cr market cap",
    linkage: 'mismatched',
    why: {
      text: "STRONG-tagged 'acquisition' filing is actually a Rs 8.83 Cr treasury purchase of listed shares in Ratnaveer Precision Engineering -- real, but a scale and character mismatch against a 14.8%/Rs 104 Cr delivery-backed move.",
      basis: 'filing',
      sources: ['BSE Reg 30 disclosure, 26-Sep-2026'],
    },
    summary:
      "Filing tagged as acquisition is a Rs 8.83 Cr treasury purchase of another listed company's shares (Ratnaveer Precision Engineering), not a business acquisition. Modest scale relative to the delivery-backed move.",
    contextUsed: [],
    concallCorroboration: null,
    narrative: {
      thesisChain: [
        'Bought 2,65,000 shares of Ratnaveer Precision Engineering for Rs 8,83,33,245 on the secondary market',
        'Portfolio/treasury investment, not core-business M&A -- no board control implied',
      ],
    },
  },
  {
    companyId: 'NSE:FCL',
    research_axis: 'DELIVERY_VALUE',
    tier: 'ACT',
    trigger: 'New nil-turnover US step-down subsidiary (Fineotex America Inc.) incorporated',
    trigger_quantified:
      'Nil turnover disclosed; Delaware incorporation via existing subsidiary Fineotex Biotex HealthGuard FZE',
    linkage: 'mismatched',
    why: {
      text: "STRONG-tagged 'acquisition' filing is a new nil-turnover US step-down subsidiary incorporation -- genuine geographic expansion move, but small in immediate scale against a 7.9%/Rs 80 Cr delivery-backed move.",
      basis: 'filing',
      sources: ['BSE/NSE Reg 30 disclosure, 24-Sep-2026'],
    },
    summary:
      'Fineotex incorporated a new, nil-turnover US step-down subsidiary -- early-stage market-entry infrastructure, not an immediate revenue or EPS event.',
    contextUsed: [],
    concallCorroboration: null,
    narrative: {
      thesisChain: [
        'Fineotex America Inc. incorporated in Delaware, USA, 24-Sep-2026',
        'Nil turnover -- legal/market-entry setup, not a revenue event yet',
      ],
    },
  },
  {
    companyId: 'NSE:AETHER',
    research_axis: 'DELIVERY_VALUE',
    tier: 'ACT',
    trigger: 'Credit rating upgrade: ICRA A+/A1 to Crisil AA-/A1+',
    trigger_quantified:
      'Rs 636 Cr bank exposure; one-notch-equivalent upgrade on both long- and short-term tenors',
    linkage: 'explained',
    why: {
      text: 'Credit rating upgrade (ICRA A+/A1 to Crisil AA-/A1+) on Rs 636 Cr bank exposure, filed 24-Sep. A real, modest positive, not a scale match for a 7.3%/Rs 67 Cr move on its own.',
      basis: 'filing',
      sources: ['BSE/NSE Reg 30 disclosure, 24-Sep-2026'],
    },
    summary:
      'Genuine credit rating upgrade on Rs 636 Cr of bank facilities -- modest, second-order EPS support via lower financing cost.',
    contextUsed: [],
    concallCorroboration: null,
    narrative: {
      thesisChain: [
        'Crisil assigned AA-/Stable and A1+, replacing prior ICRA A+/A1',
        'Lowers future borrowing cost -- second-order EPS support',
      ],
    },
  },
  {
    companyId: 'NSE:ARTEMISMED',
    research_axis: 'DELIVERY_VALUE',
    tier: 'ACT',
    trigger: 'Credit rating reaffirmed (not upgraded) by CARE Ratings; facility size reduced',
    trigger_quantified:
      'Bank facility reduced Rs 427.90 Cr to Rs 343.15 Cr; rating reaffirmed, not changed',
    linkage: 'mismatched',
    why: {
      text: 'STRONG-tagged filing is a rating reaffirmation (not an upgrade) with a reduced facility size -- routine credit-file housekeeping, not new information that would explain a 7.5%/Rs 57 Cr delivery-backed move.',
      basis: 'classified',
      sources: ['CARE Ratings reaffirmation via BSE/NSE filing, 24-Sep-2026'],
    },
    summary:
      'Rating reaffirmation (not an upgrade) with a reduced bank facility -- routine, does not explain the delivery-backed move on its own.',
    contextUsed: [],
    concallCorroboration: null,
    narrative: {
      thesisChain: [
        'CARE Ratings reaffirmed existing rating 24-Sep',
        'Facility reduced from Rs 427.90 Cr to Rs 343.15 Cr -- mildly deleveraging',
      ],
    },
  },
  {
    companyId: 'NSE:AHCL',
    research_axis: 'DELIVERY_VALUE',
    tier: 'ACT',
    trigger:
      'Nigeria subsidiary incorporated; follow-up disclosure on a share-swap acquisition already approved 5-Sep AGM',
    trigger_quantified:
      'Share-swap acquisition of 44.94% of Apiqo Organics Pvt Ltd and 47.41% of Bizotic Lifescience Pvt Ltd -- approved at 5-Sep AGM, not new this week',
    linkage: 'mismatched',
    why: {
      text: "The large share-swap acquisition (approx 45-47% of two private companies) referenced in this filing was already approved at the 5-Sep AGM; today's filing is a compliance follow-up, not new economic information. The Nigeria subsidiary is genuinely new but small.",
      basis: 'classified',
      sources: ['BSE/NSE Reg 30 disclosures, 21-Sep-2026', 'AGM outcome, 5-Sep-2026'],
    },
    summary:
      'Two real but non-fresh developments: a new small Nigeria subsidiary, and continuing regulatory disclosure on a large share-swap acquisition already approved 5-Sep -- known information, not new.',
    contextUsed: [],
    concallCorroboration: null,
    narrative: {
      thesisChain: [
        'Anlon Healthcare Nigeria Limited incorporated 21-Sep',
        "Share-swap acquisition of Apiqo Organics (44.94%) and Bizotic Lifescience (47.41%) approved 5-Sep AGM -- today's filing responds to BSE/NSE follow-up observations",
      ],
    },
  },
  {
    companyId: 'BSE:TGVSL',
    research_axis: 'DELIVERY_PCT',
    tier: 'ACT',
    trigger: 'Captive solar capacity addition +2.5 MWp; MOA object-clause amendment (routine)',
    trigger_quantified: 'Solar capacity 62.90 -> 65.40 MWp (+4%)',
    linkage: 'mismatched',
    why: {
      text: 'Genuine but incremental: +2.5 MWp captive solar (+4% of existing solar base) filed 23-Sep. Delivery was thin (Rs 7.59 Cr, just above the Rs 5 Cr quality floor) against a 13.9% move -- a low-conviction, thin-float reading.',
      basis: 'filing',
      sources: ['BSE Reg 30 disclosure, 23-Sep-2026'],
    },
    summary:
      'Incremental (+4%) captive solar capacity add for a chlor-alkali producer -- real cost-input positive, but thin delivery makes this a low-conviction read.',
    contextUsed: [],
    concallCorroboration: null,
    narrative: {
      thesisChain: [
        '+2.5 MWp captive solar capacity, 23-Sep',
        'MOA object-clause amendment approved at 26-Sep AGM is routine housekeeping',
      ],
    },
  },
  {
    companyId: 'BSE:EXHICON',
    research_axis: 'DELIVERY_PCT',
    tier: 'ACT',
    trigger: 'JV divests 35% of Mohali Convention Centre subsidiary to India Exposition Mart',
    trigger_quantified:
      'Rs 5.25 lakh cash consideration for 35% of subsidiary developing a Rs 75 Cr project',
    linkage: 'explained',
    why: {
      text: 'JV agreement (signed 21-Sep, press release 24-Sep) transfers 35% of a subsidiary developing a Rs 75 Cr convention-centre project to a strategic partner for nominal cash -- a real, if modest-scale, capital-efficiency move.',
      basis: 'filing',
      sources: ['BSE Reg 30 disclosure, 22-Sep-2026', 'Press release, 24-Sep-2026'],
    },
    summary:
      'JV agreement transferring 35% of the Mohali Convention Centre subsidiary to India Exposition Mart for nominal cash, sharing a Rs 75 Cr project cost -- capital-efficiency story, modest immediate financial scale.',
    contextUsed: [],
    concallCorroboration: null,
    narrative: {
      thesisChain: [
        'JV agreement signed 21-Sep, transferring 35% of Exhicon Mohali Convention Centre Pvt Ltd',
        'Exhicon retains 65% and board control',
        "De-risks a Rs 75 Cr project relative to Exhicon's Rs 852 Cr market cap",
      ],
    },
  },
];

for (const r of reports) {
  const dto = {
    creator: 'gainers-signal',
    type: 'gainers-trigger-research',
    date: DATE,
    companyId: r.companyId,
    modelUsed: MODEL,
    summary: r.summary,
    research_axis: r.research_axis,
    tier: r.tier,
    trigger: r.trigger,
    trigger_quantified: r.trigger_quantified,
    linkage: r.linkage,
    why: r.why,
    contextUsed: r.contextUsed,
    concallCorroboration: r.concallCorroboration,
    narrative: r.narrative,
  };
  const saved = db.saveReport(dto);
  console.log(
    'saved',
    r.companyId,
    saved && saved.id ? saved.id : JSON.stringify(saved).slice(0, 100)
  );
}
console.log('DONE, saved', reports.length, 'research DTOs');
