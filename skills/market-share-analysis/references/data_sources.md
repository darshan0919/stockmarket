# Data Sources for Market Share Analysis

A practical guide to where the verified data lives, organised by what you're trying to find.

---

## Industry size (TAM / SAM / SOM)

### Tier A — Primary, defensible
| Source | Strength | Weakness |
|---|---|---|
| Industry association reports (JISA, SIAM, AMFI, IBA, CCI sector studies, FICCI/CII reports) | Industry consensus; updated annually | May be promotional; varies in rigour |
| Top listed player's annual report (Industry Overview section) | Audited context; usually has 3-5 yr trend | Self-serving framing; their definition may differ |
| Top listed player's latest investor presentation | Often has competitive landscape slide with named players | Overstated own share is common |
| Government statistics: MoSPI Industrial Index, RBI sector handbook, Ministry-wise data | Most defensible | Slow to update; may be 12-18 months stale |
| Regulatory body data: SEBI, IRDAI, TRAI, RBI, MCA | Authoritative for regulated sectors | Limited to regulated sectors |
| DGCIS export-import data | Authoritative for trade-exposed industries | Granularity issues at sub-HS-code level |

### Tier B — Useful but verify
- Industry-tracking consultancies: CRISIL, ICRA, CARE sector reports (paid; sometimes excerpts in news)
- Bain / McKinsey / BCG sector reports (often 2-3 years old; cite with date)
- Equity research from top brokerages (Kotak, Motilal, Ambit, Jefferies India) — use the **data**, not the **conclusion**
- IBEF (India Brand Equity Foundation) — government-backed; usable
- KPO databases: Drip Capital, India Ratings sector reports

### Tier C — Cite-but-don't-rely
- Statista headline numbers without methodology
- Wikipedia
- Aggregator blogs / Substack posts (unless they show their own primary sourcing)

### Triangulation rule
- Pull TAM from at least 2 Tier-A sources
- If they disagree by >15%, document the gap and pick the more recent + more granular with justification

---

## Per-player segment revenue — listed companies

| Source | What you get | URL pattern |
|---|---|---|
| BSE/NSE annual report (latest) | Segmental Reporting note — authoritative for segment revenue | bseindia.com / nseindia.com → company → financials → AR |
| Stockscans documents fetcher | All filings in one pull | Use the `stock-documents-fetcher` skill |
| Latest investor presentation | Often has segment revenue chart | Filed at BSE same day as result |
| Concall transcript | Forward commentary that contextualises segment share | Filed at BSE day after result |
| Screener.in consolidated page | TTM segment if disclosed | screener.in/company/[TICKER]/consolidated/ |

**Use the AR Segmental Reporting note (under Ind AS 108) as the primary source.** Other figures (IP, concall, screener) are cross-checks.

When a company has merged or restructured segments mid-period, the latest year may not be comparable to T-5. Footnote the restructuring and use the pre-restructuring grouping where possible.

---

## Per-player segment revenue — unlisted companies

| Source | What you get | Cost / Access |
|---|---|---|
| MCA (Ministry of Corporate Affairs) filings | Audited financials of all incorporated companies | Free via mca.gov.in (cumbersome); paid via Tofler, Zauba, Probe42 |
| Tofler / Zauba Corp / Probe42 | MCA data wrapped + standardised | Paid subscription |
| News disclosures | Funding announcements often include revenue | Search "[player] revenue FY24 site:moneycontrol.com OR site:livemint.com OR site:economictimes.indiatimes.com" |
| Industry association member lists | Sometimes includes member rev brackets | Association website |
| Customer disclosure | "Top 10 customers" in a listed company's AR can reveal unlisted players | AR Customer Concentration note |

**For unlisted, MCA is the gold standard.** Web search is the fallback. Footnote the source.

When MCA data is older than 18 months, web-search for any post-filing growth announcements and triangulate. Flag with `[D-stale]` if the latest verifiable MCA filing is FY-2 or older.

---

## Concentration / structure data

| What you need | Where to find |
|---|---|
| Existing CR3/CR5 estimates | Top listed player IP; CRISIL/ICRA sector reports; Kotak/Motilal sector primers |
| HHI (calculated) | Compute from your player table using `scripts/compute_concentration.py` |
| Organised vs unorganised | GST registration data (CBIC); industry association estimates; AR commentary of top listed player |
| Captive consumption (cement, steel, chem) | Top listed players' AR (they footnote captive); industry association reports |
| Imports % | DGCIS data; commerce ministry monthly trade data; AR import-substitution narratives |

---

## Capacity, capex, supply-side data

| What | Where |
|---|---|
| Industry installed capacity | Industry association reports; top listed player IP |
| Capex announcements | Each listed player's AR + latest concall (board approvals); CMIE Capex database (paid); news flow |
| Greenfield / brownfield pipeline | Bharat Capex tracker; Ministry approvals; environment clearance database (parivesh.nic.in) |
| Capacity utilisation | Concall commentary; AR plant-wise data; RBI Order Books / Inventories survey |

---

## Pricing data

| Type | Source |
|---|---|
| Domestic realisation trends | Listed player AR + concall realisation slides |
| Spot prices (commodities) | MCX / NCDEX (India); LME (global metals); ICE / CME (energy) |
| Landed import cost | DGCIS unit values; SteelMint / ChemAnalyst (paid); customs notifications for tariff |
| Customs duty / anti-dumping status | DGFT notifications; CBIC circulars |

---

## Regulatory & policy data

| What | Where |
|---|---|
| Tariff structure (basic + IGST + cess) | CBIC tariff schedule; DGFT |
| BIS standards (Indian mandatory standards) | bis.gov.in |
| Anti-dumping duties | DGTR; CBIC notifications |
| Environmental clearance status of new capacity | parivesh.nic.in |
| Sector-specific regulator data | RBI / SEBI / IRDAI / TRAI / PNGRB / etc. — each has its own data portal |

---

## Threat / disruption signals

| Threat type | Monitoring source |
|---|---|
| New entrants — announced | Business news (Mint, ET, BS); CIN registrations on MCA |
| MNC entry signals | FDI Policy press releases (DPIIT); PIB; FT / Reuters / Bloomberg country desk |
| Substitution risk | Patent filings; tech news; consumer surveys; sectoral end-use trends |
| Import threat | DGCIS monthly trade data; anti-dumping investigation status |
| Customer insourcing | OEM annual reports (Customer-side AR commentary); JV announcements |

---

## Live price / market cap (for valuation cross-check on listed players)

| Priority | Source | Notes |
|---|---|---|
| 1 | dhan.co | Live timestamped — primary per Darshan's hierarchy |
| 2 | kotakneo.com | Secondary live source |
| 3 | tickertape.in | Tertiary cross-check |
| 4 | screener.in | Often stale, especially around earnings — fallback only |
| 5 | nse/bseindia.com | Authoritative but slow |

Cross-check ≥2 sources and verify timestamp before any per-share calculation.

---

## When data simply isn't available

Acceptable responses, in priority order:
1. "Not disclosed; estimated at Rs X Cr based on [specific methodology]" — and mark `[E]`
2. "Disclosed at industry level (Rs Y Cr) but not split by player — best-estimate split shown" — and mark `[E]`
3. "Not in provided/public material; needs primary research to resolve" — and flag in Part 9 data gaps
4. **Never** invent a precise number to fill a gap. Always say so.

---

## Cross-skill data sourcing

When this skill needs primary documents for the top 5-10 listed players, use:

```bash
python3 packages/stock-api/python/fetchers/fetch_documents.py "NSE:TICKER" \
    -t "Annual Report" PPT --last-n 2 -o /tmp/<industry>_msa_docs/
```

Fetch in parallel across all tickers (launch all subprocesses in one turn, then `wait`). After fetching, read each `$DOCS_DIR/manifest.json` to route documents to extraction.

For AR Segmental Reporting note specifically (the most useful single page):
```bash
pdftotext "$AR_PDF" - | grep -A 100 -i "segment\|segmental" | head -200
```
