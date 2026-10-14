---
name: result-timing-analyzer
description: Analyze and predict financial results announcement timing and patterns for any Indian listed company using official exchange filings (NSE primary, BSE fallback). Computes exact submission timestamps, exchange dissemination times, market session distribution (market hours vs post-market), day-of-week preference, reporting turnaround velocity, and seasonal timing windows over the last 8-16 quarters. Use whenever the user asks "at what time does [company] declare results", "when does [company] announce results", "board meeting outcome timing", "earnings release time", "result timing stats", or wants to know if a company announces during market hours or post-market.
---

# Result Timing Analyzer

Deterministic extraction and statistical profiling of quarterly financial results declaration timings for any Indian listed company. Relies on official exchange dissemination feeds (NSE primary, BSE fallback) for second-precision timestamps.

## When to Use

Activate this skill whenever the user:

- Asks what time a company usually announces or declares its quarterly results (e.g. _"at what time does MRPL declare its results?"_, _"when does TCS announce earnings?"_).
- Asks whether results come out during market hours (09:15 – 15:30 IST) or post-market / evening.
- Wants historical filing statistics, day-of-week preferences, or turnaround speed (days after quarter-end).
- Wants to verify the exact exchange dissemination time of recent results filings.

---

## Architecture & Data Flow

```
User Query (e.g. "when does MRPL declare results?")
                    │
                    ▼
     companyMaster.js / companyId.js
   (Resolve canonical companyId & symbol)
                    │
                    ▼
      stock-api/bin/result-timing-analyzer.js
  ├── NseClient.getCorporateAnnouncements()
  ├── NseClient.getFinancialResults()
  ├── NseClient.getIntegratedFilings()
  └── [Fallback: BseClient.getResultXbrlRows()]
                    │
                    ▼
        resultTimingAnalyzer.js
  ├── Matches primary board outcome / financial results PDF
  ├── Extracts submission time, dissemination time, difference
  ├── Tags market session (During Market Hours, Post-Market, Weekend)
  ├── Computes distribution stats (Median, Mean, Min, Max, StdDev)
  └── Analyzes day-of-week frequency & turnaround velocity
                    │
                    ▼
   Chat Output: Executive Takeaways + Full Table + Stats
```

---

## Execution Workflow

### Step 1: Execute the Deterministic Analyzer

Run the CLI tool via the workspace facade pattern:

```bash
yarn workspace @stock/api result-timing-analyzer --company <SYMBOL> [--quarters 12] [--json]
```

**Parameters**:

- `--company <SYMBOL>`: NSE ticker (e.g. `MRPL`, `TCS`, `INFY`) or BSE scrip code. Canonical resolution handles company names, prefixes (`NSE:`, `BSE:`), and suffixes.
- `--quarters <N>`: Optional lookback window (default: `12` quarters / 3 years).
- `--json`: Optional flag to output raw machine-readable JSON DTO.
- `--out <path>`: Optional path to save JSON DTO.

### Step 2: Format the Output

Present the output following the standard concise structure:

1. **Executive Takeaway**:
   - Typical window (e.g. _Post-Market Prime Evening between 17:00 and 19:30 IST_).
   - Median and Mean declaration time.
   - Off-Market Rate (percentage of results declared after 15:30 IST or on weekends).

2. **Quarter-by-Quarter Table**:
   - Columns: `#`, `Quarter`, `Quarter End`, `Declaration Date`, `Day of Week`, `NSE Filing Time (IST)`, `Market Session`, `Turnaround Days`, `Official Filing PDF Link`.

3. **Statistical Distribution**:
   - Time range (Earliest to Latest), Median, Mean, Standard Deviation.
   - Market session breakdown (Post-Market %, Market Hours %, Weekend %).
   - Turnaround velocity (Average days post quarter-end, range, acceleration trend).

4. **Day-of-Week Frequency**:
   - Breakdown of declarations across weekdays (e.g., Friday vs Thursday vs Monday concentration).

5. **Trading / Market Reaction Implication**:
   - If predominantly post-market (>70%): Price reaction occurs on the next trading session open; morning gap risk is high.
   - If daytime / market hours: Intraday volatility spikes occur immediately upon dissemination; track live exchange broadcast feed.

---

## Edge Cases & Rules

1. **Dual Filings on Result Day**:
   Companies often file multiple announcements on result day (Board Meeting Outcome, Financial Results, Limited Review Report, Press Release, Dividend declaration, Investor Meet audio recording). The analyzer automatically isolates the **earliest primary filing** that released the financial numbers to market participants.
2. **Weekend Board Meetings**:
   Some companies (especially during Q4 audited annual results) hold board meetings on Saturdays. These are explicitly tagged as `Weekend (Market Closed)` so they do not distort weekday market-hours statistics.
3. **BSE-Only Scrips**:
   For companies listed exclusively on BSE, the analyzer automatically queries BSE XBRL and corporate announcement feeds.
4. **Zero PDF Duplication**:
   Deliver crisp chat tables and statistics. Do not print boilerplate commentary or repeat raw filing text.
