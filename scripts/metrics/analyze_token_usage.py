#!/usr/bin/env python3
"""
Task: Token Usage Analysis
Purpose: Reads token usage logs, aggregates token consumption, computes estimated costs, and outputs a JSON report for the LLM skill to analyze.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path
from datetime import datetime, timedelta

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_FILE = PROJECT_ROOT / "data" / "token_usage.jsonlines"

# Pricing per 1M tokens (Claude 3.5 Sonnet as default)
PRICING = {
    "claude-3-5-sonnet-20240620": {"input": 3.00, "output": 15.00},
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
}

def main():
    if not LOG_FILE.exists():
        print(json.dumps({"error": "No token usage logs found.", "path": str(LOG_FILE)}))
        sys.exit(0)

    # We will analyze the last 7 days of logs
    cutoff_date = datetime.utcnow() - timedelta(days=7)
    
    aggregation = defaultdict(lambda: {
        "invocations": 0,
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "models_used": set(),
        "total_estimated_cost_usd": 0.0
    })
    
    total_cost = 0.0
    
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
                
            timestamp_str = entry.get("timestamp", "").replace("Z", "")
            try:
                ts = datetime.fromisoformat(timestamp_str)
            except ValueError:
                ts = datetime.utcnow()
                
            if ts < cutoff_date:
                continue
                
            name = entry.get("name", "unknown")
            t_type = entry.get("type", "unknown")
            model = entry.get("model", "claude-3-5-sonnet-20240620")
            
            in_tokens = entry.get("estimated_input_tokens", 0)
            out_tokens = entry.get("estimated_output_tokens", 0)
            
            key = f"[{t_type}] {name}"
            
            pricing = PRICING.get(model, PRICING["claude-3-5-sonnet-20240620"])
            cost = (in_tokens / 1_000_000 * pricing["input"]) + (out_tokens / 1_000_000 * pricing["output"])
            
            agg = aggregation[key]
            agg["invocations"] += 1
            agg["total_input_tokens"] += in_tokens
            agg["total_output_tokens"] += out_tokens
            agg["models_used"].add(model)
            agg["total_estimated_cost_usd"] += cost
            
            total_cost += cost

    report = {
        "report_period": "Last 7 days",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_cost_usd": round(total_cost, 4),
        "items": []
    }
    
    for key, data in aggregation.items():
        report["items"].append({
            "name": key,
            "invocations": data["invocations"],
            "total_input_tokens": data["total_input_tokens"],
            "total_output_tokens": data["total_output_tokens"],
            "models_used": list(data["models_used"]),
            "estimated_cost_usd": round(data["total_estimated_cost_usd"], 4)
        })
        
    report["items"].sort(key=lambda x: x["estimated_cost_usd"], reverse=True)
    
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
