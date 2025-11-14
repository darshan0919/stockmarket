const mongoose = require('mongoose');

const fundamentalSchema = new mongoose.Schema({
  stock_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stock',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  pe_ratio: {
    type: Number,
    default: null,
  },
  pb_ratio: {
    type: Number,
    default: null,
  },
  roe: {
    type: Number,
    default: null,
  },
  roce: {
    type: Number,
    default: null,
  },
  debt_to_equity: {
    type: Number,
    default: null,
  },
  revenue_growth_3y: {
    type: Number,
    default: null,
  },
  profit_growth_3y: {
    type: Number,
    default: null,
  },
  dividend_yield: {
    type: Number,
    default: null,
  },
  current_ratio: {
    type: Number,
    default: null,
  },
  eps: {
    type: Number,
    default: null,
  },
  book_value_per_share: {
    type: Number,
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

fundamentalSchema.index({ stock_id: 1, date: -1 });

module.exports = mongoose.model('Fundamental', fundamentalSchema);

