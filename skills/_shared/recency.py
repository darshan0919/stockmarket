#!/usr/bin/env python3
"""
recency.py — shared, deterministic "newest knowledge wins" layer for the expert-search skills
(ask-expert, ask-soic, ask-anil-lamba, ask-stockscans and the X-account corpora).

Why: market regimes change. When two sources of the same expert disagree, the more recent one is the
one that reflects what currently works, so retrieval must (1) know every hit's date, (2) rank fresher
material higher among comparably relevant hits, and (3) hand the synthesizing agent an explicit
timeline plus "possibly superseded" flags so it can resolve conflicts in favour of the newest view.

Zero-LLM, stdlib only. Never mutates the lexical `score`; adds fields next to it.

Fields added to every result:
  date            ISO date (YYYY-MM-DD) or None when the platform exposes none (Learnyst lessons)
  dateSource      "publishedAt" | "x-post" | "lesson-id-order" | "unknown"
  ageDays         int or None
  freshness       "fresh" (<=90d) | "recent" (<=1y) | "aging" (<=2y) | "stale" (>2y) | "undated"
  recencyWeight   0..1 decay (half-life depends on the source, see HALF_LIFE_DAYS)
  adjScore        score * recency factor   (the ranking key)
  relevanceRank   1-based rank by raw score before re-ranking
  possiblySupersededBy   id of a newer hit from the SAME expert on the same query (>= GAP_DAYS newer);
                  a *candidate* only — the agent decides whether the two actually conflict.
"""
import json
import math
import os
from datetime import datetime, timezone

# Decay half-life per source class. Short for market opinion (tweets), long for accounting fundamentals.
HALF_LIFE_DAYS = {
    "x": 90,
    "youtube": 365,
    "learnyst": 365,
    "anil-lamba": 1095,
}
FLOOR = 0.40  # even a very old, highly relevant hit keeps 40% of its score: relevance still matters
GAP_DAYS = 180  # a hit must be this much newer to be flagged as a possible supersession
SUPERSEDE_MIN_REL = 0.5  # newer hit needs >= 50% of the older hit's relevance to count as a candidate
RESERVE_PER_SOURCE = True  # keep the best hit of every platform (x / youtube / learnyst) in the cut
CANDIDATE_MULT = 3  # retrieve top*N by relevance, then re-rank by recency, then cut to top

POLICY = (
    "NEWEST VIEW WINS ON CONFLICT: when sources of the same expert disagree on market behaviour, "
    "tactics, valuation levels, sector calls or screening rules, the most recent dated source is the "
    "current view; present older ones as 'earlier view (<date>), since changed'. Exceptions that you "
    "must state explicitly: timeless principles (accounting identities, arithmetic, definitions) where "
    "age is irrelevant, and a newer hit that is only a one-line reply with no stated reasoning. "
    "Undated hits (Learnyst lessons) are ordered by lesson-id only — never claim a calendar date for them."
)


def _parse(d):
    if not d:
        return None
    try:
        return datetime.fromisoformat(str(d).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        try:
            return datetime.strptime(str(d)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def _load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def load_dates(data_root):
    """{doc_id: {'date': iso|None, 'order': 0..1|None, 'src': str}} from the platform index files."""
    out = {}
    for rec_id, rec in _load(os.path.join(data_root, "youtube-transcripts.json")).items():
        if rec.get("publishedAt"):
            out[rec_id] = {"date": rec["publishedAt"][:10], "order": None, "src": "publishedAt"}
    lessons = _load(os.path.join(data_root, "learnyst-lessons.json"))
    ids = sorted(r.get("lessonId") for r in lessons.values() if isinstance(r.get("lessonId"), int))
    rank = {lid: i for i, lid in enumerate(ids)}
    for rec_id, rec in lessons.items():
        lid = rec.get("lessonId")
        pct = rank[lid] / (len(ids) - 1) if lid in rank and len(ids) > 1 else None
        out[rec_id] = {"date": None, "order": pct, "src": "lesson-id-order"}
    return out


def _class_of(r):
    if r.get("source") == "x":
        return "x"
    if r.get("expert") == "anil-lamba":
        return "anil-lamba"
    return "learnyst" if r.get("source") == "learnyst" else "youtube"


def annotate(results, data_root=None, now=None, dates=None):
    now = now or datetime.now(timezone.utc)
    dates = dates if dates is not None else (load_dates(data_root) if data_root else {})
    for r in results:
        info = dates.get(r.get("id"), {})
        iso = r.get("date") or info.get("date")
        dt = _parse(iso)
        cls = _class_of(r)
        if dt:
            age = max(0, (now - dt).days)
            w = 0.5 ** (age / HALF_LIFE_DAYS[cls])
            factor = FLOOR + (1 - FLOOR) * w
            fresh = "fresh" if age <= 90 else "recent" if age <= 365 else "aging" if age <= 730 else "stale"
            r.update(date=dt.date().isoformat(), dateSource=r.get("dateSource") or ("x-post" if cls == "x" else "publishedAt"),
                     ageDays=age, freshness=fresh, recencyWeight=round(w, 3))
        else:
            pct = info.get("order")
            # undated: ordered by lesson id only, kept in a neutral band (0.55..0.80)
            factor = 0.55 + 0.25 * pct if pct is not None else 0.65
            w = None
            r.update(date=None, dateSource="lesson-id-order" if pct is not None else "unknown",
                     ageDays=None, freshness="undated", recencyWeight=None, lessonOrder=round(pct, 3) if pct is not None else None)
        r["adjScore"] = round(r.get("score", 0) * factor, 3)
    return results


def rerank(results):
    """Annotate relevance rank + supersession candidates, then sort by adjScore (stable on ties by date)."""
    by_rel = sorted(results, key=lambda r: -r.get("score", 0))
    for i, r in enumerate(by_rel, 1):
        r["relevanceRank"] = i
    dated = sorted((r for r in results if r.get("date")), key=lambda r: r["date"], reverse=True)
    for old in dated:
        for new in dated:
            if new is old or not (new["date"] > old["date"]):
                continue
            if (new["ageDays"] is not None and old["ageDays"] is not None
                    and old["ageDays"] - new["ageDays"] >= GAP_DAYS
                    and new.get("expert") == old.get("expert")
                    and new.get("score", 0) >= SUPERSEDE_MIN_REL * old.get("score", 0)):  # newer one must be on-topic too
                old["possiblySupersededBy"] = new["id"]
                break
    out = sorted(results, key=lambda r: r.get("date") or "", reverse=True)  # newest first on ties
    out.sort(key=lambda r: -r["adjScore"])  # stable
    return out


def finalize(results, data_root, top, now=None, dates=None):
    """annotate + rerank + cut to top. Pass in up to top*CANDIDATE_MULT candidates."""
    annotate(results, data_root, now, dates)
    ranked = rerank(results)
    cut = ranked[:top]
    if RESERVE_PER_SOURCE:
        # A long, high-scoring corpus (e.g. Learnyst) must not crowd out the freshest platform of the same
        # expert (their latest tweets / videos): guarantee each source its best hit, at most +2 extra rows.
        seen = {r.get("source") for r in cut}
        for r in ranked[top:]:
            if r.get("source") not in seen and len(cut) < top + 2:
                cut.append(r)
                seen.add(r.get("source"))
    return cut


def timeline(blocks):
    """Newest-first cross-expert list of dated hits: [{expert,id,date,freshness,title}]. For the synthesis step."""
    rows = []
    for ex, results in blocks.items():
        for r in results:
            if r.get("date"):
                rows.append({"expert": ex, "id": r["id"], "date": r["date"], "freshness": r["freshness"],
                             "source": r.get("source"), "title": r.get("title"),
                             "supersededCandidate": bool(r.get("possiblySupersededBy"))})
    rows.sort(key=lambda x: x["date"], reverse=True)
    return rows
