#!/usr/bin/env python3
"""Apply the author-rank rule to the CONFLICT bullets of merged playbooks (zero LLM).
For each bullet in a 'Conflicts' section of framework.src.md, collect cited [[8hex]] unit ids, map to authors, and when
>=2 different author ranks appear, mark units from the strictly lowest-ranked author(s) 'unsure' (note auto:conflict:<bullet>).
Only touches units whose userStance is null or was set by 'auto-author-rank' (never a human stance).
Rank: sureshkbn 1 > ishmohit1 2 > shashank1171 3 > thechartist26 4 (teaching = 0).
Usage: conflict_stance.py --src a/framework.src.md [--src b/...] --out patch.jsonl"""
import argparse, json, re
ap = argparse.ArgumentParser(); ap.add_argument("--src", action="append", required=True); ap.add_argument("--out", required=True)
a = ap.parse_args()
RANK = {"sureshkbn": 1, "ishmohit1": 2, "shashank1171": 3, "thechartist26": 4}
d = json.load(open("data/knowledge-units.json"))
recs = d if isinstance(d, list) else list(d.values())
by = {r["id"][-8:]: r for r in recs if isinstance(r, dict) and r.get("type") == "kb-unit"}
def rank(r):
    sk = r.get("sourceKey", "")
    return RANK.get(sk[2:], 5) if sk.startswith("x:") else 0
out, seen, bullets = [], set(), 0
for src in a.src:
    in_c = False
    for line in open(src, encoding="utf-8"):
        if line.startswith("## "): in_c = "onflict" in line
        if not in_c or not re.match(r"\s*(-|\d+\.)\s", line): continue
        ids = [i for i in re.findall(r"\[\[([0-9a-f]{8})\]\]", line) if i in by]
        ranks = {i: rank(by[i]) for i in ids}
        if len(set(ranks.values())) < 2: continue
        bullets += 1
        low = max(ranks.values()); label = re.sub(r"\[\[.*?\]\]|\s+", " ", line.strip("-0123456789. \n"))[:60].strip()
        for i, rk in ranks.items():
            r = by[i]
            if rk != low or i in seen: continue
            if r.get("userStance") and r.get("stanceBy") != "auto-author-rank": continue
            seen.add(i)
            out.append({"id": r["id"], "type": "kb-unit", "sourceKey": r["sourceKey"], "userStance": "unsure",
                        "userNote": f"auto:rank{rk},conflict:{label}", "stanceBy": "auto-author-rank"})
open(a.out, "w").write("".join(json.dumps(x) + "\n" for x in out))
print(json.dumps({"conflictBulletsWithRankSplit": bullets, "unitsToUnsure": len(out)}))
