const path = require('path');
// Load .env from the repo root so all packages share a single credentials file
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const express = require('express');
const cors = require('cors');
const connectDB = require('./core/config/database');
const { errorHandler, notFound } = require('./core/middleware/errorHandler');
const { findAvailablePort } = require('./core/utils/portUtils');

// Initialize express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(
  cors({
    exposedHeaders: ['X-Saved-To-Repo', 'X-Concall-Missing'],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/stocks', require('./features/stock/stocksRoutes'));
app.use('/api/screener', require('./features/screener/screenerRoutes'));
app.use('/api/watchlist', require('./features/watchlist/watchlistRoutes'));
app.use('/api/market', require('./features/market/marketRoutes'));
app.use('/api/admin', require('./features/admin/adminRoutes'));
app.use('/api/result-transcript', require('./features/results/resultTranscriptRoutes'));
app.use('/api/upcoming-results', require('./features/results/upcomingResultRoutes'));
app.use('/api/announcements', require('./features/announcements/announcementsRoutes'));
app.use('/api/orders', require('./features/orders/ordersRoutes'));
app.use('/api/declared-results', require('./features/results/declaredResultsRoutes'));
app.use('/api/research-pipeline', require('./features/research/researchPipelineRoutes'));
app.use('/api/twitter', require('./features/twitter/twitterRoutes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Stock Screener API is running',
    timestamp: new Date().toISOString(),
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server with automatic port switching if needed
const PREFERRED_PORT = parseInt(process.env.PORT) || 5000;

(async () => {
  try {
    const PORT = await findAvailablePort(PREFERRED_PORT);
    app.listen(PORT, () => {
      console.log(
        `Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`
      );
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
})();
