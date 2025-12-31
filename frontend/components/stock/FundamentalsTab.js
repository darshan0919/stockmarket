import { formatNumber } from '../../lib/utils/formatters';

export default function FundamentalsTab({ fundamentals }) {
  if (!fundamentals || Object.keys(fundamentals).length === 0) {
    return <div className="text-center py-8 text-gray-500">No fundamental data available</div>;
  }

  const metrics = [
    { label: 'P/E Ratio', value: fundamentals.pe_ratio, description: 'Price to Earnings' },
    { label: 'P/B Ratio', value: fundamentals.pb_ratio, description: 'Price to Book Value' },
    { label: 'ROE %', value: fundamentals.roe, description: 'Return on Equity' },
    { label: 'ROCE %', value: fundamentals.roce, description: 'Return on Capital Employed' },
    {
      label: 'Debt/Equity',
      value: fundamentals.debt_to_equity,
      description: 'Debt to Equity Ratio',
    },
    {
      label: 'Revenue Growth 3Y %',
      value: fundamentals.revenue_growth_3y,
      description: '3-Year Revenue CAGR',
    },
    {
      label: 'Profit Growth 3Y %',
      value: fundamentals.profit_growth_3y,
      description: '3-Year Profit CAGR',
    },
    {
      label: 'Dividend Yield %',
      value: fundamentals.dividend_yield,
      description: 'Annual Dividend Yield',
    },
    {
      label: 'Current Ratio',
      value: fundamentals.current_ratio,
      description: 'Current Assets / Current Liabilities',
    },
    { label: 'EPS', value: fundamentals.eps, description: 'Earnings Per Share' },
    {
      label: 'Book Value Per Share',
      value: fundamentals.book_value_per_share,
      description: 'Book Value Per Share',
    },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Financial Metrics</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((metric, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">{metric.label}</div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {formatNumber(metric.value)}
            </div>
            <div className="text-xs text-gray-500">{metric.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
