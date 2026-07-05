
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
