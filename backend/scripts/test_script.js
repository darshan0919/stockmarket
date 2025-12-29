const {parseXBRL} = require('../utils/xbrlParser');

const test = async () => {
    const data = await parseXBRL('https://nsearchives.nseindia.com/corporate/xbrl/INTEGRATED_FILING_INDAS_1565170_04112025075024_WEB.xml');
    console.log("data", data);

}

test();