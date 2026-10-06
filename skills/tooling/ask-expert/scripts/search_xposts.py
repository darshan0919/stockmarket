#!/usr/bin/env python3
"""
search_xposts.py — lexical (TF-IDF) search over the `x-posts` KB collection
(expert X/Twitter posts, threads, replies, articles imported by
packages/jobs-runtime/scripts/importXPosts.js).

Zero-LLM, same scoring as ask-soic / ask-stockscans. Used by search_expert.py
(ask-expert) so each followed X account becomes a citable expert corpus.

Docs live in data/x-posts/shard_*.jsonl; slim index in data/x-posts.json.
Index cache: data/cache/ask-x-posts/index.json keyed by corpus fingerprint.
"""
import argparse
import hashlib
import json
import math
import os
import re
import time

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "for",
    "is", "are", "was", "were", "be", "been", "being", "it", "its", "this",
    "that", "these", "those", "with", "as", "by", "at", "from", "so", "we",
    "you", "i", "he", "she", "they", "them", "his", "her", "their", "our",
    "your", "not", "do", "does", "did", "have", "has", "had", "will", "would",
    "can", "could", "should", "what", "which", "who", "whom", "how", "why",
    "when", "where", "there", "here", "then", "than", "also", "just", "like",
    "about", "into", "over", "up", "down", "out", "very", "s", "t", "rt",
}
TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text):
    return [w for w in TOKEN_RE.findall((text or "").lower()) if w not in STOPWORDS and len(w) > 1]


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_index(data_root):
    p = os.path.join(data_root, "x-posts.json")
    return load_json(p) if os.path.exists(p) else {}


def fingerprint(index):
    latest = max((r.get("modifiedTime") or "" for r in index.values()), default="")
    return hashlib.sha1(f"{len(index)}:{latest}".encode()).hexdigest()[:16]


def iter_shards(data_root):
    d = os.path.join(data_root, "x-posts")
    if not os.path.isdir(d):
        return
    for fname in sorted(os.listdir(d)):
        if not fname.endswith(".jsonl"):
            continue
        with open(os.path.join(d, fname), "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError:
                        pass


def doc_text(row):
    parts = [row.get("text") or ""]
    ctx = row.get("context") or {}
    if ctx.get("text"):
        parts.append(ctx["text"])
    for a in row.get("articles") or []:
        parts += [a.get("title") or "", a.get("text") or a.get("preview") or ""]
    parts += row.get("urls") or []
    return "\n".join(p for p in parts if p)


def build_index(data_root, index):
    docs, df = {}, {}
    for row in iter_shards(data_root):
        rid = row.get("id")
        if not rid or rid not in index:
            continue
        tokens = tokenize(doc_text(row))
        if not tokens:
            continue
        tf = {}
        for t in tokens:
            tf[t] = tf.get(t, 0) + 1
        docs[rid] = {
            "tf": tf,
            "len": len(tokens),
            "meta": {k: row.get(k) for k in ("handle", "name", "kind", "publishedAt", "url")},
        }
        for t in tf:
            df[t] = df.get(t, 0) + 1
    n = len(docs)
    idf = {t: math.log(1 + n / c) for t, c in df.items()}
    return {"builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "nDocs": n, "idf": idf, "docs": docs}


def load_or_build(data_root, index, force):
    cache = os.path.join(data_root, "cache", "ask-x-posts", "index.json")
    fp = fingerprint(index)
    if not force and os.path.exists(cache):
        try:
            c = load_json(cache)
            if c.get("fingerprint") == fp:
                return c["index"]
        except (json.JSONDecodeError, KeyError, OSError):
            pass
    built = build_index(data_root, index)
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    with open(cache, "w", encoding="utf-8") as f:
        json.dump({"fingerprint": fp, "index": built}, f)
    return built


def score(index, qtokens, handles, top_n):
    idf, hits = index["idf"], []
    for rid, d in index["docs"].items():
        if handles and (d["meta"].get("handle") or "").lower() not in handles:
            continue
        s = sum((1 + math.log(d["tf"][q])) * idf[q] for q in qtokens if q in d["tf"] and q in idf)
        if s > 0:
            hits.append((s, rid))
    hits.sort(key=lambda x: -x[0])
    return hits[:top_n]


def fetch_bodies(data_root, ids):
    want, out = set(ids), {}
    for row in iter_shards(data_root):
        if row.get("id") in want:
            out[row["id"]] = row  # shards are append-logs: later line wins
    return out


def search_handles(data_root, query, handles, expert, top_n=6, force_reindex=False):
    """Return ask-expert style result dicts for the given X handles (lowercase set)."""
    index_slim = load_index(data_root)
    if not index_slim:
        return []
    handles = {h.lower().lstrip("@") for h in handles}
    q = tokenize(query)
    if not q:
        return []
    idx = load_or_build(data_root, index_slim, force_reindex)
    top = score(idx, q, handles, top_n)
    bodies = fetch_bodies(data_root, [rid for _, rid in top])
    results = []
    for s, rid in top:
        row, meta = bodies.get(rid, {}), idx["docs"][rid]["meta"]
        date = (meta.get("publishedAt") or "")[:10]
        text = (row.get("text") or "").strip()
        ctx = row.get("context") or {}
        excerpt = text[:700]
        if meta.get("kind") == "repost":
            excerpt = f"[reposted from @{ctx.get('by') or '?'}] " + excerpt
        elif ctx.get("text"):
            excerpt += f"\n[in reply to @{ctx.get('by')}: {ctx['text'][:240]}]"
        for a in (row.get("articles") or [])[:1]:
            body = (a.get("text") or a.get("preview") or "").strip()
            excerpt += f"\n[article: {a.get('title') or 'untitled'} — {body[:500]}]"
        results.append({
            "id": rid,
            "expert": expert,
            "source": "x",
            "score": round(s, 3),
            "title": f"@{meta.get('handle')} {meta.get('kind')} · {date}",
            "collection": f"X @{meta.get('handle')}",
            "citation": f"X · @{meta.get('handle')} · {date} · {meta.get('kind')}",
            "url": meta.get("url"),
            "timestamp": None,
            "date": date or None,
            "excerpt": excerpt,
            "hasMedia": bool(row.get("media")),
            "links": (row.get("urls") or [])[:3],
        })
    return results


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", required=True)
    ap.add_argument("--query", required=True)
    ap.add_argument("--handles", default="", help="comma-separated; empty = all")
    ap.add_argument("--top", type=int, default=6)
    ap.add_argument("--reindex", action="store_true")
    a = ap.parse_args()
    hs = [h for h in a.handles.split(",") if h]
    print(json.dumps(search_handles(a.data_root, a.query, hs, "x", a.top, a.reindex), indent=2))
