#!/usr/bin/env python3
"""Unit tests for search_anil_lamba.py."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from search_anil_lamba import tokenize, filter_lamba_index, corpus_fingerprint, best_excerpt

class TestSearchAnilLamba(unittest.TestCase):
    def test_tokenize(self):
        text = "Understanding the Working Capital Cycle & Profit in 2026!"
        tokens = tokenize(text)
        self.assertIn("understanding", tokens)
        self.assertIn("working", tokens)
        self.assertIn("capital", tokens)
        self.assertIn("cycle", tokens)
        self.assertIn("profit", tokens)
        self.assertNotIn("the", tokens)
        self.assertNotIn("in", tokens)

    def test_filter_lamba_index(self):
        mock_index = {
            "rec1": {"channelHandle": "@anillamba", "videoTitle": "Lamba Vid 1"},
            "rec2": {"channelHandle": "SOICfinance", "videoTitle": "SOIC Vid 1"},
            "rec3": {"channelTitle": "Dr. Anil Lamba", "videoTitle": "Lamba Vid 2"},
            "rec4": {"channelId": "UC5mK0-K-r3KET0kifn-mJMg", "videoTitle": "Lamba Vid 3"},
        }
        filtered = filter_lamba_index(mock_index)
        self.assertEqual(len(filtered), 3)
        self.assertIn("rec1", filtered)
        self.assertNotIn("rec2", filtered)
        self.assertIn("rec3", filtered)
        self.assertIn("rec4", filtered)

    def test_corpus_fingerprint(self):
        idx = {
            "r1": {"modifiedTime": "2026-08-01T00:00:00Z"},
            "r2": {"modifiedTime": "2026-08-05T00:00:00Z"},
        }
        fp = corpus_fingerprint(idx)
        self.assertTrue(len(fp) > 0)
        self.assertEqual(fp, corpus_fingerprint(idx))

    def test_best_excerpt_timestamped(self):
        ts_text = (
            "[00:01:00] In this video we discuss general accounting.\n"
            "[00:01:30] The contribution margin is sales minus variable costs.\n"
            "[00:02:00] Break even point is where fixed costs equal contribution."
        )
        ts, excerpt = best_excerpt(ts_text, "", ["contribution", "margin"])
        self.assertIsNotNone(ts)
        self.assertIn("contribution margin", excerpt.lower())


if __name__ == "__main__":
    unittest.main()
