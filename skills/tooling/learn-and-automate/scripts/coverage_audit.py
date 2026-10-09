#!/usr/bin/env python3
"""P0 coverage audit (zero LLM). Matrix: topic x source (X handles, Learnyst, YouTube) + image census.
Usage: python3 coverage_audit.py [--out data/runs/learn-and-automate/_audit]
"""
import argparse, glob, json, re, collections
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
HANDLES = ["SureshKBN", "Shashank1171", "ishmohit1", "thechartist26"]

def rx(words):
    return re.compile(r"(?<![a-z0-9])(?:" + "|".join(re.escape(w) for w in words) + r")(?![a-z0-9])", re.I)

def jl(path):
    with open(path) as f:
        for l in f:
            l = l.strip()
            if l:
                yield json.loads(l)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPO / "data/runs/learn-and-automate/_audit"))
    a = ap.parse_args()
    topics = json.load(open(REPO / "skills/tooling/learn-and-automate/references/audit_topics.json"))
    topics = {k: rx(v) for k, v in topics.items() if not k.startswith("_")}
    res = collections.defaultdict(lambda: collections.defaultdict(int))
    census = collections.defaultdict(lambda: collections.defaultdict(int))
    for f in glob.glob(str(REPO / "data/x-posts/*.jsonl")):
        for d in jl(f):
            h = d["handle"]
            if h not in HANDLES:
                continue
            txt = (d.get("text") or "") + " " + ((d.get("context") or {}).get("text") or "")
            c = census[h]
            c["docs"] += 1
            c["kind_" + d.get("kind", "?")] += 1
            c["year_" + (d.get("publishedAt") or "????")[:4]] += 1
            photos = [m for m in d.get("media") or [] if m.get("type") == "photo"]
            c["photos"] += len(photos)
            c["docs_with_photo"] += bool(photos)
            c["gifs_ignored"] += sum(m.get("type") == "animated_gif" for m in d.get("media") or [])
            c["videos_ignored"] += sum(m.get("type") == "video" for m in d.get("media") or [])
            if len(txt) < 40 and not photos:
                continue
            for t, r in topics.items():
                if r.search(txt):
                    res[h][t] += 1
                    res[h][t + "|photo"] += bool(photos)
    # Learnyst
    ly_tot = ly_tx = 0
    for f in glob.glob(str(REPO / "data/learnyst-lessons/*.jsonl")):
        for d in jl(f):
            ly_tot += 1
            tx = d.get("transcriptPlain") or ""
            if tx:
                ly_tx += 1
                for t, r in topics.items():
                    if r.search(tx):
                        res["Learnyst"][t] += 1
    yt_tot = 0
    for f in glob.glob(str(REPO / "data/youtube-transcripts/*.jsonl")):
        for d in jl(f):
            if d.get("channelTitle") != "SOIC":
                continue
            yt_tot += 1
            tx = d.get("transcriptPlain") or d.get("transcriptTimestamped") or ""
            for t, r in topics.items():
                if r.search(tx):
                    res["YouTube-SOIC"][t] += 1
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    js = {"census": {k: dict(v) for k, v in census.items()}, "topicHits": {k: dict(v) for k, v in res.items()},
          "learnyst": {"lessons": ly_tot, "withTranscript": ly_tx}, "youtubeSOIC": yt_tot}
    json.dump(js, open(out / "coverage.json", "w"), indent=1)
    cols = HANDLES + ["Learnyst", "YouTube-SOIC"]
    md = ["| topic | " + " | ".join(cols) + " |", "|---|" + "---|" * len(cols)]
    for t in topics:
        md.append(f"| {t} | " + " | ".join(str(res[c].get(t, 0)) for c in cols) + " |")
    md.append(""); md.append("| handle | docs | photos (to read) | gifs+videos (ignored) | first yr |"); md.append("|---|---|---|---|---|")
    for h in HANDLES:
        c = census[h]; yrs = sorted(k[5:] for k in c if k.startswith("year_"))
        md.append(f"| {h} | {c['docs']} | {c['photos']} | {c['gifs_ignored']+c['videos_ignored']} | {yrs[0]} |")
    md.append(f"\nLearnyst: {ly_tx}/{ly_tot} lessons have transcript text. YouTube SOIC videos: {yt_tot}.")
    (out / "coverage.md").write_text("\n".join(md))
    print("\n".join(md))

main()
