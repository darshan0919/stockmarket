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
  },
  sector: {
    type: String,
    default: 'Unknown',
  },
  industry: {
    type: String,
    default: 'Unknown',
  },

  listing_date: {
    type: Date,
  },
  isin: {
    type: String,
    default: 'Unknown',
  },
  face_value: {
    type: Number,
    default: 0,
  },
  index_name: {
    type: String,
    default: 'Unknown',
  },
  created_at: {
    type: Date,
    default: Date.now,
  },

});

stockSchema.index({ symbol: 1 });
stockSchema.index({ name: 'text', symbol: 'text' });
stockSchema.index({ sector: 1 });
// Do not TTL-expire Stock documents: expiry forced repeated BSE lookups and broke /api/stocks/:symbol when BSE was slow or returned no scrip.

module.exports = mongoose.model('Stock', stockSchema);
