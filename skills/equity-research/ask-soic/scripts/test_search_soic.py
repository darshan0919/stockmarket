#!/usr/bin/env python3
"""Unit tests for search_soic.py."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from search_soic import tokenize, corpus_fingerprint, best_excerpt


class TestSearchSoic(unittest.TestCase):
    def test_tokenize(self):
        tokens = tokenize("How does SOIC think about moats in cyclical businesses?")
        self.assertIn("soic", tokens)
        self.assertIn("moats", tokens)
        self.assertIn("cyclical", tokens)
        self.assertIn("businesses", tokens)
        self.assertNotIn("how", tokens)
        self.assertNotIn("does", tokens)

    def test_corpus_fingerprint(self):
        ly = {"l1": {"modifiedTime": "2026-08-01T00:00:00Z"}}
        yt = {"y1": {"modifiedTime": "2026-08-05T00:00:00Z"}}
        fp = corpus_fingerprint(ly, yt)
        self.assertTrue(len(fp) > 0)
        self.assertEqual(fp, corpus_fingerprint(ly, yt))

    def test_best_excerpt_timestamped(self):
        ts_text = (
            "[00:00:10] Welcome to SOIC channel.\n"
            "[00:01:00] Today we discuss competitive moats and return on capital.\n"
            "[00:01:45] Capital allocation is key."
        )
        ts, excerpt = best_excerpt(ts_text, "", ["competitive", "moats"])
        self.assertIsNotNone(ts)
        self.assertIn("competitive moats", excerpt.lower())


if __name__ == "__main__":
    unittest.main()
