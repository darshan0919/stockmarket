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


search_soic = load_module("search_soic", "skills/equity-research/ask-soic/scripts/search_soic.py")
search_anil_lamba = load_module("search_anil_lamba", "skills/equity-research/ask-anil-lamba/scripts/search_anil_lamba.py")
search_stockscans = load_module("search_stockscans", "skills/equity-research/ask-stockscans/scripts/search_stockscans.py")
search_xposts = load_module("search_xposts", "skills/equity-research/ask-expert/scripts/search_xposts.py")
# Shared "newest knowledge wins" layer (dates, recency-weighted re-rank, supersession flags, policy text).
recency = load_module("recency", "skills/_shared/recency.py")

# X (Twitter) experts come from the KB registry data/x-experts.json (written by the capture extension /
# importXPosts.js): expert key -> (handle, display name). Accounts with mergeInto "soic" are folded into
# the SOIC expert. Falls back to these defaults when the registry does not exist yet.
_DEFAULT_X_EXPERTS = {
    "suresh-kbn": ("SureshKBN", "Suresh K"),
    "shashank": ("Shashank1171", "Shashank"),
    "thechartist": ("thechartist26", "The Chartist"),
}
_DEFAULT_SOIC_X = ["ishmohit1"]


def load_x_registry(data_root):
    """Return (X_EXPERTS, SOIC_X_HANDLES) from <data_root>/x-experts.json, else defaults."""
    try:
        with open(os.path.join(data_root, "x-experts.json"), encoding="utf-8") as f:
            reg = json.load(f)
        experts, soic = {}, []
        for e in (reg.get("experts") or {}).values():
            handle = e.get("handle")
            if not handle:
                continue
            if e.get("mergeInto") == "soic":
                soic.append(handle)
            elif e.get("expertKey"):
                experts[e["expertKey"]] = (handle, e.get("name") or handle)
        if not experts and not soic:
            return dict(_DEFAULT_X_EXPERTS), list(_DEFAULT_SOIC_X)
        return experts, soic
    except (OSError, ValueError):
        return dict(_DEFAULT_X_EXPERTS), list(_DEFAULT_SOIC_X)


X_EXPERTS = dict(_DEFAULT_X_EXPERTS)
SOIC_X_HANDLES = list(_DEFAULT_SOIC_X)
THRESHOLD = 3.0


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
    global X_EXPERTS, SOIC_X_HANDLES
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument("--data-root")
    known, _ = pre.parse_known_args()
    if known.data_root:
        X_EXPERTS, SOIC_X_HANDLES = load_x_registry(known.data_root)

    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", required=True, help="path to <repo>/data")
    ap.add_argument("--query", required=True, help="free-text query")
    ap.add_argument(
        "--expert",
        choices=["auto", "all", "both", "anil-lamba", "soic", "stockscans"] + sorted(X_EXPERTS),
        default="auto",
        help="which expert(s) to query (default: auto)",
    )
    ap.add_argument("--top", type=int, default=6, help="max results to return per expert")
    ap.add_argument("--reindex", action="store_true", help="force rebuild of the cached corpus indices")
    args = ap.parse_args()

    def wanted(key):
        return args.expert in ("all", "both", "auto", key)

    cand = args.top * recency.CANDIDATE_MULT  # over-retrieve by relevance, then re-rank by recency
    pools = {"anil-lamba": [], "soic": [], "stockscans": []}
    for key in X_EXPERTS:
        pools[key] = []

    if wanted("anil-lamba"):
        pools["anil-lamba"] = search_lamba_corpus(args.data_root, args.query, cand, args.reindex)
    if wanted("soic"):
        soic = search_soic_corpus(args.data_root, args.query, cand, args.reindex)
        soic += search_xposts.search_handles(
            args.data_root, args.query, SOIC_X_HANDLES, "soic", cand, args.reindex
        )
        pools["soic"] = soic  # trimmed by recency.finalize below (top + a little room for X posts)
    if wanted("stockscans"):
        pools["stockscans"] = search_stockscans_corpus(args.data_root, args.query, cand, args.reindex)
    for key, (handle, _name) in X_EXPERTS.items():
        if wanted(key):
            pools[key] = search_xposts.search_handles(
                args.data_root, args.query, [handle], key, cand, args.reindex
            )

    # Newest-wins: date every hit, weight by freshness, re-rank, flag older hits a newer one may supersede.
    dates = recency.load_dates(args.data_root)
    for key in list(pools):
        keep = args.top + (len(SOIC_X_HANDLES) * 2 if key == "soic" else 0)
        pools[key] = recency.finalize(pools[key], args.data_root, keep, dates=dates)

    mode = args.expert
    if args.expert == "auto":
        active = [k for k, v in pools.items() if v and max(r["score"] for r in v) >= THRESHOLD]
        if len(active) >= 2:
            mode = "both" if len(active) == 2 else "all"
        elif len(active) == 1:
            mode = active[0]
        else:
            non_empty = [(k, v) for k, v in pools.items() if v]
            mode = max(non_empty, key=lambda c: max(r["score"] for r in c[1]))[0] if non_empty else "none"
        if mode not in ("both", "all", "none"):
            pools = {k: (v if k == mode else []) for k, v in pools.items()}

    def block(results):
        dated = [r["date"] for r in results if r.get("date")]
        return {
            "count": len(results),
            "topScore": max((r["score"] for r in results), default=0.0),
            "newestDate": max(dated, default=None),
            "oldestDate": min(dated, default=None),
            "results": results,
        }

    def camel(key):
        head, *rest = key.split("-")
        return head + "".join(w.capitalize() for w in rest)

    experts = {
        "anilLamba": block(pools["anil-lamba"]),
        "soic": block(pools["soic"]),
        "stockscans": block(pools["stockscans"]),
    }
    for key in X_EXPERTS:
        experts[camel(key)] = block(pools[key])

    out = {
        "query": args.query,
        "mode": mode,
        "recencyPolicy": recency.POLICY,
        "timeline": recency.timeline({k: v["results"] for k, v in experts.items()}),
        "experts": experts,
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
