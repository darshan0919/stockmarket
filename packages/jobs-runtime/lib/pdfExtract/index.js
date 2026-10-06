'use strict';

module.exports = {
  ...require('./router'),
  ...require('./verify'),
  ...require('./pages'),
  ...require('./tier3'),
  ...require('./ocrmodel'),
  ...require('./prompts'),
};
