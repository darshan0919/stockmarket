# StockScans Auth Service

Authentication service for StockScans API. Provides token retrieval and authenticated HTTP client.

## Source File
`backend/services/stockscansAuth.js`

## Functions/Methods

### getAuthToken()
Get StockScans authentication token from environment variable `STOCKSCANS_AUTH_TOKEN`. Token is a JWT from browser cookies after logging into stockscans.in.

**Returns:** string - Auth token

**Throws:** Error if `STOCKSCANS_AUTH_TOKEN` not configured

### createAuthenticatedClient(authToken)
Create axios instance with Cookie header for StockScans API.

**Parameters:**
- `authToken` (string) - Token from getAuthToken()

**Returns:** axios.AxiosInstance - Configured with Accept, Content-Type, Cookie headers, 30s timeout

## Usage Example

```javascript
const { getAuthToken, createAuthenticatedClient } = require('../services/stockscansAuth');

const token = getAuthToken();
const authClient = createAuthenticatedClient(token);
const response = await authClient.get('https://www.stockscans.in/api/...');
```

## Environment

Set `STOCKSCANS_AUTH_TOKEN` in `.env` (copy `authtoken` cookie value from stockscans.in after login).

## Related
- [declaredResultsController](../controllers/declaredResultsController.md)
- [API Reference](../../API_REFERENCE.md#declared-results-apis)
