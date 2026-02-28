import { formatNumber } from '../../lib/utils/formatters';

/**
 * Fundamentals tab displaying key financial metrics
 * @component
 */
export default function FundamentalsTab({ fundamentals }) {
  if (!fundamentals || Object.keys(fundamentals).length === 0) {
    return (
      <div className="text-center py-12 text-base-content/40 text-sm">
        No fundamental data available
      </div>
    );
  }

  const valuationMetrics = [
    { label: 'P/E Ratio', value: fundamentals.pe_ratio, desc: 'Price to Earnings' },
    { label: 'P/B Ratio', value: fundamentals.pb_ratio, desc: 'Price to Book Value' },
    { label: 'EPS', value: fundamentals.eps, desc: 'Earnings Per Share' },
    { label: 'Book Value', value: fundamentals.book_value_per_share, desc: 'Per Share' },
  ];

  const profitabilityMetrics = [
    { label: 'ROE', value: fundamentals.roe, desc: 'Return on Equity', suffix: '%' },
    { label: 'ROCE', value: fundamentals.roce, desc: 'Return on Capital', suffix: '%' },
    { label: 'Revenue Growth', value: fundamentals.revenue_growth_3y, desc: '3Y CAGR', suffix: '%' },
    { label: 'Profit Growth', value: fundamentals.profit_growth_3y, desc: '3Y CAGR', suffix: '%' },
  ];

  const solvencyMetrics = [
    { label: 'Debt/Equity', value: fundamentals.debt_to_equity, desc: 'Leverage Ratio' },
    { label: 'Current Ratio', value: fundamentals.current_ratio, desc: 'Liquidity' },
    { label: 'Dividend Yield', value: fundamentals.dividend_yield, desc: 'Annual Yield', suffix: '%' },
  ];

  return (
    <div className="space-y-6">
      <MetricSection title="Valuation" metrics={valuationMetrics} />
      <MetricSection title="Profitability & Growth" metrics={profitabilityMetrics} />
      <MetricSection title="Solvency & Dividends" metrics={solvencyMetrics} />
    </div>
  );
}

function MetricSection({ title, metrics }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((metric, index) => (
          <MetricCard key={index} {...metric} />
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, desc, suffix = '' }) {
  const formattedValue = formatNumber(value);
  const displayValue = formattedValue !== '-' ? `${formattedValue}${suffix}` : '-';

  return (
    <div className="finance-stat">
      <div className="text-2xs text-base-content/40 uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold font-mono tabular-nums text-base-content mt-1">
        {displayValue}
      </div>
      <div className="text-2xs text-base-content/40 mt-0.5">{desc}</div>
    </div>
  );
}
