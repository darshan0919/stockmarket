#!/usr/bin/env python3
"""Build the case list for backtesting J-curve stage tags: company + first-mention date + stage + trigger.
Prices are NOT fetched here (needs Stockscans/NSE symbol mapping) — output is the input for that step.
Usage: jcurve_backtest_prep.py [--source x-sureshkbn]"""
import argparse, json, csv, pathlib
ap = argparse.ArgumentParser(); ap.add_argument("--source", default="x-sureshkbn"); a = ap.parse_args()
d = pathlib.Path("data/runs/learn-and-automate") / a.source / "topics/jcurve"
rows = []
for l in open(d / "units.persist.jsonl"):
    u = json.loads(l)
    if u.get("jcurveKind") != "case" or not u.get("company"): continue
    c = u["citations"][0]
    rows.append({"unitId": u["id"], "company": u["company"], "mentionDate": c["date"], "stage": u.get("stage"),
                 "triggerType": u.get("triggerType"), "url": c.get("url"), "symbol": "", "priceAtMention": "", "ret6m": "", "ret12m": ""})
rows.sort(key=lambda r: r["mentionDate"])
out = d / "backtest_cases.csv"
with open(out, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
print(json.dumps({"cases": len(rows), "withStage": sum(1 for r in rows if r["stage"] not in (None, "n/a")), "out": str(out)}))
