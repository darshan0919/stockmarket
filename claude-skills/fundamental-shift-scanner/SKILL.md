---
name: fundamental-shift-scanner
description: >
  Given a single Stockscans company link or ticker (e.g.
  https://www.stockscans.in/company/NSE:PARACABLES or NSE:BSE), fetches that
  company's corporate announcements from the last 7 days and produces a
  world-class-analyst interpretation of what is CHANGING FUNDAMENTALLY in the
  business — not a routine compliance digest. Use when the user pastes a
  Stockscans company URL or ticker and asks "what's changed this week", "any
  recent news on X", "scan recent announcements for X", "what's new with X",
  "is anything fundamentally different about this company", "check the last
  week's filings for X", "any red or green flags in recent announcements", or
  wants a quick fundamental-shift pulse-check on one stock. ALWAYS use this
  skill even for "just check the news" requests — raw announcement lists are
  mostly noise (AGM, record dates, ESOP) and this skill separates signal from
  noise and explains WHY it matters. Single-company only; for multi-company
  watchlist scans use `watchlist-catalyst-scanner` instead.
---

# Fundamental Shift Scanner

> Your job is not to list announcements. Your job is to answer: **"Has
> anything happened in the last week that changes how I should think about
> this business?"** — and if the honest answer is "no", say so clearly and
> briefly rather than padding out routine filings into false significance.

A single-company, last-7-day announcement scanner that pairs `stock-documents-fetcher`'s
announcement API with an analyst-grade interpretive layer. Where
`watchlist-catalyst-scanner` is built for breadth (51 companies, severity
triage, alert-digest cadence), this skill is built for depth on ONE company —
closer in spirit to `quarterly-result-analysis`'s "so what?" framing, applied
to a week of corporate-action flow instead of a results PPT.

## When to use this skill

- User pastes a Stockscans company URL: `https://www.stockscans.in/company/NSE:PARACABLES`
- User gives a bare ticker and asks for recent news/announcements: `NSE:BANDHANBNK — anything new this week?`
- "What's changed fundamentally with [company] recently?"
- "Scan the last week of filings for X and tell me if it matters"
- Pre-call prep before a deeper dive — run this first to know whether
  `growth-triggers-1pager`, `quarterly-result-analysis`, or
  `consecutive-filings-diff` is warranted on the back of new information

## How this differs from neighbouring skills

| If you need... | Route to |
|---|---|
| Multi-company (watchlist) daily catalyst alerts | `watchlist-catalyst-scanner` |
| Full single-quarter result interpretation (3-basket) | `quarterly-result-analysis` |
| 1-page conviction note with growth triggers | `growth-triggers-1pager` |
| Forensic red-flag scan from annual reports | `forensic-accounting` |
| **"Did anything change THIS WEEK that matters?" — single company** | **THIS SKILL** |

## Workflow

### Step 1 — Resolve the ticker

Accept either:
- A bare ticker: `NSE:PARACABLES`, `BSE:500325`
- A Stockscans company URL: `https://www.stockscans.in/company/NSE:PARACABLES`
  (also handle the URL-encoded form `NSE%3APARACABLES`)

Extract the `EXCH:SYMBOL` segment after `/company/`, URL-decode it
(`%3A` → `:`), and use that as `$TICKER` for all subsequent steps. If the
input is ambiguous (a company name, not a ticker/URL), resolve it on
stockscans.in first or ask the user for the ticker.

### Step 2 — Fetch last-7-day announcements

Use `stock-documents-fetcher`'s announcement script directly — do not
reimplement the API call:

```bash
TICKER="NSE:PARACABLES"          # resolved from Step 1
SAFE=$(echo "$TICKER" | tr ':' '_')
OUT_DIR="/tmp/${SAFE}_shiftscan"
START=$(date -d '7 days ago' +%Y-%m-%d)   # or `date -v-7d` on macOS

python3 /tmp/fetch_announcements.py \
    "$TICKER" --start "$START" --max-pages 5 -o "$OUT_DIR"
```

Omit `--search` — pull everything in the window, then classify yourself
(this skill's classification is interpretive, not regex-driven like the
watchlist scanner). Read `$OUT_DIR/manifest.json` for the `announcements`
array. If it's empty, that itself is the finding — say so (see "When there's
nothing to report" below). If `fetch_announcements.py` reports a 401/403,
follow its token-refresh guidance verbatim.

### Step 3 — Triage: noise vs signal

Walk every announcement and bucket it into NOISE or SIGNAL.

**NOISE (mention only in passing, do not analyse):**
AGM/EGM/postal ballot notices, book closure / record date, trading window
closure, newspaper advertisement copies, share certificate / RTA matters,
investor grievance disclosures, Reg 74(5) / Reg 57 routine certificates,
routine board meeting intimations with no outcome attached, e-voting
results that simply confirm AGM resolutions passed.

**SIGNAL — anything that could plausibly shift the investment thesis:**
order wins / contracts / LOIs, results (interim or final), capex /
capacity / commissioning announcements, M&A / JV / divestment / scheme of
arrangement, credit rating actions, fundraise (QIP / preferential /
warrants / NCD / rights), promoter or insider shareholding changes (SAST/
PIT disclosures), management or auditor changes, regulatory approvals or
actions (USFDA, PLI, environmental clearances, SEBI/exchange action),
litigation or investigation disclosures, related-party transaction
approvals above routine thresholds, dividend/buyback declarations, pledge
creation or release, plant incidents (fire, strike, shutdown), and any
exchange "clarification on price movement" (a meta-signal that the market
is already pricing something in).

If genuinely unsure whether something is noise or signal, default to SIGNAL
and address it briefly — false negatives here are worse than a short
dismissive sentence on a borderline item.

### Step 4 — Analyst interpretation (the core of this skill)

For each SIGNAL item, work through these questions like a sell-side analyst
updating a model, not a news aggregator summarising headlines:

1. **What literally happened?** One sentence, facts only, with the filing
   date. [Source: BSE/NSE filing, DD-Mon-YYYY]

2. **Why might this matter?** Connect it to a specific line item or driver —
   revenue mix, margin structure, balance sheet, competitive position,
   governance quality, cost of capital, or float/ownership structure. Avoid
   generic statements ("this is positive for the company") — state the
   mechanism ("if executed, this order adds ~X% to TTM revenue at the
   segment's historical ~Y% EBITDA margin, which would..."). When the
   filing discloses a value, size it against TTM revenue or market cap if
   those are known; if not known, say so rather than guessing.

3. **Is this NEW information, or confirmation of something already known?**
   A board approving a fundraise that was guided on the last concall is
   confirmation (lower information content); an unguided acquisition
   announcement is new (higher information content). Markets re-rate on
   *new* information disproportionately — flag which this is.

4. **Tag STRUCTURAL / CYCLICAL / ONE-OFF / GOVERNANCE-SIGNAL** — same
   taxonomy as `quarterly-result-analysis`:
   - STRUCTURAL: permanently changes earnings power or balance-sheet
     structure (new large customer, capacity addition, debt
     prepayment, business model pivot)
   - CYCLICAL: tied to a cycle that will mean-revert (commodity-linked
     order, demand-cycle related capex)
   - ONE-OFF: doesn't recur and doesn't change the run-rate (one-time
     settlement, a single asset sale)
   - GOVERNANCE-SIGNAL: says something about management/promoter
     behaviour independent of the immediate financial impact (pledge
     release, insider buying, auditor resignation, related-party deal)

5. **What would confirm or kill this thesis going forward?** One falsifiable
   forward marker with a rough horizon — "if Q[X] FY[YY] revenue from this
   segment doesn't show up by [quarter], treat the order as delayed/at
   risk."

### Step 5 — Synthesise: the "so what" verdict

After working through every SIGNAL item, write a short synthesis (3-6
sentences) answering directly:

- Has anything **structurally** changed in the last week, or is this all
  cyclical/one-off noise dressed up as news?
- Does this change the urgency of deeper research — i.e., should the user
  now run `growth-triggers-1pager`, `quarterly-result-analysis`, or
  `consecutive-filings-diff` on the back of this?
- If Darshan already holds a documented thesis on this name (check past
  conversations / memory if relevant), does this week's flow support,
  contradict, or sit orthogonal to that thesis? Don't force a connection if
  there isn't one.

### When there's nothing to report

If the 7-day window contains only NOISE (or is empty), say so in 1-2
sentences and stop — do not manufacture analysis from AGM notices. This is a
valid and useful output: "No structurally significant announcements for
[TICKER] in the last 7 days — only routine [AGM notice / record date]
filings." This is the single most important behaviour of this skill: a quiet
week is information too, and padding it out erodes trust in every other
output.

## Output format

Default to a concise **inline markdown response** (this is a "quick
pulse-check" skill, not a report-generation skill — do not create a PDF or
file unless asked):

```
## [Company Name] (TICKER) — Fundamental Shift Scan, [date range]

[1-2 line headline verdict]

### Signal items
[For each SIGNAL, 3-5 lines: What happened → Why it matters → New vs known →
Tag → Forward marker]

### Noise (for completeness)
[1 line listing what was filtered out, e.g. "AGM notice (12-Jun), Reg 74(5)
NCD certificate (10-Jun)"]

### So what?
[3-6 sentence synthesis per Step 5]
```

If the user explicitly asks for a shareable/visual format, render as an HTML
widget via `visualize:show_widget` using the same card-based severity layout
as `watchlist-catalyst-scanner` (STRUCTURAL/GOVERNANCE items get a stronger
visual treatment than CYCLICAL/ONE-OFF) — but the inline markdown is the
default and is sufficient for most uses.

## Conventions

Follow [`management-credibility-tracker`'s shared conventions](../management-credibility-tracker/_shared/conventions.md),
particularly:
- §1 Indian-market conventions (Rs Cr, FY26 notation)
- §2 Citation discipline — every SIGNAL item carries `[Source: filing-type,
  DD-Mon-YYYY]`
- §3 Anti-hallucination protocol — read the actual filing PDF before sizing
  an order or fundraise; do not infer numbers not present in the
  announcement text or a quickly-fetched filing PDF
- §6 STRUCTURAL/CYCLICAL/ONE-OFF taxonomy — borrowed and extended with
  GOVERNANCE-SIGNAL for this skill's purposes

## Pitfalls

- **Don't re-do the watchlist scanner's job.** This skill is for ONE company
  the user is actively interested in right now — go deeper per item than the
  watchlist scanner's severity-tagged cards. If the user wants to scan many
  companies, redirect to `watchlist-catalyst-scanner`.
- **Don't treat "Board Meeting Intimation" as signal by itself.** It's a
  routine pre-announcement that a board meeting will occur — wait for / fetch
  the outcome filing. If the outcome filing isn't in the window yet, note
  the upcoming meeting date as a forward marker, not as a finding.
- **Don't quantify without a source.** If an order's value is "undisclosed",
  say so — don't estimate a Rs Cr figure from thin air. If sizing against TTM
  revenue and TTM revenue isn't already known to you, either fetch it quickly
  (Screener.in) or state the comparison can't be made.
- **SAST/PIT disclosures never state direction in the summary.** As with the
  watchlist scanner — buy or sell is not inferable from the filing title
  alone; open the PDF (`ssUrl` in the manifest, served from
  `https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/<ssUrl>`)
  before characterising a promoter/insider stake change as bullish or
  bearish.
- **A "Clarification on price movement" filing is itself a signal** — it
  means the exchange noticed unusual activity. Treat it as a meta-signal:
  the market may know something not yet in the announcement feed; widen the
  search to recent news/web if this appears.
