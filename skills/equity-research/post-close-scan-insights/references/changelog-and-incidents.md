# Post-Close Scan Insights — Historical Incidents & Evolution Changelog

Reference archive for `post-close-scan-insights`. Documents historical production incidents, design evolutions, and calibration rationale to keep `SKILL.md` lean and focused on operational execution.

---

## 1. The Pre-Filter vs Taxonomy Distinction (Incident 2026-09-17)

- **2026-09-05:** In response to PC Jeweller (debt clearance update), Jindal Worldwide (showroom rollout press release), and SML Mahindra (monthly volume update) being misclassified as `ROUTINE` by `gainersScanner.js`'s title-only taxonomy guess, `filter-noise` was modified to stop dropping keyword matches, instead tagging them `noiseFlagged: true` and routing them to full PDF reading.
- **2026-09-17 Revert (Darshan's Correction):** Confirmed in live production that NSE:MIDHANI ("Change in Directorate" - routine MoD nominee-director rotation) and NSE:LOKESHMACH ("Change in Management" - operational VP hire, not board) matched curated noise keywords, were flagged, but were still fully read, judged, and digested.
- **Root Cause & Architectural Separation:**
  1. `stock-api/src/data/announcement-noise-keywords.json` is a **curated, user-editable pre-filter** (AGM/EGM notices, postal ballots, analyst meet intimations, dividend mechanics, ESOP allotments, credit rating routine updates, trading window closures). These are **deliberately dropped before any PDF is opened**.
  2. The taxonomy layer (`categorise` in `announcementTaxonomy.js`) provides an automatic, best-effort category guess. **"Never judge strength from a title alone"** applies strictly at this taxonomy layer, never at the curated pre-filter.
  3. If a material announcement is ever found hiding behind a noise keyword, the fix is to refine the specific keyword in the JSON list, not disable dropping.

---

## 2. Same-Day Duplicate & Companion Grouping (2026-09-13)

- **Incident:** In a 246-item batch, 15-20% of PDF reads were exact-duplicate or same-day companion filings for a single underlying corporate event (e.g. board outcome Reg 30 filing, companion press release, and investor presentation restating the same numbers filed within hours of each other).
- **Resolution:** `groupDuplicateFilings` in `postCloseScanInsights.js` groups announcements by `same companyId + same calendar date + title/description fuzzy similarity > threshold` before any PDF is read.
- **Routing:** Earliest filed item is designated `isDuplicateLead: true`. Companions receive `isDuplicateLead: false` and cite `duplicateOf: <lead_ssUrl>`. They bypass PDF reading and LLM calls, saving significant run duration.

---

## 3. PDF Cold-Fetch Latency & Concurrent Prefetching (2026-09-17)

- **Incident:** Uncached PDF downloads from Stockscans during market hours measured 30–60+ seconds per file. In a 96-item batch, sequential reads in Step 3 resulted in an execution duration of ~155 minutes.
- **Resolution:** Added `runwi prefetch-pdfs <urls.json> --concurrency 8` prior to the per-item loop. Warmed the Tier-1 `cache/pdf-text/` cache concurrently, dropping per-item loop read times to under 20ms cache hits.

---

## 4. Heavy Document Pre-processing Coverage (2026-09-04)

- **Incident:** Over 21 days, 438 heavy documents (Results: 205, PPTs: 125, Transcripts: 86, ARs: 20) were skipped unread, creating a blind spot for primary catalyst disclosures.
- **Resolution:** Integrated `docExtracts.js` from `document-preprocessor`. When a pre-processed filing extract exists, Step 3 writes a signal-grade note with page-anchored quotes, delegating deep multi-quarter modeling to specialist skills (`quarterly-result-analysis`, `concall-analysis`).

---

## 5. Metrics & Watchlist TTL Integration (2026-09-04 & 2026-09-23)

- **Mcap & Deliv/Mcap %:** Added to Thesis Cards because absolute delivery rupee volume does not compare equitably across market caps (₹40 Cr delivery is massive conviction in a ₹500 Cr cap, but trivial in a ₹40,000 Cr cap).
- **Announcement Signals Watchlist TTL:** Added automatic syncing to the "Announcement Signals" Stockscans watchlist for any card scoring > 60/100 (S1/S2 tiers) with a 7-day rolling TTL.
- **Mcap & P/E Display:** Enriched metric lines at send-digest time using `fetchMarketCapAndPE` batch scan lookup.
