#!/usr/bin/env python3
"""
Task: Token Usage Analysis
Purpose: Reads the `events` collection's `token_usage_summary` records
(persisted by packages/jobs-runtime/lib/tokenUsageTracker.js — see
conventions.md §24 in skills/_shared/conventions.md), aggregates by job and
model, computes estimated cost, and outputs a JSON report for the
token-usage-analyzer skill to analyze.

REWRITTEN 2026-09-07. The previous version of this script read a
`data/token_usage.jsonlines` file that nothing in the repo ever wrote —
it was a consumer with no producer, and used ad-hoc `estimated_*_tokens`
fields instead of a real usage number. It also wrote (nothing, since it
never ran) directly to `data/`, which conventions.md §3/§6 forbids —
all persistent data must go through packages/jobs-runtime/lib/db.js.
This version reads the SAME sharded `data/events-YYYY-MM.json` files
db.js itself writes (per DATA_RULES: `events` is a month-sharded
SINGLE_FILE_COLLECTIONS-style JSON object keyed by record id — this
script only READS that shape, it never writes it), aggregating
`token_usage_summary` records the same way `api_usage_summary` records
already flow through the identical path for HTTP-call tracking (§23).

Attribution dimension is JOB (a `jobs/Scheduled/<name>` directory or a
`manual-<script>` default for an ad-hoc run), matching every other
usage-tracking convention in this repo — never "skill", for the same
reason apiUsageTracker.js gives (many skills are invoked by more than one
job; several scripts back more than one skill).
"""

import json
import sys
from collections import defaultdict
from pathlib import Path
from datetime import datetime, timedelta

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"

# Pricing per 1M tokens (USD). Keep this in sync with whatever models this
# repo's jobs actually self-report — token_usage_summary records carry
# whatever model label the agent passed to `record-token-usage`/
# `recordTokenUsage.js`'s `--model` flag, so this table WILL miss entries
# for a new/renamed model until someone adds a line here; an unrecognized
# model falls back to "agent-session" pricing (Sonnet-tier, the
# conservative assumption) rather than crashing the report.
PRICING = {
    "claude-sonnet-5": {"input": 3.00, "output": 15.00},
    "claude-haiku-5": {"input": 0.25, "output": 1.25},
    "claude-opus-5": {"input": 15.00, "output": 75.00},
    # Legacy/back-compat labels some older self-reports may still carry:
    "claude-3-5-sonnet-20240620": {"input": 3.00, "output": 15.00},
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
    # Self-reported "agent-session" observations with no specific model
    # label (tokenUsageCounter.js's default) — priced at Sonnet tier as
    # the conservative assumption, since most agent-executed skill
    # reasoning in this repo runs on the flagship model.
    "agent-session": {"input": 3.00, "output": 15.00},
}
DEFAULT_PRICING = PRICING["agent-session"]


def _load_events_since(cutoff_date):
    """Yield token_usage_summary records from every events-*.json shard
    whose own filename month could plausibly contain records >= cutoff_date.
    Shards are named events-YYYY-MM.json; a shard is skipped only if its
    entire month is fully before the cutoff month, so this never has to
    guess at day-level boundaries from the filename alone.
    """
    cutoff_month = (cutoff_date.year, cutoff_date.month)
    for shard in sorted(DATA_DIR.glob("events-*.json")):
        try:
            ym = shard.stem.replace("events-", "")
            y, m = (int(x) for x in ym.split("-"))
        except ValueError:
            y, m = None, None
        if y is not None and (y, m) < cutoff_month:
            continue
        try:
            payload = json.loads(shard.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        records = payload.values() if isinstance(payload, dict) else payload
        for rec in records:
            if not isinstance(rec, dict):
                continue
            if rec.get("type") != "token_usage_summary":
                continue
            yield rec


def main():
    if not DATA_DIR.exists():
        print(json.dumps({"error": "data/ directory not found.", "path": str(DATA_DIR)}))
        sys.exit(0)

    cutoff_date = (datetime.utcnow() - timedelta(days=7)).date()

    aggregation = defaultdict(lambda: {
        "runs": 0,
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "models_used": set(),
        "total_estimated_cost_usd": 0.0,
    })

    total_cost = 0.0
    records_seen = 0
    unpriced_models = set()

    for rec in _load_events_since(cutoff_date):
        date_str = rec.get("date", "")
        try:
            rec_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        if rec_date < cutoff_date:
            continue

        job = rec.get("job", "unknown")
        by_model = rec.get("byModel", {})
        agg = aggregation[job]
        agg["runs"] += 1
        records_seen += 1

        for model, counts in by_model.items():
            in_tok = counts.get("inputTokens", 0)
            out_tok = counts.get("outputTokens", 0)
            pricing = PRICING.get(model)
            if pricing is None:
                pricing = DEFAULT_PRICING
                unpriced_models.add(model)
            cost = (in_tok / 1_000_000 * pricing["input"]) + (out_tok / 1_000_000 * pricing["output"])

            agg["total_input_tokens"] += in_tok
            agg["total_output_tokens"] += out_tok
            agg["models_used"].add(model)
            agg["total_estimated_cost_usd"] += cost
            total_cost += cost

    report = {
        "report_period": "Last 7 days",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_cost_usd": round(total_cost, 4),
        "records_aggregated": records_seen,
        "items": [],
    }
    if unpriced_models:
        report["warning"] = (
            f"No pricing entry for model(s) {sorted(unpriced_models)} — "
            "priced at agent-session/Sonnet-tier rates as a conservative "
            "fallback. Add a PRICING entry in scripts/metrics/analyze_token_usage.py."
        )

    for job, data in aggregation.items():
        report["items"].append({
            "job": job,
            "runs": data["runs"],
            "total_input_tokens": data["total_input_tokens"],
            "total_output_tokens": data["total_output_tokens"],
            "models_used": sorted(data["models_used"]),
            "estimated_cost_usd": round(data["total_estimated_cost_usd"], 4),
        })

    report["items"].sort(key=lambda x: x["estimated_cost_usd"], reverse=True)

    if records_seen == 0:
        report["note"] = (
            "No token_usage_summary records found in the last 7 days. This means "
            "job/skill runs in this window did not self-report their token usage — "
            "see conventions.md §24: every job/skill run should end with "
            "`yarn record-token-usage --job <name> --input <n> --output <n>`."
        )

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
