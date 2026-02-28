import { useState } from 'react';

/**
 * Stock screener filter panel with fundamental metrics
 * @component
 */
export default function FilterPanel({ onFilter, onClear }) {
  const [filters, setFilters] = useState({
    market_cap_min: '',
    market_cap_max: '',
    sectors: [],
    pe_min: '',
    pe_max: '',
    pb_min: '',
    pb_max: '',
    roe_min: '',
    roe_max: '',
    roce_min: '',
    roce_max: '',
    debt_to_equity_max: '',
    revenue_growth_3y_min: '',
    profit_growth_3y_min: '',
    dividend_yield_min: '',
    dividend_yield_max: '',
    current_ratio_min: '',
  });

  const sectors = [
    'IT',
    'Pharma',
    'FMCG',
    'Financial Services',
    'Energy',
    'Automobile',
    'Telecom',
    'Infrastructure',
    'Consumer Durables',
    'Cement',
  ];

  const handleChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleSectorToggle = (sector) => {
    setFilters((prev) => ({
      ...prev,
      sectors: prev.sectors.includes(sector)
        ? prev.sectors.filter((s) => s !== sector)
        : [...prev.sectors, sector],
    }));
  };

  const handleRunScreener = () => {
    const cleanFilters = {};
    Object.keys(filters).forEach((key) => {
      if (key === 'sectors') {
        if (filters[key].length > 0) cleanFilters[key] = filters[key];
      } else if (filters[key] !== '') {
        cleanFilters[key] = parseFloat(filters[key]);
      }
    });
    onFilter(cleanFilters);
  };

  const handleClearFilters = () => {
    setFilters({
      market_cap_min: '',
      market_cap_max: '',
      sectors: [],
      pe_min: '',
      pe_max: '',
      pb_min: '',
      pb_max: '',
      roe_min: '',
      roe_max: '',
      roce_min: '',
      roce_max: '',
      debt_to_equity_max: '',
      revenue_growth_3y_min: '',
      profit_growth_3y_min: '',
      dividend_yield_min: '',
      dividend_yield_max: '',
      current_ratio_min: '',
    });
    onClear();
  };

  const RangeFilter = ({ label, minField, maxField, singleField }) => (
    <div className="mb-4">
      <label className="text-xs font-medium text-base-content/60 mb-1.5 block">{label}</label>
      {singleField ? (
        <input
          type="number"
          placeholder={minField ? 'Min' : 'Max'}
          value={filters[singleField]}
          onChange={(e) => handleChange(singleField, e.target.value)}
          className="w-full h-8 px-3 text-sm bg-base-200/60 border border-base-300/60 rounded-lg focus:outline-none focus:border-secondary/50 focus:bg-base-100 transition-all"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters[minField]}
            onChange={(e) => handleChange(minField, e.target.value)}
            className="w-full h-8 px-3 text-sm bg-base-200/60 border border-base-300/60 rounded-lg focus:outline-none focus:border-secondary/50 focus:bg-base-100 transition-all"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters[maxField]}
            onChange={(e) => handleChange(maxField, e.target.value)}
            className="w-full h-8 px-3 text-sm bg-base-200/60 border border-base-300/60 rounded-lg focus:outline-none focus:border-secondary/50 focus:bg-base-100 transition-all"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="finance-card sticky top-20">
      <div className="p-4">
        <h2 className="section-title mb-4">Filters</h2>

        <RangeFilter label="Market Cap (Cr)" minField="market_cap_min" maxField="market_cap_max" />

        <div className="mb-4">
          <label className="text-xs font-medium text-base-content/60 mb-1.5 block">Sectors</label>
          <div className="flex flex-wrap gap-1.5">
            {sectors.map((sector) => (
              <button
                key={sector}
                onClick={() => handleSectorToggle(sector)}
                className={`finance-badge transition-colors cursor-pointer ${
                  filters.sectors.includes(sector)
                    ? 'bg-secondary text-white'
                    : 'bg-base-200 text-base-content/60 hover:bg-base-300'
                }`}
              >
                {sector}
              </button>
            ))}
          </div>
        </div>

        <RangeFilter label="P/E Ratio" minField="pe_min" maxField="pe_max" />
        <RangeFilter label="P/B Ratio" minField="pb_min" maxField="pb_max" />
        <RangeFilter label="ROE (%)" minField="roe_min" maxField="roe_max" />
        <RangeFilter label="ROCE (%)" minField="roce_min" maxField="roce_max" />
        <RangeFilter label="Debt/Equity (Max)" singleField="debt_to_equity_max" />
        <RangeFilter label="Revenue Growth 3Y (%)" singleField="revenue_growth_3y_min" />
        <RangeFilter label="Profit Growth 3Y (%)" singleField="profit_growth_3y_min" />
        <RangeFilter
          label="Dividend Yield (%)"
          minField="dividend_yield_min"
          maxField="dividend_yield_max"
        />
        <RangeFilter label="Current Ratio (Min)" singleField="current_ratio_min" />

        <div className="space-y-2 mt-5 pt-4 border-t border-base-300/60">
          <button onClick={handleRunScreener} className="btn btn-secondary btn-sm btn-block">
            Run Screener
          </button>
          <button
            onClick={handleClearFilters}
            className="btn btn-ghost btn-sm btn-block text-base-content/50"
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
}
