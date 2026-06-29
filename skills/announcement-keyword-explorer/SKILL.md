---
name: announcement-keyword-explorer
description: >
  Given a single seed keyword, exhaustively discovers all related keyword variants
  used in Stockscans announcement-scan filters — by fetching actual announcements
  across the last 4 quarters and mining the real titles & descriptions for n-grams,
  phrases, and semantic clusters. Use whenever the user wants to find the right
  keywords for an announcement scan, asks "what keywords should I use to scan for X",
  "find all variants of this announcement keyword", "expand my announcement search",
  "what does Stockscans call this type of filing", or wants to build an exhaustive
  announcement filter. Always use this skill for announcement keyword discovery —
  manual guessing misses many real variants used by Indian companies in their filings.
---

# Announcement Keyword Explorer

**Purpose:** Given a seed keyword, discover the exhaustive set of keyword variants
that actually appear in Stockscans announcement data — so scans catch all filings
on a topic, not just the ones that happen to match one phrase.

---

## Inputs

| Field | Source | Notes |
|---|---|---|
| `keyword` | User message | Seed phrase exactly as typed in Stockscans "Quick Search" |
| `--quarters` | Optional | How many past quarters to scan (default 4) |
| `--min-mcap` | Optional | Market cap floor in Cr (default 300) |

---

## Step 1 — Run the script (deterministic heavy lifting)

```bash
python /home/claude/announcement-keyword-explorer/packages/stock-api/python/fetchers/fetch_and_extract.py \
  --keyword "<USER_KEYWORD>" \
  --quarters 4 \
  --min-mcap 300 \
  --output /tmp/keyword_explorer_output.json
```

**Auth:** The script auto-resolves the authtoken via:
1. `$STOCKSCANS_AUTHTOKEN` env var
2. `/mnt/project/Stockscans_authtoken`
3. `~/.stockscans_authtoken`

If auth fails, tell the user: *"Please paste your Stockscans authtoken — find it in
DevTools → Application → Cookies → `authtoken` on stockscans.in"*

**Quarter-date logic:** The script computes the last N quarter-end dates in YYYYMM
format using end-of-quarter months 03, 06, 09, 12 (e.g. June 2026 → 202606,
March 2026 → 202603, Dec 2025 → 202512, Sep 2025 → 202509).

---

## Step 2 — Read the script output

```python
import json
data = json.loads(open("/tmp/keyword_explorer_output.json").read())
```

The JSON contains:
- `total_announcements` — total hits across all quarters
- `per_quarter` — count + sample titles per quarter
- `all_titles` — deduplicated list of every title found
- `all_descriptions` — deduplicated descriptions
- `title_unigrams` / `title_bigrams` — frequency-ranked single and two-word tokens
  extracted from titles (stop words and noise already removed)
- `desc_unigrams` / `desc_bigrams` — same for descriptions
- `title_candidate_phrases` — Title-Case multi-word phrases seen 2+ times in titles
- `errors` — any quarter that failed to fetch

---

## Step 3 — Reason and synthesize (prompt's job)

Read the output carefully. Your job is to:

### 3a. Audit coverage

Check whether the seed keyword itself is the dominant phrase or just one variant.
Look at `all_titles` — what are the 10–20 most common distinct title patterns?
Group them mentally into semantic clusters.

### 3b. Extract keyword candidates from titles

From `title_unigrams`, `title_bigrams`, `title_candidate_phrases`:
- Which high-frequency words/phrases are MEANINGFUL search terms (not noise)?
- Which bigrams represent complete filing titles or sub-categories?
- Are there acronyms / abbreviations worth noting?

### 3c. Extract keyword candidates from descriptions

Descriptions are often longer and more varied. From `desc_unigrams`, `desc_bigrams`:
- Do descriptions contain sub-types not visible in titles?
- Are there regulatory section references (e.g. "Section 194", "Reg 30") that
  would work as standalone search terms?
- Any counterparty names or event types (e.g. "CRISIL", "NCLT", "preferential
  allotment") recurring in descriptions?

### 3d. Identify gaps

Ask yourself:
- **What filing variants might be MISSING** from these results? (The seed keyword
  may have already pre-filtered — some variants might use completely different
  phrasing that this seed didn't catch.)
- Are there synonyms or alternate phrasings that Indian companies use that don't
  show up here because the seed excluded them?
- Flag 2–3 "blind spots" to investigate with a different seed keyword.

### 3e. Synthesize the exhaustive keyword list

Output a clean, grouped keyword list:

```
## Exhaustive Keyword List for: <SEED>

### Group 1: [Semantic Category Name]
- Keyword variant A
- Keyword variant B
- ...

### Group 2: [Semantic Category Name]
- ...

### Potential Blind Spots (try these as separate seeds)
- ...

### Summary
Total announcements sampled: N across 4 quarters
Coverage confidence: HIGH / MEDIUM / LOW
Reason: [brief justification]
```

**Coverage confidence rubric:**
- HIGH: >50 announcements found, titles are consistent, few obvious gaps
- MEDIUM: 10–50 announcements or clear synonym blind spots exist
- LOW: <10 announcements or the seed keyword returned noise with no signal

---

## Step 4 — Present results

Show the keyword list as a formatted HTML widget using `show_widget` if available,
otherwise render as clean Markdown in chat.

Include a collapsible "Raw Evidence" section showing:
- Top 20 actual titles seen (as proof the keywords are real)
- Per-quarter breakdown (did volume change over time?)

---

## Edge cases

| Situation | Handling |
|---|---|
| 0 results for a quarter | Log it in `errors`, note it in output, don't fail |
| Seed keyword too broad (>200 results) | Note it; suggest splitting into sub-keywords |
| Seed keyword too narrow (<5 results) | Flag LOW confidence; suggest 2–3 alternate seeds |
| Auth token expired | Prompt user for fresh token (see Step 1 above) |
| Description field empty in all results | Skip desc analysis, note in output |

---

## What could go wrong (self-check before answering)

1. **Quarter-date edge case:** If today is exactly on a quarter boundary (e.g. March 31),
   the script might double-count the current quarter. The script handles this by checking
   `month <= today.month`.

2. **Stop word over-removal:** Domain-specific short terms like "TDS", "AGM", "EPS" are
   3 letters and NOT removed by the stop-word filter. But verify any 3-letter term
   flagged is meaningful before including it in the keyword list.

3. **Seed pre-filtering bias:** All n-grams computed are from announcements that ALREADY
   matched the seed. Variants using completely different phrasing won't appear. Always
   mention this limitation and suggest 2–3 orthogonal seed keywords as blind-spot checks.

4. **Stockscans "quick search" vs exact match:** The searchFilters field in the API uses
   substring/fuzzy match, not exact match. So "dividend" will match "interim dividend",
   "special dividend", etc. Factor this in when grouping.
