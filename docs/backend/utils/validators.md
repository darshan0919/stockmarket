# Validators

Joi validation schemas for request validation. Used by routes/middleware to validate screener filters, stock symbols, and search queries.

## Source File
`backend/utils/validators.js`

## Exports

### screenerFiltersSchema
Joi object schema for screener request body.

**Valid fields:**
- `market_cap_min`, `market_cap_max` (number, min 0)
- `sectors`, `industries` (string[])
- `pe_min`, `pe_max`, `pb_min`, `pb_max`, `roe_min`, `roe_max`, `roce_min`, `roce_max` (number)
- `debt_to_equity_max` (number, min 0)
- `revenue_growth_3y_min`, `profit_growth_3y_min` (number)
- `dividend_yield_min`, `dividend_yield_max`, `current_ratio_min` (number)
- `sort_by` - 'market_cap' | 'pe_ratio' | 'pb_ratio' | 'roe' | 'roce'
- `sort_order` - 'asc' | 'desc'
- `limit` (number, 1-1000)

### stockSymbolSchema
Joi string schema: uppercase, 1-20 chars, required.

### searchQuerySchema
Joi string schema: 1-100 chars, required.

## Usage Example

```javascript
const { screenerFiltersSchema, stockSymbolSchema } = require('../utils/validators');

const { error, value } = screenerFiltersSchema.validate(req.body);
if (error) return res.status(400).json({ error: error.details[0].message });
```

## Related
- [screenerController](../controllers/screenerController.md)
- [API Reference](../../API_REFERENCE.md)
