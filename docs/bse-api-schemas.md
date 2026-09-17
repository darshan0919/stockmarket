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
