#!/usr/bin/env python3
"""
growth-predictor -- Step 3 (deterministic P&L engine, no LLM).

The agent (Step 2) writes `assumptions.json`: WHAT each line driver is and WHY (guided / filing /
heuristic / assumption, with a source). This script does ALL the arithmetic, identically for every company,
so a number in the report can always be rebuilt from a tagged input (conventions §17):

  Revenue -> EBITDA (margin) -> + other income - depreciation - interest (+ exceptional) = PBT
  -> tax -> x historical PAT/(PBT-tax) ratio (minority/associates) = PAT -> / shares = EPS

for the TARGET quarter and the full FY (YTD reported + projected remaining quarters), in three scenarios
(bear / base / bull; bear and bull inherit every key they do not override from base), then:
  * QoQ / YoY / FYoFY growth for Revenue, EBITDA, PAT, EPS -- against REPORTED and, where the agent
    supplied `baseCleaning`, against CORE (one-offs stripped) comparators;
  * leave-one-out lever attribution (how much of base PAT each lever explains);
  * an inputs ledger (every number + basis + source) and the share of base PAT that rests on
    heuristics/assumptions rather than guidance or filings;
  * deterministic sanity flags (implied margin outside 12-quarter range, phasing vs own seasonality,
    YoY acceleration without a named driver, tax/other-income anomalies, back-ended FY, scenario order).

assumptions.json (see references/assumptions_schema.md for the full contract):
{
  "targetQuarter": "Q2FY27",
  "sharesCr": {"value": 3.22, "basis": "derived", "source": "..."},
  "baseCleaning": [{"quarter": "Q1FY27", "line": "other_income|pat|ebitda|revenue", "reported": 33,
                    "normalised": 9, "reason": "...", "basis": "actual", "source": "..."}],
  "scenarios": {
    "base": {
      "revenue":        {"fy_abs_cr"|"fy_growth_pct", "target_q_cr"|"target_q_qoq_pct"|"target_q_yoy_pct",
                         "rest_weights": {"Q3": .5, "Q4": .5}, "basis", "source"},
      "ebitda_margin":  {"target_q_pct", "fy_pct"?, "rest_q_pct"?, "basis", "source"},
      "other_income":   {"q_cr", "rest_q_cr"?, "basis", "source"},
      "depreciation":   {...same...}, "interest": {...same...},
      "tax_rate":       {"pct", "basis", "source"},
      "exceptional":    {"q_cr": 0, "rest_q_cr": 0, ...}            (optional)
      "levers": [{"name", "line": revenue|ebitda|other_income|depreciation|interest|exceptional
                   (money: q_delta_cr, rest_delta_cr) | ebitda_margin_bps (q_bps, rest_bps)
                   | tax_rate_pp (q_pp, rest_pp) | shares_cr (delta_cr),
                  "embedded": false, "basis", "source", "kb": ["fdb27c81"]}],
      "pat_override":   {"q_cr", "fy_cr", "basis", "source"}       (banks/NBFCs or explicitly guided PAT)
    },
    "bear": {...overrides...}, "bull": {...overrides...}
  }
}

Usage:
  python3 project_pl.py --inputs <gather_inputs json> --assumptions assumptions.json --out projection.json
"""
import argparse
import copy
import importlib.util
import json
import os
import statistics

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
_spec = importlib.util.spec_from_file_location("fiscal_periods", os.path.join(_REPO, "skills", "_shared", "fiscal_periods.py"))
fp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fp)

SCENARIOS = ("bear", "base", "bull")
MONEY_LINES = ("revenue", "ebitda", "other_income", "depreciation", "interest", "exceptional")
SOFT_BASES = ("heuristic", "assumption")
VALID_BASES = ("guided", "actual", "filing", "derived", "heuristic", "assumption", "macro")
METRICS = ("revenue", "ebitda", "pat", "eps")


# ----------------------------------------------------------------------------- helpers
def _f(x):
    return None if x is None else float(x)


def r2(x):
    return None if x is None else round(x, 2)


def merge(base, over):
    """Scenario inheritance: dicts merge recursively; lists (levers) and scalars replace."""
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def pat_ratio(quarters, flags):
    """Median PAT / (PBT - tax) over the last 4 quarters: <1 => minority interest / associates."""
    vals = []
    for q in quarters[-4:]:
        pbt, tax, pat = q.get("pbt"), q.get("tax"), q.get("pat")
        if pbt and tax is not None and pat is not None and (pbt - tax) > 0:
            vals.append(pat / (pbt - tax))
    if not vals:
        return 1.0
    m = statistics.median(vals)
    if not 0.5 <= m <= 1.5:
        flags.append(f"PAT/(PBT-tax) median {m:.2f} outside 0.5-1.5; ratio ignored (check minority/associates by hand)")
        return 1.0
    return 1.0 if abs(m - 1) < 0.03 else m


# ----------------------------------------------------------------------------- core projection
def project_scenario(sc, actuals, target_fq, shares_cr, ratio, *, skip_lever=None):
    """Pure: one scenario -> {"target": lines, "fy": lines, "rest": {...}, "notes": [...]}."""
    notes = []
    quarters = actuals["quarters"]
    qidx = fp.quarter_index(quarters)
    years = fp.year_index(actuals["years"])
    tp, tfy = fp.parse_fq(target_fq)
    latest_p, latest_fy = fp.shift_quarter(tp, tfy, -1)
    latest = qidx.get((latest_p, latest_fy))
    if latest is None:
        raise ValueError(f"quarter before {target_fq} ({fp.fq_label(latest_p, latest_fy)}) missing from actuals")
    yago = qidx.get((tp, tfy - 1))
    last_fy = years.get(tfy - 1)
    ytd = [q for q in fp.ytd_rows(quarters, tfy) if fp.QUARTERS.index(q["fiscalPeriod"]) < fp.QUARTERS.index(tp)]
    remaining = fp.remaining_quarters(tp)
    rest = remaining[1:]
    levers = [lv for lv in (sc.get("levers") or []) if lv.get("name") != skip_lever and not lv.get("embedded")]

    def lsum(line, key):
        return sum(_f(lv.get(key)) or 0.0 for lv in levers if lv.get("line") == line)

    # ---- revenue
    rv = sc.get("revenue") or {}
    ytd_rev = sum(q["revenue"] for q in ytd)
    fy_rev = None
    if rv.get("fy_abs_cr") is not None:
        fy_rev = _f(rv["fy_abs_cr"])
    elif rv.get("fy_growth_pct") is not None:
        if last_fy and last_fy.get("revenue"):
            fy_rev = last_fy["revenue"] * (1 + _f(rv["fy_growth_pct"]) / 100.0)
        else:
            notes.append("fy_growth_pct given but last FY revenue missing")
    t_rev = None
    if rv.get("target_q_cr") is not None:
        t_rev = _f(rv["target_q_cr"])
    elif rv.get("target_q_qoq_pct") is not None and latest:
        t_rev = latest["revenue"] * (1 + _f(rv["target_q_qoq_pct"]) / 100.0)
    elif rv.get("target_q_yoy_pct") is not None and yago:
        t_rev = yago["revenue"] * (1 + _f(rv["target_q_yoy_pct"]) / 100.0)
    w = None
    if fy_rev is not None:
        rem = fy_rev - ytd_rev
        if rem <= 0:
            notes.append("FY revenue driver <= YTD reported revenue (guidance already met/stale)")
            rem = 0.0
        w = rv.get("rest_weights") or None
        seas = (actuals.get("baselines") or {}).get("seasonality") or {}
        wall = fp.default_weights(remaining, seas)
        if t_rev is None:
            t_rev = rem * wall[tp]
            notes.append(f"target revenue phased from FY driver at seasonal weight {wall[tp]:.3f}")
        rest_total = max(rem - t_rev, 0.0)
        if rest:
            if w:
                tot = sum(_f(w.get(p)) or 0.0 for p in rest) or 1.0
                rw = {p: (_f(w.get(p)) or 0.0) / tot for p in rest}
            else:
                tot = sum(wall[p] for p in rest) or 1.0
                rw = {p: wall[p] / tot for p in rest}
            rest_rev = {p: rest_total * rw[p] for p in rest}
        else:
            rest_rev = {}
    else:
        if t_rev is None:
            raise ValueError("revenue needs fy_abs_cr/fy_growth_pct or a target_q_* driver")
        # no FY driver: remaining quarters grow at the target quarter's YoY rate [assumption]
        g = (t_rev / yago["revenue"]) if (yago and yago.get("revenue")) else 1.0
        rest_rev = {}
        for p in rest:
            prev = qidx.get((p, tfy - 1))
            rest_rev[p] = prev["revenue"] * g if prev and prev.get("revenue") else t_rev
        notes.append("[assumption] no FY revenue driver: post-target quarters grown at the target quarter's YoY rate")
    # revenue levers
    t_rev += lsum("revenue", "q_delta_cr")
    rd = lsum("revenue", "rest_delta_cr")
    if rest and rd:
        tot = sum(rest_rev.values()) or 1.0
        for p in rest:
            rest_rev[p] += rd * (rest_rev[p] / tot if tot else 1 / len(rest))

    # ---- EBITDA
    em = sc.get("ebitda_margin") or {}
    t_m = _f(em.get("target_q_pct"))
    if t_m is None:
        t_m = _f(em.get("fy_pct"))
    if t_m is None:
        t_m = latest.get("opm_pct") if latest else None
        notes.append("[assumption] target margin held at latest reported quarter (no margin driver)")
    t_m += lsum("ebitda_margin_bps", "q_bps") / 100.0
    t_ebitda = t_rev * t_m / 100.0 + lsum("ebitda", "q_delta_cr")
    rest_ebitda = {}
    if rest:
        if em.get("fy_pct") is not None and fy_rev is not None and em.get("rest_q_pct") is None:
            ytd_e = sum((q.get("operating_profit") or 0) for q in ytd)
            fy_e = (ytd_rev + t_rev + sum(rest_rev.values())) * _f(em["fy_pct"]) / 100.0
            rest_total_e = fy_e - ytd_e - t_rev * t_m / 100.0
            tot = sum(rest_rev.values()) or 1.0
            rm = rest_total_e / tot * 100.0 if tot else t_m
            notes.append(f"post-target margin solved so FY margin = {em['fy_pct']}% ({rm:.1f}% for {', '.join(rest)})")
        else:
            rm = _f(em.get("rest_q_pct")) if em.get("rest_q_pct") is not None else t_m
        rm += lsum("ebitda_margin_bps", "rest_bps") / 100.0
        rd_e = lsum("ebitda", "rest_delta_cr")
        tot = sum(rest_rev.values()) or 1.0
        for p in rest:
            rest_ebitda[p] = rest_rev[p] * rm / 100.0 + rd_e * (rest_rev[p] / tot)

    # ---- below-EBITDA lines
    def line(name):
        d = sc.get(name) or {}
        q = _f(d.get("q_cr"))
        if q is None:
            if name == "exceptional":
                q = 0.0
            else:
                hist = [x.get(name) for x in quarters[-4:] if x.get(name) is not None]
                q = float(statistics.median(hist)) if hist else 0.0
                notes.append(f"[assumption] {name} held at trailing-4Q median ({q:.1f}) — no driver given")
        rq = _f(d.get("rest_q_cr"))
        rq = q if rq is None else rq
        tq = q + lsum(name, "q_delta_cr")
        rdl = lsum(name, "rest_delta_cr")
        rv_ = {p: rq + (rdl / len(rest) if rest else 0.0) for p in rest}
        return tq, rv_

    t_oi, r_oi = line("other_income")
    t_dep, r_dep = line("depreciation")
    t_int, r_int = line("interest")
    t_exc, r_exc = line("exceptional")
    tr = sc.get("tax_rate") or {}
    tax_pct = _f(tr.get("pct"))
    if tax_pct is None:
        tax_pct = fp.tax_rate(last_fy, latest) * 100.0
        notes.append(f"[assumption] tax rate = last FY effective rate {tax_pct:.1f}%")
    t_tax = tax_pct + lsum("tax_rate_pp", "q_pp")
    r_tax = tax_pct + lsum("tax_rate_pp", "rest_pp")
    sh = shares_cr + sum(_f(lv.get("delta_cr")) or 0.0 for lv in levers if lv.get("line") == "shares_cr")

    def pl(rev, ebitda, oi, dep, intr, exc, taxp):
        pbt = ebitda + oi - dep - intr + exc
        pat = pbt * (1 - taxp / 100.0) * ratio if pbt > 0 else pbt * ratio
        return {"revenue": rev, "ebitda": ebitda, "ebitda_margin_pct": ebitda / rev * 100.0 if rev else None,
                "other_income": oi, "depreciation": dep, "interest": intr, "exceptional": exc, "pbt": pbt,
                "tax_rate_pct": taxp, "pat": pat}

    target = pl(t_rev, t_ebitda, t_oi, t_dep, t_int, t_exc, t_tax)
    rest_pl = {p: pl(rest_rev[p], rest_ebitda.get(p, 0.0), r_oi[p], r_dep[p], r_int[p], r_exc[p], r_tax) for p in rest}

    po = sc.get("pat_override") or {}
    if po.get("q_cr") is not None:
        target["pat"] = _f(po["q_cr"])
        notes.append("PAT overridden (pat_override.q_cr)")
    target["eps"] = target["pat"] / sh if sh else None

    # ---- FY = YTD reported + target + rest
    def ysum(key):
        return sum((q.get(key) or 0) for q in ytd)

    fy = {
        "revenue": ysum("revenue") + target["revenue"] + sum(p["revenue"] for p in rest_pl.values()),
        "ebitda": ysum("operating_profit") + target["ebitda"] + sum(p["ebitda"] for p in rest_pl.values()),
        "pat": ysum("pat") + target["pat"] + sum(p["pat"] for p in rest_pl.values()),
    }
    if po.get("fy_cr") is not None:
        fy["pat"] = _f(po["fy_cr"])
        notes.append("FY PAT overridden (pat_override.fy_cr)")
    fy["ebitda_margin_pct"] = fy["ebitda"] / fy["revenue"] * 100.0 if fy["revenue"] else None
    fy["eps"] = fy["pat"] / sh if sh else None
    return {"target": target, "rest": rest_pl, "fy": fy, "shares_cr": sh, "ytd_quarters": [q["fq"] for q in ytd],
            "notes": notes}


# ----------------------------------------------------------------------------- comparators & flags
def comparators(actuals, target_fq, cleaning):
    qidx = fp.quarter_index(actuals["quarters"])
    years = fp.year_index(actuals["years"])
    tp, tfy = fp.parse_fq(target_fq)
    lp, lfy = fp.shift_quarter(tp, tfy, -1)

    def pack(row, label):
        if not row:
            return None
        d = {"label": label, "revenue": row.get("revenue"), "ebitda": row.get("operating_profit"),
             "pat": row.get("pat"), "eps": row.get("eps"), "ebitda_margin_pct": row.get("opm_pct")}
        core = dict(d)
        hit = False
        for c in cleaning or []:
            if c.get("quarter") == label and c.get("line") in ("revenue", "ebitda", "pat"):
                core[c["line"]] = _f(c["normalised"])
                hit = True
            if c.get("quarter") == label and c.get("line") == "eps":
                core["eps"] = _f(c["normalised"])
                hit = True
        if hit and core.get("pat") is not None and d.get("pat") and d.get("eps") and "eps" not in {
            c.get("line") for c in cleaning if c.get("quarter") == label}:
            core["eps"] = d["eps"] * core["pat"] / d["pat"]
        return {"reported": d, "core": core if hit else None}

    ly = years.get(tfy - 1)
    return {
        "qoq": pack(qidx.get((lp, lfy)), fp.fq_label(lp, lfy)),
        "yoy": pack(qidx.get((tp, tfy - 1)), fp.fq_label(tp, tfy - 1)),
        "fyofy": pack({"revenue": ly.get("revenue"), "operating_profit": ly.get("operating_profit"), "pat": ly.get("pat"),
                       "eps": ly.get("eps"), "opm_pct": ly.get("opm_pct")} if ly else None, fp.fy_label(tfy - 1)),
    }


def fy_core(proj, cleaning):
    """FY with the YTD one-offs the agent cleaned (same FY, quarter-level entries) taken out; None if no
    cleaning touches the YTD quarters."""
    adj = {"revenue": 0.0, "ebitda": 0.0, "pat": 0.0}
    hit = False
    for c in cleaning or []:
        if c.get("quarter") in proj["ytd_quarters"] and c.get("line") in adj:
            adj[c["line"]] += _f(c["reported"]) - _f(c["normalised"])
            hit = True
    if not hit:
        return None
    core = {m: proj["fy"][m] - adj[m] for m in adj}
    core["ebitda_margin_pct"] = core["ebitda"] / core["revenue"] * 100.0 if core["revenue"] else None
    core["eps"] = core["pat"] / proj["shares_cr"] if proj["shares_cr"] else None
    return core


def deltas(proj, comps, core_fy=None):
    """Growth vs comparators. 'reported' = projection vs reported base. 'core' = like-for-like:
    projection (FY: one-offs removed from YTD) vs the cleaned base (falls back to the reported base
    when only the projection side carried a one-off)."""
    out = {}
    for hz, src in (("qoq", proj["target"]), ("yoy", proj["target"]), ("fyofy", proj["fy"])):
        c = comps.get(hz)
        if not c:
            out[hz] = None
            continue
        row = {"vs": c["reported"]["label"]}
        pairs = [("reported", src, c["reported"])]
        if hz == "fyofy" and core_fy:
            pairs.append(("core", core_fy, c.get("core") or c["reported"]))
        elif c.get("core"):
            pairs.append(("core", src, c["core"]))
        for basis, src_, b in pairs:
            row[basis] = {m: fp.r1(fp.pct_change(src_.get(m), b.get(m))) for m in METRICS}
            row[basis]["ebitda_margin_bps"] = (
                round((src_["ebitda_margin_pct"] - b["ebitda_margin_pct"]) * 100)
                if src_.get("ebitda_margin_pct") is not None and b.get("ebitda_margin_pct") is not None else None)
        out[hz] = row
    return out


def sanity_flags(actuals, target_fq, scen, comps, shares_hint):
    flags = []
    base = scen["base"]["target"]
    q = actuals["quarters"]
    opms = [x.get("opm_pct") for x in q if x.get("opm_pct") is not None]
    if opms and base.get("ebitda_margin_pct") is not None:
        lo, hi = min(opms), max(opms)
        if not lo - 2 <= base["ebitda_margin_pct"] <= hi + 2:
            flags.append(f"base target EBITDA margin {base['ebitda_margin_pct']:.1f}% outside 12-quarter range {lo:.1f}-{hi:.1f}% (+/-2pp): name the driver")
    tp, tfy = fp.parse_fq(target_fq)
    hist = fp.seasonal_qoq(q, tp)
    qoq_c = comps.get("qoq")
    if hist and qoq_c and qoq_c["reported"].get("revenue"):
        mean = statistics.mean(h["qoq_pct"] for h in hist if h["qoq_pct"] is not None)
        imp = fp.pct_change(base["revenue"], qoq_c["reported"]["revenue"])
        if imp is not None and abs(imp - mean) > 15:
            flags.append(f"base target revenue QoQ {imp:+.1f}% vs own seasonal QoQ into {tp} avg {mean:+.1f}% ({', '.join(h['fy'] for h in hist)}): >15pp apart")
    prev_rev, prev_p = base["revenue"], tp
    for p_, row in (scen["base"].get("rest") or {}).items():
        h = [x["qoq_pct"] for x in fp.seasonal_qoq(q, p_) if x["qoq_pct"] is not None]
        imp = fp.pct_change(row["revenue"], prev_rev)
        if h and imp is not None and abs(imp - statistics.mean(h)) > 15:
            flags.append(f"implied {prev_p}->{p_} revenue QoQ {imp:+.1f}% vs own history avg {statistics.mean(h):+.1f}%: FY phasing looks off")
        prev_rev, prev_p = row["revenue"], p_
    yoys = [x.get("revenue_growth_pct") for x in q[-4:] if x.get("revenue_growth_pct") is not None]
    yoy_c = comps.get("yoy")
    if yoys and yoy_c and yoy_c["reported"].get("revenue"):
        imp = fp.pct_change(base["revenue"], yoy_c["reported"]["revenue"])
        avg = statistics.mean(yoys)
        if imp is not None and imp - avg > 20:
            flags.append(f"base target revenue YoY {imp:+.1f}% vs trailing-4Q avg {avg:+.1f}%: acceleration needs a named, sized driver")
        if imp is not None and avg - imp > 20:
            flags.append(f"base target revenue YoY {imp:+.1f}% vs trailing-4Q avg {avg:+.1f}%: sharp deceleration — confirm the reason")
    if not 15 <= base["tax_rate_pct"] <= 35:
        flags.append(f"tax rate {base['tax_rate_pct']:.1f}% outside 15-35%")
    ois = sorted(x.get("other_income") for x in q[-4:] if x.get("other_income") is not None)
    if ois:
        med = statistics.median(ois)
        if med > 0 and base["other_income"] > 2 * med:
            flags.append(f"target other income {base['other_income']:.1f} > 2x trailing median {med:.1f}")
    lq = q[-1] if q else {}
    for k in ("depreciation", "interest"):
        if lq.get(k) and base[k] > lq[k] * 1.3 + 1:
            flags.append(f"target {k} {base[k]:.1f} vs latest {lq[k]}: +30% step — is it a lever (capex capitalised / new debt)?")
    if lq.get("pat") is not None and abs(lq["pat"]) < 10:
        flags.append("small PAT base (<10 Cr, whole-Cr rounding): % growth is noisy")
    for m in ("revenue", "pat"):
        for where in ("target", "fy"):
            b, m_, u = scen["bear"][where][m], scen["base"][where][m], scen["bull"][where][m]
            if not b <= m_ <= u:
                flags.append(f"scenario order broken for {where} {m}: bear {b:.1f} / base {m_:.1f} / bull {u:.1f}")
    if shares_hint and scen["base"]["shares_cr"] and abs(scen["base"]["shares_cr"] / shares_hint - 1) > 0.03:
        flags.append(f"sharesCr {scen['base']['shares_cr']:.3f} differs >3% from latest implied {shares_hint:.3f} (PAT/EPS): justify (dilution) or fix")
    return flags


def inputs_ledger(sc):
    rows = []
    for k in ("revenue", "ebitda_margin", "other_income", "depreciation", "interest", "tax_rate", "exceptional", "pat_override"):
        d = sc.get(k)
        if isinstance(d, dict):
            vals = {kk: vv for kk, vv in d.items() if kk not in ("basis", "source")}
            rows.append({"input": k, "values": vals, "basis": d.get("basis", "assumption"), "source": d.get("source")})
    for lv in sc.get("levers") or []:
        rows.append({"input": f"lever: {lv.get('name')}", "values": {k: v for k, v in lv.items() if k not in ("name", "basis", "source", "kb")},
                     "basis": lv.get("basis", "assumption"), "source": lv.get("source"), "kb": lv.get("kb") or []})
    return rows


def validate(assumptions):
    errs = []
    sc = (assumptions.get("scenarios") or {})
    if "base" not in sc:
        errs.append("scenarios.base is required")
    for name, s in sc.items():
        for row in inputs_ledger(s):
            if row["basis"] not in VALID_BASES:
                errs.append(f"{name}: {row['input']} basis {row['basis']!r} not in {VALID_BASES}")
            if not row.get("source"):
                errs.append(f"{name}: {row['input']} has no source (every input must be traceable)")
        for lv in s.get("levers") or []:
            if lv.get("line") not in MONEY_LINES + ("ebitda_margin_bps", "tax_rate_pp", "shares_cr"):
                errs.append(f"{name}: lever {lv.get('name')} has unknown line {lv.get('line')!r}")
    if not (assumptions.get("sharesCr") or {}).get("value"):
        errs.append("sharesCr.value is required (post-dilution share count, crore)")
    return errs


def leverage_profile(scen_deltas):
    """Dr. Anil Lamba's leverage multiples on the base projection (via rerating-catalysts §J-curve):
    operating = %dEBITDA / %dRevenue, financial = %dPAT / %dEBITDA, combined = %dPAT / %dRevenue,
    for YoY and FYoFY (reported basis; core when available). Pure."""
    out, flags = {}, []
    for hz in ("yoy", "fyofy"):
        row = scen_deltas.get(hz) or {}
        d = row.get("core") or row.get("reported")
        if not d:
            continue
        rev, eb, pat = d.get("revenue"), d.get("ebitda"), d.get("pat")
        def ratio(n, m):
            return round(n / m, 2) if (n is not None and m not in (None, 0) and abs(m) >= 1) else None
        lev = {"basis": "core" if row.get("core") else "reported", "operating": ratio(eb, rev),
               "financial": ratio(pat, eb), "combined": ratio(pat, rev),
               "ordering": "PAT>EBITDA>Revenue" if (None not in (rev, eb, pat) and pat > eb > rev) else None}
        out[hz] = lev
        if lev["combined"] is not None and lev["combined"] > 5:
            flags.append(f"{hz} combined leverage {lev['combined']}x (PAT growth / revenue growth) > 5x: needs a named, sized lever (deleverage, one-off base, capacity absorption)")
        if None not in (rev, pat, eb) and rev > 0 and pat - rev > 3 and eb < rev - 1:
            flags.append(f"{hz}: PAT grows faster than revenue while EBITDA lags it — the PAT lift is below the EBITDA line (other income / interest / tax); confirm it is not a one-off")
    return out, flags


def guidance_ladder(actuals, target_fq, base):
    """What the rest of the FY must deliver (SOIC 'guidance ladder' via quarterly-result-analysis
    monitoring patterns): remaining-quarter revenue and margin implied by the FY driver vs the same
    quarters last year and vs YTD. Pure."""
    tp, tfy = fp.parse_fq(target_fq)
    qidx = fp.quarter_index(actuals["quarters"])
    rem = fp.remaining_quarters(tp)
    rem_rev = base["target"]["revenue"] + sum(r["revenue"] for r in base["rest"].values())
    rem_eb = base["target"]["ebitda"] + sum(r["ebitda"] for r in base["rest"].values())
    ly = [qidx.get((p, tfy - 1)) for p in rem]
    ly_rev = sum(r["revenue"] for r in ly if r) if all(ly) else None
    ytd = [q for q in fp.ytd_rows(actuals["quarters"], tfy) if fp.QUARTERS.index(q["fiscalPeriod"]) < fp.QUARTERS.index(tp)]
    ytd_rev = sum(q["revenue"] for q in ytd)
    ytd_eb = sum((q.get("operating_profit") or 0) for q in ytd)
    return {
        "remainingQuarters": [fp.fq_label(p, tfy) for p in rem],
        "requiredRevenueCr": r2(rem_rev),
        "requiredRevenueYoYPct": fp.r1(fp.pct_change(rem_rev, ly_rev)),
        "ytdRevenueYoYPct": fp.r1(fp.pct_change(ytd_rev, sum((qidx.get((q["fiscalPeriod"], tfy - 1)) or {}).get("revenue") or 0 for q in ytd))) if ytd else None,
        "requiredMarginPct": fp.r1(rem_eb / rem_rev * 100) if rem_rev else None,
        "ytdMarginPct": fp.r1(ytd_eb / ytd_rev * 100) if ytd_rev else None,
    }


def run(inputs, assumptions):
    actuals = inputs["actuals"]
    target = assumptions.get("targetQuarter") or (inputs.get("period") or {}).get("target")
    if (inputs.get("period") or {}).get("target") and target != inputs["period"]["target"]:
        raise ValueError(f"targetQuarter {target} != next unreported quarter {inputs['period']['target']}")
    errs = validate(assumptions)
    if errs:
        return {"status": "invalid_assumptions", "errors": errs}
    flags = []
    if actuals.get("layout") == "financial":
        flags.append("financial layout: EBITDA lines are not meaningful — use pat_override (NII = AUM x NIM, credit cost) and read Revenue/PAT/EPS only")
    ratio = pat_ratio(actuals["quarters"], flags)
    if ratio != 1.0:
        flags.append(f"PAT = (PBT - tax) x {ratio:.3f} (historical median; minority interest / associates)")
    shares = _f(assumptions["sharesCr"]["value"])
    base_sc = assumptions["scenarios"]["base"]
    scen_inputs = {s: (base_sc if s == "base" else merge(base_sc, assumptions["scenarios"].get(s) or {})) for s in SCENARIOS}
    missing = [s for s in ("bear", "bull") if s not in assumptions["scenarios"]]
    if missing:
        flags.append(f"scenario(s) {missing} not specified: they equal base — bear/bull must differ on at least one named driver")
    scen = {s: project_scenario(scen_inputs[s], actuals, target, shares, ratio) for s in SCENARIOS}
    comps = comparators(actuals, target, assumptions.get("baseCleaning") or [])
    out = {"status": "ok", "targetQuarter": target, "fiscalYear": fp.fy_label(fp.parse_fq(target)[1]),
           "patRatio": ratio, "comparators": comps, "scenarios": {}}
    cleaning = assumptions.get("baseCleaning") or []
    for s in SCENARIOS:
        p = scen[s]
        core = fy_core(p, cleaning)
        out["scenarios"][s] = {
            "target": {k: r2(v) for k, v in p["target"].items()},
            "rest": {q: {k: r2(v) for k, v in row.items()} for q, row in p["rest"].items()},
            "fy": {k: r2(v) for k, v in p["fy"].items()},
            "fy_core": {k: r2(v) for k, v in core.items()} if core else None,
            "shares_cr": None if p["shares_cr"] is None else round(p["shares_cr"], 4),
            "ytd_quarters": p["ytd_quarters"],
            "deltas": deltas(p, comps, core),
            "notes": p["notes"],
            "inputs": inputs_ledger(scen_inputs[s]),
        }
    # leave-one-out lever attribution on base PAT (target quarter and FY)
    attrib = []
    for lv in base_sc.get("levers") or []:
        if lv.get("embedded"):
            attrib.append({"lever": lv.get("name"), "embedded": True, "target_pat_cr": 0.0, "fy_pat_cr": 0.0,
                           "basis": lv.get("basis"), "note": "already inside the guidance-based driver — shown, not added"})
            continue
        wo = project_scenario(base_sc, actuals, target, shares, ratio, skip_lever=lv.get("name"))
        attrib.append({"lever": lv.get("name"), "line": lv.get("line"), "basis": lv.get("basis"),
                       "target_pat_cr": r2(scen["base"]["target"]["pat"] - wo["target"]["pat"]),
                       "fy_pat_cr": r2(scen["base"]["fy"]["pat"] - wo["fy"]["pat"])})
    out["attribution"] = attrib
    soft = sum(a["target_pat_cr"] or 0 for a in attrib if a.get("basis") in SOFT_BASES)
    led = out["scenarios"]["base"]["inputs"]
    out["assumptionShare"] = {
        "inputsByBasis": {b: sum(1 for r in led if r["basis"] == b) for b in VALID_BASES if any(r["basis"] == b for r in led)},
        "corePathBasis": {r["input"]: r["basis"] for r in led if not r["input"].startswith("lever")},
        "softLeverPatShareOfTargetPct": fp.r1(soft / scen["base"]["target"]["pat"] * 100) if scen["base"]["target"]["pat"] else None,
    }
    shares_hint = ((inputs.get("shares") or {}).get("latestCr"))
    out["flags"] = flags + sanity_flags(actuals, target, scen, comps, shares_hint)
    out["bands"] = {m: {s: out["scenarios"][s]["target"].get(m) for s in SCENARIOS} for m in ("revenue", "ebitda", "pat", "eps")}
    out["leverage"], lev_flags = leverage_profile(out["scenarios"]["base"]["deltas"])
    out["guidanceLadder"] = guidance_ladder(actuals, target, out["scenarios"]["base"])
    gl = out["guidanceLadder"]
    if gl["requiredRevenueYoYPct"] is not None and gl["ytdRevenueYoYPct"] is not None and gl["requiredRevenueYoYPct"] - gl["ytdRevenueYoYPct"] > 15:
        lev_flags.append(f"rest-of-FY needs revenue YoY {gl['requiredRevenueYoYPct']}% vs YTD {gl['ytdRevenueYoYPct']}%: back-ended / stretch")
    out["flags"] = out["flags"] + lev_flags
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inputs", required=True)
    ap.add_argument("--assumptions", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    res = run(json.load(open(a.inputs)), json.load(open(a.assumptions)))
    json.dump(res, open(a.out, "w"), indent=1)
    if res["status"] != "ok":
        print(json.dumps(res))
        raise SystemExit(2)
    b = res["scenarios"]["base"]
    print(json.dumps({"out": a.out, "target": res["targetQuarter"],
                      "base_target": {m: b["target"][m] for m in ("revenue", "ebitda", "pat", "eps")},
                      "base_fy": {m: b["fy"][m] for m in ("revenue", "ebitda", "pat", "eps")},
                      "bands_pat": res["bands"]["pat"], "flags": len(res["flags"])}))


if __name__ == "__main__":
    main()
