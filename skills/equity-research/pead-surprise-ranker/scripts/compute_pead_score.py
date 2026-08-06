#!/usr/bin/env python3
"""
Step 2 (deterministic, no LLM) for pead-surprise-ranker.

Takes the per-company ANNOTATIONS the model produced in Step 1 (visibility
tier, margin direction, PAT lever, guided revenue growth, evidence strength --
all judgment calls an LLM has to make by reading guidance DTOs) and turns them
into one composite score per company via a fixed, auditable rule set. The
score exists ONLY to sort the table -- the reader should always be pointed
back at the thesis/assumptions columns, never asked to trust the number blind.

This script does NOT re-derive tier/margin_dir/pat_lever/evidence itself --
that reasoning happens in Step 1 (LLM). This script's only job is arithmetic
over already-tagged categorical inputs, kept in a script so 30-100+ companies
score identically and reproducibly rather than an LLM re-eyeballing relative
weights differently every time it reasons about a large batch.

Input schema per company (see SKILL.md Step 1 for the full annotation guide):
{
  "ticker": "NSE:X",
  "name": "...",
  "sector": "...",
  "tier": 1|2|3|4,
  "rev_guided": "free text description, e.g. '+15-20% FY27'" | null,
  "rev_guided_pct": 17.5 | null,        # OPTIONAL pre-parsed midpoint; if
                                          # absent, the script tries to parse
                                          # rev_guided for a %% pattern itself
  "inorganic_flag": true|false,          # true halves the revenue-growth score
                                          # component (M&A-driven headline growth)
  "margin_guided": "..." | null,
  "margin_dir": "expansion"|"sandbag"|"leverage_signal"|"flat"|"declined"|"unclear",
  "pat_lever": "cost_program_direct"|"deleverage_direct"|"opex_leverage"|
               "volume_leverage"|"deleverage_signal"|"cash_turn_positive"|
               "capex_ramp"|"none_stated",
  "evidence": "very_high"|"high"|"medium-high"|"medium"|"low-medium"|"low",
  "thesis": "...",
  "assumptions": ["..."]
}

Usage:
  python3 compute_pead_score.py --in annotations.json --out ranked.json
"""
import argparse
import json
import re


def parse_pct(rev_guided_pct, rev_guided_text):
    if rev_guided_pct is not None:
        return float(rev_guided_pct)
    if not rev_guided_text:
        return None
    nums = [float(x) for x in re.findall(r'(\d+\.?\d*)\s*%', rev_guided_text)]
    if not nums:
        return None
    return sum(nums) / len(nums) if len(nums) == 1 else (min(nums) + max(nums)) / 2


TIER_SCORE = {1: 40, 2: 28, 3: 14, 4: 0}
TIER_NOTE = {
    1: "Tier1 quarter-specific visibility (+40)",
    2: "Tier2 FY-specific revenue/margin guidance (+28)",
    3: "Tier3 sector-model or partial guidance (+14)",
    4: "Tier4 no usable guidance (+0)",
}

MARGIN_SCORE = {
    "expansion": (22, "Explicit margin expansion guided"),
    "sandbag": (18, "Management self-flags guide as conservative (beat-probability skew)"),
    "leverage_signal": (12, "Operating-leverage signal present but no quantified margin guide"),
    "flat": (6, "Margin guided flat/steady, no expansion"),
    "declined": (0, "Management declined to guide margin"),
    "unclear": (3, "Margin direction unclear/not given"),
}

PAT_LEVER_SCORE = {
    "cost_program_direct": (18, "Direct, quantified cost-saving PAT lever"),
    "deleverage_direct": (18, "Direct balance-sheet deleverage PAT lever"),
    "opex_leverage": (12, "Operating-leverage PAT lever (qualitative)"),
    "volume_leverage": (9, "Volume/utilisation-ramp PAT lever"),
    "deleverage_signal": (8, "Secondary deleverage signal"),
    "cash_turn_positive": (7, "Near-term cash-turn-positive lever"),
    "capex_ramp": (-5, "Capex ramp is a near-term PAT DRAG, not a lever"),
    "none_stated": (0, "No PAT lever disclosed"),
}

EVIDENCE_SCORE = {
    "very_high": 15, "high": 12, "medium-high": 9,
    "medium": 6, "low-medium": 4, "low": 1,
}


def score_one(c):
    notes = []
    s = 0.0

    tier = c.get("tier", 4)
    s += TIER_SCORE.get(tier, 0)
    notes.append(TIER_NOTE.get(tier, f"Tier{tier} (+0)"))

    md = c.get("margin_dir", "unclear")
    pts, note = MARGIN_SCORE.get(md, (3, f"Margin direction '{md}' unrecognised, defaulted"))
    s += pts
    notes.append(f"{note} (+{pts})")

    pl = c.get("pat_lever", "none_stated")
    pts, note = PAT_LEVER_SCORE.get(pl, (0, f"PAT lever '{pl}' unrecognised, defaulted"))
    s += pts
    notes.append(f"{note} ({'+' if pts >= 0 else ''}{pts})")

    pct = parse_pct(c.get("rev_guided_pct"), c.get("rev_guided"))
    if pct is None:
        s += 2
        notes.append("No quantified revenue growth parsed (+2)")
    else:
        base = min(pct / 60 * 17, 17)
        if c.get("inorganic_flag"):
            base *= 0.5
            notes.append(f"Revenue growth ~{pct:.0f}% guided but flagged partly inorganic -- HALVED (+{base:.1f})")
        else:
            notes.append(f"Revenue growth ~{pct:.0f}% guided (+{base:.1f})")
        s += base

    ev = c.get("evidence", "low")
    ev_pts = EVIDENCE_SCORE.get(ev, 3)
    s += ev_pts
    notes.append(f"Evidence strength '{ev}' (+{ev_pts})")

    return round(s, 1), notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="infile", required=True)
    ap.add_argument("--out", dest="outfile", required=True)
    args = ap.parse_args()

    data = json.load(open(args.infile))
    results = []
    for c in data:
        sc, notes = score_one(c)
        results.append({**c, "composite_score": sc, "score_breakdown": notes})
    results.sort(key=lambda x: -x["composite_score"])

    json.dump(results, open(args.outfile, "w"), indent=2)
    for r in results:
        print(f"{r['composite_score']:5.1f}  {r['ticker']:16s} {r.get('name','')}")


if __name__ == "__main__":
    main()
