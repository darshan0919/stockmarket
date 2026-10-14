// Step 5 — Info-Classification (NEW/KNOWN/FOLLOW-UP) for top-15 S3+ items
// post-close-scan-insights adhoc (morning) run — 2026-10-13
'use strict';
const { NotesDb } = require('./packages/jobs-runtime/lib/notesDb');
const db = new NotesDb();

const CLASSIFICATIONS = {
  'NSE:PTCIL': {
    noteId: '0ded142d-ef0c-4bc5-93c5-d23e21c2a0cb',
    claims: [{ claim: 'PTC Industries raised Rs 1,800cr via QIP', bucket: 'KNOWN' }],
    verdict: 'KNOWN',
    baselineCoverage: 'high',
    summary:
      'A prior note in this notes DB already reported the QIP closing at ~Rs1,800cr with FULL pricing detail (8,54,700 shares @ Rs21,060/share, 4.92% discount to floor) — this press-release filing adds no new economic information, it just restates the already-disclosed close.',
  },
  'NSE:AARTIIND': {
    noteId: 'ec382818-007d-4c49-8e9c-c357077f18ce',
    claims: [
      {
        claim: '10+ year dedicated manufacturing & supply agreement, Rs1,500cr revenue potential',
        bucket: 'NEW',
      },
    ],
    verdict: 'NEW',
    baselineCoverage: 'none',
    summary:
      "No prior note in this company's history covers this agreement (prior notes: Zone IV Jhagadia commissioning, a promoter-group exit) — this is genuinely new information.",
  },
  'NSE:AIIL': {
    noteId: '0162e837-2291-4588-be94-15acc141159b',
    claims: [
      {
        claim: 'Formal Implementation Date (Oct 8, 2026) declared for WWIL resolution plan',
        bucket: 'FOLLOW-UP',
      },
      { claim: 'Consortium has discharged all resolution-plan obligations', bucket: 'FOLLOW-UP' },
    ],
    verdict: 'FOLLOW-UP',
    baselineCoverage: 'high',
    summary:
      "A prior HIGH note already disclosed the substantive step — Authum's Rs350cr cash commitment under the NCLT-approved resolution plan. Today's filing is the formal, procedural closing confirmation (Implementation Date) of a deal whose economics were already known.",
  },
  'NSE:GULFPETRO': {
    noteId: 'f33b0da9-23f4-402f-a5c6-99bb05cdd1e1',
    claims: [
      { claim: 'Board approves Rs44.27cr acquisition of IPTPL (Pipavav terminal)', bucket: 'NEW' },
    ],
    verdict: 'NEW',
    baselineCoverage: 'none',
    summary:
      'Prior notes for this company concern an unrelated Rs130cr NCD/OCD working-capital facility — no overlap with this acquisition.',
  },
  'NSE:KPIL': {
    noteId: 'af1d96bf-46a1-4f70-9f0b-ac98f847730c',
    claims: [{ claim: 'New order wins of Rs2,225cr', bucket: 'NEW' }],
    verdict: 'NEW',
    baselineCoverage: 'none',
    summary:
      "Prior notes for this company concern the Swedish LMG subsidiary's Nasdaq Stockholm IPO — unrelated to this order-win announcement.",
  },
  'NSE:KOLTEPATIL': {
    noteId: 'e194f98c-a1a4-4149-aa27-f585645c7d4b',
    claims: [
      { claim: 'Record Q2 FY27 sales Rs1,019cr (+52% YoY)', bucket: 'NEW' },
      {
        claim: 'Record H1 FY27 sales Rs1,636cr (+27% YoY), collections Rs1,509cr (+32% YoY)',
        bucket: 'NEW',
      },
      { claim: "'Vyana at The Reserve' generates Rs616cr sales", bucket: 'FOLLOW-UP' },
      { claim: 'Rs6,000cr Mumbai GDV expansion via six new redevelopment projects', bucket: 'NEW' },
    ],
    verdict: 'MOSTLY NEW',
    baselineCoverage: 'partial',
    summary:
      "Aggregate Q2/H1 sales+collections figures and the Rs6,000cr Mumbai expansion are new. The 'Vyana at The Reserve' project sales figure (Rs616cr) updates/confirms a figure already flagged in a prior note ('Rs600cr pre-sales in 60 hours' at the same project's launch) rather than being fresh news.",
  },
  'NSE:TDPOWERSYS': {
    noteId: '20beca5c-325c-44d8-93ac-2cde2f5c1ecf',
    claims: [
      { claim: 'QIP allotted 77.42L shares at Rs775/share (~Rs600cr)', bucket: 'FOLLOW-UP' },
    ],
    verdict: 'FOLLOW-UP',
    baselineCoverage: 'high',
    summary:
      'A prior note already disclosed the QIP opening at floor price Rs775.35 with up to 5% discount permitted. The actual close (Rs775/share, 0.05% discount) is the expected resolution within that already-disclosed range — not materially new information.',
  },
  'NSE:SHYAMMETL': {
    noteId: 'bc1427b3-7d73-438f-aeec-c1c5000b50e0',
    claims: [
      {
        claim: 'Secures Phutamura coal block mining rights via Alom Solar investment',
        bucket: 'NEW',
      },
    ],
    verdict: 'NEW',
    baselineCoverage: 'none',
    summary:
      'Prior notes cover an unrelated Chandrapur steel-complex MoU and monthly volume/realisation trends — no overlap with this coal-block mining-rights news.',
  },
  'NSE:CEIGALL': {
    noteId: '92656a43-2292-4966-aefe-7e035787fdd4',
    claims: [
      {
        claim:
          'Completion Certificate issued for Rs1,323.52cr Delhi-Saharanpur EPC highway project',
        bucket: 'NEW',
      },
    ],
    verdict: 'NEW',
    baselineCoverage: 'none',
    summary:
      "Despite a long notes history for this company (transmission SPV deals, LOAs, dividends, Q1 results), none cover this specific highway project's completion — this is new information.",
  },
  'NSE:GOODLUCK': {
    noteId: 'e1102a68-cc1f-4b8f-8237-dc87f2b6cdc2',
    claims: [
      {
        claim: 'GDAL named sole technically qualified bidder for 155mm artillery shells to MIL',
        bucket: 'NEW',
      },
    ],
    verdict: 'NEW',
    baselineCoverage: 'partial',
    summary:
      "A new, specific procurement-qualification milestone not previously flagged — though thematically continuous with prior notes on GDAL's artillery-shell capacity expansion (2.7x capacity, Rs276cr preferential raise), which this milestone is an early sign of paying off.",
  },
  'BSE:AIRFLOA': {
    noteId: 'a8f6c332-b918-4d63-a8f1-abdfedabefcf',
    claims: [
      {
        claim:
          'Rs34.85cr LOA for Vande Bharat sleeper interior work via consortium with BLUE Engineering',
        bucket: 'NEW',
      },
    ],
    verdict: 'NEW',
    baselineCoverage: 'none',
    summary:
      'Prior notes cover the KIN Railway Equipment acquisition, a small Rs7.33cr Acme India order, and a China KTK Group MOU — none overlap with this ICF/Vande Bharat order.',
  },
  'NSE:NGLFINE': {
    noteId: 'b1ba58f2-cfc5-4760-ac7c-b2f4d51e0340',
    claims: [
      {
        claim: 'SEBI grants SAST Reg 11(5) exemption for promoter family-trust share transfer',
        bucket: 'NEW',
      },
    ],
    verdict: 'NEW',
    baselineCoverage: 'none',
    summary:
      'Prior note concerns the unrelated Tarapur Greenfield facility Phase II commissioning — no overlap with this SAST/governance item.',
  },
  'BSE:SHARDUL': {
    noteId: 'f650c8fd-49d9-4970-9a85-8778d84e8f82',
    claims: [
      { claim: 'Letter of Offer filed for Rs115.2cr buyback at Rs60/share', bucket: 'KNOWN' },
    ],
    verdict: 'KNOWN',
    baselineCoverage: 'high',
    summary:
      "A prior note already recorded shareholders approving this exact buyback (Rs115.2cr tender-offer at Rs60/share). Today's Letter of Offer filing is a procedural step with identical terms — zero new economic information.",
  },
  'NSE:UHTL': {
    noteId: 'f7b7998c-4b5f-48bc-8c2e-b03f347eff58',
    claims: [
      {
        claim: 'Allots 29,68,000 shares at Rs105.50/share (~Rs31.3cr) preferential basis',
        bucket: 'NEW',
      },
    ],
    verdict: 'NEW',
    baselineCoverage: 'none',
    summary:
      'No prior notes exist for this company in the notes DB — first-time coverage, genuinely new.',
  },
  'BSE:MITSU': {
    noteId: '00294122-2111-48df-ab33-bf2e0fc9a833',
    claims: [
      {
        claim: 'BSE in-principle approval for 10L preferential warrants at min Rs151/warrant',
        bucket: 'NEW',
      },
    ],
    verdict: 'NEW',
    baselineCoverage: 'none',
    summary:
      'No prior notes exist for this company in the notes DB — first-time coverage, genuinely new.',
  },
};

(async () => {
  let updated = 0;
  let missing = [];
  const notes = db.load();
  for (const [companyId, cls] of Object.entries(CLASSIFICATIONS)) {
    const co = notes.companies[companyId];
    if (!co) {
      missing.push(companyId);
      continue;
    }
    const note = co.notes.find((n) => n.id === cls.noteId);
    if (!note) {
      missing.push(companyId + ':' + cls.noteId);
      continue;
    }
    note.infoClassification = {
      claims: cls.claims,
      verdict: cls.verdict,
      baselineCoverage: cls.baselineCoverage,
      summary: cls.summary,
    };
    updated++;
  }
  if (missing.length) {
    console.error('MISSING', JSON.stringify(missing));
    process.exit(1);
  }
  await db.save(notes);
  console.log(JSON.stringify({ status: 'infoclass-complete', updated }));
})().catch((err) => {
  console.error('INFOCLASS_FAILED', (err && err.stack) || err);
  process.exit(1);
});
