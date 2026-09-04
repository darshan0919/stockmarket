const express = require('express');
const router = express.Router();

const { getResultTranscript } = require('./resultTranscriptController');

router.get('/:symbol', getResultTranscript);

module.exports = router;
