const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '../uploads/research-dashboards');
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function dashboardPathForSymbol(symbol) {
  const sym = String(symbol || '')
    .trim()
    .toUpperCase();
  return {
    sym,
    dir: path.join(UPLOAD_ROOT, sym),
    file: path.join(UPLOAD_ROOT, sym, 'dashboard.html'),
  };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { dir } = dashboardPathForSymbol(req.params.symbol);
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    cb(null, 'dashboard.html');
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const okExt = name.endsWith('.html') || name.endsWith('.htm');
    if (!okExt) {
      return cb(new Error('Only .html or .htm uploads are allowed'));
    }
    return cb(null, true);
  },
});

/**
 * HEAD /api/stocks/:symbol/research-dashboard
 */
function headResearchDashboard(req, res) {
  const { file, sym } = dashboardPathForSymbol(req.params.symbol);
  if (!sym) {
    return res.status(400).end();
  }
  if (!fs.existsSync(file)) {
    return res.status(404).end();
  }
  return res.status(200).end();
}

/**
 * GET /api/stocks/:symbol/research-dashboard
 */
function getResearchDashboard(req, res) {
  const { file, sym } = dashboardPathForSymbol(req.params.symbol);
  if (!sym) {
    return res.status(400).json({ success: false, error: 'Invalid symbol' });
  }
  if (!fs.existsSync(file)) {
    return res.status(404).json({ success: false, error: 'No dashboard uploaded for this symbol' });
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline');
  return res.sendFile(path.resolve(file));
}

/**
 * POST /api/stocks/:symbol/research-dashboard
 */
function postResearchDashboard(req, res, next) {
  const { sym } = dashboardPathForSymbol(req.params.symbol);
  if (!sym) {
    return res.status(400).json({ success: false, error: 'Invalid symbol' });
  }
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: `File too large (max ${MAX_FILE_BYTES / (1024 * 1024)} MB)`,
          });
        }
        return res.status(400).json({ success: false, error: err.message });
      }
      return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Missing file field (use "file")' });
    }
    return res.json({
      success: true,
      data: { symbol: sym, path: req.file.filename },
    });
  });
}

/**
 * DELETE /api/stocks/:symbol/research-dashboard
 */
function deleteResearchDashboard(req, res) {
  const { file, sym } = dashboardPathForSymbol(req.params.symbol);
  if (!sym) {
    return res.status(400).json({ success: false, error: 'Invalid symbol' });
  }
  if (!fs.existsSync(file)) {
    return res.status(404).json({ success: false, error: 'No dashboard to delete' });
  }
  try {
    fs.unlinkSync(file);
    return res.json({ success: true, message: 'Dashboard removed' });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

module.exports = {
  headResearchDashboard,
  getResearchDashboard,
  postResearchDashboard,
  deleteResearchDashboard,
  MAX_FILE_BYTES,
  UPLOAD_ROOT,
};
