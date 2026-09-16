# Quick Start Guide

Get your Stock Screener application up and running in 5 minutes!

## Prerequisites Check

Before starting, ensure you have:

- ✅ Node.js 18+ (`node --version`)
- ✅ Corepack enabled once: `corepack enable` (pins Yarn via `package.json`)
- ✅ MongoDB installed and running
- ✅ Terminal access

## Step-by-Step Setup

### Step 1: Start MongoDB

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
net start MongoDB

# Or run manually
mongod --dbpath /path/to/data/directory
```

### Step 2: Install and configure (from repo root)

```bash
cd /path/to/stockmarket

yarn install

# Root .env (see .env.example for the full list)
cat >> .env << 'EOF'
MONGO_URL=mongodb://localhost:27017/stock-screener
PORT=5001
NODE_ENV=development
EOF

# screener-web env
echo "NEXT_PUBLIC_API_URL=http://localhost:5001/api" > screener-web/.env.local

# Seed database (takes 2-3 minutes), first run only
yarn seed
```

### Step 3: Run the app (one terminal)

```bash
yarn dev
```

✅ Backend (screener-api): http://localhost:5001 — Frontend (screener-web): http://localhost:3000

To run only one app: `yarn workspace screener-api dev` or `yarn workspace screener-web dev`.

### Step 4: Access Application

Open your browser and visit:
**http://localhost:3000**

## First Time Usage

### 1. Dashboard

- Try the search bar - type "RELIANCE" or "TCS"
- View market snapshot
- Click on a pre-built screener template

### 2. Screener

- Set some filters (e.g., P/E max: 25, ROE min: 15)
- Click "Run Screener"
- Click on any stock to view details

### 3. Stock Details

- View fundamentals, financials, and charts
- Add stock to watchlist using the button

### 4. Watchlist

- Navigate to Watchlist page
- View your tracked stocks
- Click on any stock for details

## Common Issues & Fixes

### MongoDB Connection Error

```bash
# Check if MongoDB is running
ps aux | grep mongod

# If not running, start it
brew services start mongodb-community  # macOS
```

### Port Already in Use

```bash
# screener-api (default port 5001)
# Edit the root .env and change PORT=5002 (or another free port)

# screener-web (port 3000)
yarn workspace screener-web dev -- -p 3001
```

### No Stocks Showing

```bash
# Re-run the seed script
yarn seed
```

### API Connection Error

Check that:

1. `screener-api` is running (port 5001 by default)
2. `screener-web/.env.local` has: `NEXT_PUBLIC_API_URL=http://localhost:5001/api`
3. Restart `screener-web` after changing `.env.local`

## Testing the Application

### 1. Test Search

- Go to Dashboard
- Search "TCS" - should show Tata Consultancy Services

### 2. Test Screener

- Go to Screener
- Set P/E max: 30
- Click "Run Screener"
- Should show multiple stocks

### 3. Test Stock Details

- Click on any stock from search or screener
- All tabs should load with data

### 4. Test Watchlist

- From stock details, click "Add to Watchlist"
- Go to Watchlist page
- Stock should appear there

## Daily Updates

The web app's data is refreshed by re-running the seed/fetch scripts under
`screener-api/scripts/`. For the research/skills side of the repo (the
bulk of daily automation), see the scheduled jobs under `jobs/Scheduled/`
and `yarn data:sync` — see `docs/DATA_ECOSYSTEM.md`.

## Sample Stocks Included

The application comes with 20 major Indian stocks:

- Financial: HDFCBANK, ICICIBANK, SBIN, KOTAKBANK, AXISBANK
- IT: TCS, INFY, WIPRO
- Consumer: HINDUNILVR, ITC, NESTLEIND, ASIANPAINT
- Others: RELIANCE, BHARTIARTL, LT, MARUTI, SUNPHARMA, TITAN, ULTRACEMCO, BAJFINANCE

## Next Steps

1. ✅ Explore pre-built screeners
2. ✅ Create custom screener filters
3. ✅ Build your watchlist
4. ✅ Analyze stock fundamentals and technicals
5. ✅ Export screener results to CSV

## Stopping the Application

Press `Ctrl+C` in the terminal running `yarn dev` to stop both servers.

To stop MongoDB:

```bash
brew services stop mongodb-community  # macOS
sudo systemctl stop mongod           # Linux
net stop MongoDB                     # Windows
```

## Need Help?

- Check main README.md for detailed documentation
- Review API documentation in `docs/API_REFERENCE.md`
- See `screener-api/README.md` and `screener-web/README.md` for workspace-specific details

---

**Happy Stock Screening! 📈**
