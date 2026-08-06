#!/usr/bin/env python3
"""
Step 2 (deterministic, no LLM) for guidance-relevance-filter.

A cheap-model relevance-filter pass can under-shoot recall just like a
cheap-model extraction pass can -- this script is a fast, mechanical sanity
check (NOT a re-extraction) that flags when that might have happened, so a
human or the calling skill can decide to re-run Step 1 or escalate that one
company rather than silently trusting a possibly-thin excerpt file.

Method: count forward-guidance "signal" keyword hits in the raw source
text(s) versus how many of those same signals appear (verbatim or as a
substring) inside the excerpts file. A low overlap ratio suggests real
recall loss; a high one is reassuring (not proof of correctness -- this
script cannot judge whether an excerpt is GOOD guidance, only whether the
filter pass touched the same neighborhoods the raw text's keyword hits are
in).

Usage:
  python3 check_excerpt_coverage.py \
    --excerpts /tmp/NSE_X_relevant_excerpts.json \
    --source-texts /tmp/.../Transcript.txt,/tmp/.../PPT.txt
"""
import argparse
import json
import re

SIGNAL_PATTERN = re.compile(
    r"(FY2[4-9]|FY3[0-9]|next year|next quarter|going forward|guidance|target(?:ing)?|"
    r"expect(?:ed|ing)?|aim(?:ing)?|plan(?:ning)? to|over the next|by FY\d{2}|"
    r"\d+(?:\.\d+)?\s*%|(?:₹|Rs\.?|INR|\$)\s*\d)",
    re.IGNORECASE,
)


def count_signal_windows(text, window=80):
    """Return a list of (start, end) windows around each signal hit, merged if overlapping."""
    hits = [m.start() for m in SIGNAL_PATTERN.finditer(text)]
    windows = []
    for h in hits:
        windows.append((max(0, h - window), h + window))
    # merge overlapping windows
    windows.sort()
    merged = []
    for s, e in windows:
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--excerpts", required=True)
    ap.add_argument("--source-texts", required=True, help="comma-separated paths")
    args = ap.parse_args()

    excerpts = json.load(open(args.excerpts))
    excerpt_texts = " ".join(e.get("text", "") for e in excerpts.get("excerpts", []))

    total_windows = 0
    covered_windows = 0
    per_source = []

    for src_path in args.source_texts.split(","):
        src_path = src_path.strip()
        if not src_path:
            continue
        try:
            text = open(src_path, encoding="utf-8", errors="ignore").read()
        except FileNotFoundError:
            per_source.append({"path": src_path, "error": "file not found"})
            continue

        excerpt_word_set = set(re.findall(r"[a-z0-9]+", excerpt_texts.lower()))
        windows = count_signal_windows(text)
        covered = 0
        for s, e in windows:
            snippet = text[s:e]
            # Word-overlap check (Jaccard-ish, not exact substring -- an
            # excerpt is usually a paraphrase/trim of the raw window, not a
            # byte-for-byte copy): if a meaningful fraction of this window's
            # distinctive words also appear in the excerpt text, count it
            # as covered. Numbers and FY-labels are the highest-signal
            # words here and deliberately weighted by just being in the set.
            snippet_words = set(re.findall(r"[a-z0-9]+", snippet.lower()))
            if not snippet_words:
                continue
            overlap = len(snippet_words & excerpt_word_set) / len(snippet_words)
            if overlap >= 0.35:
                covered += 1
        total_windows += len(windows)
        covered_windows += covered
        per_source.append({
            "path": src_path,
            "signal_windows": len(windows),
            "windows_covered_in_excerpts": covered,
            "coverage_pct": round(100 * covered / len(windows), 1) if windows else None,
        })

    overall_pct = round(100 * covered_windows / total_windows, 1) if total_windows else None
    result = {
        "ticker": excerpts.get("ticker"),
        "overall_signal_windows": total_windows,
        "overall_covered": covered_windows,
        "overall_coverage_pct": overall_pct,
        "per_source": per_source,
        "flag_low_recall": (overall_pct is not None and overall_pct < 40),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
