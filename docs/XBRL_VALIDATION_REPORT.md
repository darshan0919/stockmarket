# XBRL integration: validation report (2026-09-30)

Scope: `docs/XBRL_INTEGRATION_PLAN.md` Phase 5. Reproduce with `scripts/xbrl/validate_results.js`,
`compare_pdf.js` and `validate_filings.js` (raw output stays in the OS temp dir / scratch, not `data/`).
Sample: 104 companies from our DB (2 per sector, different industries, ranked by last-30-day
appearances; 24 sectors had fewer than 2 candidates), up to 9 quarters each = 824 runs, plus a
20-company taxonomy-family run and a 40-company non-results run.

## 1. Headline

| Check                                            | Result                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Latest quarter resolved from XBRL                | 88 of 104 companies (82 Ind AS, 4 NBFC-format, 2 SME-format)                                           |
| Falls back to PDF, by design                     | 2 (1 bank, 1 general insurer)                                                                          |
| No results XBRL on either exchange               | 14 (mostly SME-platform names, InvITs/REITs, or symbol not found on BSE)                               |
| NSE vs BSE agreement, current period             | 456 cross-checks; 11 with differing facts, all traced to filer-side errors (section 3)                 |
| Sum checks (PBT, PAT, cash flow incl. FX effect) | 0 failures after the fixes below                                                                       |
| Latency per company-quarter                      | p50 0.2 s, p95 1.0 s (warm cache)                                                                      |
| Non-results XBRL coverage (40 companies)         | shareholding 36/40, voting 32/40, governance 31/40, BRSR 22/40 (BRSR covers only the top ~1000 listed) |

## 2. Bugs found by this run and fixed

1. Half-yearly filers (15 in the sample) have a 6-month "current period" context. Revenue and PBT came out
   missing (39 false major issues) and NSE-vs-BSE showed 20 false disagreements. Now handled; the sequential
   comparative is the previous half-year and a PERIODICITY info issue is logged.
2. Cash-flow sum check ignored the FX effect on cash: 147 false alarms across 19 companies. Fixed.
3. BSE-only half-yearly and SME filers: BSE codes `MH`/`SH`/`MC` and the "Other than Ind AS" file
   (`IFOtherthan`) were unsupported. Added an `sme` family; quarter codes still outrank half-year/annual codes.
4. BSE family detection: `IFBanking`, `IFGI`, `NBFC_`, `NonBanking_` names were all "unknown". Now labelled.
5. Cross-check compared by context id; it now compares by period window.
6. PAT attributable to non-controlling interests was unmapped (1,361 files); now feeds `minorityInterest`.
7. BSE `todate` is exclusive of that day's timestamps, which dropped same-day PIT filings.

## 3. Open issues (all severities), with counts from the 824 runs

Major

- No XBRL for a period on either exchange: 698 events, many of them a basis mismatch (only a standalone filing exists that period, or the reverse). Breakdown of the comparatives: QoQ unavailable 40, YoY unavailable 128.
  Behaviour: falls back to the PDF comparative; if that fails too, the field is null and the issue is shown.
- Banks and life/general insurers: RESOLVED after the first run (see section 7). They were 100% PDF fallback in the
  824-run sample.
- NSE and BSE filings that disagree (filer-side errors, not parser errors). Examples: ARROWGREEN Sep-25 cash-flow
  signs flipped between the two filings; AHCL paid-up capital 5.3e12 on NSE vs 5.3e6 on BSE (unit error);
  GREENPANEL Mar-26 balance-sheet classification differs; VENUSPIPES FY25 tax zero on NSE, 32.5 Cr on BSE; opening
  cash zero on NSE, non-zero on BSE for QUADFUTURE, ANTELOPUS, TBZ, HERITGFOOD, TRANSRAILL. We keep the primary
  exchange's value and flag the disagreement.
- Endpoint failures: 1 BSE 403 (PTCILBSE); NSE timeouts on voting and governance listings (2 of 160).
- BSE legacy `.xml` results (`NBFC_`, `NonBanking_`, `Banking_`, `Main_Ind_As_`; taxonomy `in-bse-fin`): RESOLVED
  (section 7). They fell back to PDF for 37 comparative lookups in the first run.

Minor

- BSE scrip code not found for 30 symbols (mostly SME-platform names). Symbol-to-scrip lookup can also map a DB
  id to the wrong company (`BSE:HSIL` resolved to Hemant Surgical Industries, scrip 543916). Fixed by using the
  stored `bseScripCode` first (section 7).
- Comparative balance sheet not available from XBRL: 49.
- Facts present on only one exchange: 427 (mostly `OtherComprehensiveIncome`).

Info

- Unmapped numeric elements 1,928 (top: discontinued-operations lines, cash-flow "other" lines, PAT/NCI split now
  mapped); revisions (98 files where several NSE filings exist for a period, latest used); FALLBACK_USED 61.

## 4. XBRL vs the existing PDF extractor (18 companies, latest quarter)

- The PDF extractor found a usable P&L for only 7 of 20 result PDFs (`found: false` for the other 13). XBRL
  covered all 13.
- Where both exist, disagreements are PDF-side: unit scale slips (x10, x100, x1000; ASTEC, NRBBEARING, CCAVENUE,
  BLUSPRING, OLAELEC), a wrong standalone/consolidated label (HNDFDS, OLAELEC, BLUSPRING) and mis-read rows
  (HNDFDS exceptional items 56 vs 0; NTPC tax QoQ 1256 vs -9062, where the XBRL passes PBT-tax=PAT).
- Exceptional-items sign: cannot be confirmed from PDFs because the PDF parser mis-reads that row. Internally the
  XBRL convention (PBT = PBT-before-exceptional + exceptional) passed on every run, and NRBBEARING matched the PDF
  with the same sign (+2.65 Cr).

## 5. Decisions (answered 2026-09-30)

1. MCA annual XBRL: accepted as manual-only. Annual and half-year figures come from exchange-filed annual-results XBRL.
2. Bank and insurer adapters: built.
3. `bseScripCode` on company records: used by the resolvers; backfill script added.
4. BSE legacy `.xml` mapper: built.

## 6. Scale and automation

`scripts/xbrl/validate_results.js --resume` is safe to schedule weekly against the whole DB (about 0.2 s per warm
company-quarter). Its JSONL output feeds a diff of issue counts week over week. Nothing needs an LLM.

## 7. Follow-up work (decisions 2-4)

- Banks, life and general insurers are supported (`resultsFamilies.js`). Their `revenue` is total income, so the
  extractor output carries `signalScanApplicable: false` and `familyMetrics`. 20-company family sample (4 bank,
  3 life, 4 general, 7 NBFC, 2 Ind AS): 99 of 100 runs resolved the current period from XBRL.
  Caveat: life-insurer total income swings with investment mark-to-market (SBILIFE Mar-26: 5,658 Cr on investment
  income of -23,939 Cr).
- Legacy BSE `.xml`: the `in-bse-fin` local element names match the Ind AS and bank names, so `NBFC_*`, `NonBanking_*`
  and `Main_Ind_As_*` map as Ind AS and `Banking_*` as banking. Verified on BAJFINANCE (NBFC*, Main_Ind_As*) and
  KOTAKBANK (Banking*). A 24-quarter run for BAJFINANCE, KOTAKBANK and CHOLAFIN (back to Sep-2020) resolved
  current, QoQ and YoY from XBRL in all 72 runs, with no PDF fallback and no major issues (1 minor missing filing).
  Not verified: a `NonBanking*\*` file (none found in the samples), so that mapping rests on the same element names.
- `bseScripCode`: `lib/xbrl/scrip.js` resolves override, then numeric symbol, then the company record, then name
  search (logged as `FALLBACK_USED`, info). The field already exists on 2,521 of 8,367 records (filled by
  `companyMasterSync`). `scripts/xbrl/backfill_bse_scrip.js` fills the rest with name-match wrong-company
  rejection; dry-run on 25 records: 7 accepted, 2 rejected for missing names (fixed to fall back to the symbol),
  16 not on BSE (mostly NSE-SME). It has since been applied (section 8).
- Still open: residual filer-side errors (section 3), NSE/BSE timeouts, and SME-platform
  names lacking XBRL (NSE lists SME names under `index=sme`; see section 8), which stay on the PDF fallback.

## 8. Wrap-up (2026-09-30): Reg-30 events, backfill, full-database run

**Reg-30 event XBRL** (`lib/xbrl/events.js`, `eventsFetch.js`; CLI `xbrlFilings.js events`): 20 kinds.
NSE `/XBRL-announcements` covers the three NSE families (equities, then sme), BSE `GetCorXbrlDetails` covers
the rest. BSE flags 4, 9, 11, 16-21, 37-39 are unmapped. `validate_events.js` exists but has not been run at scale.

**Correction:** earlier claim "SME-platform names have no integrated XBRL" was wrong. NSE lists them under
`index=sme` (family `INTEGRATED_FILING_NONINDAS`). The SME fallback recovered 558 of 1,294 failures.

**bseScripCode backfill:** applied to `companies.json` (2,521 -> 3,289 holders). Stamps: 723 OK, 1,400 NOT_FOUND,
223 MISMATCH (212 are nameless records, unverifiable, review manually). `companyMasterSync` now runs it
each time (limit 2000, `--skip-bse-scrip-search` to opt out). The hook has not been run end to end.
`companies.json` is git-ignored, so `data:push` is needed to sync.

**Full run, 4,211 NSE ids, latest quarter:** 3,475 XBRL OK before the scrip guard of section 9 (2,917 first pass + 558 after the SME fix); 3,464 after it.
736 still fail: 686 show no NSE announcements since 2026-06-01 (stale, renamed e.g. HEG->HEGAM, delisted or
dormant; a DB hygiene issue), 38 are active with no XBRL (18 SME, 20 equities), 12 had transient errors.
Coverage of active names is about 98.3% (3,464 / 3,525), a lower bound: 12 more ids re-ran as plain not-found and 11 lost BSE data in section 9, so up to 23 of the "unknown" ids may also be active.
Caveat: "inactive" is inferred from one feed.

## 9. Bugs found by working through the open issue classes (2026-09-30)

Each fix was re-validated on the affected companies, not only unit-tested.

| Finding                                                       | Root cause                                                                                                                                                                                                     | Fix                                                                                                           | Re-validation                                                                                                                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SME `pbtBeforeExceptional+exceptional=pbt` (20 cases)         | SME taxonomy has a separate `ExtraordinaryItems` element that sits before PBT                                                                                                                                  | Mapped `extraordinaryItems`; included in the sum check                                                        | 66 SME companies                                                                                                                                                                       |
| SME `pbt-tax=pat` (81 cases)                                  | SME PAT also adds the `ProfitLossOfMinorityInterest` line                                                                                                                                                      | Mapped `minorityInterestAdj`; included in the check                                                           | 66 SME companies: 101 sum-check issues to 0                                                                                                                                            |
| General-insurer `assets=equity+liabilities` (NIACL, NIVABUPA) | Bare `Assets` is not the balance-sheet total in the IRDAI format                                                                                                                                               | `totalAssets` is `ApplicationOfFunds` (equals `SourcesOfFunds`). Element lists are summed, so never list both | 11 insurers, 22 balance sheets, 0 failures                                                                                                                                             |
| **Wrong company on BSE** (NRL, MCL, GLOBAL, plus 8 more)      | Live search matched a BSE ticker to a different company (NSE:NRL Nupur Recyclers resolved to GNRL Gujarat Natural Resources; NSE:MCL to Radha Madhav). No same-company check on that path, unlike the backfill | `resolveBseScrip` verifies the hit with `sameCompany`; a failed check returns `source: 'mismatch'`            | 196 search-resolved companies: 133 unchanged, 31 moved to NSE, 11 lost wrong BSE data (CLOUD, OPAL, CONS, EMETAL, AHL, SSINFRA, C, FORGE, DEE, DEEPIND, ISEC) and now fall back to PDF |
| EXCHANGE_DISAGREE noise                                       | BSE files are rounded (Rs 0.01-0.1 Cr)                                                                                                                                                                         | Gaps within 1e6 INR or 0.5% are logged as info                                                                | 20 companies: major 20 to 10                                                                                                                                                           |
| MISSING_FIELD (1,586)                                         | One element: BSE files never carry `OtherComprehensiveIncome`                                                                                                                                                  | Excluded from the gap count                                                                                   | Known structural asymmetry                                                                                                                                                             |
| Events: 8 "download failed"                                   | `fetchArchiveXml` returns null on throttle; files download fine alone                                                                                                                                          | Two retries with back-off                                                                                     | 4 companies, 0 major                                                                                                                                                                   |

**Remaining real disagreements (10 companies).** These are filer-side and stay flagged for verification against the PDF:
IGIL revenue is exactly 10x apart between exchanges; FIVESTAR paid-up capital is 100,000x; RAJESHEXPO revenue is 182x;
SMLT has two lines swapped (materials consumed vs purchases); GSLSU, ALLCARGO, UNITEDPOLY, QUADFUTURE, SAHLIBHFI and PRAXIS
differ on a few facts. A power-of-ten ratio is now named in the issue message (a units error in one filing; neither exchange
is automatically right). PARSE_ERROR (4) is a filer tagging the wrong period (file reports 2024-06-30 for a 2025-06-30 request:
SURAJEST, AARTIDRUGS, MMTC, PULZ); the period check rejects it and the resolver falls back.

**Reg-30 events, 60 companies by event count (90-day window):** 59 have events, 539 items, 0 parse errors, p50 12.5 s.
By kind: analyst-meet 130, management-change 84, board-meeting-intimation 82, shareholder-meeting-notice 58,
trading-window 53, reg30-update 36, capital-alteration 29, reg30-para-b 28, kmp-resignation 21. NSE supplied the
management-change and kmp-resignation items; BSE the rest.

**Not re-run:** the full 4,211-company pass was not repeated after these fixes. Only the affected subsets were
re-validated, so the aggregate issue counts in sections 1-8 still include the pre-fix SME, insurer and wrong-company noise.
