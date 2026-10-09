#!/usr/bin/env python3
"""OCR benchmark: tesseract (local, zero LLM) vs an external OCR (e.g. Gemini, pasted back by the user).

  ocr_benchmark.py prepare [--n 60] [--seed 42]   pick a stratified sample, run tesseract on it (full text),
                                                  copy images to <bench>/batch_k/NNN.jpg (10 per batch)
  ocr_benchmark.py status                         show whether <bench>/gemini.jsonl is present / how many ids
Compare step is run later on request (reads tesseract.jsonl + gemini.jsonl).

Layout: data/runs/learn-and-automate/_ocr_benchmark/{sample.json,tesseract.jsonl,gemini.jsonl,batch_k/}
"""
import argparse, json, random, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
BENCH = ROOT / "data/runs/learn-and-automate/_ocr_benchmark"
MEDIA = ROOT / "data/runs/learn-and-automate/_media"
CACHE = ROOT / "data/cache/learn-and-automate/media"
HANDLES = ["shashank1171", "ishmohit1", "thechartist26", "sureshkbn"]
sys.path.insert(0, str(Path(__file__).parent))
from lna.media import _imgid  # noqa: E402


def words(t):
    return len(re.findall(r"[A-Za-z]{3,}", t))


def tess(path):
    return subprocess.run(["tesseract", str(path), "stdout", "-l", "eng", "--psm", "3"], capture_output=True, text=True, timeout=90).stdout


def prepare(n, seed):
    pool = []
    for h in HANDLES:
        idx = MEDIA / f"{h}.index.jsonl"
        if not idx.exists():
            continue
        for line in idx.read_text().splitlines():
            try:
                r = json.loads(line)
            except ValueError:  # index may be mid-rewrite by a running img-ocr
                continue
            p = CACHE / h / f"{_imgid(r['url'])}.jpg"
            if p.exists():
                pool.append((h, r["url"], p))
    rnd = random.Random(seed)
    rnd.shuffle(pool)
    buckets = {"text-heavy": [], "mid": [], "low-text": []}
    per = n // 3
    for h, u, p in pool:
        if all(len(v) >= per for v in buckets.values()):
            break
        t = tess(p)
        w = words(t)
        k = "text-heavy" if w >= 40 else "mid" if w >= 8 else "low-text"
        if len(buckets[k]) < per:
            buckets[k].append({"handle": h, "url": u, "path": str(p), "tessWords": w, "tessText": re.sub(r"[ \t]+", " ", t).strip()})
    sample = [dict(x, stratum=k) for k, v in buckets.items() for x in v]
    rnd.shuffle(sample)
    if BENCH.exists():
        shutil.rmtree(BENCH)
    BENCH.mkdir(parents=True)
    for i, s in enumerate(sample, 1):
        s["id"] = f"{i:03d}"
        b = BENCH / f"batch_{(i - 1) // 10 + 1}"
        b.mkdir(exist_ok=True)
        shutil.copy(s["path"], b / f"{s['id']}.jpg")
    (BENCH / "sample.json").write_text(json.dumps([{k: v for k, v in s.items() if k not in ("tessText",)} for s in sample], indent=1))
    with open(BENCH / "tesseract.jsonl", "w") as f:
        for s in sample:
            f.write(json.dumps({"id": s["id"], "text": s["tessText"]}) + "\n")
    print(json.dumps({"bench": str(BENCH), "n": len(sample), "strata": {k: len(v) for k, v in buckets.items()}, "batches": (len(sample) + 9) // 10}))


def status():
    g = BENCH / "gemini.jsonl"
    ids = [json.loads(l)["id"] for l in g.read_text().splitlines() if l.strip()] if g.exists() else []
    print(json.dumps({"geminiFile": g.exists(), "geminiIds": len(ids)}))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["prepare", "status"])
    ap.add_argument("--n", type=int, default=60)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    prepare(a.n, a.seed) if a.cmd == "prepare" else status()
