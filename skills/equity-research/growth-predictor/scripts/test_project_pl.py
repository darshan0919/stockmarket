#!/usr/bin/env python3
"""Unit tests for project_pl.py (run: python3 -m unittest discover -s skills/equity-research/growth-predictor/scripts -p 'test_*.py')."""
import copy
import importlib.util
import os
import unittest

HERE = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location("project_pl", os.path.join(HERE, "project_pl.py"))
pp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pp)


def q(fq, period, fy, rev, op, oi, intr, dep, tax, pat, eps, yoy=None):
    pbt = op + oi - intr - dep
    return {"fq": fq, "fiscalPeriod": period, "fiscalYear": fy, "yyyymm": "", "revenue": rev, "operating_profit": op,
            "opm_pct": round(op / rev * 100, 1), "other_income": oi, "interest": intr, "depreciation": dep,
            "pbt": pbt, "tax": tax, "pat": pat, "eps": eps, "revenue_growth_pct": yoy}


QUARTERS = [
    q("Q1FY26", "Q1", 2026, 100, 20, 2, 1, 5, 4, 12, 1.2),
    q("Q2FY26", "Q2", 2026, 110, 22, 2, 1, 5, 4.5, 13.5, 1.35),
    q("Q3FY26", "Q3", 2026, 120, 24, 2, 1, 5, 5, 15, 1.5),
    q("Q4FY26", "Q4", 2026, 130, 26, 2, 1, 5, 5.5, 16.5, 1.65, 20),
    q("Q1FY27", "Q1", 2027, 120, 24, 12, 1, 5, 7.5, 22.5, 2.25, 20),  # OI includes a 10 cr one-off
]
YEARS = [{"fiscalYear": 2026, "fy": "FY26", "revenue": 460, "operating_profit": 92, "opm_pct": 20.0, "pbt": 76, "tax": 19,
          "pat": 57, "eps": 5.7}]
INPUTS = {
    "companyId": "NSE:TEST",
    "period": {"target": "Q2FY27"},
    "shares": {"latestCr": 10.0},
    "actuals": {"layout": "industrial", "quarters": QUARTERS, "years": YEARS,
                "baselines": {"seasonality": {"FY26": {"Q1": 0.2174, "Q2": 0.2391, "Q3": 0.2609, "Q4": 0.2826}}}},
}
BASE = {
    "revenue": {"fy_abs_cr": 552, "target_q_yoy_pct": 20, "basis": "guided", "source": "FY guide +20%"},
    "ebitda_margin": {"target_q_pct": 20, "basis": "guided", "source": "guided 20%"},
    "other_income": {"q_cr": 2, "basis": "derived", "source": "core OI"},
    "depreciation": {"q_cr": 5, "basis": "actual", "source": "run-rate"},
    "interest": {"q_cr": 1, "basis": "actual", "source": "run-rate"},
    "tax_rate": {"pct": 25, "basis": "actual", "source": "FY26 ETR"},
    "levers": [],
}


def assumptions(**over):
    a = {"targetQuarter": "Q2FY27", "sharesCr": {"value": 10.0, "basis": "filing", "source": "x"},
         "baseCleaning": [{"quarter": "Q1FY27", "line": "pat", "reported": 22.5, "normalised": 15.0, "reason": "one-off",
                           "basis": "actual", "source": "concall"}],
         "scenarios": {"base": copy.deepcopy(BASE),
                       "bear": {"revenue": {"target_q_yoy_pct": 10, "fy_abs_cr": 530, "basis": "heuristic", "source": "b"}},
                       "bull": {"revenue": {"target_q_yoy_pct": 30, "fy_abs_cr": 575, "basis": "heuristic", "source": "u"}}}}
    a.update(over)
    return a


class ProjectTests(unittest.TestCase):
    def test_bridge_arithmetic(self):
        out = pp.run(INPUTS, assumptions())
        t = out["scenarios"]["base"]["target"]
        self.assertAlmostEqual(t["revenue"], 132.0)          # 110 x 1.2
        self.assertAlmostEqual(t["ebitda"], 26.4)            # x 20%
        self.assertAlmostEqual(t["pbt"], 22.4)               # +2 -5 -1
        self.assertAlmostEqual(t["pat"], 16.8)               # x 0.75
        self.assertAlmostEqual(t["eps"], 1.68)

    def test_fy_is_ytd_plus_projection_and_core_strips_one_off(self):
        out = pp.run(INPUTS, assumptions())
        b = out["scenarios"]["base"]
        self.assertAlmostEqual(b["fy"]["revenue"], 552.0)
        self.assertEqual(b["ytd_quarters"], ["Q1FY27"])
        self.assertAlmostEqual(b["fy_core"]["pat"], round(b["fy"]["pat"] - 7.5, 2), places=1)
        self.assertIn("core", b["deltas"]["fyofy"])
        self.assertIn("core", b["deltas"]["qoq"])  # Q1FY27 PAT cleaned -> core QoQ comparator
        self.assertAlmostEqual(b["deltas"]["qoq"]["core"]["pat"], round((16.8 / 15.0 - 1) * 100, 1))

    def test_yoy_and_margin_bps(self):
        d = pp.run(INPUTS, assumptions())["scenarios"]["base"]["deltas"]["yoy"]["reported"]
        self.assertEqual(d["revenue"], 20.0)
        self.assertEqual(d["ebitda_margin_bps"], 0)

    def test_levers_and_leave_one_out_attribution(self):
        a = assumptions()
        a["scenarios"]["base"]["levers"] = [
            {"name": "debt cut", "line": "interest", "q_delta_cr": -1.0, "rest_delta_cr": -2.0, "basis": "filing", "source": "f"},
            {"name": "plant ramp", "line": "revenue", "q_delta_cr": 10, "rest_delta_cr": 20, "basis": "heuristic", "source": "h"},
            {"name": "in guide", "line": "revenue", "q_delta_cr": 99, "embedded": True, "basis": "guided", "source": "g"},
        ]
        out = pp.run(INPUTS, a)
        at = {x["lever"]: x for x in out["attribution"]}
        self.assertAlmostEqual(at["debt cut"]["target_pat_cr"], 0.75)       # 1 x (1-25%)
        self.assertAlmostEqual(at["plant ramp"]["target_pat_cr"], 1.5)      # 10 x 20% x 0.75
        self.assertEqual(at["in guide"]["target_pat_cr"], 0.0)
        self.assertGreater(out["assumptionShare"]["softLeverPatShareOfTargetPct"], 0)

    def test_scenario_inheritance_and_order_flag(self):
        out = pp.run(INPUTS, assumptions())
        self.assertEqual(out["scenarios"]["bear"]["target"]["other_income"], 2.0)   # inherited
        self.assertLess(out["bands"]["pat"]["bear"], out["bands"]["pat"]["base"])
        a = assumptions()
        a["scenarios"]["bull"]["revenue"]["target_q_yoy_pct"] = 0
        flags = pp.run(INPUTS, a)["flags"]
        self.assertTrue(any("scenario order broken" in f for f in flags))

    def test_validation_rejects_untraceable_inputs(self):
        a = assumptions()
        del a["scenarios"]["base"]["revenue"]["source"]
        a["scenarios"]["base"]["tax_rate"]["basis"] = "vibes"
        out = pp.run(INPUTS, a)
        self.assertEqual(out["status"], "invalid_assumptions")
        self.assertEqual(len(out["errors"]), 2)

    def test_target_quarter_must_be_next_unreported(self):
        with self.assertRaises(ValueError):
            pp.run(INPUTS, assumptions(targetQuarter="Q3FY27"))

    def test_margin_outside_history_is_flagged(self):
        a = assumptions()
        a["scenarios"]["base"]["ebitda_margin"]["target_q_pct"] = 35
        a["scenarios"]["bull"]["ebitda_margin"] = {"target_q_pct": 36, "basis": "heuristic", "source": "x"}
        flags = pp.run(INPUTS, a)["flags"]
        self.assertTrue(any("outside 12-quarter range" in f for f in flags))

    def test_pat_override_for_financials(self):
        a = assumptions()
        a["scenarios"]["base"]["pat_override"] = {"q_cr": 40, "fy_cr": 150, "basis": "derived", "source": "AUM x NIM"}
        a["scenarios"]["bear"]["pat_override"] = {"q_cr": 35, "fy_cr": 140, "basis": "derived", "source": "x"}
        a["scenarios"]["bull"]["pat_override"] = {"q_cr": 45, "fy_cr": 160, "basis": "derived", "source": "x"}
        out = pp.run(INPUTS, a)
        self.assertEqual(out["scenarios"]["base"]["target"]["pat"], 40.0)
        self.assertEqual(out["scenarios"]["base"]["fy"]["pat"], 150.0)

    def test_leverage_and_guidance_ladder(self):
        out = pp.run(INPUTS, assumptions())
        lev = out["leverage"]["yoy"]
        self.assertAlmostEqual(lev["combined"], round(out["scenarios"]["base"]["deltas"]["yoy"]["reported"]["pat"] / 20.0, 2))
        gl = out["guidanceLadder"]
        self.assertEqual(gl["remainingQuarters"], ["Q2FY27", "Q3FY27", "Q4FY27"])
        self.assertAlmostEqual(gl["requiredRevenueCr"], 432.0)          # 552 - 120 YTD
        self.assertAlmostEqual(gl["requiredRevenueYoYPct"], 20.0)       # vs 360 last year
        self.assertAlmostEqual(gl["ytdRevenueYoYPct"], 20.0)


if __name__ == "__main__":
    unittest.main()
