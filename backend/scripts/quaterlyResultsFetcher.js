const QuarterlyResult = require('../models/QuarterlyResult');

const getLastQuatersRevenueGrowthMetrics = async (symbol, numberOfQuaters) => {
  let results = await QuarterlyResult.find({ symbol: symbol.toUpperCase(), consolidated: true })
    .sort({ to_date: -1 })
    .limit(numberOfQuaters * 2)
    .lean();
  if (results.length == 0) {
    results = await QuarterlyResult.find({ symbol: symbol.toUpperCase(), consolidated: false })
      .sort({ to_date: -1 })
      .limit(numberOfQuaters * 2)
      .lean();
  }
  const lastResults = results.slice(0, numberOfQuaters);

  quarterlyData = [];
  lastResults.forEach((quarter) => {
    const prevYearQuarter = results.find(
      (q, i) =>
        q.quarter === quarter.quarter &&
        q.fiscal_year === quarter.fiscal_year - 1 &&
        q.consolidated === quarter.consolidated
    );

    if (prevYearQuarter) {
      if (quarter.revenue && prevYearQuarter.revenue && prevYearQuarter.revenue !== 0) {
        quarter.yoy_revenue_growth =
          ((quarter.revenue - prevYearQuarter.revenue) / Math.abs(prevYearQuarter.revenue)) * 100;
      }
    }

    const prevQuarter = results.find(
      (q, i) =>
        q.consolidated === quarter.consolidated &&
        (q.fiscal_year === quarter.fiscal_year
          ? q.quarter === quarter.quarter - 1
          : q.fiscal_year === quarter.fiscal_year - 1 && q.quarter === 4)
    );

    if (prevQuarter) {
      if (quarter.revenue && prevQuarter.revenue && prevQuarter.revenue !== 0) {
        quarter.qoq_revenue_growth =
          ((quarter.revenue - prevQuarter.revenue) / Math.abs(prevQuarter.revenue)) * 100;
      }
    }

    quarterlyData.push({
      period: quarter.period,
      revenue: quarter.revenue,
      yoy_growth: quarter.yoy_revenue_growth,
      qoq_growth: quarter.qoq_revenue_growth,
    });
  });
  return quarterlyData;
};

module.exports = {
  getLastQuatersRevenueGrowthMetrics,
};
