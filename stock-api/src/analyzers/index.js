'use strict';

const { evaluateCatalystRules } = require('./catalystRules');
const { computeConcentration, computeHHI } = require('./computeConcentration');
const { parseTweetDump } = require('./parseTweetDump');
const { runScan, resolveUniverse, applyLiquidityGate } = require('./runScan');
const { scanCatalysts } = require('./scanCatalysts');
const { postEventReturns, eventReturns, driftSignature } = require('./postEventReturns');
const {
  parseScreenerInsights, detectAuthState, parseProsCons, parseTopRatios, tagInsights,
} = require('./screenerInsights');

module.exports = {
  evaluateCatalystRules,
  computeConcentration, computeHHI,
  parseTweetDump,
  runScan,
  resolveUniverse,
  applyLiquidityGate,
  postEventReturns, eventReturns, driftSignature,
  parseScreenerInsights, detectAuthState, parseProsCons, parseTopRatios, tagInsights,
  scanCatalysts
};
