#!/usr/bin/env python3
"""
search_soic.py — Extraction pass for the ask-soic skill.

Zero-LLM lexical (TF-IDF-style) search over the full transcript text of BOTH
`data/learnyst-lessons/*.json` (SOIC Learnyst membership course videos) and
`data/youtube-transcripts/*.json` (SOIC YouTube channel videos). Given a
free-text query, returns the top-N matching transcripts with the single
best-matching excerpt from each (plus a timestamp when the source is
timestamped), so the caller (ask-soic SKILL.md) only has to read a handful of
short excerpts — never the raw ~1100-file corpus — before synthesizing an
answer. This is pure lookup/scoring, no reasoning, no LLM call, per
skills/_shared/conventions.md rule 17 ("Extraction First, Analysis Second").

Index caching (rule 17a — cache the extraction result): term-frequency +
document-frequency statistics for the whole corpus are expensive to rebuild
(~1100 file reads + tokenization) but cheap to reuse, so they're cached to
`data/cache/ask-soic/index.json` keyed by a corpus fingerprint (record count +
latest modifiedTime across both slim indexes). A query that hits a fresh
cache reads zero transcript bodies until it knows which docs it needs
excerpts from.

Usage:
    python3 search_soic.py --query "how does SOIC think about moats in cyclical businesses" \
        --data-root /path/to/stockmarket/data --top 8

    # Force a full reindex (e.g. right after `yarn learning-resources-refresh`):
    python3 search_soic.py --query "..." --data-root data --top 8 --reindex

Output: JSON object to stdout:
  {
    "corpusSize": {"learnyst": N, "youtube": M},
    "indexBuilt": "<iso8601>",
    "results": [
      {
        "id", "source" ("learnyst"|"youtube"), "score",
        "title" (lessonTitle|videoTitle),
        "collection" (courseTitle|channelTitle),
        "citation" (human-readable: "SOIC Learnyst · <course> · <lesson>" or
                    "SOIC YouTube · <channel> · <video>"),
        "url" (youtube watch URL when source=="youtube" and videoId present,
               else null — Learnyst has no public per-lesson URL),
        "timestamp" (best-matching "HH:MM:SS" cue, or null for non-timestamped),
        "excerpt" (~2-4 sentence window around the best-matching cue/sentence)
      },
      ...
    ]
  }

Exit code 0 with `"results": []` is a valid "no matches" result — the caller
(SKILL.md) decides what to do next (broaden the query, tell the user nothing
was found, or suggest a transcript refresh if the corpus looks stale), never
this script.
"""
import argparse
import hashlib
import json
import math
import os
import re
import sys
import time

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "for",
    "is", "are", "was", "were", "be", "been", "being", "it", "its", "this",
    "that", "these", "those", "with", "as", "by", "at", "from", "so", "we",
    "you", "i", "he", "she", "they", "them", "his", "her", "their", "our",
    "your", "not", "do", "does", "did", "have", "has", "had", "will", "would",
    "can", "could", "should", "what", "which", "who", "whom", "how", "why",
    "when", "where", "there", "here", "then", "than", "also", "just", "like",
    "about", "into", "over", "up", "down", "out", "up", "very", "s", "t",
}

TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text):
    return [w for w in TOKEN_RE.findall((text or "").lower()) if w not in STOPWORDS and len(w) > 1]


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def corpus_fingerprint(learnyst_index, youtube_index):
    n = len(learnyst_index) + len(youtube_index)
    latest = ""
    for rec in list(learnyst_index.values()) + list(youtube_index.values()):
        mt = rec.get("modifiedTime") or ""
        if mt > latest:
            latest = mt
    raw = f"{n}:{latest}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def build_index(data_root, learnyst_index, youtube_index):
    """Read every transcript body once, build TF-IDF doc vectors + df table."""
    docs = {}  # id -> {"tf": {term: count}, "len": int, "meta": {...}}
    df = {}  # term -> number of docs containing it

    def add_doc(doc_id, source, tokens, meta):
        tf = {}
        for t in tokens:
            tf[t] = tf.get(t, 0) + 1
        docs[doc_id] = {"tf": tf, "len": len(tokens), "meta": meta, "source": source}
        for t in tf:
            df[t] = df.get(t, 0) + 1

    learnyst_dir = os.path.join(data_root, "learnyst-lessons")
    for rec_id, rec in learnyst_index.items():
        if rec.get("lessonType") != 1:
            continue  # skip quizzes/articles — no transcript body
        body_path = os.path.join(learnyst_dir, f"{rec_id}.json")
        if not os.path.exists(body_path):
            continue
        body = load_json(body_path)
        plain = body.get("transcriptPlain") or ""
        if not plain.strip():
            continue
        tokens = tokenize(plain)
        add_doc(
            rec_id,
            "learnyst",
            tokens,
            {
                "title": rec.get("lessonTitle"),
                "collection": rec.get("courseTitle"),
                "timestamped": body.get("transcriptTimestamped") or "",
            },
        )

    youtube_dir = os.path.join(data_root, "youtube-transcripts")
    for rec_id, rec in youtube_index.items():
        body_path = os.path.join(youtube_dir, f"{rec_id}.json")
        if not os.path.exists(body_path):
            continue
        body = load_json(body_path)
        plain = body.get("transcriptPlain") or ""
        if not plain.strip():
            continue
        tokens = tokenize(plain)
        add_doc(
            rec_id,
            "youtube",
            tokens,
            {
                "title": rec.get("videoTitle"),
                "collection": rec.get("channelTitle"),
                "videoId": rec.get("videoId"),
                "timestamped": body.get("transcriptTimestamped") or "",
            },
        )

    n_docs = len(docs)
    idf = {t: math.log(1 + n_docs / dfreq) for t, dfreq in df.items()}

    return {
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "nDocs": n_docs,
        "idf": idf,
        "docs": docs,
    }


def load_or_build_index(data_root, cache_path, learnyst_index, youtube_index, force_reindex):
    fp = corpus_fingerprint(learnyst_index, youtube_index)
    if not force_reindex and os.path.exists(cache_path):
        try:
            cached = load_json(cache_path)
            if cached.get("fingerprint") == fp:
                return cached["index"]
        except (json.JSONDecodeError, KeyError, OSError):
            pass  # fall through to rebuild
    index = build_index(data_root, learnyst_index, youtube_index)
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"fingerprint": fp, "index": index}, f)
    return index


def score_docs(index, query_tokens, top_n):
    idf = index["idf"]
    scores = []
    for doc_id, doc in index["docs"].items():
        tf = doc["tf"]
        s = 0.0
        for qt in query_tokens:
            if qt in tf and qt in idf:
                # log-scaled TF (diminishing returns for repeated terms) * IDF
                s += (1 + math.log(tf[qt])) * idf[qt]
        if s > 0:
            scores.append((s, doc_id))
    scores.sort(key=lambda x: -x[0])
    return scores[:top_n]


TIMESTAMP_LINE_RE = re.compile(r"\[(\d{2}:\d{2}:\d{2})\]\s*(.*)")


def best_excerpt(timestamped_text, plain_text, query_tokens, window_sentences=3):
    """Find the window of text with the most query-term hits; return
    (timestamp_or_None, excerpt_text)."""
    qset = set(query_tokens)
    if timestamped_text:
        lines = []
        for line in timestamped_text.split("\n"):
            m = TIMESTAMP_LINE_RE.match(line.strip())
            if m:
                lines.append((m.group(1), m.group(2)))
        if lines:
            best_i, best_hits = 0, -1
            for i in range(len(lines)):
                window = lines[max(0, i - 1) : i + 2]
                hits = sum(1 for _, txt in window for t in tokenize(txt) if t in qset)
                if hits > best_hits:
                    best_hits = hits
                    best_i = i
            window = lines[max(0, best_i - 1) : best_i + 2]
            excerpt = " ".join(txt for _, txt in window).strip()
            return lines[best_i][0], excerpt[:600]
    # Fallback: plain-text sentence window
    sentences = re.split(r"(?<=[.!?])\s+", plain_text or "")
    best_i, best_hits = 0, -1
    for i in range(len(sentences)):
        window = sentences[max(0, i - 1) : i + 2]
        hits = sum(1 for s in window for t in tokenize(s) if t in qset)
        if hits > best_hits:
            best_hits = hits
            best_i = i
    window = sentences[max(0, best_i - 1) : best_i + 2]
    return None, " ".join(window).strip()[:600]


def load_body_for_excerpt(data_root, source, doc_id, meta):
    """Re-read the body only for docs we're actually returning (top-N), to
    avoid holding all ~1100 full transcripts in memory during scoring."""
    sub = "learnyst-lessons" if source == "learnyst" else "youtube-transcripts"
    path = os.path.join(data_root, sub, f"{doc_id}.json")
    body = load_json(path)
    return body.get("transcriptTimestamped") or "", body.get("transcriptPlain") or ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", required=True, help="path to <repo>/data")
    ap.add_argument("--query", required=True, help="free-text query")
    ap.add_argument("--top", type=int, default=8, help="max results to return")
    ap.add_argument("--reindex", action="store_true", help="force rebuild of the cached corpus index")
    args = ap.parse_args()

    learnyst_index_path = os.path.join(args.data_root, "learnyst-lessons.json")
    youtube_index_path = os.path.join(args.data_root, "youtube-transcripts.json")
    missing = [p for p in (learnyst_index_path, youtube_index_path) if not os.path.exists(p)]
    if missing:
        print(
            json.dumps(
                {
                    "error": f"missing index file(s): {missing}. Run "
                    "`yarn learning-resources-refresh` first, or check --data-root."
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    learnyst_index = load_json(learnyst_index_path)
    youtube_index = load_json(youtube_index_path)

    cache_path = os.path.join(args.data_root, "cache", "ask-soic", "index.json")
    index = load_or_build_index(args.data_root, cache_path, learnyst_index, youtube_index, args.reindex)

    query_tokens = tokenize(args.query)
    if not query_tokens:
        print(json.dumps({"error": "query had no searchable terms after stopword removal"}), file=sys.stderr)
        sys.exit(1)

    top_scores = score_docs(index, query_tokens, args.top)

    results = []
    for score, doc_id in top_scores:
        doc = index["docs"][doc_id]
        meta = doc["meta"]
        source = doc["source"]
        timestamped, plain = load_body_for_excerpt(args.data_root, source, doc_id, meta)
        ts, excerpt = best_excerpt(timestamped, plain, query_tokens)

        if source == "learnyst":
            citation = f"SOIC Learnyst · {meta.get('collection')} · {meta.get('title')}"
            url = None
        else:
            citation = f"SOIC YouTube · {meta.get('collection')} · {meta.get('title')}"
            vid = meta.get("videoId")
            url = f"https://www.youtube.com/watch?v={vid}" if vid else None
            if url and ts:
                h, m, s = ts.split(":")
                url += f"&t={int(h)*3600 + int(m)*60 + int(s)}s"

        results.append(
            {
                "id": doc_id,
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

    print(
        json.dumps(
            {
                "corpusSize": {"learnyst": len(learnyst_index), "youtube": len(youtube_index)},
                "indexBuilt": index["builtAt"],
                "results": results,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
