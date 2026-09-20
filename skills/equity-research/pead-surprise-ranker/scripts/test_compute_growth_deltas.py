#!/usr/bin/env python3
"""Unit tests for compute_growth_deltas.py (synthetic, hand-checkable numbers)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compute_growth_deltas import fy_num, growth_score, pct_change, project  # noqa: E402


def q(fy, p, rev, op, pat, fq=None):
    return {"fiscalYear": fy, "fiscalPeriod": p, "fq": fq or f"{p}FY{str(fy)[-2:]}",
            "revenue": rev, "operating_profit": op, "opm_pct": round(op / rev * 100, 1),
            "pat": pat, "npm_pct": round(pat / rev * 100, 1)}


def actuals(layout="industrial", latest_fp="Q1"):
    """FY26: 200/240/260/300 rev @10% OPM, 6% NPM, tax 25%. Q1FY27: 250 rev, 12% OPM, 7.2% NPM."""
    fy26 = [q(2026, "Q1", 200, 20, 12), q(2026, "Q2", 240, 24, 14.4),
            q(2026, "Q3", 260, 26, 15.6), q(2026, "Q4", 300, 30, 18)]
    fy27 = [q(2027, "Q1", 250, 30, 18)]
    quarters = fy26 + (fy27 if latest_fp == "Q1" else [])
    latest = quarters[-1]
    nxt = {"fiscalYear": 2027, "fiscalPeriod": "Q2", "fq": "Q2FY27"} if latest_fp == "Q1" else \
          {"fiscalYear": 2027, "fiscalPeriod": "Q1", "fq": "Q1FY27"}
    yr = {"fiscalYear": 2026, "fy": "FY26", "revenue": 1000, "operating_profit": 100, "opm_pct": 10.0,
          "pbt": 80, "tax": 20, "pat": 60, "npm_pct": 6.0}
    return {"layout": layout, "basis": "consolidated", "quarters": quarters, "years": [yr],
            "baselines": {"latest_quarter": latest, "next_quarter": nxt,
                          "year_ago_quarter": fy26[1] if latest_fp == "Q1" else fy26[0],
                          "latest_year_ago": fy26[0] if latest_fp == "Q1" else fy26[3],
                          "last_fy": yr,
                          "seasonality": {"FY26": {"Q1": .2, "Q2": .24, "Q3": .26, "Q4": .30}}}}


GI = {"guided_fy": "FY27", "revenue": {"growth_pct": 30},
      "operating_profit": {"opm_pct": 13}, "quarter_weights": {"Q2": .3, "Q3": .3, "Q4": .4},
      "phasing_basis": "test"}


class TestHelpers(unittest.TestCase):
    def test_fy_num(self):
        self.assertEqual(fy_num("FY27"), 2027)
        self.assertEqual(fy_num("fy2028"), 2028)
        with self.assertRaises(ValueError):
            fy_num("27")

    def test_pct_change_guards_nonpositive_base(self):
        self.assertAlmostEqual(pct_change(120, 100), 20.0)
        self.assertIsNone(pct_change(50, 0))
        self.assertIsNone(pct_change(50, -10))  # growth off a loss is meaningless
        self.assertIsNone(pct_change(None, 10))


class TestProject(unittest.TestCase):
    def test_full_projection_hand_computed(self):
        g = project(actuals(), GI)
        self.assertEqual(g["status"], "ok")
        # FY rev 1300; YTD 250; remaining 1050; Q2 weight .3 -> 315
        self.assertAlmostEqual(g["projected_quarter"]["revenue"], 315.0, places=1)
        # FY OP = 13% * 1300 = 169; remaining OP 139 -> OPM_rem = 139/1050 = 13.238%; Q2 OP = 41.7
        self.assertAlmostEqual(g["projected_quarter"]["operating_profit"], 41.7, places=1)
        # NPM_q = 7.2 + (13.238 - 12) * 0.75 = 8.129% -> PAT 25.6
        self.assertAlmostEqual(g["projected_quarter"]["pat"], 25.6, places=1)
        d = g["deltas"]
        self.assertAlmostEqual(d["revenue"]["qoq"], 26.0, places=1)      # 315/250
        self.assertAlmostEqual(d["revenue"]["yoy"], 31.25, delta=0.06)   # 315/240
        self.assertAlmostEqual(d["revenue"]["fyofy"], 30.0, places=1)    # 1300/1000
        self.assertAlmostEqual(d["operating_profit"]["qoq"], 39.0, places=1)   # 41.7/30
        self.assertAlmostEqual(d["operating_profit"]["yoy"], 73.8, places=1)   # 41.7/24
        self.assertAlmostEqual(d["operating_profit"]["fyofy"], 69.0, places=1)  # 169/100
        # FY PAT = 18 + 1050 * 8.129% = 103.35 -> +72.3% vs 60
        self.assertAlmostEqual(d["pat"]["fyofy"], 72.25, delta=0.06)
        self.assertEqual(g["basis_quality"], "explicit")
        self.assertEqual(g["growth_coverage"], 1.0)
        # remaining quarters: 1050 vs FY26 Q2-Q4 = 800 -> +31.3%
        self.assertAlmostEqual(g["context"]["implied_remaining_revenue_yoy_pct"], 31.25, delta=0.06)

    def test_unguided_opm_holds_latest_quarter_and_is_tagged(self):
        gi = {**GI, "operating_profit": None}
        g = project(actuals(), gi)
        self.assertAlmostEqual(g["projected_quarter"]["opm_pct"], 12.0, places=1)
        self.assertTrue(any("OPM held" in a for a in g["assumptions"]))
        self.assertEqual(g["basis_quality"], "derived")

    def test_default_phasing_uses_seasonality(self):
        gi = {k: v for k, v in GI.items() if k != "quarter_weights"}
        g = project(actuals(), gi)
        # seasonality Q2:Q3:Q4 = .24:.26:.30 -> Q2 share .3
        self.assertAlmostEqual(g["projected_quarter"]["revenue"], 1050 * 0.24 / 0.80, places=1)
        self.assertTrue(any("seasonality" in a for a in g["assumptions"]))

    def test_year_path_phases_multi_year_target_by_year_first(self):
        gi = {"guided_fy": "FY27", "revenue": {"year_path": {
            "base_fy": "FY26", "target_fy": "FY29", "target_revenue_cr": 2000,
            "cumulative_share": {"FY27": 0.3, "FY28": 0.65, "FY29": 1.0}}, "basis": "derived"}}
        g = project(actuals(), gi)
        self.assertAlmostEqual(g["projected_fy"]["revenue"], 1300.0, places=1)  # 1000 + 1000*0.3
        self.assertEqual(g["basis_quality"], "derived")

    def test_target_quarter_guidance_overrides_phasing(self):
        gi = {"guided_fy": "FY27", "revenue": {"growth_pct": 30}, "target_quarter": {"revenue_cr": 330}}
        g = project(actuals(), gi)
        self.assertAlmostEqual(g["projected_quarter"]["revenue"], 330.0, places=1)
        self.assertAlmostEqual(g["projected_fy"]["revenue"], 1300.0, places=1)  # FY total still honoured

    def test_after_q4_has_no_ytd_and_uses_fy_base(self):
        a = actuals(latest_fp="Q4")
        g = project(a, {"guided_fy": "FY27", "revenue": {"growth_pct": 20}, "operating_profit": {"opm_pct": 12},
                        "quarter_weights": {"Q1": .2, "Q2": .24, "Q3": .26, "Q4": .3}})
        self.assertEqual(g["ytd_quarters"], [])
        self.assertAlmostEqual(g["projected_quarter"]["revenue"], 1200 * 0.2, places=1)
        self.assertAlmostEqual(g["deltas"]["revenue"]["yoy"], 20.0, places=1)  # Q1FY27 240 vs Q1FY26 200
        self.assertAlmostEqual(g["deltas"]["revenue"]["qoq"], -20.0, places=1)  # seasonal Q4 -> Q1 dip

    def test_guided_fy_beyond_current_gives_fy_level_only(self):
        gi = {"guided_fy": "FY28", "revenue": {"fy_abs_cr": 1600}}
        a = actuals()
        a["years"].append({"fiscalYear": 2027, "fy": "FY27", "revenue": 1300, "operating_profit": 160,
                           "opm_pct": 12.3, "pbt": 120, "tax": 30, "pat": 90, "npm_pct": 6.9})
        g = project(a, gi)
        self.assertIsNone(g["projected_quarter"])
        self.assertAlmostEqual(g["deltas"]["revenue"]["fyofy"], 23.1, places=1)
        self.assertIsNone(g["deltas"]["revenue"]["qoq"])
        self.assertTrue(any("beyond the current FY" in f for f in g["flags"]))

    def test_stale_guidance_for_completed_fy(self):
        g = project(actuals(), {"guided_fy": "FY26", "revenue": {"growth_pct": 10}})
        self.assertEqual(g["status"], "guided_fy_already_complete")

    def test_negative_base_gives_null_growth_and_flag(self):
        a = actuals()
        a["baselines"]["latest_quarter"]["pat"] = -5
        g = project(a, GI)
        self.assertIsNone(g["deltas"]["pat"]["qoq"])
        self.assertTrue(any("pat qoq base <= 0" in f for f in g["flags"]))

    def test_financial_layout_drops_operating_profit(self):
        g = project(actuals(layout="financial"), {"guided_fy": "FY27", "revenue": {"growth_pct": 25}})
        self.assertIsNone(g["deltas"]["operating_profit"]["fyofy"])
        self.assertIsNotNone(g["deltas"]["pat"]["fyofy"])
        self.assertEqual(g["growth_coverage"], 1.0)  # OP excluded from the denominator, not counted as missing

    def test_guidance_already_met_is_flagged(self):
        g = project(actuals(), {"guided_fy": "FY27", "revenue": {"fy_abs_cr": 240}})
        self.assertTrue(any("already met" in f for f in g["flags"]))

    def test_no_revenue_guidance(self):
        g = project(actuals(), {"guided_fy": "FY27", "operating_profit": {"opm_pct": 15}})
        self.assertEqual(g["status"], "no_revenue_guidance")


class TestGrowthScore(unittest.TestCase):
    def test_bottom_line_outranks_top_line_and_thin_coverage_is_shrunk(self):
        same = {"fyofy": 50.0, "yoy": 50.0, "qoq": 12.5}     # 50/100 on every cell
        s_rev, c_rev, raw_rev = growth_score({"revenue": same})
        s_pat, c_pat, raw_pat = growth_score({"pat": same})
        self.assertEqual((raw_rev, raw_pat), (50.0, 50.0))    # renormalised over what exists
        self.assertAlmostEqual(c_rev, 0.25)
        self.assertAlmostEqual(c_pat, 0.40)
        self.assertAlmostEqual(s_rev, 31.2, delta=0.06)       # 50 * (0.5 + 0.5*0.25)
        self.assertAlmostEqual(s_pat, 35.0, delta=0.06)       # 50 * (0.5 + 0.5*0.40)
        self.assertGreater(s_pat, s_rev)

    def test_full_coverage_is_unshrunk(self):
        full = {m: {"fyofy": 50.0, "yoy": 50.0, "qoq": 12.5} for m in ("revenue", "operating_profit", "pat")}
        self.assertEqual(growth_score(full), (50.0, 1.0, 50.0))

    def test_negative_growth_scores_zero_and_none_when_no_data(self):
        s, _, _ = growth_score({"pat": {"fyofy": -30.0, "yoy": None, "qoq": None}})
        self.assertEqual(s, 0.0)
        self.assertEqual(growth_score({}), (None, 0.0, None))

    def test_caps(self):
        s, _, raw = growth_score({"pat": {"fyofy": 900.0, "yoy": 900.0, "qoq": 900.0}})
        self.assertEqual(raw, 100.0)

    def test_financial_layout_excludes_operating_profit_from_coverage(self):
        d = {m: {"fyofy": 50.0, "yoy": 50.0, "qoq": 12.5} for m in ("revenue", "pat")}
        self.assertEqual(growth_score(d, "financial")[1], 1.0)


if __name__ == "__main__":
    unittest.main()
