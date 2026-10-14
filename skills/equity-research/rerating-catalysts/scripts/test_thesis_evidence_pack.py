"""Unit tests for thesis_evidence_pack.py pure helpers (no subprocess, no corpus)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import thesis_evidence_pack as tep  # noqa: E402


class BuildQueriesTest(unittest.TestCase):
    def test_happy_path_lenses_in_order(self):
        dto = {"sector": "Power Equipment", "catalysts": [
            {"name": "765kV transformer capacity doubling", "newCategory": ["Capex"]},
            {"name": "Export order from US utility", "newCategory": "Large Orders"},
        ]}
        lenses = [l for l, _ in tep.build_queries(dto, ["transmission value chain"])]
        self.assertEqual(lenses, ["theme", "catalyst", "catalyst", "why-market-pays", "extra"])

    def test_caps_catalysts_and_words(self):
        dto = {"catalysts": [{"name": " ".join(["w"] * 40)} for _ in range(6)]}
        qs = tep.build_queries(dto)
        self.assertEqual(len(qs), 1)  # identical catalyst queries deduped
        self.assertLessEqual(len(qs[0][1].split()), tep.MAX_QUERY_WORDS)

    def test_empty_dto_yields_nothing(self):
        self.assertEqual(tep.build_queries({}), [])
        self.assertEqual(tep.build_queries({"catalysts": [{"name": "  "}]}, ["  "]), [])


class CompactHitsTest(unittest.TestCase):
    def _res(self):
        return {"experts": {
            "sureshKbn": {"results": [
                {"id": "a", "expert": "suresh-kbn", "excerpt": "x  " * 200, "url": "u", "date": "2026-10-01"},
                {"id": "b", "expert": "suresh-kbn", "excerpt": "y"},
                {"id": "c", "expert": "suresh-kbn", "excerpt": "z"},
            ]},
            "stockscans": {"results": [{"id": "s", "expert": "stockscans", "excerpt": "tutorial"}]},
        }}

    def test_quota_dedup_and_skip(self):
        seen = {"b"}
        hits = tep.compact_hits(self._res(), seen)
        self.assertEqual([h["expert"] for h in hits], ["suresh-kbn", "suresh-kbn"])  # stockscans quota 0
        self.assertEqual(seen, {"a", "b", "c"})
        self.assertLessEqual(len(hits[0]["excerpt"]), tep.EXCERPT_CHARS)

    def test_quota_override_and_default(self):
        res = {"experts": {"sureshKbn": {"results": [{"id": "a"}, {"id": "b"}]},
                           "shashank": {"results": [{"id": "c"}, {"id": "d"}]}}}
        hits = tep.compact_hits(res, set(), {"sureshKbn": 1})
        self.assertEqual(len(hits), 2)  # 1 suresh (override) + 1 shashank (default)

    def test_handles_error_payload(self):
        self.assertEqual(tep.compact_hits({"_error": "boom"}, set()), [])


class RelevanceFloorTest(unittest.TestCase):
    def test_drops_off_topic_fillers(self):
        res = {"experts": {"sureshKbn": {"results": [{"id": "a", "score": 30}]},
                           "thechartist": {"results": [{"id": "b", "score": 5}]}}}
        self.assertEqual([h["score"] for h in tep.compact_hits(res, set())], [30])


class PlaybookTest(unittest.TestCase):
    TEXT = "# KB\n## Sector playbooks — power  `sector:power`\ntext\n## Sector playbooks — pharma\n"

    def test_matches_sector_heading(self):
        out = tep.find_sector_playbooks(self.TEXT, "Power Equipment", "p.md")
        self.assertEqual([o["line"] for o in out], [2])

    def test_no_sector(self):
        self.assertEqual(tep.find_sector_playbooks(self.TEXT, "", "p.md"), [])
        self.assertEqual(tep.find_sector_playbooks(self.TEXT, "Ltd", "p.md"), [])


if __name__ == "__main__":
    unittest.main()
