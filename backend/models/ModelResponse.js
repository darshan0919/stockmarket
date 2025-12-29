const mongoose = require('mongoose');

const modelResponseSchema = new mongoose.Schema({
  symbol: {
    type: String,
    uppercase: true,
  },
  prompt: {
    type: String,
  },
  response: {
    type: String,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  attachment_name: {
    type: String,
  },
});

modelResponseSchema.index({ attachment_name: 1, prompt: 1 });

module.exports = mongoose.model('modelRespnse', modelResponseSchema);

