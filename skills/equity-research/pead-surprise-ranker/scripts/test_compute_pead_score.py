#!/usr/bin/env python3
"""Unit tests for the growth-first sort in compute_pead_score.py."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compute_pead_score import sort_key  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
