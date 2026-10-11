#!/usr/bin/env python3
"""Attach agent chart descriptions to the media index (zero LLM). Input JSONL lines {url, visionText, modelUsed}.
Usage: vision_apply.py --handle thechartist26 --file results.jsonl [--file ...]. Stored as inferred (never his claim)."""
import argparse, json, pathlib, sys
ap = argparse.ArgumentParser(); ap.add_argument("--handle", required=True); ap.add_argument("--file", action="append", required=True)
a = ap.parse_args()
p = pathlib.Path(f"data/runs/learn-and-automate/_media/{a.handle}.index.jsonl")
recs = [json.loads(l) for l in open(p)]
by = {r["url"]: r for r in recs}
n = bad = 0
for f in a.file:
    for l in open(f):
        l = l.strip()
        if not l: continue
        try: o = json.loads(l)
        except Exception: bad += 1; continue
        r = by.get(o.get("url"))
        t = (o.get("visionText") or "").strip()
        if r is None or len(t) < 20: bad += 1; continue
        r["visionText"] = t[:1500]; r["visionModel"] = o.get("modelUsed", "unknown"); r["visionKind"] = "inferred"; n += 1
p.write_text("".join(json.dumps(r) + "\n" for r in recs))
print(json.dumps({"applied": n, "skipped": bad}))
