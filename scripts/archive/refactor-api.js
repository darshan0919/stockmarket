const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, 'screener-api');
const srcPath = path.join(basePath, 'src');
const featuresPath = path.join(srcPath, 'features');
const corePath = path.join(srcPath, 'core');

// 1. Create directories
[
  'admin',
  'announcements',
  'market',
  'orders',
  'research',
  'results',
  'screener',
  'stock',
  'twitter',
  'watchlist',
].forEach((f) => fs.mkdirSync(path.join(featuresPath, f), { recursive: true }));
['config', 'middleware', 'utils', 'api'].forEach((f) =>
  fs.mkdirSync(path.join(corePath, f), { recursive: true })
);

// 2. Define moves
const fileMoves = [];
const move = (oldPath, newPath) =>
  fileMoves.push({
    old: path.join(basePath, oldPath),
    new: path.join(basePath, newPath),
    oldDir: path.dirname(path.join(basePath, oldPath)),
    newDir: path.dirname(path.join(basePath, newPath)),
  });

move('controllers/adminController.js', 'src/features/admin/adminController.js');
move(
  'controllers/announcementsController.js',
  'src/features/announcements/announcementsController.js'
);
move(
  'controllers/declaredResultsController.js',
  'src/features/results/declaredResultsController.js'
);
move('controllers/upcomingResult.js', 'src/features/results/upcomingResultController.js');
move(
  'controllers/resultTranscriptController.js',
  'src/features/results/resultTranscriptController.js'
);
move('controllers/marketController.js', 'src/features/market/marketController.js');
move('controllers/ordersController.js', 'src/features/orders/ordersController.js');
move(
  'controllers/researchDashboardController.js',
  'src/features/research/researchDashboardController.js'
);
move(
  'controllers/researchPipelineController.js',
  'src/features/research/researchPipelineController.js'
);
move('controllers/screenerController.js', 'src/features/screener/screenerController.js');
move('controllers/stockController.js', 'src/features/stock/stockController.js');
move('controllers/twitterController.js', 'src/features/twitter/twitterController.js');
move('controllers/watchlistController.js', 'src/features/watchlist/watchlistController.js');

move('routes/admin.js', 'src/features/admin/adminRoutes.js');
move('routes/announcements.js', 'src/features/announcements/announcementsRoutes.js');
move('routes/declaredResults.js', 'src/features/results/declaredResultsRoutes.js');
move('routes/upcomingResult.js', 'src/features/results/upcomingResultRoutes.js');
move('routes/resultTranscript.js', 'src/features/results/resultTranscriptRoutes.js');
move('routes/market.js', 'src/features/market/marketRoutes.js');
move('routes/orders.js', 'src/features/orders/ordersRoutes.js');
move('routes/researchPipeline.js', 'src/features/research/researchPipelineRoutes.js');
move('routes/screener.js', 'src/features/screener/screenerRoutes.js');
move('routes/stocks.js', 'src/features/stock/stocksRoutes.js');
move('routes/twitter.js', 'src/features/twitter/twitterRoutes.js');
move('routes/watchlist.js', 'src/features/watchlist/watchlistRoutes.js');

move('models/FinancialStatement.js', 'src/features/stock/FinancialStatement.js');
move('models/Fundamental.js', 'src/features/stock/Fundamental.js');
move('models/ModelResponse.js', 'src/features/research/ModelResponse.js');
move('models/Orderbook.js', 'src/features/orders/Orderbook.js');
move('models/PriceHistory.js', 'src/features/stock/PriceHistory.js');
move('models/QuarterlyResult.js', 'src/features/results/QuarterlyResult.js');
move('models/Stock.js', 'src/features/stock/Stock.js');
move('models/Watchlist.js', 'src/features/watchlist/Watchlist.js');

move('services/announcementPdfFetch.js', 'src/features/announcements/announcementPdfFetch.js');
move(
  'services/announcementScanIgnoreStore.js',
  'src/features/announcements/announcementScanIgnoreStore.js'
);
move('services/liveQuotes.js', 'src/features/market/liveQuotes.js');
move('services/ordersService.js', 'src/features/orders/ordersService.js');
move('services/researchStockscansPack.js', 'src/features/research/researchStockscansPack.js');
move(
  'services/stockscansAnnouncementScan.js',
  'src/features/announcements/stockscansAnnouncementScan.js'
);
move(
  'services/stockscansAnnouncementScansPage.js',
  'src/features/announcements/stockscansAnnouncementScansPage.js'
);
move(
  'services/stockscansAnnouncements.js',
  'src/features/announcements/stockscansAnnouncements.js'
);
move('services/stockscansAuth.js', 'src/core/api/stockscansAuth.js');
move('services/stockscansMetrics.js', 'src/features/stock/stockscansMetrics.js');
move('services/stockscansSavedScan.js', 'src/features/screener/stockscansSavedScan.js');
move('services/stockscansScreener.js', 'src/features/screener/stockscansScreener.js');
move('services/topGainers.js', 'src/features/market/topGainers.js');

const readdirMove = (dir, targetDir) => {
  if (fs.existsSync(path.join(basePath, dir))) {
    fs.readdirSync(path.join(basePath, dir)).forEach((file) => {
      if (fs.statSync(path.join(basePath, dir, file)).isFile()) {
        move(`${dir}/${file}`, `${targetDir}/${file}`);
      }
    });
  }
};
readdirMove('config', 'src/core/config');
readdirMove('middleware', 'src/core/middleware');
readdirMove('utils', 'src/core/utils');
readdirMove('api', 'src/core/api');

move('server.js', 'src/server.js');

// Create lookup maps
const pathToNewPath = {};
fileMoves.forEach((m) => (pathToNewPath[m.old] = m.new));

function resolveRequire(requirePath, currentOldDir) {
  if (!requirePath.startsWith('.')) return null;

  // Resolve old absolute path
  let oldAbs = path.resolve(currentOldDir, requirePath);
  // Add .js if not present
  if (!fs.existsSync(oldAbs) && fs.existsSync(oldAbs + '.js')) oldAbs += '.js';
  else if (!fs.existsSync(oldAbs) && fs.existsSync(path.join(oldAbs, 'index.js')))
    oldAbs = path.join(oldAbs, 'index.js');

  return oldAbs;
}

// Perform moves and rewrite
fileMoves.forEach((m) => {
  if (!fs.existsSync(m.old)) {
    console.log('Skipping ' + m.old + ', does not exist');
    return;
  }

  let content = fs.readFileSync(m.old, 'utf8');

  // Regex to match require('...') or require("...")
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

  content = content.replace(requireRegex, (match, reqPath) => {
    const oldAbs = resolveRequire(reqPath, m.oldDir);
    if (oldAbs && pathToNewPath[oldAbs]) {
      const newAbs = pathToNewPath[oldAbs];
      let newRel = path.relative(m.newDir, newAbs);
      if (!newRel.startsWith('.')) {
        newRel = './' + newRel;
      }
      // Strip .js if the original didn't have it
      if (!reqPath.endsWith('.js') && newRel.endsWith('.js')) {
        newRel = newRel.slice(0, -3);
      }
      return `require('${newRel}')`;
    }

    // Even if the target didn't move explicitly in fileMoves, it might have moved!
    // Oh wait, all relevant local files are in fileMoves.
    return match;
  });

  // Write to new location
  fs.mkdirSync(path.dirname(m.new), { recursive: true });
  fs.writeFileSync(m.new, content, 'utf8');
  console.log(`Moved ${m.old} -> ${m.new}`);
});

// Remove old files
fileMoves.forEach((m) => {
  if (fs.existsSync(m.old)) {
    fs.unlinkSync(m.old);
  }
});
const updateTestsAndScripts = (dir) => {
  if (!fs.existsSync(path.join(basePath, dir))) return;
  fs.readdirSync(path.join(basePath, dir)).forEach((file) => {
    const fullPath = path.join(basePath, dir, file);
    if (fs.statSync(fullPath).isFile() && fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
      const jestMockRegex = /jest\.mock\(['"]([^'"]+)['"](?:.*)?\)/g;

      const replacer = (match, reqPath) => {
        const oldAbs = resolveRequire(reqPath, path.dirname(fullPath));
        if (oldAbs && pathToNewPath[oldAbs]) {
          const newAbs = pathToNewPath[oldAbs];
          let newRel = path.relative(path.dirname(fullPath), newAbs);
          if (!newRel.startsWith('.')) {
            newRel = './' + newRel;
          }
          if (!reqPath.endsWith('.js') && newRel.endsWith('.js')) {
            newRel = newRel.slice(0, -3);
          }
          return match.replace(reqPath, newRel);
        }
        return match;
      };

      content = content.replace(requireRegex, replacer);
      content = content.replace(jestMockRegex, replacer);
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Updated imports in ${fullPath}`);
    } else if (fs.statSync(fullPath).isDirectory()) {
      updateTestsAndScripts(`${dir}/${file}`);
    }
  });
};
updateTestsAndScripts('scripts');
updateTestsAndScripts('tests');
updateTestsAndScripts('src/features'); // just to be sure we also do internal test dirs if they exist

// Clean empty dirs
['controllers', 'routes', 'models', 'services', 'config', 'middleware', 'utils', 'api'].forEach(
  (d) => {
    if (fs.existsSync(path.join(basePath, d))) {
      fs.rmSync(path.join(basePath, d), { recursive: true, force: true });
    }
  }
);
