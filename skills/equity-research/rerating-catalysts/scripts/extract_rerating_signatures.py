#!/usr/bin/env python3
"""
extract_rerating_signatures.py — Stage 1 of the rerating-catalysts scale
funnel (skills/_shared/scale-funnel-pattern.md).

Zero-to-cheap-tier, RECALL-FIRST pass over one company's already-fetched
document text (Transcript/PPT/Result/Announcements, per rerating-catalysts
Phase 1's own acquisition step). It does NOT judge, rank, quantify, or tag
new-vs-confirmation -- it does the same job guidance-document-extractor's
Step 2 and quarterly-result-extractor's Step 3 do for their domains: pull
every passage that PLAUSIBLY matters, so the expensive flagship-model read
(rerating-catalysts Phase 2/3 itself) works from a compressed excerpt file
instead of re-reading the full raw text of 4 transcripts + 4 results + 2
PPTs from scratch every time.

"Cheap" describes the JOB (pattern-match recall, not reasoning), not a
mandate to call a separate model API -- this script itself needs no model at
all (it is regex-driven), which makes it strictly cheaper than even a
cheap-tier LLM pass. It exists as a genuine Stage 1 script (unlike
guidance-document-extractor's Step 2, which is deliberately unscripted
because that step needs real language understanding) because rerating-
catalysts' signature phrases are already enumerated, explicit, and
grep-able in growth_catalyst_framework.md's "new" taxonomy table (§2) --
turning that table into a regex bank captures most of the recall value
without needing a model call at all. It is intentionally over-inclusive
(false positives are cheap; a missed passage is not) -- the flagship pass
still reads full context around every hit and is the one that decides
new-vs-confirmation, quantification, conviction, and J-curve stage.

Usage:
  python3 extract_rerating_signatures.py \
      --texts Transcript_Q1FY27.txt=Transcript,PPT_Q1FY27.txt=PPT,Result_Q1FY27.txt=Result \
      --out /tmp/NSE_X_rerating/signatures.json

Or, simpler, point it at a directory laid out the way rerating-catalysts
Phase 1 already writes its scratch dir (manifest.json identifies which file
is which type):

  python3 extract_rerating_signatures.py --scratch-dir /tmp/NSE_X_rerating --out /tmp/NSE_X_rerating/signatures.json

Output: JSON --
  {
    "compressionRatio": 0.14,
    "rawCharsTotal": 82000,
    "excerptCharsTotal": 11700,
    "bySource": [
      {"source": "Transcript", "path": "...", "excerpts": [
          {"category": "New capex / capacity", "phrase": "commissioning", "text": "...", "context": "...50 chars before/after..."}
      ]}
    ]
  }
"""
import argparse
import json
import os
import re
import sys

# Mirrors growth_catalyst_framework.md §2's "Signature phrase to grep for"
# column verbatim -- if the framework doc's taxonomy table changes, update
# this bank to match (they are meant to stay in lockstep; the framework doc
# is the source of truth for the taxonomy itself).
SIGNATURE_PHRASES = {
    "New base creation": [r"new base", r"scaled up", r"integration of (the )?acquired"],
    "New industry cycle": [r"options in commodities", r"s-?curve", r"penetration crossing"],
    "New management change": [r"acquired controlling stake", r"new promoter", r"board reconstitution"],
    "New corporate action": [r"scheme of arrangement", r"demerger", r"jv agreement", r"joint venture agreement"],
    "New capex / capacity": [r"under construction", r"commissioning", r"phase\s*2", r"kmtpa", r"\bmw\b added", r"capacity expansion", r"greenfield", r"brownfield"],
    "New age of business": [r"asset-?light", r"platform model", r"marketplace"],
    "New market creation": [r"first-?of-?its-?kind", r"launched in india", r"introduced"],
    "New regulations": [r"anti-?dumping duty", r"pli scheme", r"import substitution", r"production linked incentive"],
    "New value-added mix": [r"value-?added", r"premiumi[sz]ation", r"mix shift"],
    "New business verticals": [r"entered the segment", r"diversifying into"],
    "New geographies": [r"export share", r"new geography", r"international foray"],
    "New acquisitions": [r"\bacquired\b", r"consolidation"],
    "New warrants / preferential issues": [r"convertible warrants?", r"preferential allotment"],
    "New balance-sheet deleveraging": [r"debt repayment", r"net debt reduction", r"finance cost declined", r"debt-?free"],
}

# A number-near-forward-cue check, same spirit as guidance-document-extractor
# Step 2 -- but here it's a SECOND, independent pass (not tied to a "new"
# category) so quantified guidance is never missed just because it doesn't
# also contain a signature phrase in the same sentence.
NUMBER_RE = re.compile(r"(?:rs\.?|inr|₹|\$|usd)\s*[\d,]+(?:\.\d+)?\s*(?:cr|crore|lakh|lacs?|million|mn|billion|bn)?|\b\d{1,3}(?:\.\d+)?\s*%", re.I)
FORWARD_CUE_RE = re.compile(r"\bfy2[5-9]\b|\bq[1-4]fy2[5-9]\b|next year|by fy2[5-9]|expect|guide|target|aim to|plan to reach|going forward|outlook", re.I)

CONTEXT_CHARS = 220


def find_excerpts(text, patterns_by_category):
    hits = []
    for category, patterns in patterns_by_category.items():
        for pat in patterns:
            for m in re.finditer(pat, text, re.I):
                start = max(0, m.start() - CONTEXT_CHARS)
                end = min(len(text), m.end() + CONTEXT_CHARS)
                hits.append({
                    "category": category,
                    "phrase": m.group(0),
                    "context": text[start:end].strip(),
                })
    return hits


def find_quantified_forward_passages(text):
    hits = []
    for m in re.finditer(NUMBER_RE, text):
        start = max(0, m.start() - CONTEXT_CHARS)
        end = min(len(text), m.end() + CONTEXT_CHARS)
        window = text[start:end]
        if FORWARD_CUE_RE.search(window):
            hits.append({
                "category": "Quantified forward-looking passage",
                "phrase": m.group(0),
                "context": window.strip(),
            })
    return hits


def dedupe(hits):
    seen = set()
    out = []
    for h in hits:
        key = h["context"][:120]
        if key in seen:
            continue
        seen.add(key)
        out.append(h)
    return out


def process_source(path_, source_type):
    with open(path_, "r", errors="ignore") as f:
        text = f.read()
    hits = find_excerpts(text, SIGNATURE_PHRASES) + find_quantified_forward_passages(text)
    hits = dedupe(hits)
    excerpt_chars = sum(len(h["context"]) for h in hits)
    return {
        "source": source_type,
        "path": path_,
        "rawChars": len(text),
        "excerptChars": excerpt_chars,
        "excerpts": hits,
    }


def load_from_scratch_dir(scratch_dir):
    manifest_path = os.path.join(scratch_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        print(f"ERROR: no manifest.json in {scratch_dir}", file=sys.stderr)
        sys.exit(1)
    with open(manifest_path) as f:
        manifest = json.load(f)
    # manifest shape follows rerating-catalysts Phase 1 / documentsFetcher.js
    # convention: {"textPaths": {"Transcript": "...", "PPT": "...", ...}} or a
    # list of {type, path} entries -- support both shapes defensively.
    pairs = []
    text_paths = manifest.get("textPaths") if isinstance(manifest, dict) else None
    if text_paths:
        for doc_type, p in text_paths.items():
            if p and os.path.exists(p):
                pairs.append((p, doc_type))
    elif isinstance(manifest, list):
        for entry in manifest:
            p = entry.get("path") or entry.get("textPath")
            t = entry.get("type")
            if p and t and os.path.exists(p):
                pairs.append((p, t))
    return pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--texts", help="comma-separated path=Type pairs, e.g. a.txt=Transcript,b.txt=PPT")
    ap.add_argument("--scratch-dir", help="rerating-catalysts scratch dir containing manifest.json")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    pairs = []
    if args.texts:
        for pair in args.texts.split(","):
            p, t = pair.split("=", 1)
            pairs.append((p, t))
    elif args.scratch_dir:
        pairs = load_from_scratch_dir(args.scratch_dir)
    else:
        print("Provide --texts or --scratch-dir", file=sys.stderr)
        sys.exit(1)

    by_source = []
    raw_total = 0
    excerpt_total = 0
    for path_, source_type in pairs:
        if not os.path.exists(path_):
            print(f"WARN: missing {path_}, skipping", file=sys.stderr)
            continue
        result = process_source(path_, source_type)
        raw_total += result["rawChars"]
        excerpt_total += result["excerptChars"]
        by_source.append(result)

    out = {
        "rawCharsTotal": raw_total,
        "excerptCharsTotal": excerpt_total,
        "compressionRatio": round(excerpt_total / raw_total, 4) if raw_total else None,
        "bySource": by_source,
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, indent=1)

    print(
        f"[extract] {len(by_source)} source(s), {raw_total} raw chars -> {excerpt_total} excerpt chars "
        f"({out['compressionRatio']*100:.1f}% of raw)" if raw_total else "[extract] no sources processed",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
