"""Ingest → prefilter → (media) → chunk → verify → modules. Zero-LLM."""
import random
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

from . import sources
from .common import (
    REPO,
    load_state,
    mark_phase,
    read_json,
    read_jsonl,
    run_dir,
    save_state,
    sha8,
    slug,
    source_lock,
    write_json,
    write_jsonl,
)

TAXONOMY = REPO / "skills/tooling/learn-and-automate/references/topic_taxonomy.json"
UNIT_KINDS = {
    "rule", "checklist_item", "do", "dont", "framework", "heuristic", "entry_signal", "exit_signal",
    "sizing", "sector_view", "macro_view", "pick", "anti_pattern", "mindset", "process",
}
RULE_KINDS = {"rule", "checklist_item", "do", "dont", "framework", "heuristic", "entry_signal", "exit_signal", "sizing", "anti_pattern", "process"}

FIN = re.compile(
    r"\b(stock|share|market|nifty|sensex|buy|sell|exit|entry|stop|sl|target|valuation|p/?e|eps|roce|roe|debt|capex|order|margin|"
    r"growth|sector|power|renew|solar|wind|transformer|cable|wire|bank|nbfc|chart|breakout|stage|volume|delivery|position|portfolio|pf|"
    r"allocation|risk|cash|result|quarter|q[1-4]|concall|management|promoter|float|small ?cap|mid ?cap|cycle|macro|oil|crude|bond|yield|"
    r"rate|fii|dii|ipo|qip|warrant|rerat|multibagger|compound|patience|conviction|thesis|moat|earning|revenue|profit|ebitda|pat|"
    r"guidance|visibility|capacity|plant|demand|supply|price|valuat|cheap|expensive|hold|holding|invest|trade|trading|swing|momentum|"
    r"theme|tailwind|policy|budget|psu|defen[cs]e|railway|pharma|chemical|textile|auto|metal|cement|infra|realty|ems|data ?cent|"
    r"stay away|avoid|view|filter|stealth|silence|patien|discipline|mistake|fail|learn|risk|rally|correction|crash|fall|bull|bear|"
    r"sentiment|smart money|operator|retail|hni|fund|mf|pms|technical|breadth|indicator|business|corrected|lower low|higher high|trigger|leg|value|doubler|bagger|fta|contraction|bias|upside|downside|opportunit|expansion|exhaust|support|resistance|trend|dip|uptrend|downtrend|accumulat|distribut|archive|enter)\w*",
    re.I,
)
PLEASANTRY = re.compile(r"^(thanks?( you)?|thank u|ty|congrat\w*|welcome|good (morning|night|evening)|happy \w+|ok(ay)?|yes|no|sure|true|done|lol|haha\w*|wow|nice|great|superb|correct|right|agreed?|same|🙏+|👍+|😊+)[\s!.,🙏👍😊]*$", re.I)
STRIP = re.compile(r"(@\w+|https?://\S+)")


def clean(t):
    return re.sub(r"\s+", " ", STRIP.sub("", t or "")).strip()


def norm(t):
    t = clean(t).lower()
    t = t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    t = re.sub(r"[^\w%./' ]+", " ", t.replace("-", " "))
    return re.sub(r"\s+", " ", t).strip()


# ── Phase 1: ingest ──────────────────────────────────────────────────────────
def ingest(source_key, since=None, until=None, delta=False):
    rd = run_dir(source_key)
    st = load_state(source_key)
    cursor = st.get("cursor") if delta else None
    docs = sources.load(source_key)
    seen, uniq = set(), []
    for d in docs:
        if d["docId"] in seen:
            continue
        seen.add(d["docId"])
        dt = d.get("date") or ""
        if since and dt and dt < since:
            continue
        if until and dt and dt > until:
            continue
        if cursor and dt and dt <= cursor:
            continue
        uniq.append(d)
    uniq.sort(key=lambda d: (d.get("date") or "", d["docId"]))
    name = "docs.delta.jsonl" if delta else "docs.jsonl"
    write_jsonl(rd / name, uniq)
    prof = profile(uniq)
    with source_lock(source_key):
        st = load_state(source_key)
        st["phases"]["ingest"] = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "since": since, "until": until, "delta": delta, "docs": len(uniq)}
        if uniq:
            st["pendingCursor"] = max(d.get("date") or "" for d in uniq)
        st["profile"] = prof
        save_state(source_key, st)
    return {"file": str(rd / name), "docs": len(uniq), "profile": prof}


def profile(docs):
    years = Counter((d.get("date") or "undated")[:4] for d in docs)
    kinds = Counter(d.get("kind") for d in docs)
    dates = sorted(d["date"] for d in docs if d.get("date"))
    top = sorted(docs, key=lambda d: -d.get("likes", 0))[:5]
    return {
        "docs": len(docs),
        "from": dates[0] if dates else None,
        "to": dates[-1] if dates else None,
        "byYear": dict(sorted(years.items())),
        "byKind": dict(kinds),
        "byTier": dict(sorted(Counter(d.get("tier", 1) for d in docs).items())),
        "withMedia": sum(1 for d in docs if d.get("hasMedia")),
        "withQuestionContext": sum(1 for d in docs if "?" in (d.get("contextText") or "")),
        "chars": sum(len(d.get("text") or "") for d in docs),
        "topLiked": [{"docId": d["docId"], "likes": d.get("likes"), "text": clean(d["text"])[:120]} for d in top],
    }


# ── Phase 2: prefilter (recall-first) ────────────────────────────────────────
def keep_reason(d, min_chars=40):
    if d.get("kind") == "passage":
        return "passage"
    if d.get("kind") == "article":
        return "article"
    t = clean(d.get("text"))
    ctx = d.get("contextText") or ""
    if d.get("kind") == "repost":
        # tier 3: curated content he amplified — keep only substantive finance text
        return "repost-finance" if FIN.search(t) and len(t) >= min_chars else None
    fin_t, fin_c = bool(FIN.search(t)), bool(FIN.search(ctx))
    if PLEASANTRY.match(t) and not (fin_c and "?" in ctx):
        return None
    if fin_c and len(t) >= 2:
        # one-liner answers ARE rules ("Unless I make plant visits…"); followers often omit the "?"
        return "answers-finance-question"
    if fin_t and len(t) >= min_chars:
        return "finance-long"
    if fin_t and len(t) >= 12:  # short finance replies too ("lower lows, lower highs")
        return "finance-short-original"
    if d.get("hasMedia") and d.get("likes", 0) >= 50:
        return "high-engagement-media"
    return None


def prefilter(source_key, audit_n=200, delta=False):
    rd = run_dir(source_key)
    docs = read_jsonl(rd / ("docs.delta.jsonl" if delta else "docs.jsonl"))
    keep, drop, why = [], [], Counter()
    for d in docs:
        r = keep_reason(d)
        if r:
            d["keepReason"] = r
            keep.append(d)
            why[r] += 1
        else:
            drop.append(d)
    suffix = ".delta" if delta else ""
    write_jsonl(rd / f"candidates{suffix}.jsonl", keep)
    write_jsonl(rd / f"dropped{suffix}.jsonl", drop)
    rnd = random.Random(42)
    sample = rnd.sample(drop, min(audit_n, len(drop)))
    write_jsonl(rd / f"dropped-audit-sample{suffix}.jsonl", [{"docId": d["docId"], "text": clean(d["text"])[:280], "context": clean(d.get("contextText"))[:200]} for d in sample])
    funnel = {"in": len(docs), "kept": len(keep), "dropped": len(drop), "keptBy": dict(why), "keptChars": sum(len(d["text"]) + len(d.get("contextText") or "") for d in keep)}
    mark_phase(source_key, "prefilter", **funnel)
    return funnel


# ── Phase 3b: chart/media vision queue ───────────────────────────────────────
def media_queue(source_key, top_n=150):
    rd = run_dir(source_key)
    cands = [d for d in read_jsonl(rd / "candidates.jsonl") if d.get("mediaUrls")]
    cands.sort(key=lambda d: -(d.get("likes", 0)))
    q = [{"docId": d["docId"], "date": d["date"], "likes": d["likes"], "url": d["url"], "text": clean(d["text"])[:200], "mediaUrls": d["mediaUrls"]} for d in cands[:top_n]]
    write_jsonl(rd / "media-queue.jsonl", q)
    return {"queued": len(q), "file": str(rd / "media-queue.jsonl")}


def media_fetch(source_key, timeout=20):
    """Best-effort download of queued images into data/cache (re-fetchable → cache, not runs)."""
    import urllib.request

    from .common import data_root

    rd = run_dir(source_key)
    out = data_root() / "cache" / "learn-and-automate" / slug(source_key) / "media"
    out.mkdir(parents=True, exist_ok=True)
    ok, fail = 0, []
    for q in read_jsonl(rd / "media-queue.jsonl"):
        for i, u in enumerate(q["mediaUrls"]):
            dest = out / f"{q['docId']}_{i}.jpg"
            if dest.exists() and dest.stat().st_size > 0:
                ok += 1
                continue
            try:
                with urllib.request.urlopen(u + ("&name=small" if "?" in u else "?name=small"), timeout=timeout) as r:
                    dest.write_bytes(r.read())
                ok += 1
            except Exception as e:  # network allowlist / 404 — report, never fail the run
                fail.append({"docId": q["docId"], "url": u, "error": str(e)[:120]})
    return {"downloaded": ok, "failed": len(fail), "failures": fail[:10], "dir": str(out)}


def media_apply(source_key, media_file):
    """Attach agent-written chart descriptions ({docId, mediaText, modelUsed}) to candidates."""
    rd = run_dir(source_key)
    desc = {m["docId"]: m for m in read_jsonl(media_file)}
    with source_lock(source_key):
        cands = read_jsonl(rd / "candidates.jsonl")
        n = 0
        for d in cands:
            if d["docId"] in desc:
                d["mediaText"] = desc[d["docId"]]["mediaText"]
                n += 1
        write_jsonl(rd / "candidates.jsonl", cands)
        write_jsonl(rd / "media.jsonl", list(desc.values()))
    return {"attached": n}


# ── Phase 3: chunk for recall extraction ─────────────────────────────────────
def render_doc(d):
    tier = d.get("tier", 1)
    head = f"<<D {d['docId']} | {d.get('date') or 'undated'} | {d.get('kind')} | T{tier} | likes {d.get('likes', 0)} | {d.get('url')}>>"
    lines = [head]
    if d.get("title"):
        lines.append(f"TITLE: {d['title']}")
    if tier == 3:
        lines.append(f"REPOSTED from @{d.get('contextBy') or '?'} — these are THEIR words; he only amplified them")
    elif d.get("contextText"):
        lines.append(f"Q (@{d.get('contextBy') or '?'}): {clean(d['contextText'])}")
    lines.append(f"A: {clean(d['text'])}" if d.get("contextText") else clean(d["text"]))
    if d.get("mediaText"):
        lines.append(f"[IMAGE] {d['mediaText'][:3000]}")
    return "\n".join(lines)


def chunk(source_key, max_chars=40000, delta=False):
    """Chunk candidates by extraction tier (1 own posts/articles → 2 replies → 3 reposts), newest first
    inside each tier, so the most valuable material is extracted first and a partial run still pays off."""
    rd = run_dir(source_key)
    cands = read_jsonl(rd / ("candidates.delta.jsonl" if delta else "candidates.jsonl"))
    cdir = rd / "chunks"
    cdir.mkdir(exist_ok=True)
    manifest = read_json(rd / "chunks.json", default=[]) if delta else []
    start = len(manifest)
    for tier in (1, 2, 3):
        docs = sorted((d for d in cands if d.get("tier", 1) == tier), key=lambda d: (d.get("date") or "", d["docId"]), reverse=True)
        n = sum(1 for c in manifest if c["tier"] == tier)
        buf, size = [], 0

        def flush():
            nonlocal buf, size, n
            if not buf:
                return
            n += 1
            cid = f"t{tier}-c{n:04d}"
            (cdir / f"{cid}.txt").write_text("\n\n".join(render_doc(d) for d in buf))
            dates = [d.get("date") or "" for d in buf]
            manifest.append({"chunkId": cid, "tier": tier, "file": str(cdir / f"{cid}.txt"), "docIds": [d["docId"] for d in buf], "chars": size, "from": min(dates), "to": max(dates)})
            buf, size = [], 0

        for d in docs:
            txt = render_doc(d)
            if buf and size + len(txt) > max_chars:
                flush()
            buf.append(d)
            size += len(txt) + 2
        flush()
    write_json(rd / "chunks.json", manifest)
    by_tier = Counter(c["tier"] for c in manifest)
    mark_phase(source_key, "chunk", chunks=len(manifest), newChunks=len(manifest) - start, byTier=dict(sorted(by_tier.items())))
    return {"chunks": len(manifest), "new": len(manifest) - start, "byTier": dict(sorted(by_tier.items())), "dir": str(cdir)}


def pending_chunks(source_key, n=5):
    rd = run_dir(source_key)
    st = load_state(source_key)
    done = set(st.get("chunksDone", []))
    pend = [c for c in read_json(rd / "chunks.json", default=[]) if c["chunkId"] not in done]
    pend.sort(key=lambda c: (c["tier"], int(c["chunkId"].split("-c")[1])))  # tier 1→2→3; within a tier c0001 = newest
    by = Counter(c["tier"] for c in pend)
    return {"pending": len(pend), "pendingByTier": dict(sorted(by.items())), "next": [{"chunkId": c["chunkId"], "tier": c["tier"], "file": c["file"], "out": str(rd / "units-raw" / f"{c['chunkId']}.jsonl"), "chars": c["chars"], "from": c["from"], "to": c["to"]} for c in pend[:n]]}


# ── Phase 4: verify recall output ────────────────────────────────────────────
def _jaccard(a, b):
    a, b = set(a.split()), set(b.split())
    return len(a & b) / max(1, len(a | b))


def verify(source_key, chunk_ids=None, model_used=None):
    rd = run_dir(source_key)
    topics = set(read_json(TAXONOMY)["topics"])
    cand = {}
    for name in ("candidates.jsonl", "candidates.delta.jsonl"):
        for d in read_jsonl(rd / name):
            cand[d["docId"]] = d
    raw_dir = rd / "units-raw"
    files = sorted(raw_dir.glob("*.jsonl")) if raw_dir.exists() else []
    if chunk_ids:
        files = [f for f in files if f.stem in set(chunk_ids)]
    ok, rejects, done = [], [], []
    for f in files:
        for u in read_jsonl(f):
            err = _check_unit(u, cand, topics)
            if err:
                rejects.append({**u, "_chunk": f.stem, "_reject": err})
            else:
                u["_chunk"] = f.stem
                ok.append(u)
        done.append(f.stem)
    merged = _dedupe(source_key, ok, cand, model_used)
    prev = {u["id"]: u for u in read_jsonl(rd / "units.verified.jsonl")}
    for u in merged:
        if u["id"] not in prev:  # near-duplicate of an already-verified unit from an earlier chunk?
            nu = norm(u["statement"])
            for p in prev.values():
                if p["topic"] == u["topic"] and p["kind"] == u["kind"] and _jaccard(nu, norm(p["statement"])) >= 0.8:
                    u["id"] = p["id"]
                    break
        if u["id"] in prev:
            p = prev[u["id"]]
            u["statement"], u["verbatim"] = p["statement"], p["verbatim"]
            u["citations"] = _merge_cites(p["citations"], u["citations"])
            u["firstSeen"], u["lastSeen"] = min(p["firstSeen"], u["firstSeen"]), max(p["lastSeen"], u["lastSeen"])
        prev[u["id"]] = u
    write_jsonl(rd / "units.verified.jsonl", list(prev.values()))
    write_jsonl(rd / "units.rejects.jsonl", read_jsonl(rd / "units.rejects.jsonl") + rejects)
    with source_lock(source_key):
        st = load_state(source_key)
        st["chunksDone"] = sorted(set(st.get("chunksDone", [])) | set(done))
        st["phases"]["verify"] = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "accepted": len(ok), "rejected": len(rejects), "unitsTotal": len(prev)}
        save_state(source_key, st)
    return {"chunks": done, "accepted": len(ok), "rejected": len(rejects), "rejectReasons": dict(Counter(r["_reject"].split(":")[0] for r in rejects)), "unitsTotal": len(prev), "file": str(rd / "units.verified.jsonl")}


def _check_unit(u, cand, topics):
    for k in ("kind", "topic", "statement", "verbatim", "docIds"):
        if not u.get(k):
            return f"missing:{k}"
    if u["kind"] not in UNIT_KINDS:
        return f"bad-kind:{u['kind']}"
    base = u["topic"].split(":")[0]
    if base not in topics:
        return f"bad-topic:{u['topic']}"
    vb = norm(u["verbatim"])
    if len(vb) < 3:
        return "verbatim-too-short"
    for did in u["docIds"]:
        d = cand.get(did)
        if not d:
            return f"unknown-doc:{did}"
    first = cand[u["docIds"][0]]
    hay = norm(first.get("text"))
    if u.get("fromMedia"):
        hay += " " + norm(first.get("mediaText"))
    if vb not in hay:
        return "verbatim-not-in-source"
    return None


def _explicitness(members, cand):
    """curated = every supporting doc is a repost (amplified, not his own words);
    inferred = chart-derived or flagged by the extractor; explicit otherwise."""
    tiers = {cand[did].get("tier", 1) for m in members for did in m["docIds"]}
    if tiers == {3}:
        return "curated"
    if any(m.get("fromMedia") or m.get("explicitness") == "inferred" for m in members):
        return "inferred"
    return "explicit"


def _merge_cites(a, b):
    seen, out = set(), []
    for c in a + b:
        if c["docId"] not in seen:
            seen.add(c["docId"])
            out.append(c)
    return sorted(out, key=lambda c: c.get("date") or "")


def _dedupe(source_key, units, cand, model_used):
    groups = defaultdict(list)
    for u in units:
        groups[(u["topic"], u["kind"])].append(u)
    out = []
    for (topic, kind), us in groups.items():
        clusters = []
        for u in us:
            ns = norm(u["statement"])
            for c in clusters:
                if _jaccard(ns, c["_n"]) >= 0.8:
                    c["_members"].append(u)
                    break
            else:
                clusters.append({"_n": ns, "_members": [u]})
        for c in clusters:
            m0 = c["_members"][0]
            cites = []
            for m in c["_members"]:
                for did in m["docIds"]:
                    d = cand[did]
                    cites.append({"docId": did, "date": d.get("date"), "url": d.get("url"), "verbatim": m["verbatim"] if did == m["docIds"][0] else None})
            cites = _merge_cites([], cites)
            dates = [x["date"] for x in cites if x.get("date")]
            rec = {
                "id": f"kbu_{slug(source_key)}_{sha8(source_key, topic, kind, c['_n'])}",
                "type": "kb-unit",
                "sourceKey": source_key,
                "kind": kind,
                "topic": topic,
                "statement": m0["statement"],
                "verbatim": m0["verbatim"],
                "conditions": m0.get("conditions") or None,
                "explicitness": _explicitness(c["_members"], cand),
                "sourceTier": min(cand[did].get("tier", 1) for m in c["_members"] for did in m["docIds"]),
                "citations": cites,
                "firstSeen": min(dates) if dates else None,
                "lastSeen": max(dates) if dates else None,
                "date": max(dates) if dates else None,
                "status": "active",
                "userStance": None,
                "modelUsed": model_used or m0.get("modelUsed"),
            }
            out.append(rec)
    return out


# ── Phase 5: curriculum modules ──────────────────────────────────────────────
def modules(source_key, units=None, split_over=60):
    rd = run_dir(source_key)
    units = units if units is not None else read_jsonl(rd / "units.verified.jsonl")
    tax = read_json(TAXONOMY)["topics"]
    by = defaultdict(list)
    for u in units:
        if u.get("status", "active") == "active":
            by[u["topic"]].append(u)
    mods = []
    for topic, us in by.items():
        rules = [u for u in us if u["kind"] in RULE_KINDS]
        base = topic.split(":")[0]
        dates = sorted(u["lastSeen"] for u in us if u.get("lastSeen"))
        mods.append({
            "module": topic,
            "title": tax.get(base, {}).get("title", topic) + (f" — {topic.split(':', 1)[1]}" if ":" in topic else ""),
            "units": len(us),
            "ruleUnits": len(rules),
            "citations": sum(len(u["citations"]) for u in us),
            "from": dates[0] if dates else None,
            "to": dates[-1] if dates else None,
            "needsSplit": len(rules) > split_over,
        })
    mods.sort(key=lambda m: (-m["ruleUnits"], -m["citations"]))
    st = load_state(source_key)
    for m in mods:
        m["status"] = st.get("modules", {}).get(m["module"], {}).get("status", "not-started")
    write_json(rd / "modules.json", mods)
    return mods


def commit_cursor(source_key):
    """Advance the refresh cursor ONLY after a healthy delta run (conventions §19)."""
    with source_lock(source_key):
        st = load_state(source_key)
        if st.get("pendingCursor"):
            st["cursor"] = st.pop("pendingCursor")
        save_state(source_key, st)
    return {"cursor": st.get("cursor")}


def audit_sample(source_key, n=12, seed=7):
    """Deterministic sample of verified units for a human/mid-tier tag audit (kind/topic/explicitness vs quote)."""
    f = run_dir(source_key) / "units.verified.jsonl"
    units = read_jsonl(f) if f.exists() else []
    rnd = random.Random(seed)
    pick = rnd.sample(units, min(n, len(units)))
    return {"total": len(units), "sample": [{k: u.get(k) for k in ("id", "kind", "topic", "explicitness", "statement", "verbatim")} for u in pick],
            "task": "For each: does kind/topic match the quote? Is it a rule or merely an opinion? Report mismatch rate; >15% => tighten the extraction prompt."}


# ── Topic scan: keyword-focused pass over the FULL history (all tiers, any date) ──────────────
def topic_scan(source_key, topic, max_chars=40000, since=None):
    """Script-only: match topic keyword groups in text/context/title across ALL docs (ignores the
    prefilter window), write hits + tiered newest-first chunks under topics/<topic>/ for extraction."""
    import json as _json
    kw = _json.loads((Path(__file__).resolve().parents[2] / "references" / "topic_keywords.json").read_text())[topic]
    groups = {g: re.compile(rx, re.I) for g, rx in kw["groups"].items()}
    docs = sources.load(source_key)
    seen, hits = set(), []
    for d in docs:
        if d["docId"] in seen or (since and (d.get("date") or "") < since):
            continue
        seen.add(d["docId"])
        blob = " ".join(str(d.get(k) or "") for k in ("title", "text", "contextText", "mediaText"))
        matched = [g for g, rx in groups.items() if rx.search(blob)]
        if matched:
            # generic words (catalyst/trigger/commission…) only count when the doc is substantive
            if set(matched) <= set(kw.get("weak", [])) and len(d.get("text") or "") < kw.get("weakMinChars", 0):
                continue
            d["topicGroups"] = matched
            hits.append(d)
    td = run_dir(source_key) / "topics" / topic
    (td / "chunks").mkdir(parents=True, exist_ok=True)
    (td / "units-raw").mkdir(exist_ok=True)
    write_jsonl(td / "docs.jsonl", hits)
    manifest = []
    for tier in (1, 2, 3):
        part = sorted((d for d in hits if d.get("tier", 1) == tier), key=lambda d: (d.get("date") or "", d["docId"]), reverse=True)
        buf, size, n = [], 0, 0

        def flush():
            nonlocal buf, size, n
            if not buf:
                return
            n += 1
            cid = f"{topic}-t{tier}-c{n:03d}"
            (td / "chunks" / f"{cid}.txt").write_text("\n\n".join(render_doc(x) for x in buf))
            dates = [x.get("date") or "" for x in buf]
            manifest.append({"chunkId": cid, "tier": tier, "file": str(td / "chunks" / f"{cid}.txt"), "out": str(td / "units-raw" / f"{cid}.jsonl"), "docs": len(buf), "chars": size, "from": min(dates), "to": max(dates)})
            buf, size = [], 0

        for d in part:
            t = render_doc(d)
            if buf and size + len(t) > max_chars:
                flush()
            buf.append(d)
            size += len(t) + 2
        flush()
    write_json(td / "chunks.json", manifest)
    return {
        "topic": topic, "scanned": len(seen), "hits": len(hits),
        "byTier": dict(Counter(d.get("tier", 1) for d in hits)),
        "byGroup": dict(Counter(g for d in hits for g in d["topicGroups"])),
        "byYear": dict(sorted(Counter((d.get("date") or "????")[:4] for d in hits).items())),
        "chunks": len(manifest), "chars": sum(m["chars"] for m in manifest), "dir": str(td),
    }


JC_KINDS = {"definition", "stage_signal", "trigger", "metric", "rerating_mechanic", "timing", "case", "pitfall", "checklist_item", "entry_exit", "monitor"}


def _topic_cfg(topic):
    import json as _json
    return _json.loads((Path(__file__).resolve().parents[2] / "references" / "topic_keywords.json").read_text())[topic]


def topic_verify(source_key, topic):
    """Verify topic units (exact verbatim in HIS text of the first doc) and write topics/<topic>/units.verified.jsonl."""
    cfg = _topic_cfg(topic)
    kinds, repost_kinds = set(cfg.get("kinds") or JC_KINDS), set(cfg.get("repostKinds") or ("case", "metric", "rerating_mechanic"))
    td = run_dir(source_key) / "topics" / topic
    docs = {d["docId"]: d for d in read_jsonl(td / "docs.jsonl")}
    ok, bad, per = [], [], Counter()
    for f in sorted((td / "units-raw").glob("*.jsonl")):
        for u in read_jsonl(f):
            why = None
            for k in ("kind", "statement", "verbatim", "docIds"):
                if not u.get(k):
                    why = f"missing:{k}"
                    break
            if not why and u["kind"] not in kinds:
                why = f"bad-kind:{u['kind']}"
            if not why:
                first = docs.get(u["docIds"][0])
                if not first:
                    why = "unknown-doc"
                elif len(norm(u["verbatim"])) < 3 or norm(u["verbatim"]) not in norm(first.get("text")):
                    why = "verbatim-not-in-source"
                elif first.get("tier") == 3 and (u["kind"] not in repost_kinds):
                    why = "repost-kind"
            if why:
                u["_reject"] = why
                bad.append(u)
                continue
            first = docs[u["docIds"][0]]
            u["date"] = first.get("date")
            u["url"] = first.get("url")
            u["sourceTier"] = first.get("tier")
            u["explicitness"] = "inferred" if first.get("tier") == 3 else (u.get("explicitness") or "explicit")
            u["chunk"] = f.stem
            ok.append(u)
            per[f.stem] += 1
    write_jsonl(td / "units.verified.jsonl", ok)
    write_jsonl(td / "units.rejects.jsonl", bad)
    return {"accepted": len(ok), "rejected": len(bad), "rejectReasons": dict(Counter(b["_reject"].split(":")[0] for b in bad)), "perChunk": dict(per)}


def topic_persist(source_key, topic):
    """Build persist-ready kb-unit records (citations as LIST, schema-compatible with main units) from topics/<topic>/units.verified.jsonl."""
    import hashlib
    cfg = _topic_cfg(topic)
    kmap = cfg["kindMap"]
    td = run_dir(source_key) / "topics" / topic
    docs = {d["docId"]: d for d in read_jsonl(td / "docs.jsonl")}
    sk = source_key.replace(":", "-")
    out = []
    for u in read_jsonl(td / "units.verified.jsonl"):
        h = hashlib.sha1((u["docIds"][0] + "|" + u["verbatim"]).encode()).hexdigest()[:8]
        cites = [{"docId": i, "date": docs[i].get("date"), "url": docs[i].get("url"), "verbatim": u["verbatim"]} for i in dict.fromkeys(u["docIds"]) if i in docs]
        rec = {k: u.get(k) for k in ("statement", "verbatim", "docIds", "conditions", "explicitness", "sourceTier", "stage", "triggerType", "company", "metrics", "horizon", "fromMedia", "filingType") if k in u}
        rec.update({"id": f"kbu_{sk}_{topic[:2]}_{h}", "type": "kb-unit", "sourceKey": source_key, "kind": kmap[u["kind"]], f"{topic}Kind": u["kind"], "topic": topic,
                    "citations": cites, "origin": f"topic-scan:{topic}"})
        out.append(rec)
    write_jsonl(td / "units.persist.jsonl", out)
    return {"records": len(out), "file": str(td / "units.persist.jsonl")}
