#!/usr/bin/env python3
"""
Step 3 helper (deterministic, no LLM) for forward-guidance-extractor.

Takes the guidance items the model extracted from a transcript (LLM reasoning
happens BEFORE this script runs — this script only does arithmetic) and, for
each item, derives whichever of {absolute_value, relative_pct} management did
NOT state explicitly, but ONLY when a sourced base actual is available. This is
arithmetic on two confirmed facts, not an assumption — if the base actual isn't
confirmed (has no `base_value_source_quote`), the derived field is left null
rather than guessed. That null is what the SKILL.md instructs to leave blank in
the Excel cell.

Input item schema (one guidance line, produced by reading the transcript):
{
  "metric_category": "Top Line" | "Margins" | "Bottom Line" | "Balance Sheet" | "Key Metrics",
  "metric": "Revenue",                      # free text, e.g. "EBITDA Margin", "PAT", "Order Book"
  "period_guided": "FY27",                  # the period the guidance is FOR
  "absolute_value": 300.0 | null,
  "absolute_unit": "cr" | "%" | "x" | "days" | null,
  "relative_pct": 20.0 | null,               # signed: +20 growth, -10 decline
  "base_value": 250.0 | null,                # confirmed actual base-period value, only if quoted
  "base_period": "FY25" | null,
  "base_value_source_quote": "..." | null,   # required if base_value is set
  "quote": "management's exact guidance sentence",
  "confidence": "explicit"                   # this script only ever sees explicit guidance;
                                              # directional/vague statements should never reach it
}

Output: same item + {derived_field: "absolute"|"relative"|"none", absolute_value,
relative_pct, display} where display is the single-cell string requested by the
user: "<absolute> (<relative%>)" when both are known, or just whichever one is
known when the other genuinely cannot be derived.

Usage:
    python3 compute_guidance_value.py --batch items.json > enriched.json
    echo '[{...}]' | python3 compute_guidance_value.py
"""
import argparse
import json
import sys


def compute_one(item):
    out = dict(item)
    abs_v = item.get("absolute_value")
    rel_v = item.get("relative_pct")
    base_v = item.get("base_value")
    base_quote = item.get("base_value_source_quote")
    base_confirmed = base_v is not None and bool(base_quote)

    derived_field = "none"
    if abs_v is not None and rel_v is not None:
        derived_field = "none"  # management gave both directly
    elif abs_v is not None and rel_v is None and base_confirmed and base_v != 0:
        rel_v = round((abs_v - base_v) / base_v * 100, 1)
        derived_field = "relative"
    elif rel_v is not None and abs_v is None and base_confirmed:
        abs_v = round(base_v * (1 + rel_v / 100), 2)
        derived_field = "absolute"
    # else: leave whichever is missing as null -- no confirmed base to derive from

    out["absolute_value"] = abs_v
    out["relative_pct"] = rel_v
    out["derived_field"] = derived_field
    out["display"] = format_display(abs_v, item.get("absolute_unit"), rel_v)
    return out


def format_display(abs_v, unit, rel_v):
    unit = unit or ""
    abs_str = None
    if abs_v is not None:
        abs_str = f"{abs_v:g}{unit}" if unit in ("%", "x") else f"{abs_v:g} {unit}".strip()
    rel_str = f"({'+' if rel_v > 0 else ''}{rel_v:g}%)" if rel_v is not None else None

    if abs_str and rel_str:
        return f"{abs_str} {rel_str}"
    if abs_str:
        return abs_str
    if rel_str:
        return rel_str
    return ""  # nothing confirmed -> blank cell, per user requirement (no assumptions)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", help="path to JSON array of guidance items; defaults to stdin")
    args = ap.parse_args()
    raw = open(args.batch).read() if args.batch else sys.stdin.read()
    items = json.loads(raw)
    if isinstance(items, dict):
        items = [items]
    print(json.dumps([compute_one(i) for i in items], indent=2))


if __name__ == "__main__":
    main()
