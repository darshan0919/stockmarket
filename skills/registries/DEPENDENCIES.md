# Workflow Dependencies Registry

This registry lists all available **Skills**, **Classes**, **APIs/Clients**, and **Utility Functions** within the stockmarket monorepo. 
Use this document to check if a specific functionality, client, or skill already exists before implementing a new one or to find components to tweak.

---

## 1. Skills
Available high-level agentic skills defined in the project:

| Skill Name | Entry Point | Aliases / Keywords |
|---|---|---|
| [concall-transcript-extractor](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/get-latest-concall-transcript.js) | `stock-api/bin/get-latest-concall-transcript.js` | concall transcript early, transcribe earnings call recording, recording of conference call, transcript before official filing, notebooklm transcript, perplexity earnings transcript, verbatim transcript from recording, concall transcript extractor, latest quarter transcript, bulk transcript fetch, transcripts for multiple companies, historical quarter transcript |
| [stock-documents-fetcher](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/stock-documents-fetcher.js) | `stock-api/bin/stock-documents-fetcher.js` | fetch documents, fetch transcripts, fetch annual reports, download filings, get concall, pull documents, stockscans fetch, fetch ppt, get investor presentation |
| [concall-analysis](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/concall-analysis.js) | `stock-api/bin/concall-analysis.js` | concall, earnings call analysis, transcript analysis, concall deep dive, quarterly call, concall brief, multi quarter concall, peer concall |
| [forensic-accounting](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/forensic-accounting.js) | `stock-api/bin/forensic-accounting.js` | forensic, forensic check, fraud check, accounting quality, is this company cooking books, piotroski, dupont, red flags accounting, forensic analysis |
| [equity-research-deepdive](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/equity-research-deepdive.js) | `stock-api/bin/equity-research-deepdive.js` | deep dive, equity deep dive, research report, investment memo, fundamental analysis, full analysis, should I invest, analyze company, tell me everything about |
| [growth-triggers-1pager](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/growth-triggers-1pager.js) | `stock-api/bin/growth-triggers-1pager.js` | growth triggers, 1 pager, one pager, catalyst note, re-rating triggers, conviction note, why will stock rerate, growth catalyst |
| [management-credibility-tracker](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/management-credibility-tracker.js) | `stock-api/bin/management-credibility-tracker.js` | management credibility, walk the talk, management track record, guidance tracker, is management delivering, overpromising, credibility score, management quality |
| [peer-comparison](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/peer-comparison.js) | `stock-api/bin/peer-comparison.js` | peer comparison, compare companies, side by side, which to buy, peer report, compare stocks, relative valuation |
| [market-share-analysis](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/market-share-analysis.js) | `stock-api/bin/market-share-analysis.js` | market share, competitive landscape, industry concentration, who dominates, cr3 cr5 hhi, organised unorganised, top players, market structure |
| [sector-research-deepdive](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/sector-research-deepdive.js) | `stock-api/bin/sector-research-deepdive.js` | sector report, sector deep dive, industry analysis, thematic note, sector primer, industry deep dive, competitive dynamics |
| [drhp-ipo-analysis](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/drhp-ipo-analysis.js) | `stock-api/bin/drhp-ipo-analysis.js` | drhp, ipo analysis, rhp analysis, should I subscribe ipo, analyse drhp, ipo fairly priced, prospectus analysis |
| [quarterly-result-analysis](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/quarterly-result-analysis.js) | `stock-api/bin/quarterly-result-analysis.js` | quarterly results, result analysis, what changed this quarter, quarterly snapshot, post result note, q result, results analysis |
| [consecutive-filings-diff](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/consecutive-filings-diff.js) | `stock-api/bin/consecutive-filings-diff.js` | diff decks, compare presentations, q vs q presentation, consecutive filings, qoq diff, update thesis latest concall, reprice after results |
| [pre-pead-scanner](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/pre-pead-scanner.js) | `stock-api/bin/pre-pead-scanner.js` | pre pead, pre results scanner, rank companies before earnings, estimate next quarter, guidance ranking, pre-PEAD, results season scanner |
| [watchlist-catalyst-scanner](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/watchlist-catalyst-scanner.js) | `stock-api/bin/watchlist-catalyst-scanner.js` | catalyst scanner, scan watchlist, any catalysts today, catalyst alerts, what's moving watchlist, daily catalyst scan, check announcements |
| [fundamental-shift-scanner](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | fundamental shift, what changed this week, recent news, scan announcements, what's new with, recent filings, red flags recent, pulse check stock |
| [equity-research-extraction](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/equity-research-extraction.js) | `stock-api/bin/equity-research-extraction.js` | equity extraction, research extraction, extract from annual report, project a extraction, ar extracts, concall extraction, document extraction |
| [equity-research-dashboard](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | equity dashboard, research dashboard, project b dashboard, 15 tab dashboard, institutional dashboard, generate dashboard |
| [equity-research-master](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | equity master, full equity research, complete analysis, research ticker, institutional dashboard, 16 tab dashboard, master dashboard, full workup |
| [tweet-investor-playbook](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/tweet-investor-playbook.js) | `stock-api/bin/tweet-investor-playbook.js` | tweet playbook, investor tweets, analyse tweets, investment style from tweets, tweet corpus, distil investor thinking, track record tweets |
| [announcement-keyword-explorer](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/announcement-keyword-explorer.js) | `stock-api/bin/announcement-keyword-explorer.js` | announcement keywords, keyword explorer, find announcement keywords, scan keywords, announcement search keywords, expand keyword search |
| [stock-report](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | stock report, equity report, research note, buy sell recommendation, price target, stock analysis, should I buy, investment view |
| [watchlist-sync](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | watchlist sync, sync watchlist, near highs sync, nightly sync, watchlist update |
| [insight-validation](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | insight validation, validate insights, morning insights check, delivery backed price action, insight ledger |
| [gainers-signal](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | gainers signal, top gainers, daily gainers, gainer classification, conviction signals, 8am gainers run |
| [order-book-tracker](file:////Users/darshan.patel/code/personal/stockmarket/packages/jobs-runtime/scripts/orderbook/getCompanyOrderBook.js) | `packages/jobs-runtime/scripts/orderbook/getCompanyOrderBook.js` | order book, orderbook, unexecuted order book, outstanding order book, order backlog, current order book, order wins since concall, new order announcements, execution timeline of orders, book to bill, order inflow, L1 orders |
| [watchlist-insights](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | watchlist insights, announcement insights, daily insights, watchlist digest, corporate announcement digest |
| [cowork-task-architect](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | cowork task, create task, schedule task, cowork architect, task prompt, automate in cowork, recurring task |
| [skill-manager](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | skill manager, create skill, modify skill, delete skill, skill creator, manage skills |
| [render-pdf](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/bin/render-pdf.js) | `stock-api/bin/render-pdf.js` | render pdf, html to pdf |
| [investment-thesis-engine](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | investment thesis, thesis engine, update thesis, buy hold sell signal, thesis review, recompute signal, should i still hold, living thesis, evolving thesis |
| [financial-model](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | financial model, 3 year forecast, forecast model, bear base bull, irr from here, project the pnl, valuation model, earnings model |
| [value-chain-analysis](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | value chain, where does margin sit, chokepoint analysis, value migration, map the chain, bottleneck owner |
| [annual-report-analysis](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | annual report analysis, analyse this ar, ar analysis, md letter summary, governance check, remuneration check, kmp resignations |
| [stage2-catalyst-analysis](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | stage 2, weinstein stage, soic lti, 30 wema, breakout analysis, why now catalyst, technical stage, entry stop loss, institutional accumulation |
| [dead-code-scanner](file:////Users/darshan.patel/code/personal/stockmarket) | `N/A` | dead code, dead code scanner, find unused files, find unused exports, find dead code, clean up unused code |

---

## 2. Classes (Clients & Helpers)
Instantiable classes for DI or custom configurations:

### event
- **Source File**: [catalystRules.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/catalystRules.js)
- **Key Methods**:


### event
- **Source File**: [catalystRules.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/catalystRules.js)
- **Key Methods**:


### PerplexityAuth
- **Source File**: [perplexityAuth.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/auth/perplexityAuth.js)
- **Key Methods**:
  - `_envFile()`
  - `_resolve()`
  - `cookieHeader()`
  - `accountId()`
  - `headers()`
  - `isFullyConfigured()`

### ScreenerAuth
- **Source File**: [screenerAuth.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/auth/screenerAuth.js)
- **Key Methods**:
  - `_envFile()`
  - `_resolve()`
  - `cookieHeader()`
  - `headers()`
  - `isConfigured()`

### StockscansAuth
- **Source File**: [stockscansAuth.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/auth/stockscansAuth.js)
- **Key Methods**:
  - `_readFromEnvFile()`
  - `_warnLegacy()`
  - `getToken()`
  - `headers()`

### BseClient
- **Source File**: [BseClient.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/clients/BseClient.js)
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
- **Source File**: [NseClient.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/clients/NseClient.js)
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
- **Source File**: [PerplexityClient.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/clients/PerplexityClient.js)
- **Key Methods**:
  - `earningsEvents()`
  - `transcript()`

### ScreenerClient
- **Source File**: [ScreenerClient.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/clients/ScreenerClient.js)
- **Key Methods**:
  - `_slug()`
  - `companyPage()`
  - `_throttle()`
  - `companyPageWithFallback()`
  - `validateAuth()`

### StockscansClient
- **Source File**: [StockscansClient.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/clients/StockscansClient.js)
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
- **Source File**: [HttpClient.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/http/HttpClient.js)
- **Key Methods**:
  - `_headers()`
  - `get()`
  - `post()`
  - `put()`
  - `delete()`

### NseSession
- **Source File**: [nseSession.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/http/nseSession.js)
- **Key Methods**:
  - `clearCache()`
  - `_mergeSetCookie()`
  - `warmup()`
  - `getCookies()`
  - `headers()`
  - `get()`

### SimpleTemplate
- **Source File**: [docGenerator.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/docGenerator.js)
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
- **Source File**: [docGenerator.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/docGenerator.js)
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
- **Source File**: [pdfRenderer.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/pdfRenderer.js)
- **Key Methods**:



---

## 3. APIs and Clients
Core singletons and client functions for interacting with external platforms:

| API / Client Name | Source File | Description |
|---|---|---|
| `parseBseSmartSearchHtml` | [BseClient.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/clients/BseClient.js) | Exported from BseClient.js |
| `toPerplexityTicker` | [PerplexityClient.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/clients/PerplexityClient.js) | Exported from PerplexityClient.js |
| `paragraphsToText` | [PerplexityClient.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/clients/PerplexityClient.js) | Exported from PerplexityClient.js |
| `buildBseUrl` | [bseHttp.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/http/bseHttp.js) | Exported from bseHttp.js |
| `bseGetText` | [bseHttp.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/http/bseHttp.js) | Exported from bseHttp.js |
| `bseGetJson` | [bseHttp.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/http/bseHttp.js) | Exported from bseHttp.js |

---

## 4. Utilities
Helper functions and utilities for common processes (data parsing, PDF generation, formatting, etc.):

| Utility Name | Source File | Description |
|---|---|---|
| `extractValueCrore` | [catalystRules.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/catalystRules.js) | Exported from catalystRules.js |
| `findNames` | [catalystRules.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/catalystRules.js) | Exported from catalystRules.js |
| `classify` | [catalystRules.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/catalystRules.js) | Exported from catalystRules.js |
| `priceVolumeAlerts` | [catalystRules.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/catalystRules.js) | Exported from catalystRules.js |
| `hhiClassification` | [computeConcentration.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `crN` | [computeConcentration.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `hhi` | [computeConcentration.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `computeMetrics` | [computeConcentration.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `deltaBps` | [computeConcentration.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `asymmetricFlag` | [computeConcentration.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/computeConcentration.js) | Exported from computeConcentration.js |
| `classifyEventText` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `parseNseTimestamp` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `parseBseTimestamp` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `normalizeNseAnnouncement` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `normalizeBseAnnouncement` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `mergeAnnouncements` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `findLatestEvent` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `earliestEventTimestamp` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `normalizeOhlcv` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `candleIndexAtOrAfter` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `candleIndexAtOrBefore` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `computeReactionMetrics` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `classifySignal` | [eventReactionSignals.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/eventReactionSignals.js) | Exported from eventReactionSignals.js |
| `evaluateCatalystRules` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `computeConcentration` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `computeHHI` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `parseTweetDump` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `runScan` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `resolveUniverse` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `applyLiquidityGate` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `postEventReturns` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `eventReturns` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `driftSignature` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `parseScreenerInsights` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `detectAuthState` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `parseProsCons` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `parseTopRatios` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `tagInsights` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `avgTradedValueCr` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `toCandles` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `fetchPriceMetrics` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `normalizePvd` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `scanCatalysts` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/index.js) | Exported from index.js |
| `sniffAndParse` | [parseTweetDump.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/parseTweetDump.js) | Exported from parseTweetDump.js |
| `resolveReplyContext` | [parseTweetDump.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/parseTweetDump.js) | Exported from parseTweetDump.js |
| `normaliseTweet` | [parseTweetDump.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/parseTweetDump.js) | Exported from parseTweetDump.js |
| `normalizeCandles` | [postEventReturns.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/postEventReturns.js) | Exported from postEventReturns.js |
| `anchorIndex` | [postEventReturns.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/postEventReturns.js) | Exported from postEventReturns.js |
| `forwardReturn` | [postEventReturns.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/postEventReturns.js) | Exported from postEventReturns.js |
| `tsToDate` | [postEventReturns.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/postEventReturns.js) | Exported from postEventReturns.js |
| `toIsoDate` | [priceMetrics.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/priceMetrics.js) | Exported from priceMetrics.js |
| `parseScanId` | [runScan.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `buildRunPayload` | [runScan.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `flattenTable` | [runScan.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `col` | [runScan.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `toCrore` | [runScan.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `parseNum` | [runScan.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/runScan.js) | Exported from runScan.js |
| `renderHtml` | [scanCatalysts.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/scanCatalysts.js) | Exported from scanCatalysts.js |
| `fetchAnnouncementsBatch` | [scanCatalysts.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/scanCatalysts.js) | Exported from scanCatalysts.js |
| `pickRatio` | [screenerInsights.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/screenerInsights.js) | Exported from screenerInsights.js |
| `stripTags` | [screenerInsights.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/analyzers/screenerInsights.js) | Exported from screenerInsights.js |
| `fetchAndExtract` | [announcementScanner.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `lastNQuarterDates` | [announcementScanner.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `fetchQuarter` | [announcementScanner.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `extractNgrams` | [announcementScanner.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `extractCandidatePhrases` | [announcementScanner.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `tokenize` | [announcementScanner.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementScanner.js) | Exported from announcementScanner.js |
| `fetchAnnouncements` | [announcementsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementsFetcher.js) | Exported from announcementsFetcher.js |
| `iterAnnouncements` | [announcementsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementsFetcher.js) | Exported from announcementsFetcher.js |
| `matchesQuery` | [announcementsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementsFetcher.js) | Exported from announcementsFetcher.js |
| `inDateRange` | [announcementsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementsFetcher.js) | Exported from announcementsFetcher.js |
| `announcementFilename` | [announcementsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/announcementsFetcher.js) | Exported from announcementsFetcher.js |
| `fetchDocuments` | [documentsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `filterDocuments` | [documentsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `normaliseType` | [documentsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `parseDateFilter` | [documentsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `docYyyymm` | [documentsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `safeTicker` | [documentsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `buildFilename` | [documentsFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/documentsFetcher.js) | Exported from documentsFetcher.js |
| `toIstNaiveString` | [reactionCandlesFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/reactionCandlesFetcher.js) | Exported from reactionCandlesFetcher.js |
| `toIstDateString` | [reactionCandlesFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/reactionCandlesFetcher.js) | Exported from reactionCandlesFetcher.js |
| `normalizeRows` | [reactionCandlesFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/reactionCandlesFetcher.js) | Exported from reactionCandlesFetcher.js |
| `fetchTier` | [reactionCandlesFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/reactionCandlesFetcher.js) | Exported from reactionCandlesFetcher.js |
| `fetchReactionCandles` | [reactionCandlesFetcher.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/fetchers/reactionCandlesFetcher.js) | Exported from reactionCandlesFetcher.js |
| `createConcallPdf` | [generateConcallPdf.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateConcallPdf.js) | Exported from generateConcallPdf.js |
| `createCredibilityWidget` | [generateCredibilityWidget.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateCredibilityWidget.js) | Exported from generateCredibilityWidget.js |
| `getCredibilitySchema` | [generateCredibilityWidget.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateCredibilityWidget.js) | Exported from generateCredibilityWidget.js |
| `createDrhpPdf` | [generateDrhpPdf.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateDrhpPdf.js) | Exported from generateDrhpPdf.js |
| `createForensicPdf` | [generateForensicPdf.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateForensicPdf.js) | Exported from generateForensicPdf.js |
| `getForensicSchema` | [generateForensicPdf.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateForensicPdf.js) | Exported from generateForensicPdf.js |
| `createGrowthTriggersPdf` | [generateGrowthTriggersPdf.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateGrowthTriggersPdf.js) | Exported from generateGrowthTriggersPdf.js |
| `createMarketShareWidget` | [generateMarketShareHtml.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateMarketShareHtml.js) | Exported from generateMarketShareHtml.js |
| `createPeerComparisonPdf` | [generatePeerPdf.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generatePeerPdf.js) | Exported from generatePeerPdf.js |
| `getPeerSchema` | [generatePeerPdf.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generatePeerPdf.js) | Exported from generatePeerPdf.js |
| `createResearchReport` | [generateReport.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateReport.js) | Exported from generateReport.js |
| `createResearchReportFromDto` | [generateReport.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateReport.js) | Exported from generateReport.js |
| `writeReportDto` | [generateReport.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateReport.js) | Exported from generateReport.js |
| `createSectorReport` | [generateSectorReport.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/generators/generateSectorReport.js) | Exported from generateSectorReport.js |
| `nse` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/index.js) | Exported from index.js |
| `bse` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/index.js) | Exported from index.js |
| `screener` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/index.js) | Exported from index.js |
| `nseSession` | [index.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/index.js) | Exported from index.js |
| `fetchEventReactionMetrics` | [eventReactionMetrics.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/orchestration/eventReactionMetrics.js) | Exported from eventReactionMetrics.js |
| `fmtNse` | [eventReactionMetrics.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/orchestration/eventReactionMetrics.js) | Exported from eventReactionMetrics.js |
| `fmtBse` | [eventReactionMetrics.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/orchestration/eventReactionMetrics.js) | Exported from eventReactionMetrics.js |
| `normalizeText` | [announcementNoiseFilter.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `normalizeKeywordList` | [announcementNoiseFilter.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `loadNoiseKeywords` | [announcementNoiseFilter.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `saveNoiseKeywords` | [announcementNoiseFilter.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `shouldIgnoreAnnouncement` | [announcementNoiseFilter.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `matchedNoiseKeyword` | [announcementNoiseFilter.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/announcementNoiseFilter.js) | Exported from announcementNoiseFilter.js |
| `scanAnnouncementsForCompanies` | [bulkAnnouncementScan.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/bulkAnnouncementScan.js) | Exported from bulkAnnouncementScan.js |
| `scanAllPages` | [bulkAnnouncementScan.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/bulkAnnouncementScan.js) | Exported from bulkAnnouncementScan.js |
| `computeReleaseQuarterDate` | [bulkAnnouncementScan.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/bulkAnnouncementScan.js) | Exported from bulkAnnouncementScan.js |
| `buildAnnouncementScanBody` | [bulkAnnouncementScan.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/bulkAnnouncementScan.js) | Exported from bulkAnnouncementScan.js |
| `mapWithConcurrency` | [concurrency.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/concurrency.js) | Exported from concurrency.js |
| `withRetry` | [concurrency.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/concurrency.js) | Exported from concurrency.js |
| `chunk` | [concurrency.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/concurrency.js) | Exported from concurrency.js |
| `latestCompletedQuarter` | [fiscalQuarter.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/fiscalQuarter.js) | Exported from fiscalQuarter.js |
| `parseQuarterString` | [fiscalQuarter.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/fiscalQuarter.js) | Exported from fiscalQuarter.js |
| `calendarToQuarter` | [fiscalQuarter.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/fiscalQuarter.js) | Exported from fiscalQuarter.js |
| `wrapHtml` | [pdfRenderer.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/pdfRenderer.js) | Exported from pdfRenderer.js |
| `markdownToHtml` | [pdfRenderer.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/pdfRenderer.js) | Exported from pdfRenderer.js |
| `renderPdf` | [pdfRenderer.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/pdfRenderer.js) | Exported from pdfRenderer.js |
| `parseMarkdownTable` | [pdfUtils.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/pdfUtils.js) | Exported from pdfUtils.js |
| `formatInlineMarkdown` | [pdfUtils.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/pdfUtils.js) | Exported from pdfUtils.js |
| `styledTableHtml` | [pdfUtils.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/pdfUtils.js) | Exported from pdfUtils.js |
| `chipHtml` | [pdfUtils.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/pdfUtils.js) | Exported from pdfUtils.js |
| `calloutHtml` | [pdfUtils.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/pdfUtils.js) | Exported from pdfUtils.js |
| `buildTranscriptContent` | [transcriptSchema.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/transcriptSchema.js) | Exported from transcriptSchema.js |
| `segmentsFromParagraphs` | [transcriptSchema.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/transcriptSchema.js) | Exported from transcriptSchema.js |
| `parseSpeakerLabeledText` | [transcriptSchema.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/transcriptSchema.js) | Exported from transcriptSchema.js |
| `segmentsToFullText` | [transcriptSchema.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/transcriptSchema.js) | Exported from transcriptSchema.js |
| `classifyRole` | [transcriptSchema.js](file:////Users/darshan.patel/code/personal/stockmarket/stock-api/src/utils/transcriptSchema.js) | Exported from transcriptSchema.js |
