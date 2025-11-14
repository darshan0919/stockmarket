require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Stock = require('../models/Stock');
const Fundamental = require('../models/Fundamental');
const PriceHistory = require('../models/PriceHistory');
const FinancialStatement = require('../models/FinancialStatement');
const { delay } = require('../utils/dataFetcher');

// Sample NSE stocks data for initial seeding
const sampleStocks = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Energy', industry: 'Oil & Gas', market_cap: 1500000 },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', sector: 'IT', industry: 'Software', market_cap: 1200000 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Financial Services', industry: 'Banking', market_cap: 1100000 },
  { symbol: 'INFY', name: 'Infosys Ltd', sector: 'IT', industry: 'Software', market_cap: 650000 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'Financial Services', industry: 'Banking', market_cap: 620000 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', sector: 'FMCG', industry: 'Consumer Goods', market_cap: 580000 },
  { symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG', industry: 'Tobacco', market_cap: 520000 },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Financial Services', industry: 'Banking', market_cap: 480000 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'Telecom', industry: 'Telecommunications', market_cap: 450000 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd', sector: 'Financial Services', industry: 'Banking', market_cap: 380000 },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', sector: 'Infrastructure', industry: 'Construction', market_cap: 350000 },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd', sector: 'Financial Services', industry: 'Banking', market_cap: 320000 },
  { symbol: 'WIPRO', name: 'Wipro Ltd', sector: 'IT', industry: 'Software', market_cap: 280000 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints Ltd', sector: 'Consumer Durables', industry: 'Paints', market_cap: 270000 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd', sector: 'Automobile', industry: 'Auto Manufacturing', market_cap: 260000 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries Ltd', sector: 'Pharma', industry: 'Pharmaceuticals', market_cap: 240000 },
  { symbol: 'TITAN', name: 'Titan Company Ltd', sector: 'Consumer Durables', industry: 'Jewellery', market_cap: 230000 },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement Ltd', sector: 'Cement', industry: 'Cement', market_cap: 220000 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', sector: 'Financial Services', industry: 'NBFC', market_cap: 210000 },
  { symbol: 'NESTLEIND', name: 'Nestle India Ltd', sector: 'FMCG', industry: 'Food Products', market_cap: 200000 },
];

/**
 * Generate sample price history for a stock
 */
function generatePriceHistory(basePrice, numDays = 1260) {
  const priceHistory = [];
  let currentPrice = basePrice;
  const today = new Date();

  for (let i = numDays; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // Random price movement
    const change = (Math.random() - 0.48) * (basePrice * 0.02);
    currentPrice = Math.max(basePrice * 0.5, currentPrice + change);

    const open = currentPrice;
    const close = currentPrice + (Math.random() - 0.5) * (currentPrice * 0.01);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.floor(Math.random() * 10000000) + 1000000;

    priceHistory.push({
      date,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    currentPrice = close;
  }

  return priceHistory;
}

/**
 * Generate sample fundamentals
 */
function generateFundamentals() {
  return {
    date: new Date(),
    pe_ratio: Number((Math.random() * 40 + 5).toFixed(2)),
    pb_ratio: Number((Math.random() * 8 + 1).toFixed(2)),
    roe: Number((Math.random() * 30 + 5).toFixed(2)),
    roce: Number((Math.random() * 25 + 8).toFixed(2)),
    debt_to_equity: Number((Math.random() * 1.5).toFixed(2)),
    revenue_growth_3y: Number((Math.random() * 30 - 5).toFixed(2)),
    profit_growth_3y: Number((Math.random() * 35 - 5).toFixed(2)),
    dividend_yield: Number((Math.random() * 5).toFixed(2)),
    current_ratio: Number((Math.random() * 2 + 0.5).toFixed(2)),
    eps: Number((Math.random() * 50 + 5).toFixed(2)),
    book_value_per_share: Number((Math.random() * 500 + 100).toFixed(2)),
  };
}

/**
 * Generate sample financial statements
 */
function generateFinancials(baseRevenue) {
  const financials = [];
  const currentYear = new Date().getFullYear();

  for (let i = 0; i < 4; i++) {
    const quarter = 4 - i;
    const revenue = baseRevenue * (0.8 + Math.random() * 0.4);

    financials.push({
      period_type: 'quarterly',
      fiscal_year: currentYear,
      quarter: quarter,
      revenue: Number(revenue.toFixed(2)),
      gross_profit: Number((revenue * 0.4).toFixed(2)),
      operating_profit: Number((revenue * 0.25).toFixed(2)),
      ebitda: Number((revenue * 0.28).toFixed(2)),
      net_profit: Number((revenue * 0.15).toFixed(2)),
      total_assets: Number((revenue * 3).toFixed(2)),
      total_liabilities: Number((revenue * 1.5).toFixed(2)),
      shareholders_equity: Number((revenue * 1.5).toFixed(2)),
      total_debt: Number((revenue * 0.8).toFixed(2)),
      current_assets: Number((revenue * 1.2).toFixed(2)),
      current_liabilities: Number((revenue * 0.8).toFixed(2)),
    });
  }

  return financials;
}

/**
 * Main function to seed the database
 */
async function seedDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await Stock.deleteMany({});
    await Fundamental.deleteMany({});
    await PriceHistory.deleteMany({});
    await FinancialStatement.deleteMany({});
    console.log('Existing data cleared');

    // Seed stocks
    console.log(`\nSeeding ${sampleStocks.length} stocks...`);
    for (const stockData of sampleStocks) {
      console.log(`Processing ${stockData.symbol}...`);

      // Create stock
      const stock = new Stock(stockData);
      await stock.save();

      // Generate and save price history (5 years)
      const basePrice = Math.random() * 2000 + 100;
      const priceHistory = generatePriceHistory(basePrice, 1260);
      
      const priceDocuments = priceHistory.map(ph => ({
        stock_id: stock._id,
        ...ph,
      }));

      await PriceHistory.insertMany(priceDocuments);
      console.log(`  ✓ Added ${priceHistory.length} price records`);

      // Generate and save fundamentals
      const fundamentalData = generateFundamentals();
      const fundamental = new Fundamental({
        stock_id: stock._id,
        ...fundamentalData,
      });
      await fundamental.save();
      console.log(`  ✓ Added fundamentals`);

      // Generate and save financial statements
      const baseRevenue = stockData.market_cap * 0.5;
      const financials = generateFinancials(baseRevenue);
      
      const financialDocuments = financials.map(f => ({
        stock_id: stock._id,
        ...f,
      }));

      await FinancialStatement.insertMany(financialDocuments);
      console.log(`  ✓ Added ${financials.length} financial statements`);

      // Small delay to avoid overwhelming the system
      await delay(100);
    }

    console.log('\n✅ Database seeding completed successfully!');
    console.log(`Total stocks: ${sampleStocks.length}`);
    
    const totalPrices = await PriceHistory.countDocuments();
    console.log(`Total price records: ${totalPrices}`);
    
    const totalFundamentals = await Fundamental.countDocuments();
    console.log(`Total fundamental records: ${totalFundamentals}`);
    
    const totalFinancials = await FinancialStatement.countDocuments();
    console.log(`Total financial statements: ${totalFinancials}`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seeding script
seedDatabase();

