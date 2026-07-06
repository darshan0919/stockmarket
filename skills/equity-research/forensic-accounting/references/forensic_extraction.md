# Forensic Extraction Patterns

Targeted `pdftotext` + `grep`/`sed` patterns for pulling specific sections out of an annual report without dumping the whole thing into context. Each section below has: the section name, where it usually lives, and the extraction one-liner.

**Why targeted extraction matters:** A typical Indian AR is 200–350 pages. Extracting all 350 pages produces ~70K tokens of mostly-noise. Targeted extraction is 5–10× more efficient and forces the analyst to think about what actually matters before reading.

## Step 0 — Inventory the PDF

Always run inventory first:

```bash
AR=/path/to/Company_FY25_AR.pdf
pdfinfo "$AR"
pdftotext -f 1 -l 5 "$AR" -                  # check first 5 pages: TOC and front matter
pdftotext -f 1 -l 1000 "$AR" /tmp/full.txt   # full extract for grep targeting
wc -l /tmp/full.txt
```

If the AR has a Table of Contents, grep for it to map pages:

```bash
pdftotext -f 1 -l 10 "$AR" - | grep -E -i "(contents|index)" -A 60
```

## Section-specific extraction

### MDA (Management Discussion & Analysis)

Always near the front of the AR (between the Director's Report and the Financial Statements).

```bash
# Find the page number first
grep -n -i "management discussion" /tmp/full.txt | head -5

# Extract the MDA pages explicitly
pdftotext -f 25 -l 60 "$AR" /tmp/mda.txt    # adjust 25-60 to the actual range
```

### Significant Accounting Policies

Always Note 1 or Note 2 in Notes to Financial Statements.

```bash
grep -n -i "significant accounting policies" /tmp/full.txt | head -3
# extract that page + ~10 pages forward
```

Look for these subsections specifically (each is a flag-relevant policy):
- Revenue recognition (Ind AS 115)
- Property, plant and equipment (depreciation method, useful lives, capitalisation thresholds)
- Intangible assets (Ind AS 38) — especially R&D capitalisation criteria
- Inventory valuation
- Provisions and contingent liabilities

```bash
grep -n -i -E "(revenue recognition|capitalisation|impairment|provisions)" /tmp/policies.txt
```

### Cash Flow Statement

```bash
grep -n -E "Cash Flow|Statement of Cash Flow" /tmp/full.txt | head -5
# Standard layout: ~3 pages — operating, investing, financing
```

For the CFO/PAT bridge table, also extract:
- "Profit before tax" line (anchor)
- "Adjustments for" subsection (depreciation, finance costs, etc.)
- "Working capital changes" subsection

### Related Party Transactions Note

The RPT note number varies by company; typical range Note 35–45.

```bash
grep -n -i "related party" /tmp/full.txt | head -5
# Extract that page + 5-10 pages forward (RPT notes can be long)

# Specifically grep for these patterns inside the RPT extract:
grep -E "(loan to|sale to|purchase from|guarantee|advance to|investment in)" /tmp/rpt.txt
```

Pull the RPT note's two main tables: (1) names of related parties and their relationship; (2) amounts and nature of transactions for the year + comparative.

### Contingent Liabilities Note

Almost always Note 30–40. Often labelled "Contingent Liabilities and Commitments".

```bash
grep -n -i -E "(contingent liabilit|commitments)" /tmp/full.txt | head -5
```

Pull the table; compute % of net worth (net worth = equity capital + reserves; usually visible on the Balance Sheet face).

### Auditor's Report + CARO + KAMs

Always positioned just before the financial statements. Length: usually 8–15 pages including CARO annexure.

```bash
grep -n -i -E "(independent auditor|auditor's report)" /tmp/full.txt | head -3
# Extract from there to ~20 pages forward (covers Auditor Report + CARO)
```

KAMs are inside the Auditor's Report under a heading "Key Audit Matters". Always quote KAMs verbatim.

CARO is in an annexure to the Auditor's Report. Standard 21-paragraph structure under CARO 2020.

```bash
grep -n -E "Para 3\(|paragraph 3\(" /tmp/auditor.txt
# returns line numbers for each CARO paragraph
```

The high-signal CARO paragraphs (run targeted greps):

```bash
grep -A 5 -i "paragraph 3(iii)" /tmp/auditor.txt    # loans to related parties
grep -A 5 -i "paragraph 3(vii)" /tmp/auditor.txt    # statutory dues delays
grep -A 5 -i "paragraph 3(ix)" /tmp/auditor.txt     # default in repayment
grep -A 5 -i "paragraph 3(xi)" /tmp/auditor.txt     # fraud detected
grep -A 5 -i "paragraph 3(xx)" /tmp/auditor.txt     # internal financial controls
```

### Director's Report

Front of AR. Pull selectively — most of it is boilerplate. The relevant parts:
- Capex completed during the year
- Subsidiaries and their performance
- Material orders / contracts / litigations
- Board composition changes (KMP additions / departures)
- Promoter holding / pledging changes

```bash
grep -n -i "director's report\|directors' report" /tmp/full.txt | head -3
```

### Trade Receivables Aging

Inside the Trade Receivables note (usually Note 11 or 12). Look for the aging-bucket table:

```bash
grep -n -i "trade receivables" /tmp/full.txt | head -5
```

The aging bucket under Ind AS is typically: Not Due | <6 months | 6m-1y | 1-2y | 2-3y | >3y. Watch the >6m bucket trend.

### Inventory Note

Note 10 or 11 typically. Pull:
- Total inventory composition (raw / WIP / finished / spare parts)
- Net realisable value adjustments
- Inventory days = (Inventory / COGS) × 365

### Misc Expenses

Inside "Other Expenses" note. Pull the full sub-line breakdown:

```bash
grep -n -i "other expenses" /tmp/full.txt | head -5
```

The note will typically itemise: rent, repairs, insurance, rates & taxes, travelling, communication, printing & stationery, legal & professional, bank charges, donations, CSR expenditure, miscellaneous expenses.

The "Miscellaneous" sub-line is the slush bucket; flag if it's >0.5% of revenue or has grown >50% YoY without explanation.

## Composite extraction script

For convenience, here's a shell function that runs the standard 9 extractions:

```bash
forensic_extract() {
    local AR="$1"
    local OUT_DIR="$2"
    mkdir -p "$OUT_DIR"
    
    # Full text first (used by all greps)
    pdftotext -layout "$AR" "$OUT_DIR/full.txt"
    
    # Identify section start pages
    grep -n -i "management discussion" "$OUT_DIR/full.txt" | head -1
    grep -n -i "independent auditor" "$OUT_DIR/full.txt" | head -1
    grep -n -i "significant accounting policies" "$OUT_DIR/full.txt" | head -1
    grep -n -i "related party" "$OUT_DIR/full.txt" | head -1
    grep -n -i "contingent liabilit" "$OUT_DIR/full.txt" | head -1
    grep -n -i "cash flow" "$OUT_DIR/full.txt" | head -1
    grep -n -i "trade receivables" "$OUT_DIR/full.txt" | head -1
    grep -n -i "other expenses" "$OUT_DIR/full.txt" | head -1
    
    echo "--- Now run targeted pdftotext -f X -l Y for each section above ---"
}
```

## What can be wrong with grep-based extraction

- **Multi-line tables get mangled** — the `-layout` flag preserves spatial alignment but tables that span page breaks lose context
- **Image-only ARs** (rare for Indian listed companies) need OCR — use `tesseract` after `pdftoppm`
- **Notes referenced as "Note 35" with the actual content far away** — grep by note number AND keyword to find the actual data
- **Footnotes referenced in tables but printed at end of page** — sometimes lost; rasterise specific pages if precision matters

If extraction quality is suspect, fall back to rasterising the specific page (`pdftoppm -jpeg -r 150 -f N -l N`) and reading the image directly.
