#!/usr/bin/env python3
"""learn-and-automate CLI — the deterministic half of the skill (zero LLM, no API keys).

Every command takes --source <sourceKey> explicitly (x:<handle> | learnyst:<kw,..> |
youtube:<channel>[:<kw,..>] | file:<path>). Output is JSON on stdout.
Run via the workspace facade:  yarn learn-and-automate <command> --source x:sureshkbn ...
"""
import argparse
import json
import random
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lna import kb, mapping, pipeline, questions  # noqa: E402
from lna.common import load_collection, load_state, read_jsonl, run_dir, save_state, slug, source_lock, write_jsonl  # noqa: E402

LEARNER_ID = "kbl_learner_darshan"


def _units(source_key):
    db_units = [r for r in load_collection().values() if r.get("sourceKey") == source_key and r.get("type") == "kb-unit"]
    return db_units or read_jsonl(run_dir(source_key) / "units.verified.jsonl")


def _set_module(source_key, module, **info):
    with source_lock(source_key):
        st = load_state(source_key)
        m = st.setdefault("modules", {}).setdefault(module, {})
        m.update(info, updatedAt=time.strftime("%Y-%m-%dT%H:%M:%S"))
        save_state(source_key, st)
    return st["modules"][module]


def cmd_session_start(a):
    units = [u for u in _units(a.source) if u["topic"] == a.module and u.get("status", "active") == "active"]
    if not units:
        return {"error": f"no active units for module {a.module!r} — run verify/persist first, or check `modules`"}
    units.sort(key=lambda u: (-len(u["citations"]), u.get("lastSeen") or ""))
    rnd = random.Random(slug(a.module))
    raw_ids = [c["docId"] for u in units[:15] for c in u["citations"][:1]]
    cand = {d["docId"]: d for d in read_jsonl(run_dir(a.source) / "candidates.jsonl")}
    pick = rnd.sample(raw_ids, min(a.raw, len(raw_ids)))
    raw = [{"docId": i, "date": cand[i].get("date"), "question": pipeline.clean(cand[i].get("contextText")) or None, "text": pipeline.clean(cand[i]["text"]), "url": cand[i].get("url")} for i in pick if i in cand]
    fol = [q for q in read_jsonl(run_dir(a.source) / "questions.follower.jsonl") if q.get("topic") == a.module]
    fol.sort(key=lambda q: -q.get("likes", 0))
    learner = load_collection().get(LEARNER_ID, {})
    info = _set_module(a.source, a.module, status="in-progress")
    return {
        "module": a.module,
        "units": len(units),
        "ruleUnits": sum(1 for u in units if u["kind"] in pipeline.RULE_KINDS),
        "questionsFirst": raw,
        "topUnits": [{"id": u["id"], "kind": u["kind"], "statement": u["statement"], "verbatim": u["verbatim"], "cites": len(u["citations"]), "lastSeen": u.get("lastSeen"), "stance": u.get("userStance")} for u in units[: a.top]],
        "followerQA": [{"q": q["text"], "a": q["expertAnswer"], "date": q["date"], "url": q["answerUrl"]} for q in fol[:8]],
        "learnerBlindSpots": learner.get("blindSpots", []),
        "moduleState": info,
    }


def cmd_lens_score(a):
    qs = [l.strip() for l in Path(a.file).read_text().splitlines() if l.strip()]
    path = run_dir(a.source) / "questions" / f"{slug(a.module)}.jsonl"
    engine = sorted({q["lens"] for q in read_jsonl(path)}) or [f"L{i}" for i in range(1, 14)]
    res = questions.lens_score(qs, engine)
    prev = load_collection().get(LEARNER_ID, {})
    used = Counter(prev.get("lensCounts", {}))
    for p in res["perQuestion"]:
        used.update(p["lenses"])
    missed = Counter(prev.get("missCounts", {}))
    missed.update(res["missed"])
    sessions = int(prev.get("sessions", 0)) + 1
    patch = {
        "id": LEARNER_ID, "type": "kb-learner-profile", "sourceKey": "learner:darshan", "learner": "darshan",
        "lensCounts": dict(used), "missCounts": dict(missed), "sessions": sessions,
        "strongLenses": [l for l, _ in used.most_common(4)],
        "blindSpots": [l for l, c in missed.most_common() if c >= max(1, sessions // 2)][:5],
        "lastModule": f"{a.source}#{a.module}",
    }
    out = run_dir(a.source) / "learner-profile.patch.jsonl"
    write_jsonl(out, [patch])
    res["profilePatch"] = str(out)
    res["persistWith"] = f"yarn learn-and-automate:persist --file {out} --patch"
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add(name, **kw):
        p = sub.add_parser(name, **kw)
        p.add_argument("--source", required=True)
        return p

    p = add("ingest"); p.add_argument("--since"); p.add_argument("--until"); p.add_argument("--delta", action="store_true")
    p = add("prefilter"); p.add_argument("--audit", type=int, default=200); p.add_argument("--delta", action="store_true")
    p = add("media-queue"); p.add_argument("--top", type=int, default=150)
    add("media-fetch")
    p = add("media-apply"); p.add_argument("--file", required=True)
    p = add("chunk"); p.add_argument("--max-chars", type=int, default=40000); p.add_argument("--delta", action="store_true")
    p = add("next-chunks"); p.add_argument("--n", type=int, default=5)
    p = add("topic-scan"); p.add_argument("--topic", required=True); p.add_argument("--since"); p.add_argument("--max-chars", type=int, default=40000)
    p = add("topic-verify"); p.add_argument("--topic", required=True)
    p = add("topic-persist"); p.add_argument("--topic", required=True)
    add("img-collect")
    p = add("img-fetch"); p.add_argument("--limit", type=int); p.add_argument("--workers", type=int, default=8)
    p = add("img-ocr"); p.add_argument("--limit", type=int); p.add_argument("--workers", type=int, default=4)
    add("img-status")
    p = add("audit-sample"); p.add_argument("--n", type=int, default=12)
    p = add("verify"); p.add_argument("--chunks", help="comma-separated chunk ids (default: all raw files)"); p.add_argument("--model-used")
    add("modules")
    add("mine-questions")
    p = add("session-start"); p.add_argument("--module", required=True); p.add_argument("--raw", type=int, default=4); p.add_argument("--top", type=int, default=12)
    p = add("session-end"); p.add_argument("--module", required=True); p.add_argument("--status", default="done", choices=["done", "paused", "in-progress"])
    p = add("questions"); p.add_argument("--module", required=True)
    p = add("questions-apply"); p.add_argument("--module", required=True); p.add_argument("--file", required=True)
    p = add("frontier"); p.add_argument("--module", required=True); p.add_argument("--n", type=int, default=8)
    p = add("q-metrics"); p.add_argument("--module", required=True)
    p = add("lens-score"); p.add_argument("--module", required=True); p.add_argument("--file", required=True)
    p = add("map"); p.add_argument("--file", required=True, help="frameworks jsonl")
    p = add("render"); p.add_argument("--out")
    add("status")
    add("commit-cursor")
    a = ap.parse_args()

    s = a.source
    if a.cmd == "ingest":
        r = pipeline.ingest(s, a.since, a.until, a.delta)
    elif a.cmd == "prefilter":
        r = pipeline.prefilter(s, a.audit, a.delta)
    elif a.cmd == "media-queue":
        r = pipeline.media_queue(s, a.top)
    elif a.cmd == "media-fetch":
        r = pipeline.media_fetch(s)
    elif a.cmd == "media-apply":
        r = pipeline.media_apply(s, a.file)
    elif a.cmd == "chunk":
        r = pipeline.chunk(s, a.max_chars, a.delta)
    elif a.cmd == "next-chunks":
        r = pipeline.pending_chunks(s, a.n)
    elif a.cmd == "topic-scan":
        r = pipeline.topic_scan(s, a.topic, a.max_chars, a.since)
    elif a.cmd == "topic-verify":
        r = pipeline.topic_verify(s, a.topic)
    elif a.cmd == "topic-persist":
        r = pipeline.topic_persist(s, a.topic)
    elif a.cmd in ("img-collect", "img-fetch", "img-ocr", "img-status"):
        from lna import media
        hd = s.split(":", 1)[1]
        r = {"img-collect": lambda: media.collect(hd), "img-fetch": lambda: media.fetch(hd, a.limit if hasattr(a, "limit") else None, getattr(a, "workers", 8)),
             "img-ocr": lambda: media.ocr(hd, getattr(a, "limit", None), getattr(a, "workers", 4)), "img-status": lambda: media.status(hd)}[a.cmd]()
    elif a.cmd == "audit-sample":
        r = pipeline.audit_sample(s, a.n)
    elif a.cmd == "verify":
        r = pipeline.verify(s, a.chunks.split(",") if a.chunks else None, a.model_used)
    elif a.cmd == "modules":
        r = pipeline.modules(s, _units(s))
    elif a.cmd == "mine-questions":
        r = questions.mine_follower_questions(s)
    elif a.cmd == "session-start":
        r = cmd_session_start(a)
    elif a.cmd == "session-end":
        r = _set_module(s, a.module, status=a.status, metrics=questions.metrics(s, a.module))
    elif a.cmd == "questions":
        r = questions.generate(s, a.module, _units(s))
    elif a.cmd == "questions-apply":
        res = questions.apply_answers(s, a.module, read_jsonl(a.file))
        out = run_dir(s) / "questions" / f"{slug(a.module)}.persist.jsonl"
        write_jsonl(out, [{**q, "id": q["qId"], "type": "kb-question"} for q in res["persistable"]])
        r = {"applied": res["applied"], "persistable": len(res["persistable"]), "persistWith": f"yarn learn-and-automate:persist --file {out}"}
    elif a.cmd == "frontier":
        r = questions.frontier(s, a.module, a.n)
    elif a.cmd == "q-metrics":
        r = questions.metrics(s, a.module)
    elif a.cmd == "lens-score":
        r = cmd_lens_score(a)
    elif a.cmd == "map":
        cat = mapping.catalog()
        r = [mapping.map_framework(fw, cat) for fw in read_jsonl(a.file)]
    elif a.cmd == "render":
        r = kb.render(s, a.out)
    elif a.cmd == "status":
        r = kb.status(s)
    elif a.cmd == "commit-cursor":
        r = pipeline.commit_cursor(s)
    print(json.dumps(r, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
