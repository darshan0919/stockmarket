---
name: near-highs-digest
description: Near Highs Digest — stocks near 52W highs by Industry/Sector breakdown emailed daily
---

## Context
Daily near 52-week highs digest. Scans stocks near 52W highs from Stockscans, classifies by Industry and Sector breakdown, and emails an HTML digest.

## Execution Plan
Call the following exact script:
1. Execute script (bash): `yarn near-highs-digest`
2. Read the JSON summary the script prints to stdout and report: sector counts, top near-high stocks per sector, and email status.
3. If the script exits non-zero, surface the exact error in your report.

Do NOT run any logic, calculations, data fetching, filtering, or file modifications directly. Your only job is to orchestrate the script above exactly as specified and report its output.
