const { execFileSync } = require('child_process');
const path = require('path');
const WI_JOB = path.resolve('packages/jobs-runtime/watchlistInsights.js');

function run(args, input) {
  return execFileSync('node', [WI_JOB, ...args], { input, maxBuffer: 1024 * 1024 * 20 }).toString('utf8');
}

// --- Heavy-doc-skip (no Filing Extract available) ---
const HEAVY = [
  { companyId: 'NSE:63MOONS', name: '63 Moons Technologies Ltd', title: 'Investor Update For H1 (FY 2026-27) Received From Our Subsidiary-63SATS Cybertech Ltd.', category: 'investor_presentation', announcementId: '5qzbswnrsmf4kfvui3xz91hk.pdf', date: '2026-10-11' },
  { companyId: 'BSE:GRANDOAK', name: 'Grand Oak Canyons Distillery Ltd', title: 'Board Meeting Outcome for Outcome Of Meeting Of Board Of Directors Held On10th October 2026', category: 'results', announcementId: 'shd1wslxyf8nqtc52mep3ks7.pdf', date: '2026-10-10' },
  { companyId: 'NSE:PREMIERPOL', name: 'Premier Polyfilm Ltd', title: 'Board Meeting Outcome for Board Meeting Outcome For The Approval Of Unaudited Financial Results', category: 'results', announcementId: 'k3m0mksubr5ie3kn6dlyfokp.pdf', date: '2026-10-10' },
];
for (const h of HEAVY) {
  const payload = JSON.stringify({ companyId: h.companyId, name: h.name, title: h.title, category: h.category, announcementId: h.announcementId, date: h.date, heavyDocumentSkipReason: 'no Filing Extract available in docExtracts for this category/url' });
  run(['log-heavy-skip', payload]);
  run(['mark-processed', h.companyId, h.announcementId, 'heavy-doc-skip']);
  console.log('heavy-doc-skip:', h.companyId, h.announcementId);
}

// --- Duplicate followers: route to lead, no independent read ---
const DUPS = [
  ['BSE:AIRFLOA', '5z0dhbs7n1ypfv7g85fzx0t1.pdf'],
  ['BSE:GRANDOAK', 'abnkh0up1pm1a8c79opdotcz.pdf'],
  ['BSE:GRANDOAK', '6nvnwmn7j3nh71h1p24ye2lw.pdf'],
  ['BSE:GRANDOAK', 'tnar41clyjp3cvivgxwr9l2f.pdf'],
  ['NSE:PREMIERPOL', 'ogawsf49k7bbqgly57er24xf.pdf'],
  ['NSE:PTCIL', 't5qe7oizzydblj48wjy9a8a4.pdf'],
  ['NSE:SIS', 'qgyzmdwji35vevueyz08nd25.pdf'],
];
for (const [cid, annId] of DUPS) {
  run(['mark-processed', cid, annId, 'duplicate-of-existing-note']);
  console.log('duplicate-routed:', cid, annId);
}

// --- Genuinely routine (read, judged non-event) ---
const ROUTINE = [
  ['NSE:PRIMECAB', 'nhy0sc9fadb8rapdku5ch3o6.pdf'],
  ['NSE:FELIX', '0arnmont4o1afkquh37gbmua.pdf'],
  ['NSE:INNOMET', 'lq3h5q0p2vvg95ipyxojyrz4.pdf'],
  ['NSE:MANBA', '8dw54ytvnmqyiybm9lrxpb6n.pdf'],
  ['NSE:ACMESOLAR', '8o821wxq6w40h9m1a9ce00b3.pdf'],
  ['NSE:LLOYDSENGG', '44q6vpmf8t2e9ldkl5ugmk5r.pdf'],
  ['NSE:VINDHYATEL', 'xlykx3f9g6cbqk9cpk5bduob.pdf'],
  ['NSE:FAIRCHEMOR', 'huuguopcajeztv8fa1fk15er.pdf'],
  ['BSE:PSPLATINA', 'ldofyjpa9gl40ywzb0eksb9m.pdf'],
  ['NSE:CHENNPETRO', '3hjnbjpbi5s3an7jtgm01rrj.pdf'],
  ['NSE:VERTIS', '654rs4pal8bz598yitlgvhdf.pdf'],
  ['NSE:SEAMECLTD', 'csf7p0vz3ej8xuzns32iqjkw.pdf'],
  ['NSE:SIS', 'cacw7zoj1sxn0er9wcfb4yxm.pdf'],
  ['NSE:POONAWALLA', '0quo6y9igc9k1y6e4p8qkckd.pdf'],
  ['NSE:AURUM', 'ypckeb5yy366m19qxf1uxwxf.pdf'],
  ['NSE:KPIL', 'g7ze1olavwtxvqrf9bvey7el.pdf'],
];
const routineLog = [];
for (const [cid, annId] of ROUTINE) {
  run(['mark-processed', cid, annId]);
  routineLog.push({ companyId: cid, announcementId: annId });
  console.log('routine:', cid, annId);
}
require('fs').writeFileSync('cache/runs/adhoc-20261011/routine-items.json', JSON.stringify(routineLog, null, 2));
console.log('done. heavy=', HEAVY.length, 'dup=', DUPS.length, 'routine=', ROUTINE.length);
