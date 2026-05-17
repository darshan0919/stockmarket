const path = require('path');
// Load .env from this file's directory so `node ../backend/server.js` or IDE "cwd=repo root" still works
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { findAvailablePort } = require('./utils/portUtils');

// Initialize express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(
  cors({
    exposedHeaders: ['X-Saved-To-Repo'],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/stocks', require('./routes/stocks'));
app.use('/api/screener', require('./routes/screener'));
app.use('/api/watchlist', require('./routes/watchlist'));
app.use('/api/market', require('./routes/market'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/result-transcript', require('./routes/resultTranscript'));
app.use('/api/upcoming-results', require('./routes/upcomingResult'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/declared-results', require('./routes/declaredResults'));
app.use('/api/research-pipeline', require('./routes/researchPipeline'));
app.use('/api/twitter', require('./routes/twitter'));

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
