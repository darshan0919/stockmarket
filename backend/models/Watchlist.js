const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  added_date: {
    type: Date,
    default: Date.now,
  },
});

watchlistSchema.index({ symbol: 1 });

module.exports = mongoose.model('Watchlist', watchlistSchema);

