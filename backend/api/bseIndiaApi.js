const axios = require('axios');

const BSE_API_URL = 'https://api.bseindia.com/BseIndiaAPI/api';

const getStockScripCode = async (symbol) => {
  const response = await axios.get(
    `${BSE_API_URL}/PeerSmartSearch/w?Type=SS&text=${symbol.trim()}`,
    {
      headers: {
        Referer: 'https://www.bseindia.com/',
      },
    }
  );
  const data = response.data.replaceAll('&nbsp;', ' ');
  const regex = new RegExp(`<strong>${symbol}<\\/strong>\\s+\\w+\\s+(\\d+)`);
  const match = data.match(regex);
  return match?.[1] || null;
};

const getResultAnnoucement = async (symbol, fromDate, toDate) => {
  pageno = 1;
  const scripCode = await getStockScripCode(symbol);
  if (!scripCode) {
    return null;
  }
  result = [];
  while (true) {
    const response = await axios.get(`${BSE_API_URL}/AnnSubCategoryGetData/w`, {
      headers: {
        Referer: 'https://www.bseindia.com/',
      },
      params: {
        pageno: pageno,
        strCat: 'Company Update',
        strPrevDate: fromDate,
        strScrip: scripCode,
        strSearch: 'P',
        strToDate: toDate,
        strType: 'C',
        subcategory: 'Earnings Call Transcript',
      },
    });
    result.push(...response.data.Table);
    if (result.length >= response.data.Table1[0].ROWCNT || pageno > 10) {
      return result;
    }
    pageno++;
  }
  return result;
};

const upcomingResults = async () => {
  const response = await axios.get(`${BSE_API_URL}/Corpforthresults/w`, {
    headers: {
      Referer: 'https://www.bseindia.com/',
    },
  });
  return response.data;
};

const getCompanyInfo = async (scripCode) => {
  const response = await axios.get(
    `${BSE_API_URL}/ComHeadernew/w?quotetype=EQ&scripcode=${scripCode}`,
    {
      headers: {
        Referer: 'https://www.bseindia.com/',
      },
    }
  );
  return response.data;
};
module.exports = {
  getStockScripCode,
  getResultAnnoucement,
  upcomingResults,
  getCompanyInfo,
};
