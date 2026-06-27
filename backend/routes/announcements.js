const express = require('express');
const router = express.Router();
const {
  getAnnouncements,
  getAnnouncementScanMetadata,
  searchAnnouncementScanCompanies,
  getAnnouncementScanWatchlists,
  getSavedAnnouncementScans,
  saveAnnouncementScan,
  reorderAnnouncementScans,
  deleteAnnouncementScan,
  runAnnouncementScan,
  getAnnouncementScanStatistics,
  getAnnouncementScanCompany,
  getAnnouncementScanIgnoredKeywords,
  saveAnnouncementScanIgnoredKeywords,
  downloadAnnouncements,
  downloadLatestConcalls,
} = require('../controllers/announcementsController');

/**
 * Announcements routes
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */

router.post('/concalls/download', downloadLatestConcalls);

router.get('/scans/metadata', getAnnouncementScanMetadata);
router.get('/scans/company-search', searchAnnouncementScanCompanies);
router.get('/scans/watchlists', getAnnouncementScanWatchlists);
router.get('/scans/saved', getSavedAnnouncementScans);
router.put('/scans/saved', saveAnnouncementScan);
router.put('/scans/saved/order', reorderAnnouncementScans);
router.delete('/scans/saved/:scanId', deleteAnnouncementScan);
router.get('/scans/ignored-keywords', getAnnouncementScanIgnoredKeywords);
router.put('/scans/ignored-keywords', saveAnnouncementScanIgnoredKeywords);
router.post('/scans/run', runAnnouncementScan);
router.post('/scans/statistics', getAnnouncementScanStatistics);
router.post('/scans/company', getAnnouncementScanCompany);

router.get('/:symbol', getAnnouncements);
router.post('/:symbol/download', downloadAnnouncements);

module.exports = router;
