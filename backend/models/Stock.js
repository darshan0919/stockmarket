const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
  },
  sector: {
    type: String,
    default: 'Unknown',
  },
  industry: {
    type: String,
    default: 'Unknown',
  },
  market_cap: {
    type: Number,
    default: 0,
  },
  listing_date: {
    type: Date,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

stockSchema.index({ symbol: 1 });
stockSchema.index({ name: 'text', symbol: 'text' });
stockSchema.index({ sector: 1 });

module.exports = mongoose.model('Stock', stockSchema);

