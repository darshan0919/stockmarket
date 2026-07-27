const emailService = require('./emailService');
const googleDriveApi = require('./googleDriveApi');
const StorageService = require('./StorageService');
const pdfText = require('./pdfText');

module.exports = {
  ...emailService,
  ...googleDriveApi,
  StorageService,
  ...pdfText,
};
