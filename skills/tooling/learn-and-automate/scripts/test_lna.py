#!/usr/bin/env python3
"""Offline unit tests for the learn-and-automate deterministic layer (temp DATA_V2_DIR, fixtures only)."""
import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _xpost(i, text, kind="reply", ctx=None, date="2025-06-01", likes=5, media=None):
    return {
        "id": f"xp_{i}", "type": "x-post", "handle": "TestExpert", "kind": kind, "text": text,
        "context": ctx, "publishedAt": f"{date}T10:00:00.000Z", "url": f"https://x.com/TestExpert/status/{i}",
        "metrics": {"likes": likes, "views": 100}, "media": media or [], "tweetIds": [str(i)],
    }


class LnaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        os.environ["DATA_V2_DIR"] = self.tmp
        (Path(self.tmp) / "x-posts").mkdir()
        rows = [
            _xpost(1, "@a Unless I make plant visits i would stay away with that float", ctx={"by": "a", "text": "@TestExpert How do you approach stocks with low float and no concalls?"}),
            _xpost(2, "@b thanks", ctx={"by": "b", "text": "great call sir"}),
            _xpost(3, "Exit when earnings visibility breaks, not when price falls 10 percent. Stock price follows earnings growth.", kind="post", date="2026-02-01", likes=300),
            _xpost(4, "WELSPUN CORP: MORE ORDERS", kind="repost"),
            _xpost(6, "SAUDIS: refiners get no crude next month, oil above 100 will hit margins and order flow for EPC companies", kind="repost", date="2026-09-01", ctx={"by": "REDBOX", "text": None}),
            _xpost(7, "Power capex cycle: transformers and cables show earnings visibility for the next two years", kind="post", date="2025-01-01"),
            _xpost(5, "Watched a great movie today with family", kind="post"),
        ]
        with open(Path(self.tmp) / "x-posts" / "shard_0.jsonl", "w") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
        for m in [m for m in list(sys.modules) if m.startswith("lna")]:
            del sys.modules[m]
        from lna import pipeline, questions  # noqa

        self.p, self.q = pipeline, questions
        self.src = "x:testexpert"

    def test_ingest_tiers_and_assembles_context(self):
        r = self.p.ingest(self.src)
        self.assertEqual(r["docs"], 7)  # reposts are included as tier 3
        self.assertEqual(r["profile"]["byTier"], {1: 3, 2: 2, 3: 2})
        self.assertEqual(r["profile"]["withQuestionContext"], 1)

    def test_prefilter_keeps_one_line_answers_and_drops_noise(self):
        self.p.ingest(self.src)
        f = self.p.prefilter(self.src)
        kept = {d["docId"] for d in self.p.read_jsonl(self.p.run_dir(self.src) / "candidates.jsonl")}
        self.assertIn("xp_1", kept)  # short reply answering a finance question
        self.assertIn("xp_3", kept)
        self.assertNotIn("xp_2", kept)  # pleasantry
        self.assertNotIn("xp_5", kept)  # off-topic
        self.assertIn("xp_6", kept)  # substantive repost kept (tier 3)
        self.assertNotIn("xp_4", kept)  # short repost dropped
        self.assertIn("xp_7", kept)
        self.assertEqual(f["kept"], 4)

    def _prep_chunks(self):
        self.p.ingest(self.src)
        self.p.prefilter(self.src)
        self.p.chunk(self.src, max_chars=10000)

    def test_chunks_are_ordered_posts_then_replies_then_reposts_newest_first(self):
        self._prep_chunks()
        self.p.chunk(self.src, max_chars=200)  # force several chunks per tier
        order = [c["chunkId"] for c in self.p.read_json(self.p.run_dir(self.src) / "chunks.json")]
        pend = [c["chunkId"] for c in self.p.pending_chunks(self.src, n=50)["next"]]
        tiers = [int(c[1]) for c in pend]
        self.assertEqual(tiers, sorted(tiers))  # 1 → 2 → 3
        self.assertEqual(set(pend), set(order))
        t1 = [c for c in self.p.read_json(self.p.run_dir(self.src) / "chunks.json") if c["tier"] == 1]
        self.assertGreaterEqual(t1[0]["to"], t1[-1]["to"])  # c0001 holds the newest posts
        txt = Path(next(c["file"] for c in self.p.read_json(self.p.run_dir(self.src) / "chunks.json") if c["tier"] == 3)).read_text()
        self.assertIn("REPOSTED from @REDBOX", txt)

    def test_repost_only_units_are_marked_curated(self):
        self._prep_chunks()
        rd = self.p.run_dir(self.src)
        self.p.write_jsonl(rd / "units-raw" / "t3-c0001.jsonl", [
            {"kind": "macro_view", "topic": "macro", "statement": "Oil above 100 hurts EPC margins", "verbatim": "oil above 100 will hit margins", "docIds": ["xp_6"]}])
        self.p.write_jsonl(rd / "units-raw" / "t1-c0001.jsonl", [
            {"kind": "sector_view", "topic": "sector:power", "statement": "Transformers and cables have two-year earnings visibility", "verbatim": "transformers and cables show earnings visibility", "docIds": ["xp_7"]}])
        self.p.verify(self.src)
        u = {x["topic"]: x for x in self.p.read_jsonl(rd / "units.verified.jsonl")}
        self.assertEqual(u["macro"]["explicitness"], "curated")
        self.assertEqual(u["macro"]["sourceTier"], 3)
        self.assertEqual(u["sector:power"]["explicitness"], "explicit")

    def test_verify_rejects_hallucinated_verbatim_and_dedupes(self):
        self._prep_chunks()
        rd = self.p.run_dir(self.src)
        raw = [
            {"kind": "rule", "topic": "liquidity-float", "statement": "Avoid low-float stocks unless you can visit the plant", "verbatim": "Unless I make plant visits i would stay away with that float", "docIds": ["xp_1"]},
            {"kind": "rule", "topic": "liquidity-float", "statement": "Avoid low float stocks unless you can visit the plant", "verbatim": "stay away with that float", "docIds": ["xp_1"]},
            {"kind": "exit_signal", "topic": "exit", "statement": "Exit when earnings visibility breaks", "verbatim": "Always sell at 20% loss", "docIds": ["xp_3"]},
            {"kind": "rule", "topic": "made-up-topic", "statement": "x", "verbatim": "Exit when", "docIds": ["xp_3"]},
        ]
        self.p.write_jsonl(rd / "units-raw" / "t1-c0001.jsonl", raw)
        r = self.p.verify(self.src, model_used="test")
        self.assertEqual(r["accepted"], 2)
        self.assertEqual(r["rejected"], 2)
        self.assertEqual(r["unitsTotal"], 1)  # near-duplicates merged
        self.assertIn("verbatim-not-in-source", r["rejectReasons"])
        pend = [c["chunkId"] for c in self.p.pending_chunks(self.src, n=99)["next"]]
        self.assertNotIn("t1-c0001", pend)  # extracted chunk no longer pending
        self.assertIn("t3-c0001", pend)

    def test_question_engine_generates_lenses_and_frontier(self):
        self._prep_chunks()
        rd = self.p.run_dir(self.src)
        self.p.write_jsonl(rd / "units-raw" / "t2-c0001.jsonl", [
            {"kind": "rule", "topic": "liquidity-float", "statement": "Avoid low float stocks unless you can visit the plant", "verbatim": "stay away with that float", "docIds": ["xp_1"]}])
        self.p.verify(self.src)
        mined = self.q.mine_follower_questions(self.src)
        self.assertEqual(mined["mined"], 1)
        units = self.p.read_jsonl(rd / "units.verified.jsonl")
        g = self.q.generate(self.src, "liquidity-float", units)
        self.assertIn("L1", g["byLens"])  # "low"/"float" are vague → clarify question
        self.assertIn("L11", g["byLens"])  # module-level decision
        fr = self.q.frontier(self.src, "liquidity-float")
        self.assertTrue(all(x["needsUser"] for x in fr["frontier"]))
        qid = next(x["qId"] for x in self.p.read_jsonl(Path(g["file"])) if x["lens"] == "L3")
        res = self.q.apply_answers(self.src, "liquidity-float", [{"qId": qid, "status": "auto-answered", "answer": "Venus Remedies reply", "confidence": 0.8, "route": "corpus"}])
        self.assertEqual(len(res["persistable"]), 1)

    def test_lens_score(self):
        r = self.q.lens_score(["Why does low float matter?", "When would this not apply in a bear market?"], ["L1", "L4", "L5", "L7"])
        self.assertIn("L4", r["covered"])
        self.assertIn("L5", r["covered"])
        self.assertIn("L7", r["missed"])

    def test_concurrent_sources_do_not_share_state(self):
        from lna.common import load_state, mark_phase

        ths = [threading.Thread(target=mark_phase, args=(f"x:s{i}", "ingest"), kwargs={"n": i}) for i in range(4)]
        [t.start() for t in ths]
        [t.join() for t in ths]
        for i in range(4):
            self.assertEqual(load_state(f"x:s{i}")["phases"]["ingest"]["n"], i)


if __name__ == "__main__":
    unittest.main()
