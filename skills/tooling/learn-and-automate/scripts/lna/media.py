"""Tweet-image pipeline (zero LLM): collect photos -> download -> local OCR (tesseract) -> triage.
GIFs and videos are ignored by design. Index is keyed per handle so concurrent runs never collide:
  data/runs/learn-and-automate/_media/<handle>.index.jsonl  (derived, expensive -> kept in runs/)
  data/cache/learn-and-automate/media/<handle>/<imgid>.jpg    (re-fetchable -> cache/)
cls: text   = OCR found a text-heavy image (framework/table/screenshot) -> OCR text is the content
     chart  = few words (axis labels, tickers) -> needs the vision pass (agent) for the pattern
     photo  = almost no text (meme/photo) -> ignored
"""
import json
import re
import subprocess
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .common import data_root, read_jsonl, source_lock, write_jsonl
from . import sources

TEXT_WORDS, CHART_WORDS = 40, 8


def _dirs(handle):
    h = handle.lower().lstrip("@")
    idx = data_root() / "runs" / "learn-and-automate" / "_media"
    idx.mkdir(parents=True, exist_ok=True)
    img = data_root() / "cache" / "learn-and-automate" / "media" / h
    img.mkdir(parents=True, exist_ok=True)
    return h, idx / f"{h}.index.jsonl", img


def _imgid(url):
    return re.sub(r"[^A-Za-z0-9_-]", "", url.rsplit("/", 1)[-1].split(".")[0].split("?")[0])


def load_index(handle):
    _, path, _ = _dirs(handle)
    return {r["url"]: r for r in read_jsonl(path)}


def _save(handle, recs):
    h, path, _ = _dirs(handle)
    with source_lock(f"media:{h}"):
        write_jsonl(path, sorted(recs.values(), key=lambda r: (r.get("date") or "", r["url"])))


def collect(handle):
    """Add every photo of every doc (all kinds) of @handle to the index (idempotent)."""
    recs = load_index(handle)
    new = 0
    for d in sources.load(f"x:{handle}"):
        for u in d.get("mediaUrls") or []:
            if u not in recs:
                recs[u] = {"url": u, "docId": d["docId"], "handle": handle, "date": d.get("date"), "likes": d.get("likes", 0), "tweet": (d.get("text") or "")[:200], "cls": None}
                new += 1
    _save(handle, recs)
    return {"handle": handle, "images": len(recs), "new": new}


def _dl(u, dest, timeout):
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        with urllib.request.urlopen(u + ("&" if "?" in u else "?") + "format=jpg&name=large", timeout=timeout) as r:
            dest.write_bytes(r.read())
        return True
    except Exception:
        return False


def fetch(handle, limit=None, workers=8, timeout=25):
    h, _, img = _dirs(handle)
    recs = load_index(handle)
    todo = [r for r in recs.values() if not (img / f"{_imgid(r['url'])}.jpg").exists()]
    todo = todo[:limit] if limit else todo
    with ThreadPoolExecutor(workers) as ex:
        res = list(ex.map(lambda r: _dl(r["url"], img / f"{_imgid(r['url'])}.jpg", timeout), todo))
    return {"handle": handle, "attempted": len(todo), "ok": sum(res), "failed": len(res) - sum(res)}


def _ocr_one(path):
    try:
        out = subprocess.run(["tesseract", str(path), "stdout", "-l", "eng", "--psm", "3"], capture_output=True, text=True, timeout=90, env={**__import__("os").environ, "OMP_THREAD_LIMIT": "1"}).stdout
    except Exception:
        return None
    return out


def ocr(handle, limit=None, workers=4):
    h, _, img = _dirs(handle)
    recs = load_index(handle)
    todo = [r for r in recs.values() if r.get("cls") is None and (img / f"{_imgid(r['url'])}.jpg").exists()]
    todo.sort(key=lambda r: -(r.get("likes") or 0))  # most-liked first: diminishing returns in the tail
    todo = todo[:limit] if limit else todo

    def work(r):
        t = _ocr_one(img / f"{_imgid(r['url'])}.jpg")
        return r["url"], t

    done = 0
    for i in range(0, len(todo), 25):  # save every 100 so a killed run loses little
        with ThreadPoolExecutor(workers) as ex:
            results = list(ex.map(work, todo[i:i + 25]))
        for u, t in results:
            r = recs[u]
            if t is None:
                r["cls"] = "fail"
                continue
            t = re.sub(r"[ \t]+", " ", t).strip()
            words = len(re.findall(r"[A-Za-z]{3,}", t))
            r["ocrWords"] = words
            r["ocrText"] = t[:6000] if words >= CHART_WORDS else ""
            r["cls"] = "text" if words >= TEXT_WORDS else "chart" if words >= CHART_WORDS else "photo"
        done += len(results)
        _save(handle, recs)
    _save(handle, recs)
    return {"handle": handle, "ocred": done, "byCls": _count(recs)}


def _count(recs):
    c = {}
    for r in recs.values():
        c[r.get("cls")] = c.get(r.get("cls"), 0) + 1
    return c


def status(handle):
    h, _, img = _dirs(handle)
    recs = load_index(handle)
    return {"handle": handle, "images": len(recs), "downloaded": sum((img / f"{_imgid(u)}.jpg").exists() for u in recs), "byCls": _count(recs), "visionDone": sum(1 for r in recs.values() if r.get("visionText"))}


def text_by_doc(handle):
    """docId -> concatenated image text (OCR for 'text' class, agent description for charts)."""
    out = {}
    for r in load_index(handle).values():
        t = r.get("visionText") or (r.get("ocrText") if r.get("cls") == "text" else "")
        if t:
            out.setdefault(r["docId"], []).append(t)
    return {k: "\n---\n".join(v) for k, v in out.items()}
