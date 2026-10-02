process.env.STOCKMARKET_JOB_NAME = 'post-close-scan-insights-adhoc-nightly';
const fs = require('fs');
const { loadEnv } = require('./lib/env');
loadEnv();
const { stockscans } = require('@stock/api');
const { getCompanyFinancials } = require('@stock/api/analyzers/companyFinancials');
const { mapWithConcurrency } = require('@stock/api/utils/concurrency');
const { scanAnnouncementsForCompanies } = require('@stock/api/utils/bulkAnnouncementScan');
const obScript = require('./scripts/orderbook/getCompanyOrderBook');
const { enrichOrderCards } = require('./lib/orderCardEnrichment');
const { collectCachedNotesSinceCutoff } = require('./postCloseScanInsights.js');
const { dedupeInsights } = require('./lib/thesisCardEmail');

function mark(label, t0) {
  console.log(`[${new Date().toISOString()}] ${label} (+${Date.now() - t0}ms)`);
}

(async () => {
  const t0 = Date.now();
  const freshInsights = JSON.parse(fs.readFileSync('/tmp/pcs/insights-array.json', 'utf8'));
  const cutoffUtc = new Date('2026-09-30T13:47:50.928Z');
  const cachedInsights = collectCachedNotesSinceCutoff(cutoffUtc.getTime());
  const merged0 = dedupeInsights([...freshInsights, ...cachedInsights]);
  const orderItems = merged0.filter((i) => i && i.category === 'order_book' && i.companyId && i.announcementId);
  mark(`orderItems: ${orderItems.length} -> ${orderItems.map((i) => i.companyId + ':' + i.announcementId).join(', ')}`, t0);

  const deps = {
    client: stockscans,
    financialsFn: async (id) => {
      const s = Date.now();
      try {
        const r = await getCompanyFinancials(id, { client: stockscans });
        mark(`financialsFn(${id}) OK`, s);
        return r;
      } catch (e) {
        mark(`financialsFn(${id}) ERR ${e.message}`, s);
        throw e;
      }
    },
    mapWithConcurrency,
    scanForCompanies: async (...args) => {
      const s = Date.now();
      mark(`scanForCompanies CALLED args=${JSON.stringify(args[0]).slice(0,200)}`, s);
      try {
        const r = await scanAnnouncementsForCompanies(...args);
        mark(`scanForCompanies OK`, s);
        return r;
      } catch (e) {
        mark(`scanForCompanies ERR ${e.message}`, s);
        throw e;
      }
    },
    ensureBase: async (id) => {
      const s = Date.now();
      try {
        const r = await obScript.ensureBase(id);
        mark(`ensureBase(${id}) OK`, s);
        return r;
      } catch (e) {
        mark(`ensureBase(${id}) ERR ${e.message}`, s);
        throw e;
      }
    },
    processNewAnnouncements: obScript.processNewAnnouncements,
    resolveAnnouncement: obScript.resolveAnnouncement,
  };

  try {
    const r = await enrichOrderCards(merged0, { warn: (m) => process.stderr.write(`${m}\n`), deps });
    mark(`enrichOrderCards done, stats=${JSON.stringify(r.stats)}`, t0);
  } catch (e) {
    mark(`enrichOrderCards FAILED: ${e.message}\n${e.stack}`, t0);
  }
  process.exit(0);
})().catch((e) => {
  console.log('FATAL', e.message, e.stack);
  process.exit(1);
});
