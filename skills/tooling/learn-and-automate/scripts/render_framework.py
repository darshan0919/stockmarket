#!/usr/bin/env python3
"""Resolve [[xxxxxxxx]] unit-id-suffix markers in a framework .src.md into dated, author-tagged tweet links.
Usage: render_framework.py --topic pead [--source x-sureshkbn[,x-other,...]] --src <file.src.md> --out <file.md>
Prints JSON {ids, missing, malformed, collisions, derivedFrom}. Exit 1 if any marker is unresolved, malformed or ambiguous."""
import argparse, json, re, pathlib, sys
ap = argparse.ArgumentParser()
ap.add_argument("--topic", required=True); ap.add_argument("--source", default="x-sureshkbn")
ap.add_argument("--src", required=True); ap.add_argument("--out", required=True)
a = ap.parse_args()
cit, full, tag, coll = {}, {}, {}, []
for source in a.source.split(","):
    d = pathlib.Path("data/runs/learn-and-automate") / source / "topics" / a.topic
    for l in open(d / "units.persist.jsonl"):
        u = json.loads(l); k = u["id"][-8:]
        if k in cit and full[k] != u["id"]:
            coll.append(k)
        cit[k] = u["citations"][0]; full[k] = u["id"]; tag[k] = source.replace("x-", "")[:4] if "," in a.source else ""
src = open(a.src).read()
ids = list(dict.fromkeys(re.findall(r"\[\[([0-9a-f]{8})\]\]", src)))
malformed = [m for m in re.findall(r"\[\[([^\]]*)\]\]", src) if not re.fullmatch(r"[0-9a-f]{8}", m)]
missing = [i for i in ids if i not in cit]
out = re.sub(r"\[\[([0-9a-f]{8})\]\]", lambda m: f"[{(tag[m.group(1)] + ' ') if tag.get(m.group(1)) else ''}{cit[m.group(1)]['date'][:7]}]({cit[m.group(1)]['url']})" if m.group(1) in cit else m.group(0), src)
pathlib.Path(a.out).write_text(out)
print(json.dumps({"ids": len(ids), "missing": missing, "malformed": malformed, "collisions": coll, "derivedFrom": [full[i] for i in ids if i in full]}))
sys.exit(1 if (missing or malformed or coll) else 0)
