#!/usr/bin/env python3
"""Unit tests for the growth-first sort in compute_pead_score.py."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compute_pead_score import sort_key, score_one  # noqa: E402


def row(t, growth, comp):
    return {"ticker": t, "growth_score": growth, "composite_score": comp}


class TestSort(unittest.TestCase):
    rows = [row("LOW_GROWTH_HIGH_VIS", 10.0, 90.0), row("HIGH_GROWTH", 60.0, 50.0),
            row("UNSCORED_HIGH_VIS", None, 95.0), row("UNSCORED_LOW_VIS", None, 30.0),
            row("TIE_HIGH_VIS", 10.0, 95.0)]

    def test_growth_first_then_composite_and_unscored_last(self):
        got = [r["ticker"] for r in sorted(self.rows, key=sort_key("growth"))]
        self.assertEqual(got, ["HIGH_GROWTH", "TIE_HIGH_VIS", "LOW_GROWTH_HIGH_VIS",
                               "UNSCORED_HIGH_VIS", "UNSCORED_LOW_VIS"])

    def test_composite_mode_ignores_growth(self):
        got = [r["ticker"] for r in sorted(self.rows, key=sort_key("composite"))]
        self.assertEqual(got[:2], ["UNSCORED_HIGH_VIS", "TIE_HIGH_VIS"])


class TestScoreOne(unittest.TestCase):
    def test_opex_leverage_elevated_score(self):
        candidate = {
            "tier": 2,  # +28
            "margin_dir": "expansion",  # +22
            "pat_lever": "opex_leverage",  # +20
            "rev_guided_pct": 30.0,  # 30/60 * 17 = +8.5
            "evidence": "high",  # +12
        }
        score, notes = score_one(candidate)
        # 28 + 22 + 20 + 8.5 + 12 = 90.5
        self.assertEqual(score, 90.5)

    def test_compound_levers_and_qoq_bonus(self):
        candidate = {
            "tier": 2,  # +28
            "margin_dir": "expansion",  # +22
            "pat_lever": ["opex_leverage", "deleverage_direct"],  # 20 + 18 = 38 -> capped at 28
            "rev_guided_pct": 30.0,  # +8.5
            "evidence": "high",  # +12
            "qoq_status": "revised",  # +10
        }
        score, notes = score_one(candidate)
        # 28 + 22 + 28 + 8.5 + 12 + 10 = 108.5
        self.assertEqual(score, 108.5)
        self.assertTrue(any("Upward guidance revision" in n for n in notes))


if __name__ == "__main__":
    unittest.main()

