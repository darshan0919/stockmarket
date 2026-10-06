import os, sys, unittest
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(__file__))
import recency

NOW = datetime(2026, 10, 7, tzinfo=timezone.utc)


def hit(i, score, date, source="x", expert="shashank"):
    return {"id": i, "score": score, "date": date, "source": source, "expert": expert}


class RecencyTest(unittest.TestCase):
    def test_fresher_beats_older_at_similar_relevance(self):
        r = recency.finalize([hit("old", 10, "2023-01-01"), hit("new", 9, "2026-09-30")], None, 2, now=NOW)
        self.assertEqual([x["id"] for x in r], ["new", "old"])

    def test_very_relevant_old_hit_is_kept_not_dropped(self):
        r = recency.finalize([hit("old", 30, "2023-01-01"), hit("new", 5, "2026-09-30")], None, 2, now=NOW)
        self.assertEqual(r[0]["id"], "old")
        self.assertEqual(r[0]["freshness"], "stale")
        self.assertGreaterEqual(r[0]["adjScore"], 30 * recency.FLOOR - 0.01)

    def test_lamba_decays_slower_than_tweets(self):
        a = recency.annotate([hit("t", 10, "2024-10-07"), hit("l", 10, "2024-10-07", "youtube", "anil-lamba")], None, NOW)
        self.assertLess(a[0]["adjScore"], a[1]["adjScore"])

    def test_supersession_flag_needs_gap_same_expert_and_relevance(self):
        hits = [hit("o", 10, "2025-01-01"), hit("n", 8, "2026-09-01"), hit("x", 1, "2026-09-02"),
                hit("other", 10, "2025-01-01", expert="soic"), hit("close", 9, "2025-02-01")]
        recency.finalize(hits, None, 10, now=NOW)
        by = {h["id"]: h for h in hits}
        self.assertEqual(by["o"].get("possiblySupersededBy"), "n")
        self.assertNotIn("possiblySupersededBy", by["n"])
        self.assertNotIn("possiblySupersededBy", by["other"])  # different expert

    def test_undated_never_gets_a_calendar_date(self):
        dates = {"l1": {"date": None, "order": 1.0, "src": "lesson-id-order"}}
        r = recency.annotate([hit("l1", 10, None, "learnyst", "soic")], None, NOW, dates)[0]
        self.assertIsNone(r["date"]); self.assertEqual(r["freshness"], "undated")

    def test_reserve_keeps_freshest_platform(self):
        hits = [hit(f"l{i}", 30 - i, None, "learnyst", "soic") for i in range(6)] + [hit("x1", 6, "2026-09-30", "x", "soic")]
        r = recency.finalize(hits, None, 4, now=NOW)
        self.assertIn("x1", [h["id"] for h in r])


if __name__ == "__main__":
    unittest.main()
