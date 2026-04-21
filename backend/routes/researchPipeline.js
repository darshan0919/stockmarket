const express = require('express');
const router = express.Router();
const {
  listPrompts,
  getPromptById,
  initWorkspace,
  getWorkspaceStatus,
  saveEventsPdfsToWorkspace,
  postStockscansPack,
} = require('../controllers/researchPipelineController');

router.get('/prompts', listPrompts);
router.get('/prompts/:id', getPromptById);

router.post('/workspace/:symbol/init', initWorkspace);
router.get('/workspace/:symbol/status', getWorkspaceStatus);
router.post('/workspace/:symbol/events-pdfs', saveEventsPdfsToWorkspace);
router.post('/workspace/:symbol/stockscans-pack', postStockscansPack);

module.exports = router;
