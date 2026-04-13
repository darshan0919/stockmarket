const axios = require('axios');
const { getCompanyInfo } = require('../api/bseIndiaApi');
const { getCurrentMetrics } = require('./balanceSheetDataFetcher');
const Stock = require('../models/Stock');

/**
 * Build a new Stock document from NSE quote-equity payload when BSE is unavailable.
 * @param {string} upperSymbol - Uppercase symbol
 * @param {Object} nseData - Parsed JSON from /api/quote-equity
 * @returns {Object} Unsaved Mongoose Stock document
 */
function stockFromNseQuote(upperSymbol, nseData) {
  const info = nseData.info || {};
  const meta = nseData.metadata || {};
  const sec = nseData.securityInfo || {};
  return new Stock({
    symbol: upperSymbol,
    name: info.companyName || upperSymbol,
    sector: info.macro || meta.sectorName || meta.pdSectorInd || 'Unknown',
    industry: info.industry || 'Unknown',
    isin: info.isin || 'Unknown',
    face_value: sec.faceValue ?? 0,
    index_name: meta.indexName || sec.index || 'Unknown',
  });
}

/**
 * Aggregate NSE quote, BSE-backed stock record, and DB-only quarterly metrics for the stock details API.
 * @param {string} symbol - Uppercase symbol
 * @param {string|null} scripCode - BSE scrip code when creating a new Stock document from BSE
 * @returns {Promise<Object>} Payload for GET /api/stocks/:symbol
 * @see {@link docs/API_REFERENCE.md#get-stock-details}
 */
const fetchStockDetails = async (symbol, scripCode) => {
  const upperSymbol = symbol.toUpperCase();

  let stock = await Stock.findOne({ symbol: upperSymbol });

  const nseResponse = await axios.get(
    `https://www.nseindia.com/api/quote-equity?symbol=${upperSymbol}`,
    {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    }
  );
  const nseData = nseResponse.data;

  if (!stock) {
    let created = null;
    if (scripCode) {
      try {
        const b = await getCompanyInfo(scripCode);
        const bseName = b?.CompanyName || b?.SLONGNAME;
        if (b && bseName) {
          created = new Stock({
            symbol: upperSymbol,
            name: bseName,
            sector: b.Sector || b.SECTOR || 'Unknown',
            industry: b.Industry || b.INDUSTRY || 'Unknown',
            isin: b.ISIN || b.ISIN_CODE || 'Unknown',
            face_value: b.FaceVal ?? b.FACE_VAL ?? 0,
            index_name: b.Index || b.INDEX_NAME || 'Unknown',
          });
        }
      } catch (err) {
        console.warn(
          'BSE getCompanyInfo failed; persisting stock from NSE quote only:',
          err.message
        );
      }
    }
    if (!created) {
      created = stockFromNseQuote(upperSymbol, nseData);
    }
    stock = created;
    await stock.save();
  }

  // Extract basic info
  const basicInfo = {
    symbol: upperSymbol,
    name: nseData.info?.companyName || upperSymbol,
    sector: stock.sector,
    industry: stock.industry,
    market_cap: nseData.securityInfo?.issuedSize
      ? nseData.securityInfo.issuedSize * (nseData.priceInfo?.lastPrice || 0)
      : null,
    listing_date: nseData.info?.listingDate || nseData.metadata?.listingDate,
    isin: stock.isin,
    face_value: stock.face_value,
    index_name: stock.index_name,
  };

  // Extract price info
  const priceInfo = nseData.priceInfo || {};

  const currentPrice = {
    last_price: priceInfo.lastPrice,
    change: priceInfo.change,
    change_percent: priceInfo.pChange,
    previous_close: priceInfo.previousClose,
    open: priceInfo.open,
    close: priceInfo.close,
    vwap: priceInfo.vwap,
    day_high: priceInfo.intraDayHighLow?.max,
    day_low: priceInfo.intraDayHighLow?.min,
    week_high: priceInfo.weekHighLow?.max,
    week_low: priceInfo.weekHighLow?.min,
    week_high_date: priceInfo.weekHighLow?.maxDate,
    week_low_date: priceInfo.weekHighLow?.minDate,
  };

  let currentMetrics;
  try {
    currentMetrics = await getCurrentMetrics(upperSymbol, { allowFetch: false });
    console.log('currentMetrics', currentMetrics);
  } catch (error) {
    console.error('Error fetching current metrics:', error);
  }

  const pb = stock.pb_ratio;
  const bookValuePerShare =
    pb != null && pb !== 0 && Number.isFinite(pb) ? priceInfo.lastPrice / pb : null;

  // Extract fundamentals
  const fundamentals = {
    pe_ratio: nseData.metadata?.pdSymbolPe,
    pb_ratio: stock.pb_ratio,
    sector_pe: nseData.metadata?.pdSectorPe || null,
    market_cap: basicInfo.market_cap,
    face_value: nseData.securityInfo?.faceValue,
    book_value_per_share: bookValuePerShare,
    dividend_yield: currentMetrics?.last_quarter_roce, // Not available in quote API
    roe: stock.roe, // Not available in quote API
    roce: currentMetrics?.roce, // Not available in quote API
    debt_to_equity: currentMetrics?.debt_equity_ratio, // Not available in quote API
    net_profit_margin: stock.npm,
    operating_profit_margin: stock.opm,
    eps: stock.eps,
  };

  // Generate simple price history from available data
  const priceHistory = [];
  if (priceInfo.previousClose && priceInfo.close) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    priceHistory.push({
      date: yesterday.toISOString(),
      open: priceInfo.previousClose,
      high: priceInfo.previousClose,
      low: priceInfo.previousClose,
      close: priceInfo.previousClose,
      volume: 0,
    });

    priceHistory.push({
      date: today.toISOString(),
      open: priceInfo.open || priceInfo.close,
      high: priceInfo.intraDayHighLow?.max || priceInfo.close,
      low: priceInfo.intraDayHighLow?.min || priceInfo.close,
      close: priceInfo.close || priceInfo.lastPrice,
      volume: 0,
    });
  }

  return {
    basicInfo: basicInfo,
    currentPrice: currentPrice,
    fundamentals: fundamentals,
    priceHistory: priceHistory,
  };
};
module.exports = { fetchStockDetails, stockFromNseQuote };
