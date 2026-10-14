#!/usr/bin/env python3
"""Zero-LLM KB evidence pack for rerating-catalysts Phase 3h (Event Chain Thesis).

Builds lens queries from a draft rerating DTO (sector + top catalysts + extra
theme words), runs ask-expert's search_expert.py once per query across every
expert corpus, and returns a compact, deduped pack (citation, url, date,
freshness, short excerpt) plus pointers to the matching sector-playbook
sections. Pure retrieval and trimming: all judgement stays with the agent.

Usage (via facade): yarn rerating:thesis-evidence --dto draft.json [--query "..."]...
See references/event_chain_thesis.md §6.
"""
import argparse
import json
import os
import re
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
SEARCH = os.path.join(REPO, "skills", "equity-research", "ask-expert", "scripts", "search_expert.py")
PLAYBOOKS = [
    os.path.join("assets", "sector-theme-playbook-soic-handles.md"),
    os.path.join("assets", "knowledge-x-sureshkbn.md"),
]
# Hits kept per expert block per query. SOIC (incl. @ishmohit1) and SureshKBN
# are the thesis lenses; other followed X accounts get one corroborating hit.
# stockscans = platform tutorials (no thesis evidence); anilLamba is opt-in
# (--with-lamba) for the balance-sheet lens only, else it crowds theme queries.
EXPERT_QUOTA = {"soic": 2, "sureshKbn": 2, "stockscans": 0, "anilLamba": 0}
DEFAULT_QUOTA = 1
# A hit must score >= this fraction of the query's best raw score across all
# experts. search_expert returns *something* for every corpus on every query;
# this drops the off-topic fillers so the pack carries only real evidence.
RELEVANCE_FLOOR = 0.4
EXCERPT_CHARS = 240
MAX_QUERY_WORDS = 12


def _words(text, limit=MAX_QUERY_WORDS):
    """Collapse whitespace/punctuation and cap a query at `limit` words."""
    tokens = re.findall(r"[A-Za-z0-9&+.%-]+", text or "")
    return " ".join(tokens[:limit])


def build_queries(dto, extra=None, max_catalysts=3):
    """Return [(lens, query)] for the evidence pack.

    Lenses: theme (sector tailwind), one per top catalyst, why-market-pays,
    plus each agent-supplied extra theme query. Empty queries are dropped and
    duplicates removed, preserving order.
    """
    sector = (dto.get("sector") or "").strip()
    out = []
    if sector:
        out.append(("theme", _words(f"{sector} sector tailwind theme capex")))
    for c in (dto.get("catalysts") or [])[:max_catalysts]:
        cats = c.get("newCategory") or []
        cats = cats if isinstance(cats, list) else [cats]
        q = _words(f"{c.get('name') or c.get('title') or ''} {' '.join(map(str, cats))}")
        if q:
            out.append(("catalyst", q))
    if sector:
        out.append(("why-market-pays", _words(f"{sector} rerating premium valuation why market pays")))
    for q in extra or []:
        if _words(q):
            out.append(("extra", _words(q)))
    seen, uniq = set(), []
    for lens, q in out:
        if q.lower() not in seen:
            seen.add(q.lower())
            uniq.append((lens, q))
    return uniq


def compact_hits(search_json, seen_ids, quota=None):
    """Trim one search_expert.py result to each expert block's quota
    (EXPERT_QUOTA merged with `quota`; DEFAULT_QUOTA otherwise), skipping ids
    already in `seen_ids` (mutated so later lenses don't repeat a hit)."""
    quotas = {**EXPERT_QUOTA, **(quota or {})}
    blocks = (search_json.get("experts") or {}).items()
    best = max((float(r.get("score") or 0) for _, b in blocks for r in b.get("results") or []), default=0)
    floor = best * RELEVANCE_FLOOR
    hits = []
    for key, block in blocks:
        kept, top = 0, quotas.get(key, DEFAULT_QUOTA)
        for r in block.get("results") or []:
            if kept >= top:
                break
            if r.get("id") in seen_ids or float(r.get("score") or 0) < floor:
                continue
            seen_ids.add(r.get("id"))
            kept += 1
            excerpt = " ".join((r.get("excerpt") or "").split())
            hits.append({
                "expert": r.get("expert") or key,
                "citation": r.get("citation"),
                "url": r.get("url"),
                "timestamp": r.get("timestamp"),
                "date": r.get("date"),
                "freshness": r.get("freshness"),
                "score": r.get("score"),
                "excerpt": excerpt[:EXCERPT_CHARS],
            })
    return hits


def find_sector_playbooks(text, sector, path):
    """Return [{path, heading, line}] for markdown headings in `text` that name
    any token (>=3 chars) of `sector`. Lets the agent read only those sections."""
    tokens = {t for t in re.findall(r"[a-z]{3,}", (sector or "").lower())} - {"and", "the", "ltd", "sector"}
    if not tokens:
        return []
    out = []
    for i, line in enumerate(text.splitlines(), 1):
        if line.startswith("#") and any(re.search(rf"\b{re.escape(t)}", line.lower()) for t in tokens):
            out.append({"path": path, "heading": line.lstrip("# ").strip()[:120], "line": i})
    return out


def run_search(query, data_root, top):
    """Run ask-expert's search script for one query; return parsed JSON or {}."""
    proc = subprocess.run(
        [sys.executable, SEARCH, "--query", query, "--expert", "all", "--data-root", data_root, "--top", str(top + 1)],
        capture_output=True, text=True, timeout=180,
    )
    if proc.returncode != 0:
        return {"_error": proc.stderr.strip()[-300:]}
    return json.loads(proc.stdout or "{}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dto", help="draft rerating DTO json (needs sector, catalysts[])")
    ap.add_argument("--sector", help="override/supply sector when no --dto")
    ap.add_argument("--query", action="append", default=[], help="extra theme query (repeatable)")
    ap.add_argument("--data-root", default=os.path.join(REPO, "data"))
    ap.add_argument("--top", type=int, default=2, help="hits for SOIC/SureshKBN per query (others get 1)")
    ap.add_argument("--with-lamba", action="store_true", help="include Dr. Anil Lamba hits (balance-sheet lens Q3)")
    args = ap.parse_args()

    dto = {}
    if args.dto:
        with open(args.dto, encoding="utf-8") as f:
            dto = json.load(f)
    if args.sector:
        dto["sector"] = args.sector
    queries = build_queries(dto, args.query)
    if not queries:
        ap.error("nothing to search: give --dto with sector/catalysts, --sector, or --query")

    seen, lenses = set(), []
    for lens, q in queries:
        res = run_search(q, args.data_root, args.top)
        quota = {"soic": args.top, "sureshKbn": args.top, "anilLamba": 1 if args.with_lamba else 0}
        entry = {"lens": lens, "query": q, "hits": compact_hits(res, seen, quota)}
        if res.get("_error"):
            entry["error"] = res["_error"]
        lenses.append(entry)

    playbooks = []
    for rel in PLAYBOOKS:
        p = os.path.join(args.data_root, rel)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                playbooks += find_sector_playbooks(f.read(), dto.get("sector"), os.path.join("data", rel))

    json.dump({
        "companyId": dto.get("companyId"),
        "sector": dto.get("sector"),
        "lenses": lenses,
        "playbookSections": playbooks,
        "alwaysRead": ["data/assets/suresh-top-down-vs-bottom-up-2026-10-09.md"],
        "hitCount": sum(len(l["hits"]) for l in lenses),
    }, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    print()


if __name__ == "__main__":
    main()
