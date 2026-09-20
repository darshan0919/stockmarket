#!/usr/bin/env python3
"""
Step 1b (deterministic, no LLM) for pead-surprise-ranker.

Turns each company's GUIDANCE (as structured `growth_inputs` the model wrote
in Step 1) plus its reported HISTORY (`stock-api/bin/company-financials.js`
output) into projected Revenue / Operating Profit (== EBITDA on Stockscans) /
PAT and the growth of each against three comparators -- so companies can be
ranked by who is promising the most bottom-line growth:

  QoQ    projected NEXT (not yet reported) quarter  vs  latest reported quarter
  YoY    projected next quarter                     vs  same quarter last year
  FYoFY  projected full guided FY                   vs  the previous full FY

The model supplies judgment (what management guided, how to phase it across
years/quarters); this script does the arithmetic so 100 companies are treated
identically. It never invents guidance: every number it had to assume is
listed in `growth.assumptions`, tagged [assumption] / [estimate].

Input --annotations: array, each item has `ticker` and (optionally)
  "growth_inputs": {
    "guided_fy": "FY27",                         # REQUIRED; FY the guidance is for
    "revenue": {                                 # ONE of:
        "growth_pct": 28.0,                      #   FY-on-FY growth (midpoint if a range)
        "fy_abs_cr": 2050,                       #   absolute FY revenue guided
        "year_path": {"base_fy": "FY26",         #   multi-year target, phased by YEAR first
                      "target_fy": "FY29",       #   (capacity go-live / ramp), see below
                      "target_revenue_cr": 3200,
                      "cumulative_share": {"FY27": 0.30, "FY28": 0.65, "FY29": 1.0}},
        "basis": "explicit" | "derived"          #   derived = you phased/inferred it
    },
    "operating_profit": {                        # optional; ONE of:
        "opm_pct": 12.5, "opm_delta_bps": 100,   #   FY OPM (absolute) / expansion vs base FY
        "growth_pct": 30, "fy_abs_cr": 260,      #   FY Operating Profit / EBITDA growth or level
        "basis": "explicit" | "derived"
    },
    "pat": {"growth_pct": 40, "fy_abs_cr": 150, "npm_pct": 7.5, "basis": "..."},   # optional
    "target_quarter": {"revenue_cr": 520, "opm_pct": 12.5, "pat_cr": 40},           # optional: only
                                                 # when management guided the NEXT QUARTER itself
    "quarter_weights": {"Q2": 0.24, "Q3": 0.26, "Q4": 0.30},   # optional: share of the REMAINING
                                                 # FY revenue per remaining quarter (renormalised);
                                                 # default = average seasonality of past full FYs
    "phasing_basis": "why these weights (capacity go-live, seasonality, order book)"
  }

year_path: revenue(FYk) = base_rev + (target_rev - base_rev) * cumulative_share[FYk].
The shares are YOUR judgment (e.g. back-ended if capacity goes live late).

Projection rules (all deterministic):
  * FY revenue = guided. YTD actuals (quarters of the guided FY already
    reported) are kept; REMAINING FY revenue = FY - YTD, phased over the
    remaining quarters by the weights above.
  * Operating profit: if the FY OPM / OP growth / OP level is guided, the
    FY total is fixed and REMAINING OP = FY OP - YTD OP (so an already-strong
    YTD is credited, not double counted). Not guided -> the latest reported
    quarter's OPM is held [assumption].
  * PAT margin per projected quarter = latest NPM + (OPM_q - latest OPM) *
    (1 - tax_rate)  [estimate: below-operating lines held at their latest %
    of revenue; tax rate = base FY tax / PBT]. Explicit PAT guidance overrides.
  * Deltas use the base as denominator; a non-positive base gives null +
    a flag (growth off a loss is meaningless), never a huge/negative %.
  * Banks/NBFCs (layout "financial"): Stockscans' "Financing Profit" is not
    an EBITDA analogue -> Operating-Profit deltas are null; Revenue and PAT
    only.
  * Guidance for a FY that is beyond the current FY (e.g. FY28 while FY27 is
    running) yields FY-level deltas only; quarterly deltas are null.

growth_score (0-100, a SORTING AID; the raw delta columns are the truth):
  per-cell score = clamp(delta / cap, 0, 1) * 100, caps: FYoFY 100%, YoY 100%,
  QoQ 25% (QoQ is seasonal -- kept low weight). Cell weights =
  metric weight x horizon weight:  PAT .40 / Operating Profit .35 / Revenue .25
  x FYoFY .40 / YoY .40 / QoQ .20. Weights are RENORMALISED over the cells
  that exist; `growth_coverage` (0-1) says how much of the full weight had
  data. The sorted-on `growth_score` is that weighted average SHRUNK by
  coverage -- raw x (0.5 + 0.5 x coverage) -- so a company whose only
  computable growth is top-line (loss-making base, no margin guidance on a
  financial) cannot outrank one with a real bottom-line story; the
  unshrunk figure is kept as `growth_score_raw`.

Usage:
  python3 compute_growth_deltas.py --annotations pead_annotations.json \
      --actuals actuals.json --out pead_annotations_growth.json
"""
import argparse
import json
import re

# --- scoring constants (documented above; change here only) ------------------
METRIC_W = {"pat": 0.40, "operating_profit": 0.35, "revenue": 0.25}
HORIZON_W = {"fyofy": 0.40, "yoy": 0.40, "qoq": 0.20}
HORIZON_CAP = {"fyofy": 100.0, "yoy": 100.0, "qoq": 25.0}
QUARTERS = ["Q1", "Q2", "Q3", "Q4"]
SMALL_BASE_PAT_CR = 10.0  # growth off a PAT base below this is flagged as noisy
IMPLAUSIBLE_OPM = (-20.0, 60.0)


def fy_num(label):
    """'FY27' / 'FY2027' -> 2027."""
    m = re.match(r"^FY(\d{2,4})$", str(label).strip().upper())
    if not m:
        raise ValueError(f"bad FY label {label!r}")
    n = int(m.group(1))
    return n + 2000 if n < 100 else n


def pct_change(new, base):
    if new is None or base is None or base <= 0:
        return None
    return (new / base - 1.0) * 100.0


def r1(x):
    return None if x is None else round(x, 1)


def _num(x):
    return None if x is None else float(x)


def tax_rate(base_fy, latest, assumptions):
    for rec in (base_fy, latest):
        if rec and rec.get("pbt") and rec.get("tax") is not None and rec["pbt"] > 0:
            t = rec["tax"] / rec["pbt"]
            if 0 <= t <= 0.5:
                return t
    assumptions.append("[assumption] tax rate 25% (no usable tax/PBT in actuals)")
    return 0.25


def default_weights(remaining, seasonality, assumptions):
    """Seasonal-average revenue shares restricted to `remaining` quarters, renormalised."""
    fys = sorted(seasonality)
    if fys:
        raw = {q: sum(seasonality[fy][q] for fy in fys) / len(fys) for q in remaining}
        tot = sum(raw.values())
        if tot > 0:
            assumptions.append(
                f"[assumption] quarterly phasing = average seasonality of {', '.join(fys)} (not overridden)"
            )
            return {q: v / tot for q, v in raw.items()}
    assumptions.append("[assumption] quarterly phasing = equal split (no seasonality history)")
    return {q: 1.0 / len(remaining) for q in remaining}


def resolve_weights(remaining, gi, seasonality, assumptions, flags):
    given = gi.get("quarter_weights")
    if given:
        try:
            sel = {q: float(given[q]) for q in remaining}
            if all(v >= 0 for v in sel.values()) and sum(sel.values()) > 0:
                tot = sum(sel.values())
                if abs(tot - 1.0) > 0.02:
                    flags.append(f"quarter_weights summed to {tot:.2f}; renormalised")
                assumptions.append(
                    "[assumption] quarterly phasing chosen by analyst: "
                    + (gi.get("phasing_basis") or "no basis stated")
                )
                return {q: v / tot for q, v in sel.items()}
        except (KeyError, TypeError, ValueError):
            pass
        flags.append(f"quarter_weights missing/invalid for remaining quarters {remaining}; used default")
    return default_weights(remaining, seasonality, assumptions)


def fy_revenue(rev, years, guided_fy, flags):
    """-> (fy_revenue_cr | None, basis_note)."""
    base = years.get(guided_fy - 1)
    if rev.get("fy_abs_cr") is not None:
        return _num(rev["fy_abs_cr"])
    if rev.get("growth_pct") is not None:
        if not base or base.get("revenue") is None:
            flags.append(f"no FY{guided_fy - 1 - 2000} revenue in actuals; cannot apply growth_pct")
            return None
        return base["revenue"] * (1 + float(rev["growth_pct"]) / 100.0)
    yp = rev.get("year_path")
    if yp:
        b = years.get(fy_num(yp["base_fy"]))
        share = (yp.get("cumulative_share") or {}).get(f"FY{str(guided_fy)[-2:]}")
        if not b or b.get("revenue") is None or share is None:
            flags.append("year_path unusable (base FY revenue or cumulative_share for guided FY missing)")
            return None
        return b["revenue"] + (float(yp["target_revenue_cr"]) - b["revenue"]) * float(share)
    return None


def fy_operating_profit(op, fy_rev, base_fy, latest, layout):
    """Guided FY operating profit (Cr) or None (=> hold run-rate). Returns (value, note)."""
    if not op or layout == "financial":
        return None
    if op.get("fy_abs_cr") is not None:
        return _num(op["fy_abs_cr"])
    if op.get("growth_pct") is not None and base_fy and base_fy.get("operating_profit"):
        return base_fy["operating_profit"] * (1 + float(op["growth_pct"]) / 100.0)
    if fy_rev is not None:
        if op.get("opm_pct") is not None:
            return fy_rev * float(op["opm_pct"]) / 100.0
        if op.get("opm_delta_bps") is not None and base_fy and base_fy.get("opm_pct") is not None:
            return fy_rev * (base_fy["opm_pct"] + float(op["opm_delta_bps"]) / 100.0) / 100.0
    return None


def has_explicit_margin(op_in, pat_in, tq, layout):
    """Did management actually guide a margin/profit figure (vs. us assuming one)?"""
    cands = [pat_in] if layout == "financial" else [op_in, pat_in]
    if any(c and c.get("basis", "explicit") == "explicit" for c in cands):
        return True
    return tq.get("opm_pct") is not None or tq.get("pat_cr") is not None


def project(data, gi):
    """Pure projection for one company. `data` = one company-financials record's `data`."""
    flags, assumptions = [], []
    b = data.get("baselines") or {}
    latest, nxt = b.get("latest_quarter"), b.get("next_quarter")
    if not latest or not nxt:
        return {"status": "no_actuals", "flags": ["no reported quarters in actuals"]}
    layout = data.get("layout", "industrial")
    years = {y["fiscalYear"]: y for y in data.get("years", []) if y.get("fiscalYear")}
    quarters = data.get("quarters", [])
    guided_fy = fy_num(gi["guided_fy"])
    base_fy = years.get(guided_fy - 1)
    if base_fy is None:
        flags.append(f"FY{str(guided_fy - 1)[-2:]} annual column missing in actuals; FYoFY unavailable")
    if guided_fy < nxt["fiscalYear"]:
        return {"status": "guided_fy_already_complete",
                "flags": [f"guided FY{str(guided_fy)[-2:]} is already complete; guidance is stale"]}
    same_fy = guided_fy == nxt["fiscalYear"]
    if data.get("basis") not in (None, "consolidated"):
        flags.append(f"actuals basis is {data.get('basis')} (guidance is usually consolidated)")
    if layout == "financial":
        flags.append("financial layout: Operating Profit deltas not comparable (Revenue and PAT only)")

    rev_in = gi.get("revenue") or {}
    fy_rev = fy_revenue(rev_in, years, guided_fy, flags)
    tq = gi.get("target_quarter") or {}
    if fy_rev is None and tq.get("revenue_cr") is None:
        return {"status": "no_revenue_guidance", "flags": flags or ["no usable revenue guidance"]}

    op_in = gi.get("operating_profit") or {}
    fy_op_guided = fy_operating_profit(op_in, fy_rev, base_fy, latest, layout)
    pat_in = gi.get("pat") or {}

    t = tax_rate(base_fy or b.get("last_fy"), latest, assumptions)
    latest_opm = latest.get("opm_pct")
    latest_npm = latest.get("npm_pct")
    if latest_npm is None and latest.get("revenue") and latest.get("pat") is not None:
        latest_npm = latest["pat"] / latest["revenue"] * 100.0

    out = {"status": "ok", "layout": layout, "guided_fy": gi["guided_fy"],
           "target_quarter": nxt["fq"], "base_fy": base_fy.get("fy") if base_fy else None,
           "tax_rate_pct": r1(t * 100)}

    # ---- quarterly projection (only when guided FY == the running FY) -------
    q = fy_total = implied_rem_yoy = None
    if same_fy:
        ytd = [r for r in quarters if r.get("fiscalYear") == guided_fy and r.get("revenue") is not None]
        ytd_rev = sum(r["revenue"] for r in ytd)
        ytd_op = sum((r.get("operating_profit") or 0) for r in ytd)
        ytd_pat = sum((r.get("pat") or 0) for r in ytd)
        remaining = [p for p in QUARTERS if QUARTERS.index(p) >= QUARTERS.index(nxt["fiscalPeriod"])]
        w = resolve_weights(remaining, gi, b.get("seasonality") or {}, assumptions, flags)

        if fy_rev is not None:
            rem_rev = fy_rev - ytd_rev
            if rem_rev <= 0:
                flags.append("guided FY revenue <= YTD actuals; guidance already met/stale")
                rem_rev = None
        else:
            rem_rev = None
        rev_q = {}
        tgt = nxt["fiscalPeriod"]
        if tq.get("revenue_cr") is not None:
            rev_q[tgt] = float(tq["revenue_cr"])
            others = [p for p in remaining if p != tgt]
            if rem_rev is not None and others:
                wo = sum(w[p] for p in others)
                for p in others:
                    rev_q[p] = max(rem_rev - rev_q[tgt], 0) * w[p] / wo
        elif rem_rev is not None:
            for p in remaining:
                rev_q[p] = rem_rev * w[p]

        if tgt in rev_q:
            # OPM per remaining quarter
            opm_q = {}
            can_op = layout != "financial" and latest_opm is not None
            if can_op:
                tgt_opm = tq.get("opm_pct")
                if fy_op_guided is not None and rem_rev is not None:
                    rem_op = fy_op_guided - ytd_op
                    if tgt_opm is not None and tgt in rev_q:
                        op_t = rev_q[tgt] * float(tgt_opm) / 100.0
                        others = [p for p in remaining if p != tgt and p in rev_q]
                        so = sum(rev_q[p] for p in others)
                        opm_q[tgt] = float(tgt_opm)
                        for p in others:
                            opm_q[p] = (rem_op - op_t) / so * 100.0 if so > 0 else opm_q[tgt]
                    else:
                        u = rem_op / rem_rev * 100.0
                        for p in remaining:
                            opm_q[p] = u
                    lo, hi = IMPLAUSIBLE_OPM
                    if not all(lo <= v <= hi for v in opm_q.values()):
                        flags.append(f"implied remaining-quarter OPM {opm_q[tgt]:.1f}% is implausible; check guidance/YTD")
                    assumptions.append("[estimate] remaining-quarter OPM solved so FY OP hits the guided FY figure after YTD actuals")
                else:
                    for p in remaining:
                        opm_q[p] = float(tgt_opm) if (p == tgt and tgt_opm is not None) else latest_opm
                    assumptions.append(f"[assumption] OPM held at latest reported quarter ({latest_opm:.1f}%) -- margin not guided")
            # PAT per remaining quarter
            pat_q = {}
            if latest_npm is not None or pat_in or tq.get("pat_cr") is not None:
                fy_pat_guided = None
                if pat_in.get("fy_abs_cr") is not None:
                    fy_pat_guided = float(pat_in["fy_abs_cr"])
                elif pat_in.get("growth_pct") is not None and base_fy and base_fy.get("pat"):
                    fy_pat_guided = base_fy["pat"] * (1 + float(pat_in["growth_pct"]) / 100.0)
                elif pat_in.get("npm_pct") is not None and fy_rev is not None:
                    fy_pat_guided = fy_rev * float(pat_in["npm_pct"]) / 100.0
                total_rem_rev = sum(rev_q.values())
                if fy_pat_guided is not None and total_rem_rev > 0:
                    rem_pat = fy_pat_guided - ytd_pat
                    for p, rv in rev_q.items():
                        pat_q[p] = rem_pat * rv / total_rem_rev
                    if tq.get("pat_cr") is not None and tgt in rev_q:
                        left = rem_pat - float(tq["pat_cr"])
                        oth = [p for p in rev_q if p != tgt]
                        so = sum(rev_q[p] for p in oth)
                        pat_q[tgt] = float(tq["pat_cr"])
                        for p in oth:
                            pat_q[p] = left * rev_q[p] / so if so > 0 else 0
                elif latest_npm is not None:
                    for p, rv in rev_q.items():
                        d_opm = (opm_q[p] - latest_opm) if (p in opm_q and latest_opm is not None) else 0.0
                        pat_q[p] = rv * (latest_npm + d_opm * (1 - t)) / 100.0
                    assumptions.append(
                        "[estimate] PAT margin = latest NPM + change in OPM x (1 - tax); below-operating lines held at latest % of revenue"
                        if opm_q else "[assumption] PAT margin held at latest NPM"
                    )
            tr, top, tpat = rev_q.get(tgt), (rev_q[tgt] * opm_q[tgt] / 100.0 if tgt in opm_q else None), pat_q.get(tgt)
            q = {"revenue": tr, "operating_profit": top, "pat": tpat,
                 "opm_pct": opm_q.get(tgt),
                 "npm_pct": (tpat / tr * 100.0) if (tpat is not None and tr) else None}
            # FY totals = YTD + remaining projections
            all_rem_rev = sum(rev_q.values())
            complete = fy_rev is not None and all(p in rev_q for p in remaining)
            fy_total = {
                "revenue": (ytd_rev + all_rem_rev) if complete else None,
                "operating_profit": (ytd_op + sum(rev_q[p] * opm_q[p] / 100.0 for p in rev_q if p in opm_q))
                if (complete and opm_q and len(opm_q) == len(rev_q)) else None,
                "pat": (ytd_pat + sum(pat_q.values())) if (complete and len(pat_q) == len(rev_q)) else None,
            }
            rem_prev = [r for r in quarters if r.get("fiscalYear") == guided_fy - 1
                        and r.get("fiscalPeriod") in remaining]
            if complete and len(rem_prev) == len(remaining) and all(r.get("revenue") for r in rem_prev):
                implied_rem_yoy = r1(pct_change(all_rem_rev, sum(r["revenue"] for r in rem_prev)))
            out["ytd_quarters"] = [r["fq"] for r in ytd]
            out["phasing_weights"] = {p: r1(w[p] * 100) for p in remaining}

    if fy_total is None:
        # FY-level only (guided FY beyond the running FY, or no phasing possible)
        fy_total = {"revenue": fy_rev, "operating_profit": None, "pat": None}
        if fy_rev is not None:
            if layout != "financial" and latest_opm is not None:
                fy_total["operating_profit"] = fy_op_guided if fy_op_guided is not None else fy_rev * latest_opm / 100.0
                fy_opm = fy_total["operating_profit"] / fy_rev * 100.0
                if fy_op_guided is None:
                    assumptions.append(f"[assumption] FY OPM held at latest reported quarter ({latest_opm:.1f}%)")
            else:
                fy_opm = latest_opm
            if pat_in.get("fy_abs_cr") is not None:
                fy_total["pat"] = float(pat_in["fy_abs_cr"])
            elif pat_in.get("growth_pct") is not None and base_fy and base_fy.get("pat"):
                fy_total["pat"] = base_fy["pat"] * (1 + float(pat_in["growth_pct"]) / 100.0)
            elif latest_npm is not None:
                d = (fy_opm - latest_opm) if (fy_opm is not None and latest_opm is not None and layout != "financial") else 0.0
                fy_total["pat"] = fy_rev * (latest_npm + d * (1 - t)) / 100.0
                assumptions.append("[estimate] FY PAT margin = latest NPM + change in OPM x (1 - tax)")
        if not same_fy:
            flags.append("guided FY is beyond the current FY: FY-level deltas only")

    # ---- deltas ---------------------------------------------------------------
    yoy_base = b.get("year_ago_quarter")
    deltas = {m: {"qoq": None, "yoy": None, "fyofy": None} for m in ("revenue", "operating_profit", "pat")}
    metrics = ["revenue", "pat"] if layout == "financial" else ["revenue", "operating_profit", "pat"]
    for m in metrics:
        if q and q.get(m) is not None:
            for hz, base in (("qoq", latest), ("yoy", yoy_base)):
                bv = base.get(m) if base else None
                if bv is not None and bv <= 0:
                    flags.append(f"{m} {hz} base <= 0; growth not computed")
                elif base is None and hz == "yoy":
                    flags.append("year-ago quarter missing in 12-quarter window; YoY unavailable")
                deltas[m][hz] = r1(pct_change(q[m], bv))
        if fy_total.get(m) is not None and base_fy:
            bv = base_fy.get(m)
            if bv is not None and bv <= 0:
                flags.append(f"{m} fyofy base <= 0; growth not computed")
            deltas[m]["fyofy"] = r1(pct_change(fy_total[m], bv))
    if base_fy and (base_fy.get("pat") or 0) < SMALL_BASE_PAT_CR and deltas["pat"]["fyofy"] is not None:
        flags.append(f"small PAT base (<{SMALL_BASE_PAT_CR:.0f} Cr): PAT growth is noisy (actuals are rounded to whole Cr)")

    # context: is guidance an acceleration vs what was just delivered?
    la = b.get("latest_year_ago")
    ctx = {"latest_quarter": latest["fq"],
           # the page's own YoY figures (computed by Stockscans on unrounded numbers) beat
           # re-deriving from whole-Cr values, which can be off by several points for small PAT
           "latest_revenue_yoy_pct": latest.get("revenue_growth_pct") if latest.get("revenue_growth_pct") is not None
           else r1(pct_change(latest.get("revenue"), la.get("revenue") if la else None)),
           "latest_pat_yoy_pct": latest.get("pat_growth_pct") if latest.get("pat_growth_pct") is not None
           else r1(pct_change(latest.get("pat"), la.get("pat") if la else None))}
    if implied_rem_yoy is not None:
        # revenue growth the guidance implies for the not-yet-reported quarters vs the same quarters last year
        ctx["implied_remaining_revenue_yoy_pct"] = implied_rem_yoy

    quality = "explicit" if (rev_in.get("basis", "explicit") == "explicit"
                             and has_explicit_margin(op_in, pat_in, tq, layout)) else "derived"

    def rr(d):
        return None if d is None else {k: (r1(v) if v is not None else None) for k, v in d.items()}

    out.update({"projected_quarter": rr(q), "projected_fy": rr(fy_total), "deltas": deltas,
                "context": ctx, "basis_quality": quality,
                "assumptions": assumptions, "flags": flags})
    out["growth_score"], out["growth_coverage"], out["growth_score_raw"] = growth_score(deltas, layout)
    return out


def growth_score(deltas, layout="industrial"):
    """-> (coverage-adjusted score 0-100 | None, coverage 0-1, raw score | None)."""
    num = den = full = 0.0
    for m, mw in METRIC_W.items():
        for hz, hw in HORIZON_W.items():
            wgt = mw * hw
            if layout == "financial" and m == "operating_profit":
                continue  # not applicable -- excluded from the coverage denominator too
            full += wgt
            v = (deltas.get(m) or {}).get(hz)
            if v is None:
                continue
            num += wgt * min(max(v / HORIZON_CAP[hz], 0.0), 1.0) * 100.0
            den += wgt
    if den == 0:
        return None, 0.0, None
    raw, cov = num / den, den / full
    return round(raw * (0.5 + 0.5 * cov), 1), round(cov, 2), round(raw, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--annotations", required=True, help="Step-1 annotations JSON (array; items may carry growth_inputs)")
    ap.add_argument("--actuals", required=True, help="output of stock-api/bin/company-financials.js")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    ann = json.load(open(args.annotations))
    actuals = {r["companyId"]: r for r in json.load(open(args.actuals))}
    n_ok = 0
    for c in ann:
        gi = c.get("growth_inputs")
        if not gi:
            c["growth"] = {"status": "no_quantified_guidance", "growth_score": None, "growth_coverage": 0.0,
                           "flags": ["no growth_inputs supplied (qualitative guidance only)"], "assumptions": []}
            continue
        a = actuals.get(c["ticker"])
        if not a or not a.get("ok"):
            err = (a or {}).get("error", "not fetched")
            c["growth"] = {"status": "no_actuals", "growth_score": None, "growth_coverage": 0.0,
                           "flags": [f"actuals unavailable: {err}"], "assumptions": []}
            continue
        try:
            c["growth"] = project(a["data"], gi)
        except (ValueError, KeyError, TypeError) as e:
            c["growth"] = {"status": "error", "growth_score": None, "growth_coverage": 0.0,
                           "flags": [f"growth_inputs invalid: {e}"], "assumptions": []}
        c["growth"].setdefault("growth_score", None)
        c["growth"].setdefault("growth_coverage", 0.0)
        n_ok += c["growth"].get("status") == "ok"
    json.dump(ann, open(args.out, "w"), indent=2)
    print(json.dumps({"out": args.out, "companies": len(ann), "growth_computed": n_ok}))


if __name__ == "__main__":
    main()
