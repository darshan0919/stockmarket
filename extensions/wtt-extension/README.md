# Walk the Talk — Management Credibility Scorer

**Version 2.1.0** | Chrome Extension (Manifest V3)

A Chrome extension that scores Indian company management credibility by comparing what they promised in earnings calls against what they actually delivered. Powered by Claude AI.

## What It Does

1. Navigate to any company page on [stockscans.in](https://www.stockscans.in)
2. Click the gold "Walk the Talk" button (or the extension icon)
3. The side panel opens and runs an automated 5-step analysis pipeline
4. Get a management credibility score (0–100) with quarterly breakdowns
5. An HTML report auto-downloads for offline reference

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  stockscans.in/company/NSE:INFY                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ content.js                                                │  │
│  │ • Detects company symbol from URL                        │  │
│  │ • Scrapes financial tables from the page DOM             │  │
│  │ • Fetches doc list & concall notes via stockscans API    │  │
│  │ • Injects the "Walk the Talk" button                     │  │
│  └──────────────────────┬───────────────────────────────────┘  │
└─────────────────────────┼──────────────────────────────────────┘
                          │ messages
┌─────────────────────────┴──────────────────────────────────────┐
│ background.js (service worker)                                  │
│ • Opens side panel on button click                              │
│ • Relays messages between content script ↔ side panel           │
└─────────────────────────┬──────────────────────────────────────┘
                          │ messages
┌─────────────────────────┴──────────────────────────────────────┐
│ sidepanel.js + sidepanel.html + sidepanel.css                   │
│ • Orchestrates the 5-step analysis pipeline                     │
│ • Downloads PDFs from S3                                        │
│ • Calls Claude API for extraction, scoring, and verdict         │
│ • Renders results with interactive quarter-by-quarter detail    │
│ • Generates and downloads the HTML report                       │
└────────────────────────────────────────────────────────────────┘
```

## Installation (Developer Mode)

1. Clone or download this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `extensions/wtt-extension/` directory
6. The extension icon appears in the toolbar

## Configuration

On first use, the extension prompts for your **Anthropic API key**:

1. Get a key from [console.anthropic.com](https://console.anthropic.com/)
2. Enter it in the extension's setup screen
3. The key is stored locally via `chrome.storage.sync` and only sent to `api.anthropic.com`

## Permissions Explained

| Permission | Why |
|---|---|
| `storage` | Persist the API key across sessions |
| `sidePanel` | Show the analysis UI in Chrome's side panel |
| `tabs` | Query for the active stockscans.in tab |
| `cookies` | Access stockscans.in session for API calls |
| `host_permissions: stockscans.in` | Content script injection and same-origin API access |
| `host_permissions: S3` | Download earnings PDFs (transcripts, results, PPTs) |
| `host_permissions: anthropic.com` | Claude API calls for AI analysis |

## File Structure

```
wtt-extension/
├── manifest.json       # Extension manifest (MV3)
├── background.js       # Service worker — panel lifecycle, message relay
├── content.js          # Content script — button injection, DOM scraping, API proxy
├── sidepanel.html      # Side panel HTML shell
├── sidepanel.js        # Side panel logic — pipeline, Claude calls, rendering
├── sidepanel.css       # Side panel styles (dark theme)
├── utils.js            # Shared utilities (dateToQuarter, qtrSort)
├── icons/              # Extension icons (16, 48, 128px)
├── README.md           # This file
└── IMPLEMENTATION.md   # Detailed technical documentation
```

## Usage

1. Navigate to `https://www.stockscans.in/company/<SYMBOL>` (e.g. NSE:INFY)
2. Click the gold **Walk the Talk** button on the page, or click the extension icon
3. The side panel shows a 5-step progress tracker:
   - Fetching document list
   - Downloading PDFs (transcripts + results)
   - Extracting claims & financial data (via Claude)
   - Scoring management credibility (prior promises vs actuals)
   - Generating overall verdict
4. Results display: overall score, sub-scores (execution/language/consistency), quarter-by-quarter breakdown, red flags, and strengths
5. An HTML report auto-downloads to your Downloads folder

## Scoring Model

| Component | Weight | What It Measures |
|---|---|---|
| Execution Score | 50% | Did numeric guidance match actual results? |
| Language Score | 30% | Clarity, specificity, absence of hedge words |
| Consistency Score | 20% | Stable narrative vs shifting stories |
| **WTT Score** | **weighted avg** | `exec × 0.5 + lang × 0.3 + cons × 0.2` |

## Tech Stack

- **Chrome Extension**: Manifest V3, Side Panel API, Service Worker
- **AI**: Claude claude-sonnet-4-20250514 via Anthropic Messages API (with PDF document input)
- **Data Sources**: stockscans.in API, S3 PDFs, DOM-scraped financial tables
- **UI**: Vanilla JS, custom dark theme (Syne + DM Sans + JetBrains Mono)

## Limitations

- Requires an active stockscans.in session (must be logged in)
- Needs an Anthropic API key (Claude usage is billed to your account)
- Analysis covers at most 8 quarters (~2 years)
- PDFs larger than 8MB are skipped
- Designed specifically for Indian equities on stockscans.in
