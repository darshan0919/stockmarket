const express = require('express');
const router = express.Router();

const { getResultTranscript, analyzeTranscript } = require('./resultTranscriptController');

router.get('/:symbol', getResultTranscript);
router.post('/:symbol/analyze', analyzeTranscript);

module.exports = router;
