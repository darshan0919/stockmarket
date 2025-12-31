require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Initialize express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
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

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
