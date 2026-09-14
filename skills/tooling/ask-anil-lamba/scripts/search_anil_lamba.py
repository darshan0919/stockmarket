#!/usr/bin/env python3
"""
search_anil_lamba.py — Extraction pass for the ask-anil-lamba skill.

Zero-LLM lexical (TF-IDF-style) search over the full transcript text of Dr. Anil
Lamba's YouTube videos stored in `data/youtube-transcripts/*.json`. Given a
free-text query, returns the top-N matching transcripts with the single
best-matching excerpt from each (plus a timestamp and YouTube watch URL with deep
link), so the caller (ask-anil-lamba SKILL.md) only has to read a handful of
short excerpts before synthesizing an answer. Pure lookup/scoring, no reasoning,
per skills/_shared/conventions.md rule 17 ("Extraction First, Analysis Second").

Index caching: term-frequency + document-frequency statistics for the ~197-video
corpus (119 with captions) are cached to `data/cache/ask-anil-lamba/index.json`
keyed by a corpus fingerprint (record count + latest modifiedTime across Dr.
Anil Lamba's records in `data/youtube-transcripts.json`).

Usage:
    python3 search_anil_lamba.py --query "contribution margin and break even analysis" \
        --data-root /path/to/stockmarket/data --top 8

    # Force a full reindex (e.g. right after `yarn youtube-transcript-refresh`):
    python3 search_anil_lamba.py --query "..." --data-root data --top 8 --reindex
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
    "about", "into", "over", "up", "down", "out", "very", "s", "t",
}

TOKEN_RE = re.compile(r"[a-z0-9]+")
TIMESTAMP_LINE_RE = re.compile(r"\[(\d{2}:\d{2}:\d{2})\]\s*(.*)")


def tokenize(text):
    return [w for w in TOKEN_RE.findall((text or "").lower()) if w not in STOPWORDS and len(w) > 1]


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def filter_lamba_index(youtube_index):
    """Filter youtube-transcripts index down to Dr. Anil Lamba's channel."""
    return {
        rec_id: rec
        for rec_id, rec in youtube_index.items()
        if rec.get("channelHandle") == "@anillamba"
        or rec.get("channelTitle") == "Dr. Anil Lamba"
        or rec.get("channelId") == "UC5mK0-K-r3KET0kifn-mJMg"
    }


def corpus_fingerprint(lamba_index):
    n = len(lamba_index)
    latest = ""
    for rec in lamba_index.values():
        mt = rec.get("modifiedTime") or ""
        if mt > latest:
            latest = mt
    raw = f"{n}:{latest}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def build_index(data_root, lamba_index):
    """Read every Dr. Anil Lamba transcript body once, build TF-IDF doc vectors + df table."""
    docs = {}
    df = {}

    def add_doc(doc_id, tokens, meta):
        tf = {}
        for t in tokens:
            tf[t] = tf.get(t, 0) + 1
        docs[doc_id] = {"tf": tf, "len": len(tokens), "meta": meta, "source": "youtube"}
        for t in tf:
            df[t] = df.get(t, 0) + 1

    youtube_dir = os.path.join(data_root, "youtube-transcripts")
    for rec_id, rec in lamba_index.items():
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
            tokens,
            {
                "title": rec.get("videoTitle"),
                "collection": rec.get("channelTitle") or "Dr. Anil Lamba",
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


def load_or_build_index(data_root, cache_path, lamba_index, force_reindex):
    fp = corpus_fingerprint(lamba_index)
    if not force_reindex and os.path.exists(cache_path):
        try:
            cached = load_json(cache_path)
            if cached.get("fingerprint") == fp:
                return cached["index"]
        except (json.JSONDecodeError, KeyError, OSError):
            pass  # Rebuild on cache parse failure
    index = build_index(data_root, lamba_index)
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
                # log-scaled TF * IDF
                s += (1 + math.log(tf[qt])) * idf[qt]
        if s > 0:
            scores.append((s, doc_id))
    scores.sort(key=lambda x: -x[0])
    return scores[:top_n]


def best_excerpt(timestamped_text, plain_text, query_tokens):
    """Find window of text with highest density of query-term hits."""
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

    # Plain text fallback
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


def load_body_for_excerpt(data_root, doc_id):
    path = os.path.join(data_root, "youtube-transcripts", f"{doc_id}.json")
    body = load_json(path)
    return body.get("transcriptTimestamped") or "", body.get("transcriptPlain") or ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", required=True, help="path to <repo>/data")
    ap.add_argument("--query", required=True, help="free-text query")
    ap.add_argument("--top", type=int, default=8, help="max results to return")
    ap.add_argument("--reindex", action="store_true", help="force rebuild of the cached corpus index")
    args = ap.parse_args()

    youtube_index_path = os.path.join(args.data_root, "youtube-transcripts.json")
    if not os.path.exists(youtube_index_path):
        print(
            json.dumps(
                {
                    "error": f"missing index file: {youtube_index_path}. Run "
                    "`yarn youtube-transcript-refresh` first, or check --data-root."
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    all_youtube_index = load_json(youtube_index_path)
    lamba_index = filter_lamba_index(all_youtube_index)

    if not lamba_index:
        print(
            json.dumps(
                {
                    "error": "No Dr. Anil Lamba videos found in data/youtube-transcripts.json. "
                    "Ensure @AnilLamba is configured in youtubeTranscriptRefresh.js."
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    cache_path = os.path.join(args.data_root, "cache", "ask-anil-lamba", "index.json")
    index = load_or_build_index(args.data_root, cache_path, lamba_index, args.reindex)

    query_tokens = tokenize(args.query)
    if not query_tokens:
        print(json.dumps({"error": "query had no searchable terms after stopword removal"}), file=sys.stderr)
        sys.exit(1)

    top_scores = score_docs(index, query_tokens, args.top)

    results = []
    for score, doc_id in top_scores:
        doc = index["docs"][doc_id]
        meta = doc["meta"]
        timestamped, plain = load_body_for_excerpt(args.data_root, doc_id)
        ts, excerpt = best_excerpt(timestamped, plain, query_tokens)

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

    print(
        json.dumps(
            {
                "corpusSize": {"totalVideos": len(lamba_index), "indexedWithTranscripts": index["nDocs"]},
                "indexBuilt": index["builtAt"],
                "results": results,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
