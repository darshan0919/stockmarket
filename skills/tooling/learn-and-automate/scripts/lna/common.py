"""Shared paths, keyed state, locking and JSONL I/O for learn-and-automate."""
import hashlib
import json
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path

REPO = Path(__file__).resolve().parents[5]
SKILL = "learn-and-automate"
COLLECTION = "knowledge-units"


def data_root():
    return Path(os.environ.get("DATA_V2_DIR") or REPO / "data")


def slug(source_key):
    return re.sub(r"[^a-z0-9]+", "-", source_key.lower()).strip("-")


def run_dir(source_key):
    d = data_root() / "runs" / SKILL / slug(source_key)
    d.mkdir(parents=True, exist_ok=True)
    return d


def sha8(*parts):
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:8]


def read_jsonl(path):
    path = Path(path)
    if not path.exists():
        return []
    out = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def write_jsonl(path, rows):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp{os.getpid()}")
    with tmp.open("w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    os.replace(tmp, path)


def write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp{os.getpid()}")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2))
    os.replace(tmp, path)


def read_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text())


@contextmanager
def source_lock(source_key):
    """Per-source exclusive lock (fcntl.flock on a persistent file — delete-free).
    Different source keys never block each other; the OS releases the lock if the process dies."""
    import fcntl

    lock = run_dir(source_key) / ".lock"
    with open(lock, "a+") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def load_state(source_key):
    return read_json(run_dir(source_key) / "state.json", default={"sourceKey": source_key, "phases": {}, "chunksDone": [], "modules": {}})


def save_state(source_key, state):
    state["sourceKey"] = source_key
    write_json(run_dir(source_key) / "state.json", state)


def mark_phase(source_key, phase, **info):
    with source_lock(source_key):
        st = load_state(source_key)
        st["phases"][phase] = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), **info}
        save_state(source_key, st)
    return st


def load_collection():
    """Read-only view of the knowledge-units collection (writes go through persist.js / db.js)."""
    return read_json(data_root() / f"{COLLECTION}.json", default={}) or {}


def units_for(source_key, types=("kb-unit",)):
    return [r for r in load_collection().values() if r.get("sourceKey") == source_key and r.get("type") in types]
