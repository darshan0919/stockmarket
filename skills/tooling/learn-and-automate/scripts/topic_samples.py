#!/usr/bin/env python3
"""Top-liked sample posts per audit topic per handle (zero LLM) - grounding for taxonomy drafting.
Usage: topic_samples.py --per 6 --out file.md [--topics a,b]"""
import argparse, glob, json, re, sys
from pathlib import Path
REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lna import media
ap = argparse.ArgumentParser(); ap.add_argument("--per", type=int, default=6); ap.add_argument("--out", required=True); ap.add_argument("--topics"); ap.add_argument("--minkw", type=int, default=2)
a = ap.parse_args()
T = json.load(open(REPO / "skills/tooling/learn-and-automate/references/audit_topics.json"))
T = {k: re.compile(r"(?<![a-z0-9])(?:" + "|".join(re.escape(w) for w in v) + r")(?![a-z0-9])", re.I) for k, v in T.items() if not k.startswith("_")}
if a.topics: T = {k: v for k, v in T.items() if k in a.topics.split(",")}
H = ["SureshKBN", "Shashank1171", "ishmohit1", "thechartist26"]
img = {h: media.text_by_doc(h) for h in H}
best = {t: {h: [] for h in H} for t in T}
seen = set()
for f in glob.glob(str(REPO / "data/x-posts/*.jsonl")):
    for l in open(f):
        l = l.strip()
        if not l: continue
        d = json.loads(l)
        h = d["handle"]
        if h not in H or d["id"] in seen or d.get("kind") == "repost": continue
        seen.add(d["id"])
        txt = (d.get("text") or "") + " " + img[h].get(d["id"], "")[:1500]
        lk = (d.get("metrics") or {}).get("likes", 0)
        for t, r in T.items():
            nk = len({m.group(0).lower() for m in r.finditer(txt)})
            if nk >= a.minkw and len(txt) > 200 and d.get("kind") != "reply":
                best[t][h].append((nk * 100 + lk, d, img[h].get(d["id"], "")))
out = []
for t in T:
    out.append(f"\n## {t}")
    for h in H:
        for lk, d, it in sorted(best[t][h], key=lambda x: -x[0])[: a.per]:
            s = re.sub(r"\s+", " ", d["text"])[:230]
            if it: s += " [IMG] " + re.sub(r"\s+", " ", it)[:260]
            out.append(f"- {h} {d['publishedAt'][:10]} kw+♥{lk} {d['url']}: {s}")
Path(a.out).write_text("\n".join(out))
print(len(out), "lines")
