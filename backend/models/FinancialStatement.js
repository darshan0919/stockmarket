const mongoose = require('mongoose');

const financialStatementSchema = new mongoose.Schema({
  stock_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stock',
    required: true,
  },
  period_type: {
    type: String,
    enum: ['quarterly', 'annual'],
    required: true,
  },
  fiscal_year: {
    type: Number,
    required: true,
  },
  quarter: {
    type: Number,
    min: 1,
    max: 4,
  },
  revenue: {
    type: Number,
    default: 0,
  },
  gross_profit: {
    type: Number,
    default: 0,
  },
  operating_profit: {
    type: Number,
    default: 0,
  },
  ebitda: {
    type: Number,
    default: 0,
  },
  net_profit: {
    type: Number,
    default: 0,
  },
  total_assets: {
    type: Number,
    default: 0,
  },
  total_liabilities: {
    type: Number,
    default: 0,
  },
  shareholders_equity: {
    type: Number,
    default: 0,
  },
  total_debt: {
    type: Number,
    default: 0,
  },
  current_assets: {
    type: Number,
    default: 0,
  },
  current_liabilities: {
    type: Number,
    default: 0,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

financialStatementSchema.index({ stock_id: 1, fiscal_year: -1, quarter: -1 });

module.exports = mongoose.model('FinancialStatement', financialStatementSchema);

