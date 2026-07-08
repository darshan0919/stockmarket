---
name: stage2-catalyst-analysis
description: >
  Long-term technical read (Stan Weinstein Stage framework + SOIC LTI: 30-WEMA, VSTOP,
  RSI, ADX, CRS vs Nifty) combined with strict identification of the SPECIFIC, RECENT
  fundamental catalyst driving institutional accumulation. Use whenever the user asks
  "is X in Stage 2", "technical analysis of X on weekly", "did X break out", "entry and
  stop-loss levels for X", "why is this stock being accumulated", "what's the catalyst
  behind this breakout", or provides a list/scan of stocks that just entered Stage 2 and
  wants the "why now" for each. Also the timing overlay provider for
  investment-thesis-engine (technical.stage field). Timing tool only — never a
  substitute for the fundamental thesis.
---

# Stage 2 + Catalyst Analysis

Sources: SOIC LTI prompt + "Stage 2 filtering stocks" prompt (Google Doc library).
Mandatory: `skills/_shared/data-verification.md` — the strict dating/quantification rules
there ARE the rules of this skill.

## Part A — Technical read (weekly timeframe)

Definition of Early Stage 2 (screen level): MCap ≥ ₹1,000 Cr, CMP ≥ 30-Week EMA,
CMP ≥ VSTOP (10W, ×2). For the full read, assess:

1. **Stage 2 breakout confirmation (Weinstein):** valid base breakout? 30-WEMA clearly
   rising and supporting price? Breakout on significantly elevated weekly volume?
2. **Relative strength vs Nifty 50:** CRS line making new highs and above its 52-week MA?
3. **Entry zones:** primary = breakout with volume confirmation; alternate = pullback to
   10W/30W MA or breakout zone on low volume with VSTOP as support.
4. **Stop-loss:** below recent swing low, VSTOP line, or just under the 30-WEMA.
5. **Exit criteria:** close below 30-WEMA with volume spike; loss of RS vs Nifty with
   prolonged sideways action; Stage 3 distribution signs; trailing VSTOP; two consecutive
   lower highs on weakening volume; RSI < 45 + ADX < 20 as trend-weakness confirmation.

SOIC LTI parameters: VSTOP length 10 ×2 · RSI length 14, buy zone ≥ 45 · CRS benchmarked
to NSE:NIFTY with 52-week MA · ADX length 14, buy signal ≥ 20.

AI cannot see live charts: work from data the user provides, a chart screenshot, or fetched
price/volume data. State clearly which inputs were actually available. Verdict format:
Stage (1/2/3/4) | BUY / HOLD / SELL technically | risk-reward from CMP to nearest support
vs resistance.

## Part B — The "why now" fundamental catalyst

For each stock, execute the research steps and identify the specific catalyst likely
driving institutional accumulation:

1. Recent concall/guidance (last 2 quarters): revenue/margin guidance, order book,
   capacity utilisation.
2. Corporate announcements (last 90 days): order wins, capex sanction, acquisition,
   fundraise, promoter buying. Use `fundamental-shift-scanner` / `stock-documents-fetcher`
   outputs where they already exist.
3. Capacity/expansion news: commissioning dates, debottlenecking, backward integration.
4. Sector tailwinds: PLI, tariff protection, China+1 orders (must be backed by actual
   orders), government spending.
5. Financial snapshot from Screener: TTM sales/PAT growth, 3-yr OPM trend, D/E change, ROCE.

### Persist the JSON DTO before writing the output template

Before producing the text output below (for one stock, or the table for a list), write
`data/agent-outputs/{TICKER}_stage2_catalyst.json` (for a multi-stock run, write one
file per ticker, or a single `{date}_stage2_catalyst.json` with a top-level array — one
record per stock either way). Each record MUST carry the standard envelope from
`skills/tooling/output-dto-standard/SKILL.md` — `companyId` (canonical `EXCH:SYMBOL`),
`creationTime`, `modifiedTime`, `creator: "stage2-catalyst-analysis"` — plus the domain
fields: `stage` (1/2/3/4), `technicalVerdict` (BUY/HOLD/SELL), `entryZone`, `stopLoss`,
`exitCriteria`, `riskReward`, `primaryTrigger` (dated), `supportingData`, `sectorContext`,
`keyRisk`, `triggerConfidence` (HIGH/MEDIUM/LOW). The output template below is a render of
this JSON, not a separately-drafted note.

### Output template (per stock)

```
[TICKER] — [Company] · Sector | MCap ₹X Cr | CMP ₹X | TTM PE Xx
PRIMARY TRIGGER (the "why now"): one specific, DATED catalyst
SUPPORTING DATA: concall quote (dated) · financial inflection · order book / revenue visibility
SECTOR CONTEXT: company-specific or sector-wide? 1–2 peers with similar triggers
KEY RISK: single biggest risk to the trigger
TRIGGER CONFIDENCE: HIGH / MEDIUM / LOW + one line
```

If the most recent catalyst is older than 6 months → classify as
**"NO RECENT FUNDAMENTAL TRIGGER — technical/liquidity setup"**. Never invent one.

For a list of stocks, finish with: trigger summary table, and thematic clusters
(Capex Commissioning | Order Book Inflection | Margin Recovery | Sector Policy Tailwind |
No Clear Trigger).

## Handoffs

- Write `technical.stage` + entry/stop/exit into the company's thesis
  (`investment-thesis-engine`, timing overlay — see its signal_rules.md: technicals adjust
  timing, never the fundamental signal).
- HIGH-confidence triggers become `triggers[]` candidates in the thesis after quantification.
