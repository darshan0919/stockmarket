"""Source adapters → common Doc shape (zero-LLM).

Doc = {docId, sourceKey, author, date, kind, text, contextText, contextBy, url,
       likes, views, hasMedia, mediaUrls}

Source keys:
  x:<handle>                 expert X posts from the x-posts collection (data/x-posts shards)
  learnyst:<kw1,kw2>         Learnyst lessons whose title matches any keyword
  youtube:<channelHandle>[:<kw1,kw2>]  YouTube transcripts of a channel (optional title keywords)
  file:<path>                a local .txt/.md file (book notes, PDF text dump)
"""
import glob
import json
import re
from pathlib import Path

from .common import data_root

PASSAGE_CHARS = 2000

# Extraction priority (Darshan, 2026-10-08): his own posts & articles first, replies second, reposts third.
TIER_LABEL = {1: "own-post/article", 2: "reply", 3: "repost (curated, not his words)"}


def tier_of(kind):
    if kind == "repost":
        return 3
    if kind == "reply":
        return 2
    return 1  # post | thread | quote | article | passage


def _shards(collection):
    return sorted(glob.glob(str(data_root() / collection / "shard_*.jsonl")))


def _iter_bodies(collection):
    for f in _shards(collection):
        with open(f) as fh:
            for line in fh:
                if line.strip():
                    yield json.loads(line)


def _passages(text, size=PASSAGE_CHARS):
    """Split long text on sentence boundaries into ~size-char passages."""
    sents = re.split(r"(?<=[.!?])\s+", text or "")
    buf, out = "", []
    for s in sents:
        if len(buf) + len(s) > size and buf:
            out.append(buf.strip())
            buf = ""
        buf += s + " "
    if buf.strip():
        out.append(buf.strip())
    return out


def load_xposts(source_key, handle):
    h = handle.lower().lstrip("@")
    docs = []
    from . import media as _media  # image text (OCR / vision) joined by docId; empty until img-* commands ran

    img_text = _media.text_by_doc(handle)
    for d in _iter_bodies("x-posts"):
        if str(d.get("handle", "")).lower() != h:
            continue
        ctx = d.get("context") or {}
        ctx_by = (ctx.get("by") or "") if isinstance(ctx, dict) else ""
        media = [m.get("url") for m in (d.get("media") or []) if isinstance(m, dict) and m.get("type") == "photo"]
        m = d.get("metrics") or {}
        text = d.get("text") or ""
        arts = [a for a in (d.get("articles") or []) if isinstance(a, dict)]
        for a in arts:  # X articles: title + preview are the expert's long-form writing
            text += "\n" + " ".join(x for x in (a.get("title"), a.get("preview") or a.get("text")) if x)
        kind = d.get("kind")
        if arts and kind != "repost":
            kind = "article"
        docs.append(
            {
                "docId": d["id"],
                "sourceKey": source_key,
                "author": d.get("handle"),
                "date": (d.get("publishedAt") or "")[:10],
                "kind": kind,
                "tier": tier_of(kind),
                "text": text,
                "contextText": (ctx.get("text") or "") if isinstance(ctx, dict) and ctx_by.lower() != h else "",
                "contextBy": ctx_by if ctx_by.lower() != h else "",
                "url": d.get("url"),
                "likes": int(m.get("likes") or 0),
                "views": int(m.get("views") or 0),
                "hasMedia": bool(media),
                "mediaUrls": media,
                "mediaText": img_text.get(d["id"], ""),
            }
        )
    return docs


def _transcript_docs(source_key, collection, match, title_key, date_key, url_fn, author):
    docs = []
    for b in _iter_bodies(collection):
        if not match(b):
            continue
        text = b.get("transcriptPlain") or ""
        for i, p in enumerate(_passages(text)):
            docs.append(
                {
                    "docId": f"{b['id']}#p{i}",
                    "sourceKey": source_key,
                    "author": author(b),
                    "date": (b.get(date_key) or "")[:10] if date_key else "",
                    "kind": "passage",
                    "tier": 1,
                    "title": b.get(title_key),
                    "text": p,
                    "contextText": "",
                    "contextBy": "",
                    "url": url_fn(b),
                    "likes": 0,
                    "views": 0,
                    "hasMedia": False,
                    "mediaUrls": [],
                }
            )
    return docs


def load_learnyst(source_key, keywords):
    kws = [k.strip().lower() for k in keywords.split(",") if k.strip()]
    return _transcript_docs(
        source_key,
        "learnyst-lessons",
        lambda b: any(k in (b.get("lessonTitle") or "").lower() for k in kws),
        "lessonTitle",
        None,  # Learnyst exposes no publish date — never invent one (conventions §28)
        lambda b: f"learnyst:{b.get('courseId')}/{b.get('lessonId')}",
        lambda b: b.get("courseTitle"),
    )


def load_youtube(source_key, spec):
    handle, _, kw = spec.partition(":")
    kws = [k.strip().lower() for k in kw.split(",") if k.strip()]
    return _transcript_docs(
        source_key,
        "youtube-transcripts",
        lambda b: str(b.get("channelHandle", "")).lower() == handle.lower()
        and (not kws or any(k in (b.get("videoTitle") or "").lower() for k in kws)),
        "videoTitle",
        "publishedAt",
        lambda b: f"https://www.youtube.com/watch?v={b.get('videoId')}",
        lambda b: b.get("channelHandle"),
    )


def load_file(source_key, path):
    text = Path(path).read_text(errors="ignore")
    return [
        {
            "docId": f"file#{i}",
            "sourceKey": source_key,
            "author": Path(path).stem,
            "date": "",
            "kind": "passage",
            "tier": 1,
            "text": p,
            "contextText": "",
            "contextBy": "",
            "url": f"file://{path}#p{i}",
            "likes": 0,
            "views": 0,
            "hasMedia": False,
            "mediaUrls": [],
        }
        for i, p in enumerate(_passages(text))
    ]


def load(source_key):
    kind, _, spec = source_key.partition(":")
    if not spec:
        raise ValueError(f"bad source key {source_key!r} — expected <kind>:<spec>")
    if kind == "x":
        return load_xposts(source_key, spec)
    if kind == "learnyst":
        return load_learnyst(source_key, spec)
    if kind == "youtube":
        return load_youtube(source_key, spec)
    if kind == "file":
        return load_file(source_key, spec)
    raise ValueError(f"unknown source kind {kind!r} (x|learnyst|youtube|file)")
