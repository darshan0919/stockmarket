'use strict';

const { createResearchReport } = require('./generateReport');
const { createDrhpPdf } = require('./generateDrhpPdf');
const { createForensicPdf, getForensicSchema } = require('./generateForensicPdf');
const { createConcallPdf } = require('./generateConcallPdf');
const { createSectorReport } = require('./generateSectorReport');
const { createPeerComparisonPdf, getPeerSchema } = require('./generatePeerPdf');
const { createCredibilityWidget, getCredibilitySchema } = require('./generateCredibilityWidget');
const { createMarketShareWidget } = require('./generateMarketShareHtml');
const { createGrowthTriggersPdf } = require('./generateGrowthTriggersPdf');
const { createQuarterlyResultPdf } = require('./generateQuarterlyResultPdf');
const { createReratingCatalystsPdf } = require('./generateReratingCatalystsPdf');

module.exports = {
  createResearchReport,
  createDrhpPdf,
  createForensicPdf,
  getForensicSchema,
  createConcallPdf,
  createSectorReport,
  createPeerComparisonPdf,
  getPeerSchema,
  createCredibilityWidget,
  getCredibilitySchema,
  createMarketShareWidget,
  createGrowthTriggersPdf,
  createQuarterlyResultPdf,
  createReratingCatalystsPdf,
};
