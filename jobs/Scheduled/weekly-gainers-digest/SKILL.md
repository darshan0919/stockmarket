---
name: weekly-gainers-digest
description: Weekly Gainers Digest — top weekly gainers by Industry/Sector with streak scoring emailed weekly
---

## Context
Weekly top gainers digest. Scans weekly market gainers from Stockscans with multi-week streak scoring, organizes by Industry and Sector breakdown, and emails an HTML summary digest.

## Execution Plan
Call the following exact script:
1. Execute script (bash): `yarn weekly-gainers-digest`
2. Read the JSON summary the script prints to stdout and report: sector counts, top weekly gainers per sector, and email status.
3. If the script exits non-zero, surface the exact error in your report.

Do NOT run any logic, calculations, data fetching, filtering, or file modifications directly. Your only job is to orchestrate the script above exactly as specified and report its output.
