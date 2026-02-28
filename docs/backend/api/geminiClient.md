# Gemini Client

Shared Gemini AI client for PDF document parsing with MongoDB caching. Used by orderParser, orderbookBaselineParser, and geminiApi.

## Source File
`backend/api/geminiClient.js`

## Functions/Methods

### parsePdfWithGemini(options)
Parse a PDF document using Gemini AI. Checks cache first; on miss, calls Gemini API and caches result.

**Parameters:**
- `options.attachmentUrl` (string) - URL to PDF
- `options.prompt` (string) - Prompt for Gemini
- `options.promptHash` (string) - Pre-computed SHA-256 hash of prompt (cache key)
- `options.timeout` (number) - Request timeout ms (default: 120000)
- `options.parseJson` (boolean) - Parse response as JSON (default: true)
- `options.errorShape` (object) - Default fields on error

**Returns:** Promise\<Object\> - Parsed data with `_cache_metadata: { from_cache, cached_at, parse_time_ms }`

### cleanGeminiJsonResponse(text)
Strip markdown code fences from Gemini response for JSON parsing.

### hashPrompt(prompt)
Generate SHA-256 hash of prompt string for cache keys.

### checkCache(attachmentKey, promptHashValue)
Look up cached response in ModelResponse collection.

### saveToCache(attachmentKey, promptHashValue, responseData)
Save response to ModelResponse collection.

## Exports

- `GEMINI_API_URL` - Gemini API endpoint
- `parsePdfWithGemini`, `cleanGeminiJsonResponse`, `hashPrompt`, `checkCache`, `saveToCache`

## Usage Example

```javascript
const { parsePdfWithGemini, hashPrompt } = require('../api/geminiClient');

const result = await parsePdfWithGemini({
  attachmentUrl: 'https://...',
  prompt: 'Extract order details...',
  promptHash: hashPrompt(prompt),
  parseJson: true,
});
```

## Related
- [orderParser](orderParser.md)
- [ModelResponse](../../../backend/models/ModelResponse.js)
