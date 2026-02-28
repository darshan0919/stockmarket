# Orders Service

Business logic for NSE order announcements. Fetches and filters announcements, finds transcripts.

## Source File
`backend/services/ordersService.js`

## Functions/Methods

### fetchAllAnnouncements(symbol)
Fetch all corporate announcements for a stock from NSE India API.

**Parameters:**
- `symbol` (string) - Stock symbol

**Returns:** Promise\<Array\> - List of all announcements (empty array on error)

### filterOrderAnnouncements(announcements)
Filter announcements to only order-related ones (bagging/receiving orders, tender intimation).

**Parameters:**
- `announcements` (Array) - All announcements

**Returns:** Array - Order-related announcements

### fetchOrderAnnouncements(symbol)
Fetch all announcements and return only order-related ones.

**Parameters:**
- `symbol` (string) - Stock symbol

**Returns:** Promise\<Array\> - Order announcements

### findTranscriptAnnouncements(allAnnouncements)
Find transcript announcements from last 1 year. Sorted by date descending.

**Parameters:**
- `allAnnouncements` (Array) - All announcements

**Returns:** Array - Transcript announcements (attachment text/file contains "transcript")

## Usage Example

```javascript
const {
  fetchAllAnnouncements,
  fetchOrderAnnouncements,
  findTranscriptAnnouncements,
} = require('../services/ordersService');

const all = await fetchAllAnnouncements('RELIANCE');
const orders = await fetchOrderAnnouncements('RELIANCE');
const transcripts = findTranscriptAnnouncements(all);
```

## Related
- [ordersController](../controllers/ordersController.md)
- [nseHelpers](../utils/nseHelpers.md)
- [API Reference](../../API_REFERENCE.md#orders-apis)
