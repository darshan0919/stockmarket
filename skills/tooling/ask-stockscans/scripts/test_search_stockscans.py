#!/usr/bin/env python3
"""Unit tests for search_stockscans.py."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from search_stockscans import tokenize, filter_stockscans_index, corpus_fingerprint, best_excerpt


class TestSearchStockScans(unittest.TestCase):
    def test_tokenize(self):
        text = "StockScans Research AI, Concall Scans & IPO Filters in 2026!"
        tokens = tokenize(text)
        self.assertIn("stockscans", tokens)
        self.assertIn("research", tokens)
        self.assertIn("ai", tokens)
        self.assertIn("concall", tokens)
        self.assertIn("scans", tokens)
        self.assertIn("ipo", tokens)
        self.assertNotIn("in", tokens)
        self.assertNotIn("the", tokens)

    def test_filter_stockscans_index(self):
        mock_index = {
            "rec1": {"channelHandle": "@StockScans", "videoTitle": "StockScans Video 1"},
            "rec2": {"channelHandle": "SOICfinance", "videoTitle": "SOIC Video 1"},
            "rec3": {"channelTitle": "StockScans", "videoTitle": "StockScans Video 2"},
            "rec4": {"channelId": "UCrgKbrMD08iK8HI4oFA--kA", "videoTitle": "StockScans Video 3"},
            "rec5": {"channelHandle": "@anillamba", "videoTitle": "Lamba Video 1"},
        }
        filtered = filter_stockscans_index(mock_index)
        self.assertEqual(len(filtered), 3)
        self.assertIn("rec1", filtered)
        self.assertNotIn("rec2", filtered)
        self.assertIn("rec3", filtered)
        self.assertIn("rec4", filtered)
        self.assertNotIn("rec5", filtered)

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
            "[00:01:00] In this video we show how to use StockScans.\n"
            "[00:01:30] Research AI can summarize con-calls and management sentiment.\n"
            "[00:02:00] You can also filter for order book wins."
        )
        ts, excerpt = best_excerpt(ts_text, "", ["research", "sentiment"])
        self.assertIsNotNone(ts)
        self.assertIn("research ai", excerpt.lower())


if __name__ == "__main__":
    unittest.main()
