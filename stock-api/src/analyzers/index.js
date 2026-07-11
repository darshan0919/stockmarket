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
const {
  avgTradedValueCr, toCandles, fetchPriceMetrics, normalizePvd,
} = require('./priceMetrics');
const {
  classifyEventText, mergeAnnouncements, findLatestEvent, earliestEventTimestamp,
  normalizeOhlcv, computeReactionMetrics, classifySignal, SIGNAL_THRESHOLDS,
} = require('./eventReactionSignals');

module.exports = {
  evaluateCatalystRules,
  computeConcentration, computeHHI,
  parseTweetDump,
  runScan,
  resolveUniverse,
  applyLiquidityGate,
  postEventReturns, eventReturns, driftSignature,
  parseScreenerInsights, detectAuthState, parseProsCons, parseTopRatios, tagInsights,
  avgTradedValueCr, toCandles, fetchPriceMetrics, normalizePvd,
  scanCatalysts,
  classifyEventText, mergeAnnouncements, findLatestEvent, earliestEventTimestamp,
  normalizeOhlcv, computeReactionMetrics, classifySignal, SIGNAL_THRESHOLDS,
};
