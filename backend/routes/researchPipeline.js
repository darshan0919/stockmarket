const express = require('express');
const router = express.Router();
const { listPrompts, getPromptById } = require('../controllers/researchPipelineController');

router.get('/prompts', listPrompts);
router.get('/prompts/:id', getPromptById);

module.exports = router;
