#!/usr/bin/env python3
"""Build a kb-framework persist record for a merged topic playbook (zero LLM).
Usage: framework_persist.py --topic valuation --meta <meta.json> --src <framework.src.md> [--sources x-a,x-b]
meta.json: {name, trigger, inputs[], checks[], action, cadence, validation{}, platformReuse{}, conflicts[], openQuestions[], reviewState}
derivedFrom = unit ids resolved from the [[xxxxxxxx]] markers. Output: <src dir>/framework.persist.jsonl"""
import argparse, json, re, pathlib
ap = argparse.ArgumentParser()
ap.add_argument("--topic", required=True); ap.add_argument("--meta", required=True); ap.add_argument("--src", required=True)
ap.add_argument("--sources", default="x-sureshkbn,x-shashank1171,x-ishmohit1,x-thechartist26")
ap.add_argument("--slug", default=None, help="id slug (default <topic>-playbook)")
ap.add_argument("--source-key", default="x:soic-handles")
a = ap.parse_args()
meta = json.load(open(a.meta)); full = {}
for s in a.sources.split(","):
    p = pathlib.Path("data/runs/learn-and-automate") / s / "topics" / a.topic / "units.persist.jsonl"
    if p.exists():
        for l in open(p):
            u = json.loads(l); full[u["id"][-8:]] = u["id"]
ids = list(dict.fromkeys(re.findall(r"\[\[([0-9a-f]{8})\]\]", open(a.src).read())))
slug = a.slug or f"{a.topic}-playbook"
rec = {"id": f"kbf_{a.source_key.replace(chr(58), chr(45))}_{slug}", "type": "kb-framework", "sourceKey": a.source_key, "topic": a.topic,
       "derivedFrom": [full[i] for i in ids if i in full], "status": "draft", "modelUsed": "claude-sonnet-5-5"}
rec.update(meta)
out = pathlib.Path(a.src).parent / "framework.persist.jsonl"
out.write_text(json.dumps(rec) + "\n")
print(json.dumps({"out": str(out), "derivedFrom": len(rec["derivedFrom"])}))
