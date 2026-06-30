#!/usr/bin/env python3
"""
Gainers classifier — deterministic, no external API calls.
Reads:  data/daily_gainers/{market_date}_gainers_raw.json
Writes: data/daily_gainers/{market_date}_insights.json

Classification logic:
  FUNDAMENTAL      — material announcement + decent delivery (>= 20%)
  SECTOR_CATALYST  — sector broad move (>= 3 gainers same industry + breadth)
  PRICE_ACTION     — high-delivery / vol-spike / breakout signal; or delivery >= 40%
  VOLATILITY       — everything else (low delivery, no signals, no announcement)

Conviction:
  HIGH   — primary driver is strong and corroborated
  MEDIUM — primary driver present but weakly corroborated
  LOW    — classification by elimination

in_email: HIGH or MEDIUM conviction only.
"""
import json, os, glob, sys
from pathlib import Path

DATA_DIR = Path(os.environ.get("COWORK_DATA_DIR", Path(__file__).parent))
GAINERS_DIR = DATA_DIR / "daily_gainers"

# ── helpers ─────────────────────────────────────────────────────────────────

def latest_raw(gainers_dir: Path):
    files = sorted(gainers_dir.glob("*_gainers_raw.json"))
    if not files:
        raise FileNotFoundError(f"No *_gainers_raw.json in {gainers_dir}")
    return files[-1]

def build_evidence(g: dict, sector_catalyst_industries: set) -> list[str]:
    ev = []
    # Announcements
    for ann in g.get("announcements", []):
        subj = ann.get("subject", "")
        cat  = ann.get("category", "")
        mat  = ann.get("material", False) or cat.lower() in ("board meeting", "result", "dividend", "acquisition", "merger", "ipo", "rights issue", "buyback")
        icon = "📋" if mat else "📄"
        ev.append(f"{icon} {subj[:120]}" if subj else f"{icon} {cat}")
    # Delivery
    deliv = g.get("delivery", {})
    if deliv.get("available"):
        src = deliv.get("source", "")
        tag = "[NSE]" if "nse" in src else "[BSE]"
        pct = deliv.get("deliv_per")
        if pct is not None:
            ev.append(f"Delivery {pct:.1f}% {tag}")
        if deliv.get("high_delivery"):
            ev.append("⚡ High-delivery flag")
    else:
        ev.append("⚠️ Delivery data unavailable — confirm on bseindia.com")
    # Price signals
    ps = g.get("price_signals", {})
    if "error" not in ps:
        if ps.get("vol_spike"):
            ev.append(f"🔊 Volume spike ({ps.get('vol_ratio',''):.1f}x avg)" if isinstance(ps.get('vol_ratio'), (int, float)) else "🔊 Volume spike")
        if ps.get("breakout_52w"):
            ev.append("🚀 52-week high breakout")
        if ps.get("above_200dma"):
            ev.append("📈 Above 200-DMA")
        if ps.get("rsi") and ps["rsi"] > 70:
            ev.append(f"RSI {ps['rsi']:.0f} (overbought)")
    else:
        ev.append("⚠️ Price-history signals unavailable")
    # Sector
    if g.get("industry") in sector_catalyst_industries:
        ev.append(f"🏭 Sector broad move: {g['industry']}")
    return ev

def classify(g: dict, sector_catalyst_industries: set) -> dict:
    deliv    = g.get("delivery", {})
    deliv_pct = deliv.get("deliv_per") if deliv.get("available") else None
    high_del  = deliv.get("high_delivery", False)
    has_mat   = g.get("has_material_ann", False)
    anns      = g.get("announcements", [])
    ps        = g.get("price_signals", {})
    ps_ok     = "error" not in ps
    vol_spike = ps.get("vol_spike", False) if ps_ok else False
    breakout  = ps.get("breakout_52w", False) if ps_ok else False
    above200  = ps.get("above_200dma", False) if ps_ok else False
    ret       = g.get("return_1d", 0)
    in_sector = g.get("industry") in sector_catalyst_industries

    # FUNDAMENTAL
    if has_mat and len(anns) > 0:
        conviction = "HIGH" if (high_del or (deliv_pct or 0) >= 30) else "MEDIUM"
        return dict(primary_driver="FUNDAMENTAL", conviction=conviction)

    # SECTOR_CATALYST
    if in_sector:
        conviction = "HIGH" if (high_del or (deliv_pct or 0) >= 30) else "MEDIUM"
        return dict(primary_driver="SECTOR_CATALYST", conviction=conviction)

    # PRICE_ACTION
    pa_signals = sum([high_del, vol_spike, breakout, above200, (deliv_pct or 0) >= 40])
    if pa_signals >= 2:
        return dict(primary_driver="PRICE_ACTION", conviction="HIGH")
    if pa_signals == 1 or (deliv_pct or 0) >= 25:
        return dict(primary_driver="PRICE_ACTION", conviction="MEDIUM")

    # VOLATILITY
    conviction = "LOW"
    return dict(primary_driver="VOLATILITY", conviction=conviction)

# ── main ─────────────────────────────────────────────────────────────────────

def main():
    raw_path = latest_raw(GAINERS_DIR)
    print(f"[classifier] reading {raw_path.name}", file=sys.stderr)

    with open(raw_path) as f:
        raw = json.load(f)

    market_date = raw["market_date"]
    gainers     = raw["gainers"]
    ind_summary = raw.get("industry_summary", {})

    # Identify sector-catalyst industries: >= 3 gainers + broad_move (or >= 3 gainers if breadth unavailable)
    sector_catalyst_industries = set()
    for ind, info in ind_summary.items():
        if info.get("gainer_count", 0) >= 3:
            sector_catalyst_industries.add(ind)

    signals = []
    for g in gainers:
        cls    = classify(g, sector_catalyst_industries)
        driver = cls["primary_driver"]
        conv   = cls["conviction"]
        ev     = build_evidence(g, sector_catalyst_industries)
        in_em  = conv in ("HIGH", "MEDIUM") and driver != "VOLATILITY"

        signals.append({
            "ticker":         g["ticker"],
            "name":           g["name"],
            "industry":       g.get("industry", ""),
            "return_1d":      g.get("return_1d"),
            "market_cap_cr":  g.get("market_cap_cr"),
            "primary_driver": driver,
            "conviction":     conv,
            "in_email":       in_em,
            "evidence":       ev,
            "delivery":       g.get("delivery", {}),
            "ann_count":      g.get("ann_count", 0),
            "has_material_ann": g.get("has_material_ann", False),
        })

    # Sector catalysts block
    sector_catalysts = {}
    for ind in sector_catalyst_industries:
        tickers = ind_summary[ind].get("gainer_tickers", [])
        returns = [g["return_1d"] for g in gainers if g["ticker"] in tickers]
        sector_catalysts[ind] = {
            "tickers": tickers,
            "avg_return": round(sum(returns) / len(returns), 2) if returns else 0,
        }

    total_analyzed = len(signals)
    in_email_count = sum(1 for s in signals if s["in_email"])
    noise_excluded = total_analyzed - in_email_count

    insights = {
        "schema_version":    "1.0",
        "market_date":       market_date,
        "total_analyzed":    total_analyzed,
        "in_email":          in_email_count,
        "noise_excluded":    noise_excluded,
        "ann_api_available": any(g.get("ann_count", 0) > 0 for g in gainers),
        "price_api_available": any("error" not in g.get("price_signals", {}) for g in gainers),
        "sector_catalysts":  sector_catalysts,
        "signals":           signals,
    }

    out_path = GAINERS_DIR / f"{market_date}_insights.json"
    with open(out_path, "w") as f:
        json.dump(insights, f, indent=2)

    print(f"[classifier] wrote {out_path.name}  ({total_analyzed} analyzed, {in_email_count} in email)", file=sys.stderr)

if __name__ == "__main__":
    main()
