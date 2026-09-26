#!/usr/bin/env python3
"""
search_expert.py — Multi-expert extraction pass for the ask-expert skill.

Orchestrates searches across Dr. Anil Lamba's corporate finance corpus,
SOIC's public market equity investing corpus, and StockScans' platform workflows corpus.

CLI Options:
    --query "<question>"
    --data-root <path-to-data>
    --expert auto|all|both|anil-lamba|soic|stockscans (default: auto)
    --top <int> (default: 6 per expert)
    --reindex

Returns structured JSON with results grouped by expert, enabling the ask-expert
skill to synthesize combined learnings or highlight contrasting viewpoints.
"""
import argparse
import importlib.util
import json
import os
import sys

# Dynamic module loaders to avoid hardcoded absolute path assumptions
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../../../.."))


def load_module(module_name, rel_path):
    full_path = os.path.join(REPO_ROOT, rel_path)
    if not os.path.exists(full_path):
        raise FileNotFoundError(f"Module file not found: {full_path}")
    spec = importlib.util.spec_from_file_location(module_name, full_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


search_soic = load_module("search_soic", "skills/tooling/ask-soic/scripts/search_soic.py")
search_anil_lamba = load_module("search_anil_lamba", "skills/tooling/ask-anil-lamba/scripts/search_anil_lamba.py")
search_stockscans = load_module("search_stockscans", "skills/tooling/ask-stockscans/scripts/search_stockscans.py")


def search_lamba_corpus(data_root, query, top_n, force_reindex):
    youtube_index_path = os.path.join(data_root, "youtube-transcripts.json")
    if not os.path.exists(youtube_index_path):
        return []

    all_youtube_index = search_anil_lamba.load_json(youtube_index_path)
    lamba_index = search_anil_lamba.filter_lamba_index(all_youtube_index)
    if not lamba_index:
        return []

    cache_path = os.path.join(data_root, "cache", "ask-anil-lamba", "index.json")
    index = search_anil_lamba.load_or_build_index(data_root, cache_path, lamba_index, force_reindex)

    query_tokens = search_anil_lamba.tokenize(query)
    if not query_tokens:
        return []

    top_scores = search_anil_lamba.score_docs(index, query_tokens, top_n)
    results = []
    for score, doc_id in top_scores:
        doc = index["docs"][doc_id]
        meta = doc["meta"]
        timestamped, plain = search_anil_lamba.load_body_for_excerpt(data_root, doc_id)
        ts, excerpt = search_anil_lamba.best_excerpt(timestamped, plain, query_tokens)

        citation = f"Dr. Anil Lamba YouTube · {meta.get('title')}"
        vid = meta.get("videoId")
        url = f"https://www.youtube.com/watch?v={vid}" if vid else None
        if url and ts:
            try:
                parts = [int(p) for p in ts.split(":")]
                if len(parts) == 3:
                    h, m, s = parts
                    sec = h * 3600 + m * 60 + s
                elif len(parts) == 2:
                    m, s = parts
                    sec = m * 60 + s
                else:
                    sec = parts[0]
                url += f"&t={sec}s"
            except (ValueError, TypeError):
                pass

        results.append(
            {
                "id": doc_id,
                "expert": "anil-lamba",
                "source": "youtube",
                "score": round(score, 3),
                "title": meta.get("title"),
                "collection": meta.get("collection"),
                "citation": citation,
                "url": url,
                "timestamp": ts,
                "excerpt": excerpt,
            }
        )
    return results


def search_soic_corpus(data_root, query, top_n, force_reindex):
    learnyst_index_path = os.path.join(data_root, "learnyst-lessons.json")
    youtube_index_path = os.path.join(data_root, "youtube-transcripts.json")
    if not os.path.exists(learnyst_index_path) or not os.path.exists(youtube_index_path):
        return []

    learnyst_index = search_soic.load_json(learnyst_index_path)
    all_youtube_index = search_soic.load_json(youtube_index_path)
    youtube_index = {
        k: v
        for k, v in all_youtube_index.items()
        if v.get("channelHandle") in ("SOICfinance", "SOIC")
        or v.get("channelTitle") == "SOIC"
        or v.get("channelId") == "UCB7GnQlJPIL6rBBqEoX87vA"
    }

    cache_path = os.path.join(data_root, "cache", "ask-soic", "index.json")
    index = search_soic.load_or_build_index(data_root, cache_path, learnyst_index, youtube_index, force_reindex)

    query_tokens = search_soic.tokenize(query)
    if not query_tokens:
        return []

    top_scores = search_soic.score_docs(index, query_tokens, top_n)
    results = []
    for score, doc_id in top_scores:
        doc = index["docs"][doc_id]
        meta = doc["meta"]
        source = doc["source"]
        timestamped, plain = search_soic.load_body_for_excerpt(data_root, source, doc_id, meta)
        ts, excerpt = search_soic.best_excerpt(timestamped, plain, query_tokens)

        if source == "learnyst":
            citation = f"SOIC Learnyst · {meta.get('collection')} · {meta.get('title')}"
            url = None
        else:
            citation = f"SOIC YouTube · {meta.get('collection')} · {meta.get('title')}"
            vid = meta.get("videoId")
            url = f"https://www.youtube.com/watch?v={vid}" if vid else None
            if url and ts:
                try:
                    parts = [int(p) for p in ts.split(":")]
                    if len(parts) == 3:
                        h, m, s = parts
                        sec = h * 3600 + m * 60 + s
                    elif len(parts) == 2:
                        m, s = parts
                        sec = m * 60 + s
                    else:
                        sec = parts[0]
                    url += f"&t={sec}s"
                except (ValueError, TypeError):
                    pass

        results.append(
            {
                "id": doc_id,
                "expert": "soic",
                "source": source,
                "score": round(score, 3),
                "title": meta.get("title"),
                "collection": meta.get("collection"),
                "citation": citation,
                "url": url,
                "timestamp": ts,
                "excerpt": excerpt,
            }
        )
    return results


def search_stockscans_corpus(data_root, query, top_n, force_reindex):
    youtube_index_path = os.path.join(data_root, "youtube-transcripts.json")
    if not os.path.exists(youtube_index_path):
        return []

    all_youtube_index = search_stockscans.load_json(youtube_index_path)
    stockscans_index = search_stockscans.filter_stockscans_index(all_youtube_index)
    if not stockscans_index:
        return []

    cache_path = os.path.join(data_root, "cache", "ask-stockscans", "index.json")
    index = search_stockscans.load_or_build_index(data_root, cache_path, stockscans_index, force_reindex)

    query_tokens = search_stockscans.tokenize(query)
    if not query_tokens:
        return []

    top_scores = search_stockscans.score_docs(index, query_tokens, top_n)
    results = []
    for score, doc_id in top_scores:
        doc = index["docs"][doc_id]
        meta = doc["meta"]
        timestamped, plain = search_stockscans.load_body_for_excerpt(data_root, doc_id)
        ts, excerpt = search_stockscans.best_excerpt(timestamped, plain, query_tokens)

        citation = f"StockScans YouTube · {meta.get('title')}"
        vid = meta.get("videoId")
        url = f"https://www.youtube.com/watch?v={vid}" if vid else None
        if url and ts:
            try:
                parts = [int(p) for p in ts.split(":")]
                if len(parts) == 3:
                    h, m, s = parts
                    sec = h * 3600 + m * 60 + s
                elif len(parts) == 2:
                    m, s = parts
                    sec = m * 60 + s
                else:
                    sec = parts[0]
                url += f"&t={sec}s"
            except (ValueError, TypeError):
                pass

        results.append(
            {
                "id": doc_id,
                "expert": "stockscans",
                "source": "youtube",
                "score": round(score, 3),
                "title": meta.get("title"),
                "collection": meta.get("collection"),
                "citation": citation,
                "url": url,
                "timestamp": ts,
                "excerpt": excerpt,
            }
        )
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", required=True, help="path to <repo>/data")
    ap.add_argument("--query", required=True, help="free-text query")
    ap.add_argument(
        "--expert",
        choices=["auto", "all", "both", "anil-lamba", "soic", "stockscans"],
        default="auto",
        help="which expert(s) to query (default: auto)",
    )
    ap.add_argument("--top", type=int, default=6, help="max results to return per expert")
    ap.add_argument("--reindex", action="store_true", help="force rebuild of the cached corpus indices")
    args = ap.parse_args()

    lamba_results = []
    soic_results = []
    stockscans_results = []

    if args.expert in ("all", "both", "anil-lamba", "auto"):
        lamba_results = search_lamba_corpus(args.data_root, args.query, args.top, args.reindex)

    if args.expert in ("all", "both", "soic", "auto"):
        soic_results = search_soic_corpus(args.data_root, args.query, args.top, args.reindex)

    if args.expert in ("all", "both", "stockscans", "auto"):
        stockscans_results = search_stockscans_corpus(args.data_root, args.query, args.top, args.reindex)

    # In 'auto' mode, determine whether to return multiple or just the relevant one
    mode = args.expert
    if args.expert == "auto":
        has_lamba = len(lamba_results) > 0 and lamba_results[0]["score"] >= 3.0
        has_soic = len(soic_results) > 0 and soic_results[0]["score"] >= 3.0
        has_stockscans = len(stockscans_results) > 0 and stockscans_results[0]["score"] >= 3.0

        active = []
        if has_lamba:
            active.append("anil-lamba")
        if has_soic:
            active.append("soic")
        if has_stockscans:
            active.append("stockscans")

        if len(active) >= 2:
            mode = "both" if len(active) == 2 else "all"
        elif len(active) == 1:
            mode = active[0]
            if mode != "anil-lamba":
                lamba_results = []
            if mode != "soic":
                soic_results = []
            if mode != "stockscans":
                stockscans_results = []
        else:
            candidates = [
                ("anil-lamba", lamba_results),
                ("soic", soic_results),
                ("stockscans", stockscans_results),
            ]
            non_empty = [c for c in candidates if len(c[1]) > 0]
            if non_empty:
                best_expert, _ = max(non_empty, key=lambda c: c[1][0]["score"])
                mode = best_expert
                if mode != "anil-lamba":
                    lamba_results = []
                if mode != "soic":
                    soic_results = []
                if mode != "stockscans":
                    stockscans_results = []
            else:
                mode = "none"

    output = {
        "query": args.query,
        "mode": mode,
        "experts": {
            "anilLamba": {
                "count": len(lamba_results),
                "topScore": lamba_results[0]["score"] if lamba_results else 0.0,
                "results": lamba_results,
            },
            "soic": {
                "count": len(soic_results),
                "topScore": soic_results[0]["score"] if soic_results else 0.0,
                "results": soic_results,
            },
            "stockscans": {
                "count": len(stockscans_results),
                "topScore": stockscans_results[0]["score"] if stockscans_results else 0.0,
                "results": stockscans_results,
            },
        },
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
