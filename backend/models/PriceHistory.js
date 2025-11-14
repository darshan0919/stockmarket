const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
  stock_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stock',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  open: {
    type: Number,
    required: true,
  },
  high: {
    type: Number,
    required: true,
  },
  low: {
    type: Number,
    required: true,
  },
  close: {
    type: Number,
    required: true,
  },
  volume: {
    type: Number,
    default: 0,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

priceHistorySchema.index({ stock_id: 1, date: -1 });
priceHistorySchema.index({ date: -1 });

module.exports = mongoose.model('PriceHistory', priceHistorySchema);

