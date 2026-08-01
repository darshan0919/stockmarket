# Workflow Dependencies Registry

This registry lists all available **Skills**, **Classes**, **APIs/Clients**, and **Utility Functions** within the stockmarket monorepo.
Use this document to check if a specific functionality, client, or skill already exists before implementing a new one or to find components to tweak.

Regenerate with `yarn registries:generate` (or `node scripts/build/generate-registries.js`) after adding/moving/removing a skill or a stock-api/src module.

---

## 1. Skills
Available high-level agentic skills defined in the project:

| Skill Name | Entry Point | Aliases / Keywords |
|---|---|---|
| [stock-api/bin/get-latest-concall-transcript.js](stock-api/bin/get-latest-concall-transcript.js) | `stock-api/bin/get-latest-concall-transcript.js` | concall transcript early, transcribe earnings call recording, recording of conference call, transcript before official filing, notebooklm transcript, perplexity earnings transcript, verbatim transcript from recording, concall transcript extractor, latest quarter transcript, bulk transcript fetch, transcripts for multiple companies, historical quarter transcript |
| [stock-api/bin/stock-documents-fetcher.js](stock-api/bin/stock-documents-fetcher.js) | `stock-api/bin/stock-documents-fetcher.js` | fetch documents, fetch transcripts, fetch annual reports, download filings, get concall, pull documents, stockscans fetch, fetch ppt, get investor presentation |
| [stock-api/bin/concall-analysis.js](stock-api/bin/concall-analysis.js) | `stock-api/bin/concall-analysis.js` | concall, earnings call analysis, transcript analysis, concall deep dive, quarterly call, concall brief, multi quarter concall, peer concall |
| [stock-api/bin/forensic-accounting.js](stock-api/bin/forensic-accounting.js) | `stock-api/bin/forensic-accounting.js` | forensic, forensic check, fraud check, accounting quality, is this company cooking books, piotroski, dupont, red flags accounting, forensic analysis |
| [stock-api/bin/equity-research-deepdive.js](stock-api/bin/equity-research-deepdive.js) | `stock-api/bin/equity-research-deepdive.js` | deep dive, equity deep dive, research report, investment memo, fundamental analysis, full analysis, should I invest, analyze company, tell me everything about |
| [stock-api/bin/growth-triggers-1pager.js](stock-api/bin/growth-triggers-1pager.js) | `stock-api/bin/growth-triggers-1pager.js` | growth triggers, 1 pager, one pager, catalyst note, re-rating triggers, conviction note, why will stock rerate, growth catalyst |
| [stock-api/bin/management-credibility-tracker.js](stock-api/bin/management-credibility-tracker.js) | `stock-api/bin/management-credibility-tracker.js` | management credibility, walk the talk, management track record, guidance tracker, is management delivering, overpromising, credibility score, management quality |
| [stock-api/bin/peer-comparison.js](stock-api/bin/peer-comparison.js) | `stock-api/bin/peer-comparison.js` | peer comparison, compare companies, side by side, which to buy, peer report, compare stocks, relative valuation |
| [stock-api/bin/market-share-analysis.js](stock-api/bin/market-share-analysis.js) | `stock-api/bin/market-share-analysis.js` | market share, competitive landscape, industry concentration, who dominates, cr3 cr5 hhi, organised unorganised, top players, market structure |
| [stock-api/bin/sector-research-deepdive.js](stock-api/bin/sector-research-deepdive.js) | `stock-api/bin/sector-research-deepdive.js` | sector report, sector deep dive, industry analysis, thematic note, sector primer, industry deep dive, competitive dynamics |
| [stock-api/bin/drhp-ipo-analysis.js](stock-api/bin/drhp-ipo-analysis.js) | `stock-api/bin/drhp-ipo-analysis.js` | drhp, ipo analysis, rhp analysis, should I subscribe ipo, analyse drhp, ipo fairly priced, prospectus analysis |
| [stock-api/bin/quarterly-result-analysis.js](stock-api/bin/quarterly-result-analysis.js) | `stock-api/bin/quarterly-result-analysis.js` | quarterly results, result analysis, what changed this quarter, quarterly snapshot, post result note, q result, results analysis |
| [stock-api/bin/consecutive-filings-diff.js](stock-api/bin/consecutive-filings-diff.js) | `stock-api/bin/consecutive-filings-diff.js` | diff decks, compare presentations, q vs q presentation, consecutive filings, qoq diff, update thesis latest concall, reprice after results |
| [stock-api/bin/pre-pead-scanner.js](stock-api/bin/pre-pead-scanner.js) | `stock-api/bin/pre-pead-scanner.js` | pre pead, pre results scanner, rank companies before earnings, estimate next quarter, guidance ranking, pre-PEAD, results season scanner |
| [stock-api/bin/watchlist-catalyst-scanner.js](stock-api/bin/watchlist-catalyst-scanner.js) | `stock-api/bin/watchlist-catalyst-scanner.js` | catalyst scanner, scan watchlist, any catalysts today, catalyst alerts, what's moving watchlist, daily catalyst scan, check announcements |
| N/A | `N/A` | fundamental shift, what changed this week, recent news, scan announcements, what's new with, recent filings, red flags recent, pulse check stock |
| [stock-api/bin/equity-research-extraction.js](stock-api/bin/equity-research-extraction.js) | `stock-api/bin/equity-research-extraction.js` | equity extraction, research extraction, extract from annual report, project a extraction, ar extracts, concall extraction, document extraction |
| N/A | `N/A` | equity dashboard, research dashboard, project b dashboard, 15 tab dashboard, institutional dashboard, generate dashboard |
| N/A | `N/A` | equity master, full equity research, complete analysis, research ticker, institutional dashboard, 16 tab dashboard, master dashboard, full workup |
| [stock-api/bin/tweet-investor-playbook.js](stock-api/bin/tweet-investor-playbook.js) | `stock-api/bin/tweet-investor-playbook.js` | tweet playbook, investor tweets, analyse tweets, investment style from tweets, tweet corpus, distil investor thinking, track record tweets |
| [stock-api/bin/announcement-keyword-explorer.js](stock-api/bin/announcement-keyword-explorer.js) | `stock-api/bin/announcement-keyword-explorer.js` | announcement keywords, keyword explorer, find announcement keywords, scan keywords, announcement search keywords, expand keyword search |
| N/A | `N/A` | stock report, equity report, research note, buy sell recommendation, price target, stock analysis, should I buy, investment view |
| N/A | `N/A` | watchlist sync, sync watchlist, near highs sync, nightly sync, watchlist update |
| N/A | `N/A` | insight validation, validate insights, morning insights check, delivery backed price action, insight ledger |
| N/A | `N/A` | gainers signal, top gainers, daily gainers, gainer classification, conviction signals, 8am gainers run |
| [packages/jobs-runtime/scripts/orderbook/getCompanyOrderBook.js](packages/jobs-runtime/scripts/orderbook/getCompanyOrderBook.js) | `packages/jobs-runtime/scripts/orderbook/getCompanyOrderBook.js` | order book, orderbook, unexecuted order book, outstanding order book, order backlog, current order book, order wins since concall, new order announcements, execution timeline of orders, book to bill, order inflow, L1 orders |
| N/A | `N/A` | watchlist insights, daily insights, watchlist digest, corporate announcement digest |
| N/A | `N/A` | cowork task, create task, schedule task, cowork architect, task prompt, automate in cowork, recurring task |
| N/A | `N/A` | skill manager, create skill, modify skill, delete skill, skill creator, manage skills |
| [stock-api/bin/render-pdf.js](stock-api/bin/render-pdf.js) | `stock-api/bin/render-pdf.js` | render pdf, html to pdf |
| N/A | `N/A` | investment thesis, thesis engine, update thesis, buy hold sell signal, thesis review, recompute signal, should i still hold, living thesis, evolving thesis |
| N/A | `N/A` | financial model, 3 year forecast, forecast model, bear base bull, irr from here, project the pnl, valuation model, earnings model |
| N/A | `N/A` | value chain, where does margin sit, chokepoint analysis, value migration, map the chain, bottleneck owner |
| N/A | `N/A` | annual report analysis, analyse this ar, ar analysis, md letter summary, governance check, remuneration check, kmp resignations |
| N/A | `N/A` | stage 2, weinstein stage, soic lti, 30 wema, breakout analysis, why now catalyst, technical stage, entry stop loss, institutional accumulation |
| N/A | `N/A` | dead code, dead code scanner, find unused files, find unused exports, find dead code, clean up unused code |
| N/A | `N/A` | announcement insights, read this filing, analyse this announcement, demerger insight, merger insight, management change insight, high conviction announcement, SOTP analysis, spin-off analysis |

---

## 2. Classes (Clients & Helpers)
Instantiable classes for DI or custom configurations:

### event
- **Source File**: [stock-api/src/analyzers/catalystRules.js](stock-api/src/analyzers/catalystRules.js)
- **Key Methods**:


### event
- **Source File**: [stock-api/src/analyzers/catalystRules.js](stock-api/src/analyzers/catalystRules.js)
- **Key Methods**:


### PerplexityAuth
- **Source File**: [stock-api/src/auth/perplexityAuth.js](stock-api/src/auth/perplexityAuth.js)
- **Key Methods**:
  - `_envFile()`
  - `_resolve()`
  - `cookieHeader()`
  - `accountId()`
  - `headers()`
  - `isFullyConfigured()`

### ScreenerAuth
- **Source File**: [stock-api/src/auth/screenerAuth.js](stock-api/src/auth/screenerAuth.js)
- **Key Methods**:
  - `_envFile()`
  - `_resolve()`
  - `cookieHeader()`
  - `headers()`
  - `isConfigured()`

### StockscansAuth
- **Source File**: [stock-api/src/auth/stockscansAuth.js](stock-api/src/auth/stockscansAuth.js)
- **Key Methods**:
  - `_readFromEnvFile()`
  - `_warnLegacy()`
  - `getToken()`
  - `headers()`

### BseClient
- **Source File**: [stock-api/src/clients/BseClient.js](stock-api/src/clients/BseClient.js)
- **Key Methods**:
  - `getScripCode()`
  - `smartSearch()`
  - `getSecurityPosition()`
  - `getQuoteHeader()`
  - `getBulkBlockDeals()`
  - `getInsiderFilings()`
  - `getCorporateActions()`
  - `getBoardMeetings()`

### NseClient
- **Source File**: [stock-api/src/clients/NseClient.js](stock-api/src/clients/NseClient.js)
- **Key Methods**:
  - `_quoteReferer()`
  - `getQuote()`
  - `getSymbolData()`
  - `getPriceVolumeDeliverable()`
  - `getDeliveryBhavcopy()`
  - `getLargeDeals()`
  - `getSastReg29()`
  - `getInsiderFilings()`
  - `fetchArchiveXml()`
  - `getLiveVariations()`
  - `getCorporateActions()`
  - `getBoardMeetings()`
  - `getCorporateAnnouncements()`

### PerplexityClient
- **Source File**: [stock-api/src/clients/PerplexityClient.js](stock-api/src/clients/PerplexityClient.js)
- **Key Methods**:
  - `earningsEvents()`
  - `transcript()`

### ScreenerClient
- **Source File**: [stock-api/src/clients/ScreenerClient.js](stock-api/src/clients/ScreenerClient.js)
- **Key Methods**:
  - `_slug()`
  - `companyPage()`
  - `_throttle()`
  - `companyPageWithFallback()`
  - `validateAuth()`

### StockscansClient
- **Source File**: [stock-api/src/clients/StockscansClient.js](stock-api/src/clients/StockscansClient.js)
- **Key Methods**:
  - `_headers()`
  - `runScan()`
  - `getScanMetadata()`
  - `announcementStatistics()`
  - `companyAnnouncements()`
  - `announcements()`
  - `scanMetadata()`
  - `watchlistsList()`
  - `savedAnnouncementScans()`
  - `saveAnnouncementScan()`
  - `reorderAnnouncementScans()`
  - `deleteAnnouncementScan()`
  - `searchAnnouncements()`
  - `searchCompany()`
  - `cardDetails()`
  - `prices()`
  - `ohlcv()`
  - `documents()`
  - `resultsDocuments()`
  - `resultsDocumentsMap()`
  - `growthCatalysts()`
  - `businessOverview()`
  - `concallNotes()`
  - `latestTranscript()`
  - `concallScan()`
  - `watchlistTable()`
  - `replaceWatchlist()`
  - `createWatchlist()`
  - `deleteWatchlist()`
  - `updateWatchlist()`
  - `savedScanPageHtml()`
  - `savedScans()`
  - `s3PdfUrl()`
  - `fetchPdf()`
  - `validateAuth()`

### HttpClient
- **Source File**: [stock-api/src/http/HttpClient.js](stock-api/src/http/HttpClient.js)
- **Key Methods**:
  - `_headers()`
  - `get()`
  - `post()`
  - `put()`
  - `delete()`

### NseSession
- **Source File**: [stock-api/src/http/nseSession.js](stock-api/src/http/nseSession.js)
- **Key Methods**:
  - `clearCache()`
  - `_mergeSetCookie()`
  - `warmup()`
  - `getCookies()`
  - `headers()`
  - `get()`

### SimpleTemplate
- **Source File**: [stock-api/src/utils/docGenerator.js](stock-api/src/utils/docGenerator.js)
- **Key Methods**:
  - `applyFilter()`
  - `resolveValue()`
  - `render()`
  - `loadMarketplace()`
  - `extractFrontmatter()`
  - `buildContext()`
  - `renderTemplate()`
  - `generateAll()`

### DocGenerator
- **Source File**: [stock-api/src/utils/docGenerator.js](stock-api/src/utils/docGenerator.js)
- **Key Methods**:
  - `applyFilter()`
  - `resolveValue()`
  - `render()`
  - `loadMarketplace()`
  - `extractFrontmatter()`
  - `buildContext()`
  - `renderTemplate()`
  - `generateAll()`

### names
- **Source File**: [stock-api/src/utils/pdfRenderer.js](stock-api/src/utils/pdfRenderer.js)
- **Key Methods**:



---

## 3. APIs and Clients
Core singletons and client functions for interacting with external platforms:

| API / Client Name | Source File | Description |
|---|---|---|
| `parseBseSmartSearchHtml` | [stock-api/src/clients/BseClient.js](stock-api/src/clients/BseClient.js) | Exported from BseClient.js |
| `toPerplexityTicker` | [stock-api/src/clients/PerplexityClient.js](stock-api/src/clients/PerplexityClient.js) | Exported from PerplexityClient.js |
| `paragraphsToText` | [stock-api/src/clients/PerplexityClient.js](stock-api/src/clients/PerplexityClient.js) | Exported from PerplexityClient.js |
| `buildBseUrl` | [stock-api/src/http/bseHttp.js](stock-api/src/http/bseHttp.js) | Exported from bseHttp.js |
| `bseGetText` | [stock-api/src/http/bseHttp.js](stock-api/src/http/bseHttp.js) | Exported from bseHttp.js |
| `bseGetJson` | [stock-api/src/http/bseHttp.js](stock-api/src/http/bseHttp.js) | Exported from bseHttp.js |

---

## 4. Utilities
Helper functions and utilities for common processes (data parsing, PDF generation, formatting, etc.):

| Utility Name | Source File | Description |
|---|---|---|
| `extractValueCrore` | [stock-api/src/analyzers/catalystRules.js](stock-api/src/analyzers/catalystRules.js) | Exported from catalystRules.js |
| `findNames` | [stock-api/src/analyzers/catalystRules.js](stock-api/src/analyzers/catalystRules.js) | Exported from catalystRules.js |
| `classify` | [stock-api/src/analyzers/catalystRules.js](stock-api/src/analyzers/catalystRules.js) | Exported from catalystRules.js |
| `priceVolumeAlerts` | [stock-api/src/analyzers/catalystRules.js](stock-api/src/analyzers/catalystRules.js) | Exported from catalystRules.js |
| `hhiClassification` | [stock-api/src/analyzers/computeConcentration.js](stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `crN` | [stock-api/src/analyzers/computeConcentration.js](stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `hhi` | [stock-api/src/analyzers/computeConcentration.js](stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `computeMetrics` | [stock-api/src/analyzers/computeConcentration.js](stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `deltaBps` | [stock-api/src/analyzers/computeConcentration.js](stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `asymmetricFlag` | [stock-api/src/analyzers/computeConcentration.js](stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `classifyEventText` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `parseNseTimestamp` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `parseBseTimestamp` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `normalizeNseAnnouncement` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `normalizeBseAnnouncement` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `mergeAnnouncements` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `findLatestEvent` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `earliestEventTimestamp` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `normalizeOhlcv` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `candleIndexAtOrAfter` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `candleIndexAtOrBefore` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `computeReactionMetrics` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `classifySignal` | [stock-api/src/analyzers/eventReactionSignals.js](stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `evaluateCatalystRules` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `computeConcentration` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `computeHHI` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `parseTweetDump` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `runScan` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `resolveUniverse` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `applyLiquidityGate` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `postEventReturns` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `eventReturns` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `driftSignature` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `parseScreenerInsights` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `detectAuthState` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `parseProsCons` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `parseTopRatios` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `tagInsights` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `avgTradedValueCr` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `toCandles` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `fetchPriceMetrics` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `normalizePvd` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `scanCatalysts` | [stock-api/src/analyzers/index.js](stock-api/src/analyzers/index.js) | Exported from index.js |
| `sniffAndParse` | [stock-api/src/analyzers/parseTweetDump.js](stock-api/src/analyzers/parseTweetDump.js) | Exported from parseTweetDump.js |
| `resolveReplyContext` | [stock-api/src/analyzers/parseTweetDump.js](stock-api/src/analyzers/parseTweetDump.js) | Exported from parseTweetDump.js |
| `normaliseTweet` | [stock-api/src/analyzers/parseTweetDump.js](stock-api/src/analyzers/parseTweetDump.js) | Exported from parseTweetDump.js |
| `normalizeCandles` | [stock-api/src/analyzers/postEventReturns.js](stock-api/src/analyzers/postEventReturns.js) | Exported from postEventReturns.js |
| `anchorIndex` | [stock-api/src/analyzers/postEventReturns.js](stock-api/src/analyzers/postEventReturns.js) | Exported from postEventReturns.js |
| `forwardReturn` | [stock-api/src/analyzers/postEventReturns.js](stock-api/src/analyzers/postEventReturns.js) | Exported from postEventReturns.js |
| `tsToDate` | [stock-api/src/analyzers/postEventReturns.js](stock-api/src/analyzers/postEventReturns.js) | Exported from postEventReturns.js |
| `toIsoDate` | [stock-api/src/analyzers/priceMetrics.js](stock-api/src/analyzers/priceMetrics.js) | Exported from priceMetrics.js |
| `parseScanId` | [stock-api/src/analyzers/runScan.js](stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `buildRunPayload` | [stock-api/src/analyzers/runScan.js](stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `flattenTable` | [stock-api/src/analyzers/runScan.js](stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `col` | [stock-api/src/analyzers/runScan.js](stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `toCrore` | [stock-api/src/analyzers/runScan.js](stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `parseNum` | [stock-api/src/analyzers/runScan.js](stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `renderHtml` | [stock-api/src/analyzers/scanCatalysts.js](stock-api/src/analyzers/scanCatalysts.js) | Exported from scanCatalysts.js |
| `fetchAnnouncementsBatch` | [stock-api/src/analyzers/scanCatalysts.js](stock-api/src/analyzers/scanCatalysts.js) | Exported from scanCatalysts.js |
| `pickRatio` | [stock-api/src/analyzers/screenerInsights.js](stock-api/src/analyzers/screenerInsights.js) | Exported from screenerInsights.js |
| `stripTags` | [stock-api/src/analyzers/screenerInsights.js](stock-api/src/analyzers/screenerInsights.js) | Exported from screenerInsights.js |
| `fetchAndExtract` | [stock-api/src/fetchers/announcementScanner.js](stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `lastNQuarterDates` | [stock-api/src/fetchers/announcementScanner.js](stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `fetchQuarter` | [stock-api/src/fetchers/announcementScanner.js](stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `extractNgrams` | [stock-api/src/fetchers/announcementScanner.js](stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `extractCandidatePhrases` | [stock-api/src/fetchers/announcementScanner.js](stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `tokenize` | [stock-api/src/fetchers/announcementScanner.js](stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `fetchAnnouncements` | [stock-api/src/fetchers/announcementsFetcher.js](stock-api/src/fetchers/announcementsFetcher.js) | Exported from announcementsFetcher.js |
| `iterAnnouncements` | [stock-api/src/fetchers/announcementsFetcher.js](stock-api/src/fetchers/announcementsFetcher.js) | Exported from announcementsFetcher.js |
| `matchesQuery` | [stock-api/src/fetchers/announcementsFetcher.js](stock-api/src/fetchers/announcementsFetcher.js) | Exported from announcementsFetcher.js |
| `inDateRange` | [stock-api/src/fetchers/announcementsFetcher.js](stock-api/src/fetchers/announcementsFetcher.js) | Exported from announcementsFetcher.js |
| `announcementFilename` | [stock-api/src/fetchers/announcementsFetcher.js](stock-api/src/fetchers/announcementsFetcher.js) | Exported from announcementsFetcher.js |
| `fetchDocuments` | [stock-api/src/fetchers/documentsFetcher.js](stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `filterDocuments` | [stock-api/src/fetchers/documentsFetcher.js](stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `normaliseType` | [stock-api/src/fetchers/documentsFetcher.js](stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `parseDateFilter` | [stock-api/src/fetchers/documentsFetcher.js](stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `docYyyymm` | [stock-api/src/fetchers/documentsFetcher.js](stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `safeTicker` | [stock-api/src/fetchers/documentsFetcher.js](stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `buildFilename` | [stock-api/src/fetchers/documentsFetcher.js](stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `toIstNaiveString` | [stock-api/src/fetchers/reactionCandlesFetcher.js](stock-api/src/fetchers/reactionCandlesFetcher.js) | Exported from reactionCandlesFetcher.js |
| `toIstDateString` | [stock-api/src/fetchers/reactionCandlesFetcher.js](stock-api/src/fetchers/reactionCandlesFetcher.js) | Exported from reactionCandlesFetcher.js |
| `normalizeRows` | [stock-api/src/fetchers/reactionCandlesFetcher.js](stock-api/src/fetchers/reactionCandlesFetcher.js) | Exported from reactionCandlesFetcher.js |
| `fetchTier` | [stock-api/src/fetchers/reactionCandlesFetcher.js](stock-api/src/fetchers/reactionCandlesFetcher.js) | Exported from reactionCandlesFetcher.js |
| `fetchReactionCandles` | [stock-api/src/fetchers/reactionCandlesFetcher.js](stock-api/src/fetchers/reactionCandlesFetcher.js) | Exported from reactionCandlesFetcher.js |
| `createConcallPdf` | [stock-api/src/generators/generateConcallPdf.js](stock-api/src/generators/generateConcallPdf.js) | Exported from generateConcallPdf.js |
| `createCredibilityWidget` | [stock-api/src/generators/generateCredibilityWidget.js](stock-api/src/generators/generateCredibilityWidget.js) | Exported from generateCredibilityWidget.js |
| `getCredibilitySchema` | [stock-api/src/generators/generateCredibilityWidget.js](stock-api/src/generators/generateCredibilityWidget.js) | Exported from generateCredibilityWidget.js |
| `createDrhpPdf` | [stock-api/src/generators/generateDrhpPdf.js](stock-api/src/generators/generateDrhpPdf.js) | Exported from generateDrhpPdf.js |
| `createForensicPdf` | [stock-api/src/generators/generateForensicPdf.js](stock-api/src/generators/generateForensicPdf.js) | Exported from generateForensicPdf.js |
| `getForensicSchema` | [stock-api/src/generators/generateForensicPdf.js](stock-api/src/generators/generateForensicPdf.js) | Exported from generateForensicPdf.js |
| `createGrowthTriggersPdf` | [stock-api/src/generators/generateGrowthTriggersPdf.js](stock-api/src/generators/generateGrowthTriggersPdf.js) | Exported from generateGrowthTriggersPdf.js |
| `createMarketShareWidget` | [stock-api/src/generators/generateMarketShareHtml.js](stock-api/src/generators/generateMarketShareHtml.js) | Exported from generateMarketShareHtml.js |
| `createPeerComparisonPdf` | [stock-api/src/generators/generatePeerPdf.js](stock-api/src/generators/generatePeerPdf.js) | Exported from generatePeerPdf.js |
| `getPeerSchema` | [stock-api/src/generators/generatePeerPdf.js](stock-api/src/generators/generatePeerPdf.js) | Exported from generatePeerPdf.js |
| `createResearchReport` | [stock-api/src/generators/generateReport.js](stock-api/src/generators/generateReport.js) | Exported from generateReport.js |
| `createResearchReportFromDto` | [stock-api/src/generators/generateReport.js](stock-api/src/generators/generateReport.js) | Exported from generateReport.js |
| `writeReportDto` | [stock-api/src/generators/generateReport.js](stock-api/src/generators/generateReport.js) | Exported from generateReport.js |
| `createSectorReport` | [stock-api/src/generators/generateSectorReport.js](stock-api/src/generators/generateSectorReport.js) | Exported from generateSectorReport.js |
| `nse` | [stock-api/src/index.js](stock-api/src/index.js) | Exported from index.js |
| `bse` | [stock-api/src/index.js](stock-api/src/index.js) | Exported from index.js |
| `screener` | [stock-api/src/index.js](stock-api/src/index.js) | Exported from index.js |
| `nseSession` | [stock-api/src/index.js](stock-api/src/index.js) | Exported from index.js |
| `fetchEventReactionMetrics` | [stock-api/src/orchestration/eventReactionMetrics.js](stock-api/src/orchestration/eventReactionMetrics.js) | Exported from eventReactionMetrics.js |
| `fmtNse` | [stock-api/src/orchestration/eventReactionMetrics.js](stock-api/src/orchestration/eventReactionMetrics.js) | Exported from eventReactionMetrics.js |
| `fmtBse` | [stock-api/src/orchestration/eventReactionMetrics.js](stock-api/src/orchestration/eventReactionMetrics.js) | Exported from eventReactionMetrics.js |
| `normalizeText` | [stock-api/src/utils/announcementNoiseFilter.js](stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `normalizeKeywordList` | [stock-api/src/utils/announcementNoiseFilter.js](stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `loadNoiseKeywords` | [stock-api/src/utils/announcementNoiseFilter.js](stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `saveNoiseKeywords` | [stock-api/src/utils/announcementNoiseFilter.js](stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `shouldIgnoreAnnouncement` | [stock-api/src/utils/announcementNoiseFilter.js](stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `matchedNoiseKeyword` | [stock-api/src/utils/announcementNoiseFilter.js](stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `scanAnnouncementsForCompanies` | [stock-api/src/utils/bulkAnnouncementScan.js](stock-api/src/utils/bulkAnnouncementScan.js) | Exported from bulkAnnouncementScan.js |
| `scanAllPages` | [stock-api/src/utils/bulkAnnouncementScan.js](stock-api/src/utils/bulkAnnouncementScan.js) | Exported from bulkAnnouncementScan.js |
| `computeReleaseQuarterDate` | [stock-api/src/utils/bulkAnnouncementScan.js](stock-api/src/utils/bulkAnnouncementScan.js) | Exported from bulkAnnouncementScan.js |
| `buildAnnouncementScanBody` | [stock-api/src/utils/bulkAnnouncementScan.js](stock-api/src/utils/bulkAnnouncementScan.js) | Exported from bulkAnnouncementScan.js |
| `sanitizeCompanyId` | [stock-api/src/utils/companyId.js](stock-api/src/utils/companyId.js) | Exported from companyId.js |
| `mapWithConcurrency` | [stock-api/src/utils/concurrency.js](stock-api/src/utils/concurrency.js) | Exported from concurrency.js |
| `withRetry` | [stock-api/src/utils/concurrency.js](stock-api/src/utils/concurrency.js) | Exported from concurrency.js |
| `chunk` | [stock-api/src/utils/concurrency.js](stock-api/src/utils/concurrency.js) | Exported from concurrency.js |
| `latestCompletedQuarter` | [stock-api/src/utils/fiscalQuarter.js](stock-api/src/utils/fiscalQuarter.js) | Exported from fiscalQuarter.js |
| `parseQuarterString` | [stock-api/src/utils/fiscalQuarter.js](stock-api/src/utils/fiscalQuarter.js) | Exported from fiscalQuarter.js |
| `calendarToQuarter` | [stock-api/src/utils/fiscalQuarter.js](stock-api/src/utils/fiscalQuarter.js) | Exported from fiscalQuarter.js |
| `wrapHtml` | [stock-api/src/utils/pdfRenderer.js](stock-api/src/utils/pdfRenderer.js) | Exported from pdfRenderer.js |
| `markdownToHtml` | [stock-api/src/utils/pdfRenderer.js](stock-api/src/utils/pdfRenderer.js) | Exported from pdfRenderer.js |
| `renderPdf` | [stock-api/src/utils/pdfRenderer.js](stock-api/src/utils/pdfRenderer.js) | Exported from pdfRenderer.js |
| `parseMarkdownTable` | [stock-api/src/utils/pdfUtils.js](stock-api/src/utils/pdfUtils.js) | Exported from pdfUtils.js |
| `formatInlineMarkdown` | [stock-api/src/utils/pdfUtils.js](stock-api/src/utils/pdfUtils.js) | Exported from pdfUtils.js |
| `styledTableHtml` | [stock-api/src/utils/pdfUtils.js](stock-api/src/utils/pdfUtils.js) | Exported from pdfUtils.js |
| `chipHtml` | [stock-api/src/utils/pdfUtils.js](stock-api/src/utils/pdfUtils.js) | Exported from pdfUtils.js |
| `calloutHtml` | [stock-api/src/utils/pdfUtils.js](stock-api/src/utils/pdfUtils.js) | Exported from pdfUtils.js |
| `buildTranscriptContent` | [stock-api/src/utils/transcriptSchema.js](stock-api/src/utils/transcriptSchema.js) | Exported from transcriptSchema.js |
| `segmentsFromParagraphs` | [stock-api/src/utils/transcriptSchema.js](stock-api/src/utils/transcriptSchema.js) | Exported from transcriptSchema.js |
| `parseSpeakerLabeledText` | [stock-api/src/utils/transcriptSchema.js](stock-api/src/utils/transcriptSchema.js) | Exported from transcriptSchema.js |
| `segmentsToFullText` | [stock-api/src/utils/transcriptSchema.js](stock-api/src/utils/transcriptSchema.js) | Exported from transcriptSchema.js |
| `classifyRole` | [stock-api/src/utils/transcriptSchema.js](stock-api/src/utils/transcriptSchema.js) | Exported from transcriptSchema.js |
