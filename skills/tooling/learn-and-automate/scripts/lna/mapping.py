"""Fit-gap mapping: framework → candidate existing skills / scheduled jobs (zero-LLM, human confirms)."""
import json
import re
from collections import Counter

from .common import REPO

STOP = set("a an the and or of to in on for is are be with as by at from this that it its into when what which how do does not no if then than any all per each".split())


def _tok(text):
    return [w for w in re.findall(r"[a-z][a-z0-9\-]+", (text or "").lower()) if w not in STOP and len(w) > 2]


def _frontmatter_desc(path):
    try:
        txt = open(path).read(6000)
    except OSError:
        return ""
    m = re.search(r"^description:\s*(.+?)(?:\n[a-z_]+:|\n---)", txt, re.S | re.M)
    return m.group(1) if m else txt[:1500]


def catalog():
    reg = json.load(open(REPO / "skills/registry.json"))
    items = reg if isinstance(reg, list) else reg.get("skills", reg)
    if isinstance(items, dict):
        items = [{"name": k, **v} for k, v in items.items()]
    out = []
    for s in items:
        if s.get("source") == "external" or s.get("skill_md", "").startswith("skills/development/"):
            continue
        desc = _frontmatter_desc(REPO / s["skill_md"]) if s.get("skill_md") else ""
        if "Deprecated" in desc[:40]:
            continue
        out.append({"kind": "skill", "name": s["name"], "text": " ".join([s["name"].replace("-", " "), " ".join(s.get("aliases", [])), desc])})
    jdir = REPO / "jobs/Scheduled"
    for j in sorted(p for p in jdir.iterdir() if p.is_dir()):
        md = j / "SKILL.md"
        body = md.read_text()[:2500] if md.exists() else ""
        out.append({"kind": "job", "name": j.name, "text": j.name.replace("-", " ") + " " + body})
    return out


def map_framework(fw, cat=None, top=6):
    cat = cat or catalog()
    q = Counter(_tok(" ".join(str(fw.get(k, "")) for k in ("name", "trigger", "inputs", "checks", "action", "cadence", "topic"))))
    scored = []
    for c in cat:
        ct = Counter(_tok(c["text"]))
        overlap = sum(min(q[w], ct[w]) for w in q)
        if overlap:
            scored.append({"kind": c["kind"], "name": c["name"], "score": overlap, "shared": [w for w, _ in (q & ct).most_common(6)]})
    scored.sort(key=lambda x: -x["score"])
    skills = [s for s in scored if s["kind"] == "skill"][:top]
    jobs = [s for s in scored if s["kind"] == "job"][: max(3, top // 2)]
    return {"framework": fw.get("id") or fw.get("name"), "candidateSkills": skills, "candidateJobs": jobs,
            "note": "Candidates only — keyword overlap. The agent proposes enhance-existing / new-skill / new-routine; Darshan approves (gate G4)."}
