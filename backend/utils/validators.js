const Joi = require('joi');

/**
 * Validate screener filters
 */
const screenerFiltersSchema = Joi.object({
  market_cap_min: Joi.number().min(0).optional(),
  market_cap_max: Joi.number().min(0).optional(),
  sectors: Joi.array().items(Joi.string()).optional(),
  industries: Joi.array().items(Joi.string()).optional(),
  pe_min: Joi.number().optional(),
  pe_max: Joi.number().optional(),
  pb_min: Joi.number().optional(),
  pb_max: Joi.number().optional(),
  roe_min: Joi.number().optional(),
  roe_max: Joi.number().optional(),
  roce_min: Joi.number().optional(),
  roce_max: Joi.number().optional(),
  debt_to_equity_max: Joi.number().min(0).optional(),
  revenue_growth_3y_min: Joi.number().optional(),
  profit_growth_3y_min: Joi.number().optional(),
  dividend_yield_min: Joi.number().min(0).optional(),
  dividend_yield_max: Joi.number().optional(),
  current_ratio_min: Joi.number().min(0).optional(),
  sort_by: Joi.string().valid('market_cap', 'pe_ratio', 'pb_ratio', 'roe', 'roce').optional(),
  sort_order: Joi.string().valid('asc', 'desc').optional(),
  limit: Joi.number().min(1).max(1000).optional(),
});

/**
 * Validate stock symbol
 */
const stockSymbolSchema = Joi.string().uppercase().min(1).max(20).required();

/**
 * Validate search query
 */
const searchQuerySchema = Joi.string().min(1).max(100).required();

module.exports = {
  screenerFiltersSchema,
  stockSymbolSchema,
  searchQuerySchema,
};

