# BSE API Schemas

Documentation for official BSE India API endpoints integrated in `@stock/api` (`BseClient`).

## 1. Market-Wide SAST & Corporate Announcements (`AnnSubCategoryGetData/w`)

- **Method**: `GET`
- **Path**: `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w`
- **Client Method**: `BseClient.prototype.getSastAnnouncements(fromDate, toDate, { pageNo })` / `getAnnouncements(...)`
- **Auth**: None required. Uses `bseHttp.js` with browser-like User-Agent and Referer `https://www.bseindia.com/`.

### Request Parameters

| Parameter     | Type     | Required | Description                                                                                                                        |
| :------------ | :------- | :------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| `strCat`      | `string` | Yes      | Category filter: `'Insider Trading / SAST'` for takeover/SAST disclosures; `'-1'` for all categories.                              |
| `subcategory` | `string` | Yes      | `'-1'` for all subcategories within category.                                                                                      |
| `strPrevDate` | `string` | Yes      | `YYYYMMDD` (e.g. `'20260916'`)                                                                                                     |
| `strToDate`   | `string` | Yes      | `YYYYMMDD` (e.g. `'20260916'`)                                                                                                     |
| `strSearch`   | `string` | Yes      | `'P'` (period filter)                                                                                                              |
| `strscrip`    | `string` | Yes      | **Leave empty (`''`) for market-wide search across ALL BSE scrips**. Pass a BSE scrip code (e.g. `'530073'`) for a single company. |
| `strType`     | `string` | Yes      | `'C'` (company announcements)                                                                                                      |
| `pageno`      | `number` | Yes      | Page number (1-indexed).                                                                                                           |

### Response Schema

```json
{
  "Table": [
    {
      "NEWSID": "055fec03-09c1-4379-8727-a1a1177d3605",
      "SCRIP_CD": 544534,
      "XML_NAME": "ANN_544534_055FEC03-09C1-4379-8727-A1A1177D3605",
      "NEWSSUB": "Jaro Institute of Technology Management and Research Ltd - 544534 - Disclosures under Reg. 29(2) of SEBI (SAST) Regulations, 2011",
      "DT_TM": "2026-09-16T19:56:02.293",
      "NEWS_DT": "2026-09-16T19:56:02.293",
      "ATTACHMENTNAME": "055FEC03_09C1_4379_8727_A1A1177D3605_195556.pdf",
      "HEADLINE": "The Exchange has received the disclosure under Regulation 29(2) of SEBI (Substantial Acquisition of Shares & Takeovers) Regulations, 2011 for Sanjay Namdeo Salunkhe",
      "CATEGORYNAME": "Insider Trading / SAST",
      "SLONGNAME": "Jaro Institute of Technology Management and Research Ltd",
      "TotalPageCnt": 2,
      "DissemDT": "2026-09-16T19:56:02.293",
      "SUBCATNAME": "Disclosures under Reg. 29(2) of SEBI (SAST) Regulations, 2011"
    }
  ]
}
```

### Attachment URL Format

- Attached filing PDFs are accessible at: `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${ATTACHMENTNAME}`.

---

## 2. Market-Wide Bulk & Block Deals (`BulkDealData_ng/w`)

- **Method**: `GET`
- **Path**: `https://api.bseindia.com/BseIndiaAPI/api/BulkDealData_ng/w`
- **Client Method**: `BseClient.prototype.getBulkBlockDeals(dealType, fromDate, toDate)`
- **Params**: `DealType=1` (bulk) or `2` (block), `sc_code=""` (market-wide), `FDate=DD/MM/YYYY`, `TDate=DD/MM/YYYY`.

### Response Schema

```json
{
  "Table": [
    {
      "DEAL_DATE": "2026-09-16T00:00:00",
      "SCRIP_CODE": "512169",
      "scripname": "512169",
      "CLIENT_NAME": "INVESTOR NAME",
      "TRANSACTION_TYPE": "B",
      "QUANTITY": 100000,
      "PRICE": 117.65
    }
  ]
}
```

Compute trade value as `QUANTITY * PRICE`.

---

## XBRL endpoints (added 2026-09-30, verified live and via Chrome network capture)

### Financial-result XBRL (`Corp_FinanceResult_ng_new/w`)

- **Client**: `BseClient#getResultXbrlRows(scripCode)`; file download `BseClient#fetchXbrlFile(name)`.
- **Params**: `SCRIP_CD`, `FlagDur=7`, `HFQ=''`, `ISUBGROUP_CODE=''`, `segment=C`.
- **Rows** (history to about FY2017-18 for the scrip checked): `Scrip_cd, scrip_name, quarter_code (e.g. JQ2026-2027), audited, DT_TM, Fld_CreateDate, Industry_name, Fld_NatureOfReport, XMLName (standalone), Consol_XMLName`.
- **Files**: `https://www.bseindia.com/XBRLFILES/<XMLName>`; needs a browser User-Agent and `Referer: https://www.bseindia.com/` (handled by `bseGetXbrlFile`).
- **Formats**: new filings are iXBRL `.html` (`Integrated_Finance_Ind_As_*`, `..._NBFC_*`) with `in-capmkt` names, single-quoted attributes, `scale='6'` (values in millions) and `sign='-'`; older filings are plain `.xml` with `in-bse-fin` names. The parser handles both.
- **Verified**: Hindustan Foods Q1 FY27 (scrip 519126) matches NSE on 69/69 standalone and 43/43 consolidated facts.

### XBRL filings index (`GetCorXbrlDetails_ng/w`)

- **Client**: `BseClient#getXbrlFilings(flag, fromDate, toDate, scripCode?)`.
- **Params**: `Flag` (category id), `scripcode`, `fromdate`/`todate` as `YYYY/M/D`.
- About 70 categories (PIT, shareholding, voting results, governance, BRSR, credit ratings, Reg-30 events). Flag 22 "Financial Results" returns empty; use the endpoint above for results.
- Flag table (names inferred from file prefixes and element domains, verified by fetching sample files):

  | Flag                   | Content                                                                                                  | Format                                   |
  | ---------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
  | 1                      | Insider trading (PIT, `in-bse-co`)                                                                       | xml                                      |
  | 6                      | Voting results (`in-bse-voting`)                                                                         | xml                                      |
  | 8                      | Integrated governance report                                                                             | xml                                      |
  | 44                     | Integrated governance report                                                                             | html (iXBRL)                             |
  | 23                     | Shareholding pattern (`in-bse-shp`)                                                                      | xml                                      |
  | 43                     | BRSR                                                                                                     | xml                                      |
  | 24                     | Reg-30 event announcements                                                                               | xml                                      |
  | 14                     | Credit rating                                                                                            | xml                                      |
  | 31                     | Director/KMP resignation                                                                                 | xml                                      |
  | 32                     | Auditor resignation                                                                                      | xml                                      |
  | 33                     | Change in management                                                                                     | xml                                      |
  | 28                     | Notice / resolution agenda                                                                               | xml                                      |
  | 40                     | CIRP                                                                                                     | xml                                      |
  | 41                     | Trading-window closure                                                                                   | xml                                      |
  | 46                     | Orders / actions                                                                                         | xml                                      |
  | 48-65                  | `REG30PARAB` sub-categories                                                                              | xml                                      |
  | 22                     | "Financial Results"                                                                                      | empty, use `Corp_FinanceResult_ng_new/w` |
  | 34                     | Prior intimation of board meeting (`PIBM`)                                                               | html                                     |
  | 35                     | Outcome of board meeting (`BM`)                                                                          | html                                     |
  | 47                     | Analyst/investor meet, earnings-call schedule and recordings (`SAIIM`)                                   | html                                     |
  | 45                     | Order/contract awarded to the entity (`ABRC`); ignores the date window, filter client-side               | html                                     |
  | 27                     | Alteration of capital (`ACR`)                                                                            | html                                     |
  | 42                     | Loss of share certificate (`LSCI`)                                                                       | html                                     |
  | 2                      | Annual secretarial compliance report (`ASCR`)                                                            | html                                     |
  | 13 / 15                | Debt redemption (`RPS`) / interest (`IPS`) payment schedule                                              | xml                                      |
  | 26 / 29                | One-time settlement (`OTS`) / CDR                                                                        | html                                     |
  | 4, 9, 11, 16-21, 37-39 | not mapped (exchange-internal, empty, or no file URLs); see `UNMAPPED_BSE_FLAGS` in `lib/xbrl/events.js` |                                          |

  Gotchas: a `todate` later than today makes the endpoint return nothing (capped in `bseDayAfter`); event files are `in-capmkt` iXBRL that contain text facts only, which `parseXbrl` now detects via `ix:nonNumeric`. The event catalogue (kinds, flags, NSE subjects) lives in `packages/jobs-runtime/lib/xbrl/events.js`.

### Symbol to scrip mapping

NSE symbol and BSE scrip code differ (HNDFDS is 519126); resolve with `BseClient#getScripCode`.
