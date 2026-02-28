# Result Transcript Controller

Fetches earnings call transcript announcements from BSE and analyzes them using Gemini AI.

## Source File
`backend/controllers/resultTranscriptController.js`

## Functions/Methods

### getResultTranscript(req, res, next)
Fetch result/earnings call transcript announcements for a stock from BSE India API.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol

**Returns:** JSON with `data` (array of announcements)

### analyzeTranscript(req, res, next)
Analyze a transcript attachment using Gemini AI. Requires attachment name in request body.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol
- `req.body.attachmentName` (string) - BSE attachment filename (required)

**Returns:** JSON with `data` (analysis result) and `url` (BSE document URL)

## Usage Example

```javascript
// GET /api/result-transcript/RELIANCE
// POST /api/result-transcript/RELIANCE/analyze
// Body: { attachmentName: "transcript_123.pdf" }
```

## Related
- [API Reference](../../API_REFERENCE.md#result-transcript-apis)
- [bseIndiaApi](../api/bseIndiaApi.md)
- [geminiApi](../api/geminiApi.js)
