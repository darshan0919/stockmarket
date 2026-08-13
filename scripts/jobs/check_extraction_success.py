#!/usr/bin/env python3
"""
Task: Check Extraction Success
Purpose: Verify that quarterly-result-extractor (or guidance-document-extractor)
persisted records to the DB successfully. Used as a gate before downstream analysis
skills (quarterly-result-analysis, forward-guidance-extractor).

Usage:
  python check_extraction_success.py --collection quarterly-result-documents --date 2026-08-11
  python check_extraction_success.py --collection guidance-documents --date 2026-08-11
"""

import sys
import json
import os
from datetime import datetime

# Add repo to path for db access
sys.path.insert(0, "/Users/darshanpatel/code/stockmarket/packages/jobs-runtime")

def check_db_records(collection_name, date_str):
    """
    Check if records were persisted to the DB for the given date.

    Args:
        collection_name: e.g. 'quarterly-result-documents', 'guidance-documents'
        date_str: Date string in YYYY-MM-DD format

    Returns:
        {status: 'success'|'failure', count: N, message: '...'}
    """
    try:
        # Query reports.json directly (simpler than importing Node db module)
        import json
        import os

        # Find repo root by looking for data/reports.json
        script_dir = os.path.dirname(os.path.abspath(__file__))
        repo_root = os.path.dirname(os.path.dirname(script_dir))
        reports_path = os.path.join(repo_root, 'data', 'reports.json')

        with open(reports_path, 'r') as f:
            reports = json.load(f)

        # data/reports.json is a flat object keyed by record id containing
        # thin INDEX entries (id/type/date/companyId/creator/summary/body) —
        # not full record bodies. Content fields like `excerpts` and
        # `excerptsPending` live in the full body file that `body` points to
        # (data/reports/<id>.json) and must be read separately. An earlier
        # version of this script counted any matching index entry as
        # "success," which silently passed even when
        # guidance-document-extractor had only fetched documents but never
        # run its relevance-filter pass (excerptsPending: true, excerpts: []
        # on every record) — exactly the "fetched but not filtered" state
        # this gate exists to catch.
        matching_records = [
            r for r in reports.values()
            if r.get('type') == collection_name
            and r.get('date') == date_str
            and r.get('creator') in [
                'quarterly-result-extractor',
                'guidance-document-extractor'
            ]
        ]

        if not matching_records:
            return {
                "status": "failure",
                "count": 0,
                "message": f"No {collection_name} records persisted for {date_str}",
                "date": date_str
            }

        # Load full bodies and require the extraction to have actually
        # finished (excerptsPending is not True). excerpts: [] alone can be
        # a legitimate "attempted, genuinely nothing found" outcome (see
        # forward-guidance-extractor's SKILL.md case 3) — excerptsPending is
        # what distinguishes that from an unfinished Stage 1 run.
        full_records = []
        for r in matching_records:
            body_path = os.path.join(repo_root, 'data', r.get('body', ''))
            try:
                with open(body_path, 'r') as bf:
                    full_records.append(json.load(bf))
            except (OSError, IOError, ValueError):
                full_records.append(r)  # body file missing/unreadable — fall back to index entry

        incomplete = [r for r in full_records if r.get('excerptsPending') is True]
        complete = [r for r in full_records if r.get('excerptsPending') is not True]

        if not complete:
            return {
                "status": "failure",
                "count": 0,
                "message": f"Found {len(matching_records)} {collection_name} records for {date_str}, "
                           f"but all {len(incomplete)} still have excerptsPending: true "
                           f"(relevance-filter pass never completed)",
                "date": date_str,
                "incompleteIds": [r.get('id') for r in incomplete[:10]]
            }

        result = {
            "status": "success",
            "count": len(complete),
            "message": f"Found {len(complete)} completed {collection_name} records for {date_str}",
            "date": date_str,
            "firstRecord": complete[0] if complete else None
        }
        if incomplete:
            result["message"] += f" ({len(incomplete)} of {len(matching_records)} still have excerptsPending: true and were excluded)"
            result["incompleteIds"] = [r.get('id') for r in incomplete]
        return result

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "date": date_str
        }

def main():
    if len(sys.argv) < 5:
        print(json.dumps({
            "status": "error",
            "error": "Usage: python check_extraction_success.py --collection <name> --date <YYYY-MM-DD>"
        }), file=sys.stderr)
        sys.exit(1)

    collection = None
    date_str = None

    for i in range(1, len(sys.argv), 2):
        if sys.argv[i] == "--collection":
            collection = sys.argv[i + 1]
        elif sys.argv[i] == "--date":
            date_str = sys.argv[i + 1]

    if not collection or not date_str:
        print(json.dumps({
            "status": "error",
            "error": "Missing --collection or --date"
        }), file=sys.stderr)
        sys.exit(1)

    result = check_db_records(collection, date_str)
    print(json.dumps(result, indent=2))

    # Exit with failure if status is not 'success'
    if result["status"] != "success":
        sys.exit(1)

if __name__ == "__main__":
    main()
