const { nse } = require('@stock/api');
nse.getSymbolData('RELIANCE').then(x => console.log(JSON.stringify(x, null, 2))).catch(console.error);
