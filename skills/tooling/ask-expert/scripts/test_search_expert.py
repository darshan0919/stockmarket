#!/usr/bin/env python3
"""Unit tests for search_expert.py."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import search_expert


class TestSearchExpert(unittest.TestCase):
    def test_search_expert_modules_loaded(self):
        self.assertIsNotNone(search_expert.search_soic)
        self.assertIsNotNone(search_expert.search_anil_lamba)

    def test_search_expert_data_fetch(self):
        data_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../data"))
        if not os.path.exists(os.path.join(data_root, "youtube-transcripts.json")):
            self.skipTest("data/youtube-transcripts.json not found")

        # Test Lamba search
        lamba_hits = search_expert.search_lamba_corpus(data_root, "contribution margin", top_n=2, force_reindex=False)
        self.assertTrue(len(lamba_hits) > 0)
        self.assertEqual(lamba_hits[0]["expert"], "anil-lamba")

        # Test SOIC search
        soic_hits = search_expert.search_soic_corpus(data_root, "multibagger", top_n=2, force_reindex=False)
        self.assertTrue(len(soic_hits) > 0)
        self.assertEqual(soic_hits[0]["expert"], "soic")


if __name__ == "__main__":
    unittest.main()
