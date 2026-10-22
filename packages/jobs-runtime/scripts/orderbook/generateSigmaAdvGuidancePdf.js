'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../../lib/db');
const { wrapHtml, renderPdf } = require('../../../../stock-api/src/utils/pdfRenderer');

async function renderGuidancePdf() {
  const COMPANY_ID = 'NSE:SIGMAADV';
  const RUN_DATE = '2026-10-21';

  const htmlBody = `
    <div class="sec">
      <div class="eyebrow">MANAGEMENT FORWARD GUIDANCE & TARGET COMMITMENTS AUDIT</div>
      <div class="title" style="margin-bottom: 2px;">SIGMA ADVANCED SYSTEMS LIMITED</div>
      <div class="subtitle">NSE: SIGMAADV · BSE: 532408 · CMP: ₹872 · MCAP: ₹16,600 CR · AS OF 21 OCTOBER 2026</div>
      <div class="thick-line"></div>
    </div>

    <!-- KPI ROW -->
    <div class="grid4">
      <div class="kpi kpi-g">
        <div class="label">Committed Order Visibility</div>
        <div class="bignum">₹7,407 Cr</div>
        <div class="subnum text-pos">▲ Revised: +£125M LTA & +$19.7M Win</div>
      </div>
      <div class="kpi kpi-b">
        <div class="label">Near-Term Ammunition Burn</div>
        <div class="bignum">₹1,502 Cr</div>
        <div class="subnum">FY27 Execution (6–12 months)</div>
      </div>
      <div class="kpi kpi-b">
        <div class="label">Greenfield Facility Scale</div>
        <div class="bignum">2.50 L sq. ft.</div>
        <div class="subnum">Sri City · Q3 FY27 Full Production</div>
      </div>
      <div class="kpi kpi-y">
        <div class="label">Concall Transcript Status</div>
        <div class="bignum" style="font-size:13px; margin-top:2px;">PPT Fallback</div>
        <div class="subnum text-warn">Zero Concall on Record · Deck Mined</div>
      </div>
    </div>

    <!-- EXECUTIVE SUMMARY -->
    <div class="sec">
      <div class="sec-hd">
        <span>EXECUTIVE SUMMARY & METHODOLOGY DISCLOSURE</span>
        <span class="chip chip-b">AUDIT DISCLOSURE</span>
      </div>
      <div class="hl hl-b">
        <strong>Source Channel & Fallback Protocol:</strong> Sigma Advanced Systems does not hold official earnings conference calls with transcripts annotated on Stockscans (<code>latestTranscript: null</code>). Under the <code>forward-guidance-extractor</code> protocol and <code>guidance-ppt-fallback</code> standard, management's forward-looking commitments were rigorously mined from the Q1 FY27 Investor Presentation, Q1 FY27 Financial Results Press Release, and official SEBI Regulation 30 contract disclosures through 21 October 2026.
      </div>
      <p style="margin-top: 6px; font-size: 9.5px;">
        <strong>Reconciliation vs Prior Run:</strong> The prior run on 2026-08-13 recorded <code>0 guidance items</code> due to transcript absence. This audit identifies <strong>8 explicit, quantified management commitments</strong> spanning multi-year aerospace LTAs, short-cycle NATO 155 mm artillery deliveries, greenfield manufacturing capacity, and technical headcount ramp. Crucially, under the <strong>Zero-Assumption Rule</strong>, management provided no standalone company-wide percentage growth target (e.g. '25% YoY revenue growth'); hence, the top-line cell remains strictly blank rather than interpolated.
      </p>
    </div>

    <!-- STRUCTURED GUIDANCE TABLE -->
    <div class="sec">
      <div class="sec-hd">
        <span>CONFIRMED FORWARD GUIDANCE & TARGET COMMITMENT MATRIX</span>
        <span class="chip chip-g">8 EXPLICIT TARGETS</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 14%;">Metric Category</th>
            <th style="width: 20%;">Metric & Parameter</th>
            <th style="width: 12%;">Period Guided</th>
            <th style="width: 14%; text-align: right;">Guided Value</th>
            <th style="width: 10%; text-align: center;">QoQ Status</th>
            <th style="width: 30%;">Management Quote / Commitment Source</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Key Metrics</strong></td>
            <td>Order Book / Revenue Visibility</td>
            <td>FY27–FY34 (7Y)</td>
            <td style="text-align: right;" class="text-pos font-bold">₹5,400 Cr<br><span style="font-size:7.5px; color:#64748b;">£425M LTA</span></td>
            <td style="text-align: center;"><span class="chip chip-y">REVISED</span></td>
            <td style="font-size:8px;">"Key Rolls-Royce LTA Win: £300M (~₹3,800 Cr)... deepens Rolls-Royce Aerospace UK partnership with £125m (~₹1,600 Cr) additional long-term agreement"</td>
          </tr>
          <tr>
            <td><strong>Top Line</strong></td>
            <td>Volume (Base Bleed Shells)</td>
            <td>FY27 (6–12m)</td>
            <td style="text-align: right;" class="text-pos font-bold">147,000 units</td>
            <td style="text-align: center;"><span class="chip chip-g">NEW</span></td>
            <td style="font-size:8px;">"USD 104.9 Million Export Order: manufacture and supply of 147,000 units of 155mm base bleed artillery shells, executed over next 6 to 12 months"</td>
          </tr>
          <tr>
            <td><strong>Top Line</strong></td>
            <td>Revenue (Base Bleed Shells)</td>
            <td>FY27 (6–12m)</td>
            <td style="text-align: right;" class="text-pos font-bold">₹1,013 Cr<br><span style="font-size:7.5px; color:#64748b;">$104.9M</span></td>
            <td style="text-align: center;"><span class="chip chip-g">NEW</span></td>
            <td style="font-size:8px;">"USD 104.9 Million Export Order (approximately INR 1,013 crore) to be executed over next 6 to 12 months, strengthening supply chain position"</td>
          </tr>
          <tr>
            <td><strong>Top Line</strong></td>
            <td>Revenue (Ancillary Subsystems)</td>
            <td>By Q2 2027</td>
            <td style="text-align: right;" class="text-pos font-bold">₹174 Cr<br><span style="font-size:7.5px; color:#64748b;">$19.70M</span></td>
            <td style="text-align: center;"><span class="chip chip-g">NEW (TODAY)</span></td>
            <td style="font-size:8px;">"secured order valued at US$19.70M (~₹174 Cr) from North American NATO customer for critical 155 mm artillery subsystems, scheduled to be executed by Q2 2027"</td>
          </tr>
          <tr>
            <td><strong>Top Line</strong></td>
            <td>Volume (M107 Shell Bodies)</td>
            <td>Q2–Q3 FY27</td>
            <td style="text-align: right;" class="text-pos font-bold">40,000 units</td>
            <td style="text-align: center;"><span class="chip chip-g">NEW</span></td>
            <td style="font-size:8px;">"Execution of M107 shells order (~INR 208 Cr, 40,000 units) has commenced, with deliveries continuing over next two quarters"</td>
          </tr>
          <tr>
            <td><strong>Top Line</strong></td>
            <td>Volume (M557 Filled Fuzes)</td>
            <td>FY27 (10m)</td>
            <td style="text-align: right;" class="text-pos font-bold">90,000 units</td>
            <td style="text-align: center;"><span class="chip chip-g">NEW</span></td>
            <td style="font-size:8px;">"secured export order worth USD 11.4 Mn (~INR 107 Cr) for 90,000 units of Filled Fuzes for 155mm artillery shells, executed over 10-month period"</td>
          </tr>
          <tr>
            <td><strong>Key Metrics</strong></td>
            <td>Capacity (Sri City Master Plan)</td>
            <td>Q3 FY27</td>
            <td style="text-align: right;" class="text-pos font-bold">2.50 L sq. ft.</td>
            <td style="text-align: center;"><span class="chip chip-g">NEW</span></td>
            <td style="font-size:8px;">"facility in Sri City commissioned and on track for full scale production in third quarter... 23-acre master plan, 2.5 lakh sq. ft. greenfield plant"</td>
          </tr>
          <tr>
            <td><strong>Key Metrics</strong></td>
            <td>Technical Workforce Ramp</td>
            <td>FY27</td>
            <td style="text-align: right;" class="text-pos font-bold">~300 FTEs</td>
            <td style="text-align: center;"><span class="chip chip-g">NEW</span></td>
            <td style="font-size:8px;">"Footprint ~300 FTEs across Hyderabad & Bangalore (FY27) ~150k Sq. ft. of R&D and manufacturing"</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- QUALITATIVE STRATEGIC LEVERS -->
    <div class="sec">
      <div class="sec-hd">
        <span>OPERATING MARGIN & EXECUTION DRIVERS</span>
        <span class="chip chip-y">STRATEGIC PRIORITIES</span>
      </div>
      <div class="grid2">
        <div class="hl hl-g">
          <strong>EBITDA Margin Expansion Lever:</strong> Management explicitly targets ongoing margin expansion through accelerated work transfer from UK subsidiaries (Nasmyth and Bromford) to the newly commissioned Sri City facility in Andhra Pradesh, leveraging Tier-1 delegatory quality approvals to bypass 5-year qualification lag.
        </div>
        <div class="hl hl-b">
          <strong>Multi-Year Demand Longevity:</strong> Management notes in Slide 16 that the acute global shortage of 155 mm artillery shells is expected to support a sustained <strong>6 to 7-year replacement demand cycle</strong> across NATO members, securing repeat replenishment potential.
        </div>
      </div>
    </div>

    <!-- EXTRA-MILE RESEARCH ("THE 1% FACTOR") -->
    <div class="sec">
      <div class="sec-hd">
        <span>EXTRA-MILE RESEARCH: THE 1% FACTOR (EXPERIMENTAL GUIDANCE SYNTHESIS)</span>
        <span class="chip chip-g">THE 1% COMPOUNDER</span>
      </div>
      <div class="hl hl-g" style="margin-bottom: 8px;">
        <strong>1. Synthetic Revenue Burn Analysis vs Guidance Gap:</strong>
        While management does not give formal revenue % guidance, the <em>contract delivery milestones create a deterministic revenue floor</em>. 
        Between Q2 FY27 and Q4 FY27, Sigma is scheduled to deliver:
        (a) ₹1,013 Cr base bleed shells, 
        (b) ₹208 Cr M107 shells, 
        (c) ₹174 Cr ancillary subsystems, 
        (d) ₹107 Cr fuzes, and 
        (e) ₹750–800 Cr annualized Rolls-Royce LTA volume. 
        Summing these contract schedules indicates an annualized run-rate of <strong>₹2,200–2,500 Cr</strong> by late FY27/FY28, representing a ~4.5x expansion over FY26 reported base (₹492 Cr).
      </div>
      <div class="hl hl-y">
        <strong>2. Execution Risks & Monitoring Checklist:</strong>
        <span class="text-warn">Watch items for upcoming quarters:</span>
        (1) <em>Sri City Q3 Ramp:</em> Verification that full-scale production at Sri City commences as committed in Q3 FY27 without audit delays from Western OEMs.
        (2) <em>Working Capital / Cash Conversion:</em> Massive procurement of artillery alloy forgings and electronic subsystems could compress CFO/PAT during the initial ramp phase before receivables clear.
      </div>
    </div>
  `;

  const fullHtml = wrapHtml(
    'SIGMA ADVANCED SYSTEMS LTD',
    'FORWARD GUIDANCE & COMMITMENTS EXTRACTOR',
    htmlBody,
    {
      companyId: COMPANY_ID,
      runDate: RUN_DATE,
    }
  );

  const outputDir = path.join(db.dataRoot(), 'assets', 'forward-guidance');
  fs.mkdirSync(outputDir, { recursive: true });
  const pdfFileName = 'NSE_SIGMAADV_forward_guidance.pdf';
  const pdfOutputPath = path.join(outputDir, pdfFileName);

  await renderPdf(
    fullHtml,
    pdfOutputPath,
    'INSTITUTIONAL EQUITY RESEARCH · FORWARD GUIDANCE EXTRACTOR',
    'Strictly Private & Confidential · For Research Purposes Only'
  );
  console.log('PDF generated at:', pdfOutputPath);

  const artifactDir =
    '/Users/darshanpatel/.gemini/antigravity/brain/034d351b-afab-4d51-9807-3970dac30801';
  if (fs.existsSync(artifactDir)) {
    fs.copyFileSync(pdfOutputPath, path.join(artifactDir, pdfFileName));
    fs.copyFileSync(
      path.join(outputDir, 'Forward_Guidance_SIGMAADV_20261021.xlsx'),
      path.join(artifactDir, 'Forward_Guidance_SIGMAADV_20261021.xlsx')
    );
    console.log('Copied PDF and XLSX to artifact directory.');
  }
}

if (require.main === module) {
  renderGuidancePdf().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { renderGuidancePdf };
