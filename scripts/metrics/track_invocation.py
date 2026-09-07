#!/usr/bin/env python3
"""
Task: Token Usage Tracking
Purpose: Estimates token usage for LLM skill and task invocations and persists
it via the canonical token-usage pipeline (packages/jobs-runtime/lib/
tokenUsageTracker.js -> events collection, type token_usage_summary) --
see skills/_shared/conventions.md Sec24.

FIXED 2026-09-07: this script's log entry shape (name, type, model,
estimated_input_tokens, estimated_output_tokens) was designed to feed
scripts/metrics/analyze_token_usage.py, but both scripts wrote/read a
`data/token_usage.jsonlines` file directly -- bypassing lib/db.js entirely,
which conventions.md Sec3/Sec6 forbids (all persistent data must go through
db.js), and landing on a path neither script's counterpart ever actually
exercised together in production (the file did not exist on disk despite
this script being wired into ~30 job SKILL.md files as a mandatory final
step -- see cowork-task-architect/SKILL.md's task-template step N). This
version keeps the exact same CLI (--name/--type/--model/--files/
--output-words) so none of those ~30 existing call sites need to change,
but now shells out to `node packages/jobs-runtime/recordTokenUsage.js`,
which persists through db.js the same way Sec23's apiUsageTracker already
does for API-call counts -- one canonical events-backed pipeline instead of
two competing, disconnected ones.
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RECORD_TOKEN_USAGE_SCRIPT = PROJECT_ROOT / "packages" / "jobs-runtime" / "recordTokenUsage.js"

def parse_args():
    parser = argparse.ArgumentParser(description="Estimate and log token usage.")
    parser.add_argument("--name", required=True, help="Name of the skill or task (e.g. concall-analysis)")
    parser.add_argument("--type", required=True, choices=["skill", "task"], help="Type of invocation")
    parser.add_argument("--files", help="Comma-separated list of files fed to context", default="")
    parser.add_argument("--output-words", type=int, default=500, help="Estimated number of words in the AI's output")
    parser.add_argument(
        "--model",
        required=True,
        help=(
            "Exact model string of the model that executed this invocation's LLM "
            "steps (e.g. claude-sonnet-5, claude-opus-5, gemini-2.5-pro) — read from "
            "the running context, never hardcoded. Also the value any DTO this "
            "invocation writes should use for its modelUsed field "
            "(skills/tooling/output-dto-standard/SKILL.md)."
        ),
    )
    parser.add_argument(
        "--duration-ms",
        type=int,
        default=None,
        help=(
            "Optional wall-clock duration of the whole run, in milliseconds — "
            "the caller (the job's own SKILL.md/script) notes its own start "
            "time and passes the elapsed delta here at the end. Omit if not "
            "tracked; never estimated by this script."
        ),
    )
    return parser.parse_args()

def main():
    args = parse_args()
    
    total_chars = 0
    file_list = [f.strip() for f in args.files.split(",")] if args.files else []
    
    for filepath in file_list:
        if not filepath:
            continue
        p = Path(filepath)
        if not p.is_absolute():
            p = PROJECT_ROOT / p
            
        if p.exists() and p.is_file():
            try:
                # Read size directly or read chars
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    total_chars += len(content)
            except Exception as e:
                print(f"Warning: could not read {filepath}: {e}", file=sys.stderr)

    # Base prompt tokens for skills vs tasks
    base_prompt_tokens = 1000 if args.type == "skill" else 500
    
    # 1 token ~= 4 chars for English text
    estimated_input_tokens = base_prompt_tokens + (total_chars // 4)
    estimated_output_tokens = int(args.output_words / 0.75)
    
    # Job-name resolution mirrors lib/scriptJobName.js's order: an already-set
    # STOCKMARKET_JOB_NAME env var (set by the job's own SKILL.md as its first
    # orchestration step, per Sec23) wins; otherwise --name is used as-is, which
    # is already the job-directory name for every `--type task` call site in
    # this repo's job SKILL.md files today.
    job_name = os.environ.get("STOCKMARKET_JOB_NAME") or args.name

    note = (
        f"estimated via track_invocation.py (char-count heuristic: "
        f"{total_chars} context chars across {len(file_list)} file(s), "
        f"{args.output_words} estimated output words)"
    )

    cmd = [
        "node",
        str(RECORD_TOKEN_USAGE_SCRIPT),
        "--job", job_name,
        "--input", str(estimated_input_tokens),
        "--output", str(estimated_output_tokens),
        "--model", args.model,
        "--note", note,
    ]
    if args.duration_ms is not None:
        cmd += ["--duration-ms", str(args.duration_ms)]

    result = subprocess.run(
        cmd,
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(
            f"Warning: recordTokenUsage.js failed for job '{job_name}': "
            f"{result.stderr.strip()}",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Logged token usage for {args.type} '{args.name}' (job: {job_name}): "
          f"~{estimated_input_tokens} input, ~{estimated_output_tokens} output")

if __name__ == "__main__":
    main()
