const emailService = require('./emailService');
const googleDriveApi = require('./googleDriveApi');
const StorageService = require('./StorageService');
const pdfText = require('./pdfText');
const apiUsageCounter = require('./apiUsageCounter');
const deliveryUsageCounter = require('./deliveryUsageCounter');

module.exports = {
  ...emailService,
  ...googleDriveApi,
  StorageService,
  ...pdfText,
  // Namespaced (not spread) — avoids colliding with any of the above, and
  // keeps its small function set addressable as one object at call sites:
  // require('@stock/cloud-utils').apiUsageCounter.record(...).
  apiUsageCounter,
  deliveryUsageCounter,
};
