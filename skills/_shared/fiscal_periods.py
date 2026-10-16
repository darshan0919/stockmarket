#!/usr/bin/env python3
"""
fiscal_periods.py -- shared, zero-LLM helpers for Indian fiscal-period arithmetic over
`stock-api/bin/company-financials.js` output (12 quarters, ~7 FYs, TTM, baselines).

Extracted 2026-10-14 from pead-surprise-ranker/scripts/compute_growth_deltas.py so that
pead-predictor (formerly growth-predictor, and any future forecasting skill) uses the SAME period labels, growth-off-base
rule, seasonality phasing and tax-rate fallback as the PEAD ranker -- two skills must never
disagree on what "QoQ" or "FY27 YTD" means (conventions.md §17).

Load it the repo way (no package install):
    spec = importlib.util.spec_from_file_location("fiscal_periods", "<repo>/skills/_shared/fiscal_periods.py")

Conventions (all callers rely on these):
  * Fiscal year = Apr-Mar; "FY27" == fiscalYear 2027 == Apr 2026 - Mar 2027.
  * Quarter labels "Q1".."Q4" (Q1 = Apr-Jun); full label "Q2FY27".
  * Growth off a non-positive base is None (never a huge/negative %), see pct_change.
"""
import re

QUARTERS = ["Q1", "Q2", "Q3", "Q4"]
DEFAULT_TAX_RATE = 0.25  # Indian new-regime corporate rate incl. surcharge/cess, rounded


def fy_num(label):
    """'FY27' / 'FY2027' / 2027 -> 2027."""
    if isinstance(label, int):
        return label
    m = re.match(r"^FY(\d{2,4})$", str(label).strip().upper())
    if not m:
        raise ValueError(f"bad FY label {label!r}")
    n = int(m.group(1))
    return n + 2000 if n < 100 else n


def fy_label(fiscal_year):
    """2027 -> 'FY27'."""
    return f"FY{str(int(fiscal_year))[-2:]}"


def fq_label(fiscal_period, fiscal_year):
    """('Q2', 2027) -> 'Q2FY27'."""
    return f"{fiscal_period}{fy_label(fiscal_year)}"


def parse_fq(label):
    """'Q2FY27' -> ('Q2', 2027)."""
    m = re.match(r"^(Q[1-4])\s*FY(\d{2,4})$", str(label).strip().upper())
    if not m:
        raise ValueError(f"bad quarter label {label!r}")
    return m.group(1), fy_num("FY" + m.group(2))


def shift_quarter(fiscal_period, fiscal_year, n):
    """Move n quarters (negative = back). ('Q1', 2027, -1) -> ('Q4', 2026)."""
    idx = QUARTERS.index(fiscal_period) + fiscal_year * 4 + n
    return QUARTERS[idx % 4], idx // 4


def remaining_quarters(fiscal_period):
    """Quarters of the FY from `fiscal_period` (inclusive) to Q4."""
    return QUARTERS[QUARTERS.index(fiscal_period):]


def pct_change(new, base):
    """Growth % of `new` over `base`; None when either is missing or base <= 0."""
    if new is None or base is None or base <= 0:
        return None
    return (new / base - 1.0) * 100.0


def r1(x):
    return None if x is None else round(x, 1)


def num(x):
    return None if x is None else float(x)


def quarter_index(quarters):
    """company-financials `quarters` list -> {('Q2', 2027): row}."""
    return {(q.get("fiscalPeriod"), q.get("fiscalYear")): q for q in quarters or [] if q.get("fiscalPeriod")}


def year_index(years):
    """company-financials `years` list -> {2026: row}."""
    return {y["fiscalYear"]: y for y in years or [] if y.get("fiscalYear")}


def ytd_rows(quarters, fiscal_year):
    """Reported quarters of `fiscal_year`, in order."""
    rows = [q for q in quarters or [] if q.get("fiscalYear") == fiscal_year and q.get("revenue") is not None]
    return sorted(rows, key=lambda q: QUARTERS.index(q["fiscalPeriod"]))


def tax_rate(base_fy, latest, assumptions=None):
    """Effective tax rate (0-0.5) from a FY or quarter row with tax & PBT; else 25% [assumption]."""
    for rec in (base_fy, latest):
        if rec and rec.get("pbt") and rec.get("tax") is not None and rec["pbt"] > 0:
            t = rec["tax"] / rec["pbt"]
            if 0 <= t <= 0.5:
                return t
    if assumptions is not None:
        assumptions.append("[assumption] tax rate 25% (no usable tax/PBT in actuals)")
    return DEFAULT_TAX_RATE


def default_weights(remaining, seasonality, assumptions=None):
    """Average past-FY revenue shares (company-financials baselines.seasonality) restricted to the
    `remaining` quarters and renormalised; equal split when there is no history."""
    fys = sorted(seasonality or {})
    if fys:
        raw = {q: sum(seasonality[fy][q] for fy in fys) / len(fys) for q in remaining}
        tot = sum(raw.values())
        if tot > 0:
            if assumptions is not None:
                assumptions.append(
                    f"[assumption] quarterly phasing = average seasonality of {', '.join(fys)} (not overridden)"
                )
            return {q: v / tot for q, v in raw.items()}
    if assumptions is not None:
        assumptions.append("[assumption] quarterly phasing = equal split (no seasonality history)")
    return {q: 1.0 / len(remaining) for q in remaining}


def seasonal_qoq(quarters, to_period, max_years=3):
    """Historical QoQ revenue change INTO `to_period` (e.g. Q1->Q2), one value per past FY,
    newest first. Used to phase a target quarter off the latest reported one when no FY
    guidance exists (SOIC modelling: 'Q4 is ~10% above Q3 every year')."""
    idx = quarter_index(quarters)
    out = []
    years = sorted({fy for (_, fy) in idx}, reverse=True)
    for fy in years:
        prev_p, prev_fy = shift_quarter(to_period, fy, -1)
        cur, prev = idx.get((to_period, fy)), idx.get((prev_p, prev_fy))
        if cur and prev and cur.get("revenue") and prev.get("revenue"):
            out.append({"fy": fy_label(fy), "qoq_pct": r1(pct_change(cur["revenue"], prev["revenue"]))})
        if len(out) >= max_years:
            break
    return out
