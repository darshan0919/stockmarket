# Result Transcript Controller

Fetches earnings call transcript announcements from BSE.

## Source File

`backend/controllers/resultTranscriptController.js` (and `screener-api/src/features/results/resultTranscriptController.js`)

## Functions/Methods

### getResultTranscript(req, res, next)

Fetch result/earnings call transcript announcements for a stock from BSE India API.

**Parameters:**

- `req.params.symbol` (string) - Stock symbol

**Returns:** JSON with `data` (array of announcements)

## Usage Example

```javascript
// GET /api/result-transcript/RELIANCE
```

## Related

- [API Reference](../../API_REFERENCE.md#result-transcript-apis)
- [bseIndiaApi](../api/bseIndiaApi.md)
