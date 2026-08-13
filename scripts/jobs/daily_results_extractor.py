#!/usr/bin/env python3
"""
Task: Daily Results Extractor
Purpose: Fetch all companies with results filed on a given date via Stockscans API,
then invoke quarterly-result-extractor for bulk processing.
"""

import sys
import json
import os
from datetime import datetime, timedelta
import requests

sys.path.insert(0, "/mnt/project")
from stockscans_client import (
    load_authtoken,
    check_token_expiry,
)

def get_previous_day():
    """Return yesterday's date in YYYY-MM-DD format."""
    yesterday = datetime.now() - timedelta(days=1)
    return yesterday.strftime("%Y-%m-%d")

def fetch_results_for_date(date_str, authtoken):
    """
    Fetch all companies with results filed on the given date.
    Uses the Stockscans /api/company/results/scan endpoint.

    Args:
        date_str: Date in YYYY-MM-DD format
        authtoken: Stockscans auth token

    Returns:
        List of company objects {companyId, ticker, resultDate, ...}
    """
    url = "https://www.stockscans.in/api/company/results/scan"

    payload = {
        "scan": {
            "filters": [],
            "index": [],
            "industry": [],
            "watchlistIds": []
        },
        "order": "desc",
        "orderBy": "Last Result Date",
        "offset": 0,
        "resultDate": date_str,
        "searchCompany": "",
        "documentType": ""
    }

    headers = {
        "accept": "application/json",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "content-type": "application/json",
    }

    cookies = {
        "authtoken": authtoken,
    }

    try:
        response = requests.post(url, json=payload, headers=headers, cookies=cookies, timeout=30)
        response.raise_for_status()
        data = response.json()

        # Extract companies from response
        companies = data.get("data", {}).get("results", [])
        return {
            "date": date_str,
            "count": len(companies),
            "companies": companies,
            "status": "success"
        }
    except Exception as e:
        return {
            "date": date_str,
            "count": 0,
            "companies": [],
            "status": "error",
            "error": str(e)
        }

def main():
    try:
        token = load_authtoken()
        check_token_expiry(token)

        date_str = get_previous_day()
        result = fetch_results_for_date(date_str, token)

        # Output manifest for the task to read
        print(json.dumps(result, indent=2))

        if result["status"] == "error":
            sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "status": "error",
            "error": str(e)
        }), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
