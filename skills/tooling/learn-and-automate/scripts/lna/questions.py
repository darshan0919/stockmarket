"""Question Engine (zero-LLM layer): generate wide, mine follower Q&A, rank, frontier, lens scoring.

Persistence rule: template questions and mined follower Q&A are re-derivable → they live in
data/runs/. Only questions carrying an LLM/agent answer, a Darshan decision, or a park reason are
persisted to the knowledge-units collection (type kb-question) via persist.js.
"""
import math
import re
from collections import Counter

from .common import REPO, read_json, read_jsonl, run_dir, sha8, slug, write_jsonl
from .pipeline import TAXONOMY, clean, norm, _jaccard

LENSES_FILE = REPO / "skills/tooling/learn-and-automate/references/question_lenses.json"


def _lenses():
    return read_json(LENSES_FILE)


def _source_name(source_key):
    kind, _, spec = source_key.partition(":")
    return "@" + spec if kind == "x" else spec


def topic_of(text, taxonomy=None):
    """Keyword routing of free text to a topic (follower questions). Returns best topic or None."""
    tax = taxonomy or read_json(TAXONOMY)["topics"]
    t = " " + (text or "").lower() + " "
    scores = Counter()
    for k, v in tax.items():
        for kw in v["keywords"]:
            if kw in t:
                scores[k] += 1
    if not scores:
        return None
    top = scores.most_common(1)[0][0]
    if top == "sector":
        for kw in tax["sector"]["keywords"]:
            if kw in t:
                return "sector:" + kw.replace(" ", "-").replace("&", "and")
    return top


def mine_follower_questions(source_key):
    """Follower question → expert answer pairs already in the corpus (free, expert-answered)."""
    rd = run_dir(source_key)
    tax = read_json(TAXONOMY)["topics"]
    out = []
    for d in read_jsonl(rd / "docs.jsonl"):
        q = clean(d.get("contextText"))
        if "?" not in q or not d.get("contextBy"):
            continue
        ls = classify_lenses(q)
        out.append({
            "qId": f"kbq_{slug(source_key)}_{sha8(source_key, 'follower', d['docId'])}",
            "sourceKey": source_key,
            "origin": "follower",
            "askedBy": d["contextBy"],
            "lens": ls[0] if ls else None,
            "topic": topic_of(q + " " + d.get("text", ""), tax),
            "text": q,
            "expertAnswer": clean(d.get("text")),
            "answerDocId": d["docId"],
            "answerUrl": d.get("url"),
            "date": d.get("date"),
            "likes": d.get("likes", 0),
            "status": "expert-answered",
        })
    write_jsonl(rd / "questions.follower.jsonl", out)
    by = Counter(q["topic"] or "unrouted" for q in out)
    return {"mined": len(out), "byTopic": dict(by.most_common()), "file": str(rd / "questions.follower.jsonl")}


STOP = set("a an the and or of to in on for is are be with as by at from this that it its into when what which how do does not no if then than any all per each you your i my we our sir u r ur will can should would could more most very just only also".split())


def _content(t):
    return {w for w in norm(t).split() if len(w) > 2 and w not in STOP}


def follower_demand(statement, fol_norm):
    """How many follower questions touch the same idea (≥2 shared content words)."""
    st = _content(statement)
    return sum(1 for f in fol_norm if len(st & {w for w in f.split() if len(w) > 2 and w not in STOP}) >= 2)


def _vague_term(statement, vague):
    s = " " + norm(statement) + " "
    for v in vague:
        if f" {v} " in s:
            return v
    return None


def generate(source_key, module, units):
    """Apply every applicable lens to every unit of `module` + module-level decision questions."""
    L = _lenses()
    src = _source_name(source_key)
    rd = run_dir(source_key)
    follower = [q for q in read_jsonl(rd / "questions.follower.jsonl") if q.get("topic") == module]
    fol_norm = [norm(q["text"]) for q in follower]
    qs = []
    mod_units = [u for u in units if u.get("topic") == module and u.get("status", "active") == "active"]
    for u in mod_units:
        for lid, lens in L["lenses"].items():
            if "module" in lens["appliesTo"] or u["kind"] not in lens["appliesTo"]:
                continue
            term = None
            if lens.get("onlyIfVague"):
                term = _vague_term(u["statement"], L["vagueTerms"])
                if not term:
                    continue
            for tpl in lens["templates"]:
                text = tpl.format(statement=u["statement"], topic=module, term=term or "", source=src)
                qs.append(_q(source_key, module, u["id"], lid, lens, text, u, fol_norm))
    for lid, lens in L["lenses"].items():
        if "module" in lens["appliesTo"]:
            for tpl in lens["templates"]:
                text = tpl.format(statement="", topic=module, term="", source=src)
                qs.append(_q(source_key, module, f"module:{module}", lid, lens, text, None, fol_norm))
    qs.sort(key=lambda q: -q["priority"])
    path = rd / "questions" / f"{slug(module)}.jsonl"
    existing = {q["qId"]: q for q in read_jsonl(path)}
    for q in qs:  # keep answers/decisions already recorded for the same qId
        if q["qId"] in existing and existing[q["qId"]].get("status") != "open":
            q.update({k: existing[q["qId"]][k] for k in ("status", "answer", "citations", "confidence", "route", "decidedBy") if k in existing[q["qId"]]})
    write_jsonl(path, qs)
    per_lens = Counter(q["lens"] for q in qs)
    return {"module": module, "units": len(mod_units), "questions": len(qs), "followerQuestions": len(follower), "byLens": dict(sorted(per_lens.items(), key=lambda x: int(x[0][1:]))), "file": str(path)}


def _q(source_key, module, target, lid, lens, text, unit, fol_norm):
    cites = len(unit["citations"]) if unit else 0
    asked_by_followers = follower_demand(unit["statement"], fol_norm) if unit else 0
    prio = lens["weight"] * (1 + math.log1p(cites)) * (1 + 0.5 * min(asked_by_followers, 4))
    if unit and unit.get("explicitness") == "curated":
        prio *= 0.5  # reposted views are his amplification, not his own reasoning
    if lens["needsUser"]:
        prio *= 2
    return {
        "qId": f"kbq_{slug(source_key)}_{sha8(source_key, target, lid, text)}",
        "sourceKey": source_key,
        "module": module,
        "target": target,
        "lens": lid,
        "lensName": lens["name"],
        "origin": "template",
        "text": text,
        "needsUser": lens["needsUser"],
        "needsUserReason": "decision" if lens["needsUser"] else None,
        "followerAsked": asked_by_followers,
        "priority": round(prio, 3),
        "status": "open",
        "routeTried": [],
    }


def apply_answers(source_key, module, answers):
    """Merge agent/Darshan answers: {qId, status, answer, citations[], confidence, route, needsUser?, decidedBy?}."""
    path = run_dir(source_key) / "questions" / f"{slug(module)}.jsonl"
    qs = {q["qId"]: q for q in read_jsonl(path)}
    n = 0
    for a in answers:
        q = qs.get(a["qId"])
        if not q:
            continue
        for k in ("status", "answer", "citations", "confidence", "decidedBy", "parkReason", "modelUsed"):
            if k in a:
                q[k] = a[k]
        if a.get("route"):
            q["routeTried"] = sorted(set(q.get("routeTried", [])) | {a["route"]})
        if q.get("status") == "open" and (a.get("confidence") or 1) < 0.6:
            q["needsUser"], q["needsUserReason"] = True, "low-confidence"
        n += 1
    write_jsonl(path, list(qs.values()))
    return {"applied": n, "persistable": [q for q in qs.values() if q.get("status") in ("auto-answered", "user-decided", "parked")]}


def frontier(source_key, module, n=8):
    """Questions only Darshan should see now: decisions, low-confidence leftovers, teaching items."""
    path = run_dir(source_key) / "questions" / f"{slug(module)}.jsonl"
    qs = [q for q in read_jsonl(path) if q.get("status") == "open" and q.get("needsUser")]
    qs.sort(key=lambda q: -q["priority"])
    return {"module": module, "openForUser": len(qs), "frontier": qs[:n]}


def metrics(source_key, module):
    path = run_dir(source_key) / "questions" / f"{slug(module)}.jsonl"
    qs = read_jsonl(path)
    st = Counter(q.get("status") for q in qs)
    total = len(qs) or 1
    return {
        "module": module,
        "generated": len(qs),
        "autoAnswered": st.get("auto-answered", 0),
        "autoAnsweredPct": round(100 * st.get("auto-answered", 0) / total, 1),
        "userDecided": st.get("user-decided", 0),
        "parked": st.get("parked", 0),
        "open": st.get("open", 0),
        "escalatedToExpert": sum(1 for q in qs if "ask-expert-on-x" in q.get("routeTried", [])),
        "lensCoverage": sorted({q["lens"] for q in qs}, key=lambda x: int(x[1:])),
    }


def classify_lenses(text):
    """Heuristic: which lenses does a free-text question use? (agent may override)."""
    t = (text or "").lower()
    hits = []
    for lid, lens in _lenses()["lenses"].items():
        if any(re.search(p, t) for p in lens["detect"]):
            hits.append(lid)
    return hits


def lens_score(user_questions, engine_lenses):
    """Compare Darshan's own questions with the engine's lens set → covered / missed lenses."""
    used = Counter()
    per_q = []
    for q in user_questions:
        ls = classify_lenses(q)
        per_q.append({"question": q, "lenses": ls})
        used.update(ls)
    engine = set(engine_lenses)
    covered = sorted(set(used) & engine, key=lambda x: int(x[1:]))
    missed = sorted(engine - set(used), key=lambda x: int(x[1:]))
    return {"asked": len(user_questions), "perQuestion": per_q, "covered": covered, "missed": missed, "coveragePct": round(100 * len(covered) / max(1, len(engine)), 1)}
