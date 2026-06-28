#!/usr/bin/env python3
"""
gainers_classifier.py — v1
Task: daily-gainers-signal  (Step 2 companion script)
Purpose: Deterministically classify each gainer from _gainers_raw.json
         into FUNDAMENTAL / SECTOR_CATALYST / PRICE_ACTION / VOLATILITY,
         score conviction, build evidence (including announcements + delivery),
         and write _insights.json.

Usage:
  python3 gainers_classifier.py                       # uses latest raw file
  python3 gainers_classifier.py --date 2026-06-23     # explicit date
"""

import json
import sys
import argparse
import datetime as dt
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "daily_gainers"

MATERIAL_KEYWORDS = {
    "order", "contract", "win", "award",
    "result", "profit", "revenue", "pat",
    "fda", "pli", "capacity", "expansion",
    "merger", "acquisition", "demerger",
    "buyback", "qip", "preferential", "warrant",
    "stake", "sast",
}


def is_material(ann: dict) -> bool:
    text = (ann.get("subject", "") + " " + ann.get("description", "")).lower()
    return any(kw in text for kw in MATERIAL_KEYWORDS)


def classify(g: dict, market_date_str: str) -> dict:
    """Return classification dict for a single gainer."""
    ticker   = g["ticker"]
    r1d      = g["return_1d"]
    ps       = g.get("price_signals", {})
    deliv    = g.get("delivery", {})
    anns     = g.get("announcements", [])
    sb       = g.get("sector_breadth", {})

    vol_spike    = ps.get("vol_spike_ratio") or 0
    near_breakout = ps.get("near_high_breakout", False)
    pct_in_range  = ps.get("pct_in_20d_range") or 0
    deliv_per     = deliv.get("deliv_per")
    deliv_avail   = deliv.get("available", False)
    deliv_source  = deliv.get("source", "")
    sector_move   = g.get("sector_broad_move", False)
    sector_avg    = sb.get("avg_return_1d", 0) or 0
    sector_breadth_pct = sb.get("pct_up", 0) or 0

    # --- Build evidence list (always includes what we know) ---
    evidence = []

    # Announcements first
    market_dt = dt.date.fromisoformat(market_date_str)
    recent_material_anns = []
    for ann in anns:
        ann_date_str = (ann.get("date") or "")[:10]
        try:
            ann_dt = dt.date.fromisoformat(ann_date_str)
            days_ago = (market_dt - ann_dt).days
        except ValueError:
            days_ago = 999

        mat = is_material(ann)
        subj = ann.get("subject", "").strip()[:120]
        tag = "📋" if mat else "📄"
        age_str = f"{days_ago}d ago" if days_ago < 30 else ann_date_str
        evidence.append(f"{tag} Ann ({age_str}): {subj}")
        if mat and days_ago <= 3:
            recent_material_anns.append(ann)

    # Delivery
    if deliv_avail and deliv_per is not None:
        src_tag = "NSE" if deliv_source == "nse_api" else "BSE"
        high_tag = " ✓ high" if (deliv_per >= 50) else ""
        evidence.append(f"Delivery [{src_tag}]: {deliv_per:.1f}%{high_tag}")
        if deliv.get("deliv_value_cr"):
            evidence.append(f"Delivery value: ₹{deliv['deliv_value_cr']:.1f} Cr")
    else:
        evidence.append("Delivery: unavailable")

    # Price signals
    if vol_spike:
        evidence.append(f"Vol spike: {vol_spike:.1f}× 20-day avg")
    if near_breakout:
        evidence.append(f"Near window high: {ps.get('pct_from_window_high', 0):.1f}% from high")
    if pct_in_range >= 80:
        evidence.append(f"Range position: {pct_in_range:.0f}th pctile of 20d range")

    # Sector
    if sector_move:
        evidence.append(
            f"Sector breadth: {sector_breadth_pct:.0f}% of industry up "
            f"(avg +{sector_avg:.1f}%)"
        )

    evidence.append(f"Return: +{r1d:.2f}%")

    # --- Classify ---
    driver     = "VOLATILITY"
    conviction = None
    in_email   = False
    exclusion  = ""

    # 1. FUNDAMENTAL
    if recent_material_anns:
        driver = "FUNDAMENTAL"
        corr = len(recent_material_anns)
        if deliv_avail and (deliv_per or 0) >= 40:
            corr += 1
        if vol_spike >= 2:
            corr += 1
        conviction = "HIGH" if corr >= 2 else "MEDIUM"
        in_email = True

    # 2. SECTOR_CATALYST
    elif (sector_move
          and sector_avg > 1.5
          and sector_breadth_pct >= 50
          and r1d <= sector_avg * 1.5):
        driver = "SECTOR_CATALYST"
        conviction = "HIGH" if sector_breadth_pct >= 60 else "MEDIUM"
        in_email = True

    # 3. PRICE_ACTION
    else:
        # Hard exclude: delivery confirmed below threshold
        deliv_ok = (
            (deliv_avail and deliv_per is not None and deliv_per >= 40)
            or (not deliv_avail and vol_spike >= 2.0)   # no data → need strong vol spike
        )
        deliv_fail = deliv_avail and deliv_per is not None and deliv_per < 40

        price_signals = []
        if vol_spike >= 2.0:
            price_signals.append("vol_spike")
        if near_breakout:
            price_signals.append("near_breakout")
        if pct_in_range >= 80:
            price_signals.append("high_range")

        if r1d < 3:
            exclusion = "return < 3%"
        elif deliv_fail:
            exclusion = f"delivery {deliv_per:.1f}% < 40% — likely intraday"
        elif not price_signals:
            exclusion = "no qualifying price signal"
        elif not deliv_ok:
            exclusion = "delivery unavailable & vol spike < 2× — too ambiguous"
        else:
            driver = "PRICE_ACTION"
            # Conviction: count confirmed signals
            corr = len(price_signals)
            if deliv_avail and (deliv_per or 0) >= 50:
                corr += 1  # high confirmed delivery is a bonus point
            if not deliv_avail:
                # cap at MEDIUM when delivery unconfirmed
                conviction = "MEDIUM" if corr >= 2 else "LOW"
            else:
                conviction = "HIGH" if corr >= 2 else "MEDIUM"

            if conviction == "LOW":
                in_email = False
                exclusion = "LOW conviction"
            else:
                in_email = True

    return {
        "ticker":        ticker,
        "name":          g["name"],
        "industry":      g["industry"],
        "return_1d":     r1d,
        "primary_driver": driver,
        "conviction":    conviction,
        "in_email":      in_email,
        "evidence":      evidence,
        "exclusion_reason": exclusion,
    }


def main(market_date: dt.date | None = None):
    if market_date is None:
        # Find latest raw file
        files = sorted(OUTPUT_DIR.glob("*_gainers_raw.json"), reverse=True)
        if not files:
            print("[classifier] No raw file found", file=sys.stderr)
            sys.exit(1)
        raw_path = files[0]
    else:
        raw_path = OUTPUT_DIR / f"{market_date.isoformat()}_gainers_raw.json"

    with open(raw_path) as f:
        raw = json.load(f)

    market_date_str = raw["market_date"]
    gainers         = raw.get("gainers", [])
    now_ist = dt.datetime.now(
        dt.timezone(dt.timedelta(hours=5, minutes=30))
    ).isoformat()

    signals = [classify(g, market_date_str) for g in gainers]

    # Sector catalyst grouping
    sector_cat_map: dict[str, list] = {}
    for s in signals:
        if s["primary_driver"] == "SECTOR_CATALYST":
            ind = s["industry"] or "Unknown"
            sector_cat_map.setdefault(ind, []).append(s["ticker"])

    sector_catalysts = []
    for ind, tickers in sector_cat_map.items():
        sb = next(
            (g.get("sector_breadth", {}) for g in gainers if g.get("industry") == ind), {}
        )
        sector_catalysts.append({
            "industry":         ind,
            "thesis":           f"Broad buying in {ind} — {sb.get('pct_up', 0):.0f}% of stocks up, avg +{sb.get('avg_return_1d', 0):.1f}%",
            "avg_return":       sb.get("avg_return_1d", 0),
            "breadth_pct":      sb.get("pct_up", 0),
            "affected_gainers": tickers,
        })

    in_email = [s for s in signals if s["in_email"]]
    summary = {
        "total_analyzed":       len(signals),
        "fundamental_movers":   sum(1 for s in signals if s["primary_driver"] == "FUNDAMENTAL"),
        "sector_catalysts":     sum(1 for s in signals if s["primary_driver"] == "SECTOR_CATALYST"),
        "price_action_breakouts": sum(1 for s in signals if s["primary_driver"] == "PRICE_ACTION"),
        "noise_excluded":       sum(1 for s in signals if s["primary_driver"] == "VOLATILITY"),
        "in_email":             len(in_email),
    }

    insights = {
        "schema_version":  "1.1",
        "market_date":     market_date_str,
        "generated_at_ist": now_ist,
        "summary":         summary,
        "signals":         signals,
        "sector_catalysts": sector_catalysts,
    }

    out_path = OUTPUT_DIR / f"{market_date_str}_insights.json"
    with open(out_path, "w") as f:
        json.dump(insights, f, indent=2)

    print(f"[classifier] Written → {out_path}", file=sys.stderr)
    print(f"[classifier] {summary['total_analyzed']} analyzed, "
          f"{summary['in_email']} in email "
          f"({summary['fundamental_movers']} fundamental, "
          f"{summary['price_action_breakouts']} price_action, "
          f"{summary['noise_excluded']} noise)", file=sys.stderr)

    # Stdout → consumed by task prompt Step 3 (email)
    print(json.dumps(insights, default=str))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Override market date YYYY-MM-DD")
    args = parser.parse_args()
    override = dt.date.fromisoformat(args.date) if args.date else None
    main(override)
