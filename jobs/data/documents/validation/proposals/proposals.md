
## 2026-07-05 — proposed insight-prompt refinements
- Not enough delivery-confirmed samples yet to propose changes (need a few trading days of post-publish data). Accumulating.

### 2026-07-05 — insight quality review

### 2026-07-05 — categorisation review
- CATEGORY MISMATCHES (5): stored category from the insight prompt doesn't match tag-inferred category. Review whether the scheduled-task prompt is passing `category` correctly from fetch-announcements output, or whether CATEGORY_RULES needs new keywords.
- GENERAL FALLBACK (2 today): these landed in 'general'. Review CATEGORY_RULES for missing keywords that could capture them: Hardwyn India Ltd (sig=low): "Announcement under Regulation 30 (LODR)-Amendments to Memorandum & Articles of Association"; Aster DM Quality Care Ltd (formerly Aster DM Healthcare Ltd) (sig=high): "Announcement under Regulation 30 (LODR)-Change of Company Name"
- UNDER-REPRESENTED CATEGORIES today (zero hits): buyback, capacity, dividend, order_book, results. Consider whether keyword coverage in CATEGORY_RULES is broad enough, especially if you hold companies that regularly file in these categories.
  • MISMATCH: Piramal Finance Ltd: stored='regulatory' vs tags→'acquisition' | tags=["regulatory","acquisition"] | title: "Announcement under Regulation 30 (LODR)-Scheme of Arrangemen"
  • MISMATCH: ideaForge Technology Ltd: stored='agm_egm' vs tags→'fundraise' | tags=["fundraise","agm_outcome"] | title: "Shareholder Meeting / Postal Ballot-Outcome of Postal_Ballot"
  • MISMATCH: Hardwyn India Ltd: stored='general' vs tags→'fundraise' | tags=["fundraise"] | title: "Announcement under Regulation 30 (LODR)-Amendments to Memora"
  • MISMATCH: Belrise Industries Ltd: stored='regulatory' vs tags→'acquisition' | tags=["acquisition","regulatory"] | title: "Announcement under Regulation 30 (LODR)-Scheme of Arrangemen"
  • MISMATCH: Aster DM Quality Care Ltd (formerly Aster DM Healthcare Ltd): stored='general' vs tags→'acquisition' | tags=["acquisition"] | title: "Announcement under Regulation 30 (LODR)-Change of Company Na"

### 2026-07-05 — ignored-announcements review
- No ignored log found — ensure watchlistInsights.js is updated to write to the events log.

## 2026-07-06 — proposed insight-prompt refinements
- Not enough delivery-confirmed samples yet to propose changes (need a few trading days of post-publish data). Accumulating.

### 2026-07-06 — insight quality review

### 2026-07-06 — categorisation review
- CATEGORY MISMATCHES (3): stored category from the insight prompt doesn't match tag-inferred category. Review whether the scheduled-task prompt is passing `category` correctly from fetch-announcements output, or whether CATEGORY_RULES needs new keywords.
- GENERAL FALLBACK (3 today): these landed in 'general'. Review CATEGORY_RULES for missing keywords that could capture them: Granules India Ltd (sig=medium): "Press Release / Media Release - Press Release"; Poonawalla Fincorp Ltd (sig=low): "General - Intimation under Regulation 30 of SEBI Listing Regulations 2015."; Satin Creditcare Network Ltd (sig=high): "General - Announcement under Regulation 30 of SEBI (LODR) Regulations 2015 - Business Update"
- UNDER-REPRESENTED CATEGORIES today (zero hits): acquisition, agm_egm, buyback, credit_rating, dividend, fundraise, management_change, results, shareholding_change. Consider whether keyword coverage in CATEGORY_RULES is broad enough, especially if you hold companies that regularly file in these categories.
  • MISMATCH: Granules India Ltd: stored='general' vs tags→'regulatory' | tags=["regulatory","press_release"] | title: "Announcement under Regulation 30 (LODR)-Press Release / Medi"
  • MISMATCH: Poonawalla Fincorp Ltd: stored='general' vs tags→'investor_meet' | tags=["investor_meet"] | title: "Information Under Regulation 30 ... R/W Schedule A of Reg. 8"
  • MISMATCH: Satin Creditcare Network Ltd: stored='general' vs tags→'capacity' | tags=["credit_rating","capacity"] | title: "Announcement Under Regulation 30 Of SEBI (LODR) Regulations "

### 2026-07-06 — ignored-announcements review
- TOP SUPPRESSED KEYWORDS today: 'closure of trading window' ×4. If any of these are over-suppressing, tighten the keyword (e.g. prefix/suffix anchor) in INSIGNIFICANT_KEYWORDS.
