require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Stock = require('../models/Stock');
const PriceHistory = require('../models/PriceHistory');
const Fundamental = require('../models/Fundamental');
const { delay } = require('../utils/dataFetcher');

/**
 * Update daily EOD prices for all stocks
 */
async function updatePrices() {
  try {
    console.log('Fetching all stocks...');
    const stocks = await Stock.find();
    console.log(`Found ${stocks.length} stocks to update`);

    let successCount = 0;
    let errorCount = 0;

    for (const stock of stocks) {
      try {
        // Get the latest price record
        const latestPrice = await PriceHistory.findOne({ stock_id: stock._id })
          .sort({ date: -1 })
          .lean();

        if (!latestPrice) {
          console.log(`No price history for ${stock.symbol}, skipping...`);
          continue;
        }

        // Generate today's price (simulated)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if today's price already exists
        const existingToday = await PriceHistory.findOne({
          stock_id: stock._id,
          date: today,
        });

        if (existingToday) {
          console.log(`${stock.symbol}: Today's price already exists`);
          continue;
        }

        // Simulate price movement
        const prevClose = latestPrice.close;
        const change = (Math.random() - 0.48) * (prevClose * 0.02);
        const close = Number((prevClose + change).toFixed(2));
        const open = Number((prevClose + (Math.random() - 0.5) * (prevClose * 0.01)).toFixed(2));
        const high = Number(
          Math.max(open, close, prevClose) * (1 + Math.random() * 0.01).toFixed(2)
        );
        const low = Number(
          Math.min(open, close, prevClose) * (1 - Math.random() * 0.01).toFixed(2)
        );
        const volume = Math.floor(Math.random() * 10000000) + 1000000;

        // Insert new price record
        const newPrice = new PriceHistory({
          stock_id: stock._id,
          date: today,
          open,
          high,
          low,
          close,
          volume,
        });

        await newPrice.save();
        successCount++;
        console.log(
          `${stock.symbol}: Updated price - Close: ${close} (${change > 0 ? '+' : ''}${change.toFixed(2)})`
        );

        // Rate limiting delay
        await delay(100);
      } catch (error) {
        errorCount++;
        console.error(`Error updating ${stock.symbol}:`, error.message);
      }
    }

    console.log('\n✅ Price update completed!');
    console.log(`Success: ${successCount}, Errors: ${errorCount}`);
  } catch (error) {
    console.error('Error in updatePrices:', error);
  }
}

/**
 * Update fundamentals (less frequently)
 */
async function updateFundamentals() {
  try {
    console.log('\nUpdating fundamentals...');
    const stocks = await Stock.find();

    let updateCount = 0;

    for (const stock of stocks) {
      try {
        // For demo purposes, update fundamentals randomly
        if (Math.random() > 0.8) {
          const latestFundamental = await Fundamental.findOne({ stock_id: stock._id })
            .sort({ date: -1 })
            .lean();

          if (latestFundamental) {
            // Slightly modify existing values
            const updatedFundamental = new Fundamental({
              stock_id: stock._id,
              date: new Date(),
              pe_ratio: Number(
                (latestFundamental.pe_ratio * (0.95 + Math.random() * 0.1)).toFixed(2)
              ),
              pb_ratio: Number(
                (latestFundamental.pb_ratio * (0.95 + Math.random() * 0.1)).toFixed(2)
              ),
              roe: Number((latestFundamental.roe * (0.95 + Math.random() * 0.1)).toFixed(2)),
              roce: Number((latestFundamental.roce * (0.95 + Math.random() * 0.1)).toFixed(2)),
              debt_to_equity: latestFundamental.debt_to_equity,
              revenue_growth_3y: latestFundamental.revenue_growth_3y,
              profit_growth_3y: latestFundamental.profit_growth_3y,
              dividend_yield: latestFundamental.dividend_yield,
              current_ratio: latestFundamental.current_ratio,
              eps: Number((latestFundamental.eps * (0.95 + Math.random() * 0.1)).toFixed(2)),
              book_value_per_share: latestFundamental.book_value_per_share,
            });

            await updatedFundamental.save();
            updateCount++;
            console.log(`${stock.symbol}: Fundamentals updated`);
          }
        }

        await delay(50);
      } catch (error) {
        console.error(`Error updating fundamentals for ${stock.symbol}:`, error.message);
      }
    }

    console.log(`✅ Updated fundamentals for ${updateCount} stocks`);
  } catch (error) {
    console.error('Error in updateFundamentals:', error);
  }
}

/**
 * Main update function
 */
async function updateData() {
  try {
    console.log('=== Stock Data Update Script ===\n');
    console.log('Connecting to MongoDB...');

    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB\n');

    // Update prices
    await updatePrices();

    // Update fundamentals (optional, less frequent)
    await updateFundamentals();

    console.log('\n✅ All updates completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error in updateData:', error);
    process.exit(1);
  }
}

// Run the update script
updateData();
