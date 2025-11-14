const Stock = require('../models/Stock');
const Fundamental = require('../models/Fundamental');
const PriceHistory = require('../models/PriceHistory');
const FinancialStatement = require('../models/FinancialStatement');
const { calculateAllIndicators, calculateSMA } = require('../utils/technicalIndicators');
const axios = require('axios');

/**
 * Search stocks by symbol or name using NSE India API
 * GET /api/stocks/search?q={query}&page={page}&limit={limit}
 */
const searchStocks = async (req, res, next) => {
  const { q, page = 1, limit = 10 } = req.query;

  if (!q || q.length < 1) {
    return res.status(400).json({
      success: false,
      error: 'Search query is required',
    });
  }

  try {
    // Call NSE India autocomplete API
    const apiResponse = await axios.get(
      `https://www.nseindia.com/api/search/autocomplete?q=${encodeURIComponent(q)}`,
      {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      }
    );

    // Extract and format the response from NSE India API
    const symbols = apiResponse.data.symbols || [];
    
    // Filter only equity stocks (not mutual funds, etc.)
    const equitySymbols = symbols.filter(
      item => item.result_sub_type === 'equity' && item.activeSeries && item.activeSeries.includes('EQ')
    );

    // Apply pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedResults = equitySymbols.slice(startIndex, endIndex);

    // Format results to match our expected structure
    const formattedResults = paginatedResults.map(stock => ({
      name: stock.symbol_info,
      symbol: stock.symbol,
      exchange: 'NSE',
      sector: null,
      industry: null,
      current_price: null,
      change_percent: null,
      listing_date: stock.listing_date,
    }));

    res.json({
      success: true,
      results: formattedResults,
      total: equitySymbols.length,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error('NSE India API Error:', error.message);
    
    // Fallback to local database if NSE India API fails
    try {
      console.log('Using local database fallback for search:', q);
      
      const pageNum = Number(page);
      const limitNum = Number(limit);
      const skip = (pageNum - 1) * limitNum;
      
      const stocks = await Stock.find({
        $or: [
          { symbol: { $regex: q, $options: 'i' } },
          { name: { $regex: q, $options: 'i' } },
        ],
      })
        .skip(skip)
        .limit(limitNum)
        .select('id symbol name sector industry market_cap')
        .lean();

      const totalCount = await Stock.countDocuments({
        $or: [
          { symbol: { $regex: q, $options: 'i' } },
          { name: { $regex: q, $options: 'i' } },
        ],
      });

      return res.json({
        success: true,
        results: stocks.map(stock => ({
          name: stock.name,
          symbol: stock.symbol,
          exchange: 'NSE',
          sector: stock.sector,
          industry: stock.industry,
          current_price: null,
          change_percent: null,
        })),
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        fallback: true,
      });
    } catch (dbError) {
      console.error('Database fallback error:', dbError);
      next(error);
    }
  }
};

/**
 * Get stock details by symbol using NSE API
 * GET /api/stocks/:symbol
 */
const getStockDetails = async (req, res, next) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();

  try {
    // Fetch data from NSE India Quote API
    const nseResponse = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${upperSymbol}`,
      {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      }
    );

    const nseData = nseResponse.data;
    
    // Extract basic info
    const basicInfo = {
      symbol: upperSymbol,
      name: nseData.info?.companyName || upperSymbol,
      sector: nseData.industryInfo?.sector || nseData.industryInfo?.macro || 'Unknown',
      industry: nseData.industryInfo?.basicIndustry || nseData.metadata?.industry || 'Unknown',
      market_cap: nseData.securityInfo?.issuedSize ? 
        (nseData.securityInfo.issuedSize * (nseData.priceInfo?.lastPrice || 0)) : null,
      listing_date: nseData.info?.listingDate || nseData.metadata?.listingDate,
      isin: nseData.info?.isin,
      face_value: nseData.securityInfo?.faceValue,
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

    // Extract fundamentals
    const fundamentals = {
      pe_ratio: nseData.metadata?.pdSymbolPe || null,
      sector_pe: nseData.metadata?.pdSectorPe || null,
      market_cap: basicInfo.market_cap,
      face_value: nseData.securityInfo?.faceValue,
      book_value_per_share: null, // Not available in quote API
      dividend_yield: null, // Not available in quote API
      roe: null, // Not available in quote API
      roce: null, // Not available in quote API
      debt_to_equity: null, // Not available in quote API
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

    res.json({
      success: true,
      data: {
        basic_info: basicInfo,
        price_info: currentPrice,
        fundamentals: fundamentals,
        latest_financial: {},
        price_history_5y: priceHistory,
        nse_data: {
          trading_status: nseData.securityInfo?.tradingStatus,
          board_status: nseData.securityInfo?.boardStatus,
          surveillance: nseData.securityInfo?.surveillance,
          is_fno: nseData.info?.isFNOSec,
          issued_size: nseData.securityInfo?.issuedSize,
        },
      },
    });
  } catch (error) {
    console.error('NSE API Error for stock details:', error.message);
    
    // Fallback to local database
    try {
      const stock = await Stock.findOne({ symbol: upperSymbol }).lean();

      if (!stock) {
        return res.status(404).json({
          success: false,
          error: `Stock ${upperSymbol} not found`,
        });
      }

      // Get latest fundamentals
      const fundamental = await Fundamental.findOne({ stock_id: stock._id })
        .sort({ date: -1 })
        .lean();

      // Get recent price history
      const priceHistory = await PriceHistory.find({
        stock_id: stock._id,
      })
        .sort({ date: -1 })
        .limit(365)
        .lean();

      // Get latest financial statement
      const latestFinancial = await FinancialStatement.findOne({
        stock_id: stock._id,
      })
        .sort({ fiscal_year: -1, quarter: -1 })
        .lean();

      const latestPrice = priceHistory.length > 0 ? priceHistory[0] : null;
      const prevPrice = priceHistory.length > 1 ? priceHistory[1] : null;

      res.json({
        success: true,
        data: {
          basic_info: {
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector,
            industry: stock.industry,
            market_cap: stock.market_cap,
            listing_date: stock.listing_date,
          },
          price_info: latestPrice ? {
            last_price: latestPrice.close,
            change: prevPrice ? latestPrice.close - prevPrice.close : 0,
            change_percent: prevPrice && prevPrice.close !== 0 ? 
              ((latestPrice.close - prevPrice.close) / prevPrice.close) * 100 : 0,
            previous_close: prevPrice?.close,
            open: latestPrice.open,
            close: latestPrice.close,
            day_high: latestPrice.high,
            day_low: latestPrice.low,
          } : {},
          fundamentals: fundamental || {},
          latest_financial: latestFinancial || {},
          price_history_5y: priceHistory.reverse().map(ph => ({
            date: ph.date,
            open: ph.open,
            high: ph.high,
            low: ph.low,
            close: ph.close,
            volume: ph.volume,
          })),
          fallback: true,
        },
      });
    } catch (dbError) {
      console.error('Database fallback error:', dbError);
      next(error);
    }
  }
};

/**
 * Get stock technicals
 * GET /api/stocks/:symbol/technicals
 */
const getStockTechnicals = async (req, res, next) => {
  try {
    const { symbol } = req.params;

    const stock = await Stock.findOne({ symbol: symbol.toUpperCase() }).lean();

    if (!stock) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found',
      });
    }

    // Get recent price history for technical calculations
    const priceHistory = await PriceHistory.find({
      stock_id: stock._id,
    })
      .sort({ date: -1 })
      .limit(250)
      .lean();

    if (priceHistory.length === 0) {
      return res.json({
        success: true,
        data: {
          current_price: null,
          sma_50: null,
          sma_200: null,
          rsi_14: null,
          macd: { macd: null, signal: null, histogram: null },
        },
      });
    }

    // Reverse to get chronological order
    priceHistory.reverse();

    const indicators = calculateAllIndicators(priceHistory);
    const currentPrice = priceHistory[priceHistory.length - 1].close;

    res.json({
      success: true,
      data: {
        current_price: currentPrice,
        ...indicators,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get stock financial statements
 * GET /api/stocks/:symbol/financials?quarters=4
 */
const getStockFinancials = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const quarters = parseInt(req.query.quarters) || 4;

    // Try to find stock in database
    const stock = await Stock.findOne({ symbol: symbol.toUpperCase() }).lean();

    // If stock not found in database, return empty data (not an error)
    // This allows the quarterly results widget to still work with NSE API
    if (!stock) {
      return res.json({
        success: true,
        data: {
          p_and_l: [],
          balance_sheet: [],
          message: 'Historical financial data not available in database',
        },
      });
    }

    const financials = await FinancialStatement.find({
      stock_id: stock._id,
    })
      .sort({ fiscal_year: -1, quarter: -1 })
      .limit(quarters)
      .lean();

    res.json({
      success: true,
      data: {
        p_and_l: financials.map(f => ({
          period: `Q${f.quarter} FY${f.fiscal_year}`,
          revenue: f.revenue,
          gross_profit: f.gross_profit,
          operating_profit: f.operating_profit,
          ebitda: f.ebitda,
          net_profit: f.net_profit,
        })),
        balance_sheet: financials.map(f => ({
          period: `Q${f.quarter} FY${f.fiscal_year}`,
          total_assets: f.total_assets,
          total_liabilities: f.total_liabilities,
          shareholders_equity: f.shareholders_equity,
          total_debt: f.total_debt,
          current_assets: f.current_assets,
          current_liabilities: f.current_liabilities,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get quarterly financial results from NSE
 * GET /api/stocks/:symbol/quarterly
 */
const getQuarterlyResults = async (req, res, next) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();

  try {
    // Fetch quarterly results from NSE India using results-comparison API
    const nseResponse = await axios.get(
      `https://www.nseindia.com/api/results-comparision?symbol=${upperSymbol}&period=Quarterly&comparisionType=quarterly`,
      {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      }
    );

    const rawData = nseResponse.data;
    
    // Extract financial results from NSE response
    const financialResults = rawData?.resCmpData || [];
    
    if (!financialResults || financialResults.length === 0) {
      return res.json({
        success: true,
        data: {
          quarters: [],
          message: 'No quarterly results available',
        },
      });
    }

    // Parse and normalize quarterly results
    // Sort by date (most recent first) and take up to 8 quarters
    const sortedResults = financialResults
      .sort((a, b) => {
        const dateA = new Date(a.re_to_dt.split('-').reverse().join('-'));
        const dateB = new Date(b.re_to_dt.split('-').reverse().join('-'));
        return dateB - dateA;
      })
      .slice(0, 8);

    // Helper function to parse numeric values
    const parseValue = (val) => {
      if (!val || val === '-' || val === 'NA' || val === null) return null;
      const numStr = String(val).replace(/,/g, '');
      const num = parseFloat(numStr);
      return isNaN(num) ? null : num;
    };

    // Helper function to format date from DD-MMM-YYYY to a readable quarter format
    const formatPeriod = (toDate, fromDate) => {
      const date = new Date(toDate.split('-').reverse().join('-'));
      const month = date.getMonth() + 1;
      const quarter = Math.ceil(month / 3);
      const year = date.getFullYear();
      return `Q${quarter} ${year}`;
    };

    // Parse each quarter's data and structure it
    const quarters = sortedResults.map((item) => {
      // Calculate expenses (total expenses - interest - depreciation - tax)
      const totalIncome = parseValue(item.re_total_inc);
      const netSales = parseValue(item.re_net_sale);
      const otherIncome = parseValue(item.re_oth_inc_new);
      const totalOtherExp = parseValue(item.re_oth_tot_exp);
      const staffCost = parseValue(item.re_staff_cost);
      const rawMatConsump = parseValue(item.re_rawmat_consump);
      const otherExp = parseValue(item.re_oth_exp);
      const interest = parseValue(item.re_int_new);
      const depreciation = parseValue(item.re_depr_und_exp);
      const pbt = parseValue(item.re_pro_loss_bef_tax);
      const tax = parseValue(item.re_tax);
      const netProfit = parseValue(item.re_net_profit);
      
      // Calculate operating profit (Sales - Operating Expenses)
      // Operating Expenses = Raw materials + Staff + Other expenses
      const operatingExpenses = (rawMatConsump || 0) + (staffCost || 0) + (otherExp || 0);
      const operatingProfit = netSales ? (netSales - operatingExpenses) : null;
      
      // Calculate OPM % (Operating Profit Margin)
      const opmPercent = netSales && operatingProfit ? (operatingProfit / netSales) * 100 : null;
      
      // Calculate tax percentage
      const taxPercent = pbt && pbt !== 0 ? (tax / pbt) * 100 : null;
      
      // Get EPS
      const eps = parseValue(item.re_basic_eps_for_cont_dic_opr) || parseValue(item.re_dilut_eps_for_cont_dic_opr);
      
      return {
        period: formatPeriod(item.re_to_dt, item.re_from_dt),
        to_date: item.re_to_dt,
        from_date: item.re_from_dt,
        sales: netSales,
        expenses: operatingExpenses || totalOtherExp,
        operating_profit: operatingProfit,
        opm_percent: opmPercent,
        other_income: otherIncome,
        interest: interest,
        depreciation: depreciation,
        pbt: pbt,
        tax_percent: taxPercent,
        net_profit: netProfit,
        eps: eps,
        audited: item.re_res_type === 'A',
      };
    });

    // Calculate YoY and QoQ growth
    quarters.forEach((quarter, index) => {
      // YoY Growth (compare with quarter 4 positions back)
      if (index + 4 < quarters.length) {
        const prevYearQuarter = quarters[index + 4];
        
        if (quarter.sales && prevYearQuarter.sales && prevYearQuarter.sales !== 0) {
          quarter.yoy_sales_growth = ((quarter.sales - prevYearQuarter.sales) / Math.abs(prevYearQuarter.sales)) * 100;
        }
        
        if (quarter.net_profit && prevYearQuarter.net_profit && prevYearQuarter.net_profit !== 0) {
          quarter.yoy_profit_growth = ((quarter.net_profit - prevYearQuarter.net_profit) / Math.abs(prevYearQuarter.net_profit)) * 100;
        }
      }

      // QoQ Growth (compare with previous quarter)
      if (index + 1 < quarters.length) {
        const prevQuarter = quarters[index + 1];
        
        if (quarter.sales && prevQuarter.sales && prevQuarter.sales !== 0) {
          quarter.qoq_sales_growth = ((quarter.sales - prevQuarter.sales) / Math.abs(prevQuarter.sales)) * 100;
        }
        
        if (quarter.net_profit && prevQuarter.net_profit && prevQuarter.net_profit !== 0) {
          quarter.qoq_profit_growth = ((quarter.net_profit - prevQuarter.net_profit) / Math.abs(prevQuarter.net_profit)) * 100;
        }
      }
    });

    // Reverse to show oldest to newest (left to right in table)
    quarters.reverse();

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        quarters,
        source: 'NSE India',
        source_url: `https://www.nseindia.com/get-quotes/equity?symbol=${upperSymbol}`,
      },
    });
  } catch (error) {
    console.error('NSE API Error for quarterly results:', error.message);
    
    // Return empty data instead of error
    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        quarters: [],
        error: 'Unable to fetch quarterly results from NSE',
      },
    });
  }
};

module.exports = {
  searchStocks,
  getStockDetails,
  getStockTechnicals,
  getStockFinancials,
  getQuarterlyResults,
};

