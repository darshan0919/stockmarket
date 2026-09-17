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
