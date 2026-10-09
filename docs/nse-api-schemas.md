# NSE API Schemas

Documentation for official NSE API endpoints integrated in `@stock/api` (`NseClient`).

## 1. Corporate Announcements (`/api/corporate-announcements`)

- **Method**: `GET`
- **Path**: `https://www.nseindia.com/api/corporate-announcements`
- **Client Method**: `NseClient.prototype.getCorporateAnnouncements({ fromDate, toDate, index })`
- **Auth**: Standard `NseSession` cookie warmup (`NseSession.js`), with browser-like User-Agent and Referer `https://www.nseindia.com/companies-listing/corporate-filings-announcements`.

### Request Parameters

| Parameter   | Type     | Required | Description                                                              |
| :---------- | :------- | :------- | :----------------------------------------------------------------------- |
| `index`     | `string` | No       | Market segment index: `'equities'` (default), `'sme'`, `'mf'`, `'debt'`. |
| `from_date` | `string` | No       | `DD-MM-YYYY`. If omitted, defaults to latest broadcast.                  |
| `to_date`   | `string` | No       | `DD-MM-YYYY`. If omitted, defaults to latest broadcast.                  |

### Response Schema

Array of announcement objects:

```json
[
  {
    "symbol": "3IINFOLTD",
    "desc": "Disclosure under SEBI Takeover Regulations",
    "sm_name": "3i Infotech Limited",
    "sm_isin": "INE748C01038",
    "smIndustry": null,
    "an_dt": "16-Sep-2026 15:10:40",
    "sort_date": "2026-09-16 15:10:40",
    "attchmntText": "Capital NxT LLP has submitted to the Exchange a copy Disclosure under Regulation 29(1) Of SEBI (SAST) Regulations, 2011.",
    "attchmntFile": "https://nsearchives.nseindia.com/corporate/team_bbodade_12082026152339_3IINFOLTD.pdf",
    "fileSize": "465.62 KB",
    "difference": "00:00:01",
    "exchdisstime": "16-Sep-2026 15:10:41",
    "hasXbrl": true,
    "seq_id": "106738945"
  }
]
```

### Known Takeover & SAST Categories

For takeover disclosures, filter where `desc === "Disclosure under SEBI Takeover Regulations"` or regex matches `/takeover|sast|regulation\s*29|reg\s*29|reg\.\s*31|reg\s*10/i` on `desc` and `attchmntText`.

---

## 2. Historical Bulk/Block Deals (`/api/historicalOR/bulk-block-short-deals`)

- **Method**: `GET`
- **Path**: `https://www.nseindia.com/api/historicalOR/bulk-block-short-deals`
- **Client Method**: `NseClient.prototype.getHistoricalBulkDeals(fromDate, toDate, symbol)` / `getHistoricalBlockDeals(fromDate, toDate, symbol)`
- **Auth**: Standard `NseSession` warmup.

### Request Parameters

| Parameter    | Type     | Required | Description                        |
| :----------- | :------- | :------- | :--------------------------------- |
| `optionType` | `string` | Yes      | `'bulk_deals'` or `'block_deals'`. |
| `from`       | `string` | Yes      | `DD-MM-YYYY`                       |
| `to`         | `string` | Yes      | `DD-MM-YYYY`                       |
| `symbol`     | `string` | No       | Ticker symbol (e.g. `'RELIANCE'`). |

### Response Schema

```json
{
  "data": [
    {
      "BD_DT_DATE": "16-SEP-2026",
      "BD_DT_ORDER": "2026-09-15T18:30:00.000Z",
      "BD_SYMBOL": "GROWW",
      "BD_SCRIP_NAME": "Groww Nifty Total Market Index ETF",
      "BD_CLIENT_NAME": "ABC CAPITAL",
      "BD_BUY_SELL": "BUY",
      "BD_QTY_TRD": 1000000,
      "BD_TP_WATP": 25.5,
      "BD_REMARKS": "-"
    }
  ]
}
```

Compute trade value as `BD_QTY_TRD * BD_TP_WATP`.

---

## XBRL filing endpoints (added 2026-09-30, verified live)

All are `GET https://www.nseindia.com/api/<path>` via `NseSession`; files come from `nsearchives.nseindia.com`. Parse with `packages/jobs-runtime/lib/xbrl/parse.js`.

| Client method                                          | Path                                   | Params                                                                                     | Useful row fields                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getIntegratedFilings(symbol, 'Financials')`           | `/integrated-filing-results`           | `index=equities, symbol, period_ended=all, type=Integrated Filing- Financials, page, size` | `xbrl`, `ixbrl`, `qe_Date`, `consolidated`, `type_Sub` (New/Revision), `broadcast_Date`, `audited`                                                                                                                                                                                                                                |
| `getIntegratedFilings(symbol, 'Governance')`           | same                                   | `type=Integrated Filing- Governance`                                                       | `xbrl`, `ixbrl`, `qe_Date`, `type_Sub`                                                                                                                                                                                                                                                                                            |
| `getShareholdingFilings(symbol)`                       | `/corporate-share-holdings-master`     | `index, symbol`                                                                            | `xbrl` (in-bse-shp XML), `date` (quarter end), `recordId`, `typeOfSubmission`, `pr_and_prgrp`, `public_val`, `broadcastDate`                                                                                                                                                                                                      |
| `getVotingResultFilings(symbol)`                       | `/corporate-voting-results` (singular) | `index, symbol`                                                                            | `{ metadata: { vrXbrlFilename, vrMeetingType, vrTimestamp, vrbroadcastDt, vrAttachment }, agendas[] }`                                                                                                                                                                                                                            |
| `getXbrlAnnouncements({symbol,fromDate,toDate,index})` | `/XBRL-announcements`                  | `index=equities\|sme, type=announcements, [symbol, from_date, to_date]`                    | `subject`, `attachment` (XML, or a ZIP of PDFs for resignations), `ixbrl` (HTML), `revision`, `broadcastDateTime`. No symbol = latest ~1,200 rows market-wide. Subjects: `Change in Directors/KMP/SMP/Auditor/RTA`, `Resignation of Director/KMP/SMP`, `Resignation of Independent director`, `Resignation of Statutory Auditor`. |
| `getBrsrFilings(symbol)`                               | `/corporate-bussiness-sustainabilitiy` | `index, symbol`                                                                            | `xbrlFile`, `attachmentFile`, `fyFrom`, `fyTo`, `revisionDate`                                                                                                                                                                                                                                                                    |

Notes:

- The result file family is in the XBRL file name: `INTEGRATED_FILING_INDAS`, `_BANKING`, `_LI` (life insurance), `_NBFC_INDAS`. All use the `in-capmkt` namespace but different element sets. Shareholding uses `in-bse-shp`, voting `in-bse-voting`.
- Quarterly result XBRL holds only the current period context.
- `/corporate-announcements` rows have `hasXbrl: true` on every row and only a PDF link, so this feed carries no XBRL link. NSE does publish event XBRL separately (next row), but only for director/KMP changes, resignations and auditor resignations.
- `/corporates-voting-results` (plural) and `/voting-results` return 404.

---

## 4. Official NSE Model Context Protocol (MCP) Endpoints (Verified Live 2026-10-10)

Official high-speed in-memory endpoints exposed by NSE via Streamable HTTP (JSON-RPC 2.0 over HTTP POST with Server-Sent Events). Managed by `NseMcpSession` and exposed via `NseClient`.

- **Base URLs**:
  - Bhavcopy / Historical / Master: `https://mcp.nseindia.in/bhavcopy/cm/mcp`
  - Live Capital Market: `https://mcp.nseindia.in/cmmkt/mcp`
- **Protocol**: JSON-RPC 2.0 over Streamable HTTP (Content-Type: `application/json`, Accept: `application/json, text/event-stream`).
- **Auth**: No API key (public beta). Requires handshake initialization (`method: "initialize"` with protocolVersion `2024-11-05`), session header (`Mcp-Session-Id`), and browser headers (`Origin: https://www.nseindia.com`, `Referer: https://www.nseindia.com/`, standard `User-Agent`).
- **Response Format**: SSE event stream (`event:message\ndata:{"jsonrpc":"2.0",...}\n\n`). Unpacked `result.content[0].text` contains JSON string payloads.

### 4.1 Historical Daily OHLCV (`get_stock_history`)

- **Server**: `https://mcp.nseindia.in/bhavcopy/cm/mcp`
- **Client Method**: `NseClient.prototype.getHistoricalOhlcv(symbol, { months, endDate })`
- **Tool Name**: `get_stock_history`

#### Request Payload

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_stock_history",
    "arguments": {
      "symbol": "INFY",
      "months": 3,
      "endDate": "today"
    }
  }
}
```

| Parameter | Type      | Required | Description                                              |
| :-------- | :-------- | :------- | :------------------------------------------------------- |
| `symbol`  | `string`  | Yes      | Uppercase NSE stock symbol (e.g. `'RELIANCE'`, `'INFY'`) |
| `months`  | `integer` | No       | Lookback chunk in months. Default: 3, Max: 3 per chunk   |
| `endDate` | `string`  | No       | Date `YYYY-MM-DD` or `'today'`                           |

#### Response Schema

```json
{
  "symbol": "INFY",
  "from_date": "2026-07-10",
  "to_date": "2026-10-09",
  "trading_days": 65,
  "source": "HOT",
  "query_ms": 0,
  "data": [
    {
      "symbol": "INFY",
      "series": "EQ",
      "ltp": 1023.4,
      "open": 1010.0,
      "high": 1030.0,
      "low": 1005.0,
      "close": 1023.4,
      "prevClose": 997.0,
      "volume": 14094234,
      "totalTradedValue": 14350000000.0,
      "ch52WeekHigh": 0,
      "ch52WeekLow": 0,
      "mktType": "N",
      "deliveryQty": 0,
      "date": "2026-10-09"
    }
  ],
  "chunk_months": 3,
  "next_end_date": "2026-07-09"
}
```

_Note_: `deliveryQty` is 0 in standard bhavcopy bars. Deliverable volumes require `NseClient.getDeliveryBhavcopy` or `getPriceVolumeDeliverable`.

---

### 4.2 Market Mood & India VIX (`get_market_mood`)

- **Server**: `https://mcp.nseindia.in/bhavcopy/cm/mcp`
- **Client Method**: `NseClient.prototype.getMarketMood(date)`
- **Tool Name**: `get_market_mood`

#### Request Payload

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_market_mood",
    "arguments": { "date": "today" }
  }
}
```

#### Response Schema

```json
{
  "date": "2026-10-09",
  "requested_date": "2026-10-10",
  "benchmarks": {
    "Nifty 50": { "close": 22520.45, "change_pct": 1.3 },
    "Nifty Next 50": { "close": 68166.7, "change_pct": 0.82 },
    "Nifty 500": { "close": 21866.65, "change_pct": 1.16 },
    "NIFTY Midcap 100": { "close": 58787.3, "change_pct": 1.56 },
    "NIFTY Smallcap 100": { "close": 19153.7, "change_pct": 0.54 }
  },
  "index_breadth": {
    "up": 143,
    "down": 1,
    "unchanged": 0,
    "up_pct": 99.3,
    "reading": "broad advance",
    "equity_indices": 144
  },
  "stock_breadth": {
    "up": 1766,
    "down": 1125,
    "unchanged": 47,
    "up_pct": 60.1,
    "reading": "broad advance",
    "stocks": 2938
  },
  "india_vix": {
    "level": 14.38,
    "change_1d_pct": -5.89,
    "vs_1w_ago": { "change_pct": -0.55, "base_level": 14.46, "direction": "falling" },
    "vs_1m_ago": { "change_pct": 20.64, "base_level": 11.92, "direction": "rising" },
    "range": {
      "min": 9.15,
      "max": 27.89,
      "mean": 14.05,
      "percentile": 70,
      "trading_days": 247
    }
  },
  "method": "index_breadth counts NSE equity indices... breadth reading: 'broad advance'..."
}
```

---

### 4.3 Symbol Discovery & Disambiguation (`search_symbols` / `nse_lookup_symbol`)

- **Server**: `https://mcp.nseindia.in/bhavcopy/cm/mcp`
- **Client Methods**: `NseClient.prototype.searchSymbols(query)` / `lookupSymbol(query)`
- **Tool Names**: `search_symbols` and `nse_lookup_symbol`

#### Request & Response (`nse_lookup_symbol`)

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "nse_lookup_symbol",
    "arguments": { "query": "SWARAJ" }
  }
}
```

Response:

```json
{
  "symbols": ["SWARAJ", "SWARAJENG"],
  "query": "SWARAJ",
  "count": 2
}
```

---

### 4.4 Index Valuation Ratios (`get_index_valuation`)

- **Server**: `https://mcp.nseindia.in/bhavcopy/cm/mcp`
- **Client Method**: `NseClient.prototype.getIndexValuation(indexName, { months, date })`

#### Request & Response

```json
{
  "index": "Nifty 50",
  "date": "2026-10-09",
  "close": 22520.45,
  "pe": {
    "current": 19.27,
    "min": 19.02,
    "max": 22.92,
    "median": 20.94,
    "mean": 21.27,
    "percentile": 1.6,
    "observations": 246
  },
  "pb": {
    "current": 2.77,
    "min": 2.73,
    "max": 3.58,
    "median": 3.26,
    "percentile": 0.8
  },
  "div_yield": {
    "current": 1.34,
    "percentile": 85.2
  }
}
```

---

### 4.5 Live Stock Quote (`cm_get_stock_quote`)

- **Server**: `https://mcp.nseindia.in/cmmkt/mcp`
- **Client Method**: `NseClient.prototype.getLiveStockQuote(symbol)`

#### Response

```json
{
  "updatedAt": "2026-10-09T22:13:27.638Z",
  "stock": {
    "type": "CM",
    "symbol": "RELIANCE",
    "series": "EQ",
    "openPrice": 1179.0,
    "highPrice": 1179.0,
    "lowPrice": 1160.2,
    "preClosePrice": 1178.0,
    "lastTradedPrice": 1170.3,
    "indicativeClosePrice": 0.0,
    "change": -7.7,
    "perChange": -0.65,
    "volume": 12086708,
    "value": 1414.676651152,
    "fiftyTwoWeekHigh": 1611.8,
    "fiftyTwoWeekLow": 1160.2,
    "perChange30d": -8.5,
    "latestTimestamp": "2026-10-09 16:00:27"
  }
}
```
