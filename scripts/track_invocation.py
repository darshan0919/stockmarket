#!/usr/bin/env python3
"""
Task: Token Usage Tracking
Purpose: Estimates token usage for LLM skill and task invocations and logs to a central JSONL file.
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_FILE = PROJECT_ROOT / "data" / "token_usage.jsonlines"

def parse_args():
    parser = argparse.ArgumentParser(description="Estimate and log token usage.")
    parser.add_argument("--name", required=True, help="Name of the skill or task (e.g. concall-analysis)")
    parser.add_argument("--type", required=True, choices=["skill", "task"], help="Type of invocation")
    parser.add_argument("--files", help="Comma-separated list of files fed to context", default="")
    parser.add_argument("--output-words", type=int, default=500, help="Estimated number of words in the AI's output")
    parser.add_argument("--model", default="claude-3-5-sonnet-20240620", help="Model used")
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
    
    log_entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "name": args.name,
        "type": args.type,
        "model": args.model,
        "estimated_input_tokens": estimated_input_tokens,
        "estimated_output_tokens": estimated_output_tokens,
        "files_read": len(file_list),
        "context_chars": total_chars
    }
    
    # Ensure directory exists
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry) + "\n")
        
    print(f"Logged token usage for {args.type} '{args.name}': ~{estimated_input_tokens} input, ~{estimated_output_tokens} output")

if __name__ == "__main__":
    main()
