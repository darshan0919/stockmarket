
## 2026-06-25 — proposed insight-prompt refinements
- Not enough delivery-confirmed samples yet to propose changes (need a few trading days of post-publish data). Accumulating.

## 2026-06-26 — proposed insight-prompt refinements
- Not enough delivery-confirmed samples yet to propose changes (need a few trading days of post-publish data). Accumulating.

## 2026-06-27 — proposed insight-prompt refinements
- Not enough delivery-confirmed samples yet to propose changes (need a few trading days of post-publish data). Accumulating.

## 2026-06-27 — proposed insight-prompt refinements
- Not enough delivery-confirmed samples yet to propose changes (need a few trading days of post-publish data). Accumulating.

## 2026-06-27 — proposed insight-prompt refinements
- Not enough delivery-confirmed samples yet to propose changes (need a few trading days of post-publish data). Accumulating.

## 2026-06-27 — proposed insight-prompt refinements
- Not enough delivery-confirmed samples yet to propose changes (need a few trading days of post-publish data). Accumulating.

### 2026-06-27 — insight quality review
- [general] NO SPECIFICS (10/24): insights missing numbers/₹/%. Add to template: 'Every insight MUST contain at least one hard fact (₹ amount / % / date / counterparty name).'
- [dividend] TITLES (2/4): titles lack key facts. Instruct Claude to front-load entity name + ₹ value/% + action verb — e.g. 'CRISIL upgrades outlook to Positive; limits enhanced to ₹600 Cr'. Weak examples: Greaves Cotton Ltd: "Communication on TDS Deduction on Dividend to Shareholders"; Shriram Pistons & Rings Ltd: "Communication to Shareholders Regarding TDS/Withholding Tax on Dividend"

### 2026-06-27 — categorisation review
- GENERAL FALLBACK (24 today): these landed in 'general'. Review CATEGORY_RULES for missing keywords that could capture them: Greaves Cotton Ltd (sig=medium): "Incorporation of WOS in Dubai UAE"; INOX India Ltd (sig=medium): "Outcome of AGM — Resolutions Passed"; Godrej Industries Ltd (sig=medium): "Outcome of Postal Ballot — Resolution Passed with Requisite Majority"; Hardwyn India Ltd (sig=low): "Corrigendum to First EGM Notice — July 03, 2026"
- UNDER-REPRESENTED CATEGORIES today (zero hits): agm_egm, results, shareholding_change. Consider whether keyword coverage in CATEGORY_RULES is broad enough, especially if you hold companies that regularly file in these categories.

### 2026-06-27 — ignored-announcements review
- No ignored log found — ensure watchlist_insights.py is updated to write validation/ignored_log_YYYYMMDD.json.

## 2026-06-28 — proposed insight-prompt refinements
- `acquisition`: 8/13 insights rated high but NOT delivery-confirmed (over-rated). Propose TIGHTENING significance — require a hard, quantified trigger (₹ value / % of revenue / threshold crossed) before tagging `high`; default borderline cases to `medium`.
- `fundraise`: 7/9 insights rated high but NOT delivery-confirmed (over-rated). Propose TIGHTENING significance — require a hard, quantified trigger (₹ value / % of revenue / threshold crossed) before tagging `high`; default borderline cases to `medium`. CAVEAT: 1/9 of these moves were sector/market-driven (the stock moved largely with its sector, not on the announcement) — discount these before concluding the insight was mis-rated.

### 2026-06-28 — insight quality review
- [general] NO SPECIFICS (10/24): insights missing numbers/₹/%. Add to template: 'Every insight MUST contain at least one hard fact (₹ amount / % / date / counterparty name).'
- [dividend] TITLES (2/4): titles lack key facts. Instruct Claude to front-load entity name + ₹ value/% + action verb — e.g. 'CRISIL upgrades outlook to Positive; limits enhanced to ₹600 Cr'. Weak examples: Greaves Cotton Ltd: "Communication on TDS Deduction on Dividend to Shareholders"; Shriram Pistons & Rings Ltd: "Communication to Shareholders Regarding TDS/Withholding Tax on Dividend"

### 2026-06-28 — categorisation review
- GENERAL FALLBACK (24 today): these landed in 'general'. Review CATEGORY_RULES for missing keywords that could capture them: Greaves Cotton Ltd (sig=medium): "Incorporation of WOS in Dubai UAE"; INOX India Ltd (sig=medium): "Outcome of AGM — Resolutions Passed"; Godrej Industries Ltd (sig=medium): "Outcome of Postal Ballot — Resolution Passed with Requisite Majority"; Hardwyn India Ltd (sig=low): "Corrigendum to First EGM Notice — July 03, 2026"
- UNDER-REPRESENTED CATEGORIES today (zero hits): agm_egm, results, shareholding_change. Consider whether keyword coverage in CATEGORY_RULES is broad enough, especially if you hold companies that regularly file in these categories.

### 2026-06-28 — ignored-announcements review
- POTENTIAL MIS-FILTERS (6): ignored announcements contain informative signals — review whether these keywords are too broad. Top flagged: Mufin Green Finance Ltd | kw='closure of trading window' | "Closure of Trading Window"; Aeroflex Industries Ltd | kw='intimation of record date' | "Intimation Of Record Date Pursuant To Regulation 42 Of SEBI (Listing Obligations"; Aeroflex Industries Ltd | kw='book closure' | "Intimation Of Book Closure Pursuant To Regulation 42 Of SEBI (Listing Obligation"; Vadilal Industries Ltd | kw='closure of trading window' | "Closure of Trading Window"; Shreeji Shipping Global Ltd | kw='closure of trading window' | "Closure of Trading Window"
- TOP SUPPRESSED KEYWORDS today: 'closure of trading window' ×15, 'annual general meeting' ×4, 'scrutinizer' ×1, 'brsr' ×1, 'intimation of record date' ×1. If any of these are over-suppressing, tighten the keyword (e.g. prefix/suffix anchor) in INSIGNIFICANT_KEYWORDS.
  • POSSIBLE MIS-FILTER: Mufin Green Finance Ltd | kw='closure of trading window' | "Closure of Trading Window"
  • POSSIBLE MIS-FILTER: Aeroflex Industries Ltd | kw='intimation of record date' | "Intimation Of Record Date Pursuant To Regulation 42 Of SEBI (Listing Obligations"
  • POSSIBLE MIS-FILTER: Aeroflex Industries Ltd | kw='book closure' | "Intimation Of Book Closure Pursuant To Regulation 42 Of SEBI (Listing Obligation"
  • POSSIBLE MIS-FILTER: Vadilal Industries Ltd | kw='closure of trading window' | "Closure of Trading Window"
  • POSSIBLE MIS-FILTER: Shreeji Shipping Global Ltd | kw='closure of trading window' | "Closure of Trading Window"
  • POSSIBLE MIS-FILTER: Craftsman Automation Ltd | kw='closure of trading window' | "Closure of Trading Window"
