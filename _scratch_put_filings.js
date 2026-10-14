const bc = require('./skills/equity-research/rerating-catalysts/scripts/brief_cache.js');
const extracts = {
  'oy9idqqeqlfcvupl5uh3sepi.pdf': {
    profile: 'result',
    companyId: 'NSE:TCS',
    summary:
      'TCS Q2FY27 results: revenue 73,188 Cr (+11.2% YoY), PAT 13,884 Cr (+15.0% YoY), diluted EPS 38.37, 2nd interim div Rs12/sh.',
  },
  '5v2o59gngw8gtljld5z1u0jd.pdf': {
    profile: 'result',
    companyId: 'NSE:HCLTECH',
    summary:
      'HCLTECH Q2FY27 results cover letter + review report (no results table extracted here); interim div Rs12/sh.',
  },
  'hejnr6trmex3ohxoraufjcmz.pdf': {
    profile: 'result',
    companyId: 'NSE:HCLTECH',
    summary:
      'HCLTECH Q2FY27 investor release: revenue 35,620 Cr (+11.5% YoY), Net Income 5,132 Cr (+2.2% YoY), EBIT margin 18.2%, EPS diluted 70.22, FY27 guidance 2.5-4.0% CC rev growth / 17.5-18.5% EBIT margin.',
  },
  'nnpzw6cp82eiwqhu4vn8jb7t.pdf': {
    profile: 'ppt',
    companyId: 'NSE:SHRIRAMFIN',
    summary:
      'SHRIRAMFIN Q1FY27 investor update: AUM 3.14 lakh Cr (+15.3% YoY), NII +33.7% YoY, PAT 3,445 Cr (+59.8% YoY), EPS 14.83 (+29.4% YoY), ROA 3.93%.',
  },
  '85f31rvkab27xz753tkx65hs.pdf': {
    profile: 'announcement',
    companyId: 'NSE:BANDHANBNK',
    summary:
      'BANDHANBNK Reg-30 clarification denying awareness of moneycontrol report re: IHC exploring promoter stake acquisition; stock +9.02% on the report.',
  },
  '6393x0avdge9kwia71r58buz.pdf': {
    profile: 'ppt',
    companyId: 'NSE:CMLL',
    summary:
      'CMLL Q1FY27 PPT: order book 9,125 Cr (5x FY26 rev), FY27 guide rev +45-50%/EBITDA+35%/PAT+35%, CRISIL upgrade to A-/Positive.',
  },
  '665gjwmc061gqve4kgwaih2n.pdf': {
    profile: 'ppt',
    companyId: 'NSE:SHRINGARMS',
    summary:
      'SHRINGARMS Q1FY27 PPT: revenue 548.5 Cr (+64.9% YoY), PAT 34.0 Cr (+19.3% YoY), margins compressed 240-420bps YoY.',
  },
  '5ohyrgufbsn4e87efe5f9g5y.pdf': {
    profile: 'announcement',
    companyId: 'NSE:BSOFT',
    summary: 'BSOFT press release: named OpenAI Select Partner; no deal value disclosed.',
  },
  'iai346q7kbdr14r1dsp1owor.pdf': {
    profile: 'ppt',
    companyId: 'NSE:KPITTECH',
    summary: 'KPITTECH Q1FY27 PPT: CC revenue flattish QoQ, PAT ~117 Cr, $257M new deal TCV.',
  },
  'i9xnuod5sbll4s0lhshcy25k.pdf': {
    profile: 'announcement',
    companyId: 'NSE:PNCINFRA',
    summary:
      'PNCINFRA: incorporated pre-revenue Kazakhstan subsidiary, charter capital ~Rs5 lakh-equiv, immaterial.',
  },
  'dmk35md0es2ca16hwhig7luh.pdf': {
    profile: 'result',
    companyId: 'NSE:63MOONS',
    summary: '63MOONS Q1FY27 board outcome (Aug-2026) — routine, no Q2 filing yet.',
  },
  '3yuu2fhsn8189hwygw3jcri6.pdf': {
    profile: 'announcement',
    companyId: 'NSE:VIKRAN',
    summary:
      'VIKRAN: NOPL (WOS) signed Rs2,941.19 Cr IREDA term loan facility financing a 969MW solar EPC order (Rs3,517.98 Cr) for VEL.',
  },
  'btvpyvdkcgrecod1b2161irf.pdf': {
    profile: 'announcement',
    companyId: 'NSE:NEWGEN',
    summary:
      'NEWGEN: routine KMP retirement (EVP Global Business Strategy & HR), no financial impact.',
  },
  'h9wxrkpfhkd5qgvao2e7qfdz.pdf': {
    profile: 'announcement',
    companyId: 'NSE:SMLMAH',
    summary:
      'SMLMAH: CFO cessation (Patwardhan) + interim CFO (Goel) + new CFO from 1-Jan-2027 (Kalra) + new CHRO; planned succession, routine.',
  },
};
for (const [id, data] of Object.entries(extracts)) {
  const { file } = bc.putFilingExtract(id, data);
  console.log('put-filing', id, '->', file);
}
