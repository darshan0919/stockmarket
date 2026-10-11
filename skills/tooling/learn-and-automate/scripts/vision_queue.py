#!/usr/bin/env python3
"""Build chart-vision batches (zero LLM): chart-class, downloaded, not-yet-described images, most-liked first.
Usage: vision_queue.py --handles sureshkbn,ishmohit1,shashank1171,thechartist26 [--top 50] [--batch 25]
Writes data/runs/learn-and-automate/_media/vision/vb-<handle>-NN.json = {handle, items:[{url,imgid,path,tweet,likes,date}]}.
Apply agent output with vision_apply.py (idempotent)."""
import argparse, json, pathlib, re
ap = argparse.ArgumentParser(); ap.add_argument("--handles", required=True); ap.add_argument("--top", type=int, default=50); ap.add_argument("--batch", type=int, default=25)
ap.add_argument("--skip", type=int, default=0, help="skip the first N queued (already issued in earlier waves)")
a = ap.parse_args()
root = pathlib.Path("data")
out = root / "runs/learn-and-automate/_media/vision"; out.mkdir(parents=True, exist_ok=True)
imgid = lambda u: re.sub(r"[^A-Za-z0-9_-]", "", u.rsplit("/", 1)[-1].split(".")[0].split("?")[0])
summary = {}
for h in a.handles.split(","):
    idx = [json.loads(l) for l in open(root / f"runs/learn-and-automate/_media/{h}.index.jsonl")]
    d = root / f"cache/learn-and-automate/media/{h}"
    todo = [r for r in idx if r.get("cls") == "chart" and not r.get("visionText") and (d / f"{imgid(r['url'])}.jpg").exists()]
    todo.sort(key=lambda r: -(r.get("likes") or 0))
    todo = todo[a.skip:a.skip + a.top]
    n = 0
    for i in range(0, len(todo), a.batch):
        items = [{"url": r["url"], "imgid": imgid(r["url"]), "path": str((d / f"{imgid(r['url'])}.jpg").resolve()), "tweet": (r.get("tweet") or "")[:200], "likes": r.get("likes"), "date": r.get("date")} for r in todo[i:i + a.batch]]
        n += 1
        (out / f"vb-{h}-{a.skip // a.batch + n:02d}.json").write_text(json.dumps({"handle": h, "items": items}, indent=1))
    summary[h] = {"images": len(todo), "batches": n}
print(json.dumps(summary))
