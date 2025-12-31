import { useState } from 'react';

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
    // Convert empty strings to undefined
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

  return (
    <div className="bg-white rounded-lg shadow-md p-6 h-fit sticky top-4">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Filters</h2>

      {/* Market Cap */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Market Cap (Cr)</h3>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.market_cap_min}
            onChange={(e) => handleChange('market_cap_min', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.market_cap_max}
            onChange={(e) => handleChange('market_cap_max', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>
      </div>

      {/* Sectors */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Sectors</h3>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {sectors.map((sector) => (
            <label key={sector} className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.sectors.includes(sector)}
                onChange={() => handleSectorToggle(sector)}
                className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">{sector}</span>
            </label>
          ))}
        </div>
      </div>

      {/* P/E Ratio */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">P/E Ratio</h3>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.pe_min}
            onChange={(e) => handleChange('pe_min', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.pe_max}
            onChange={(e) => handleChange('pe_max', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>
      </div>

      {/* P/B Ratio */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">P/B Ratio</h3>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.pb_min}
            onChange={(e) => handleChange('pb_min', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.pb_max}
            onChange={(e) => handleChange('pb_max', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>
      </div>

      {/* ROE */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">ROE (%)</h3>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.roe_min}
            onChange={(e) => handleChange('roe_min', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.roe_max}
            onChange={(e) => handleChange('roe_max', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>
      </div>

      {/* ROCE */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">ROCE (%)</h3>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.roce_min}
            onChange={(e) => handleChange('roce_min', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.roce_max}
            onChange={(e) => handleChange('roce_max', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>
      </div>

      {/* Debt to Equity */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Debt/Equity (Max)</h3>
        <input
          type="number"
          placeholder="Max"
          value={filters.debt_to_equity_max}
          onChange={(e) => handleChange('debt_to_equity_max', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
        />
      </div>

      {/* Revenue Growth */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Revenue Growth 3Y (Min %)</h3>
        <input
          type="number"
          placeholder="Min"
          value={filters.revenue_growth_3y_min}
          onChange={(e) => handleChange('revenue_growth_3y_min', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
        />
      </div>

      {/* Profit Growth */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Profit Growth 3Y (Min %)</h3>
        <input
          type="number"
          placeholder="Min"
          value={filters.profit_growth_3y_min}
          onChange={(e) => handleChange('profit_growth_3y_min', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
        />
      </div>

      {/* Dividend Yield */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Dividend Yield (%)</h3>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.dividend_yield_min}
            onChange={(e) => handleChange('dividend_yield_min', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.dividend_yield_max}
            onChange={(e) => handleChange('dividend_yield_max', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>
      </div>

      {/* Current Ratio */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Current Ratio (Min)</h3>
        <input
          type="number"
          placeholder="Min"
          value={filters.current_ratio_min}
          onChange={(e) => handleChange('current_ratio_min', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
        />
      </div>

      {/* Action Buttons */}
      <div className="space-y-2">
        <button
          onClick={handleRunScreener}
          className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          Run Screener
        </button>
        <button
          onClick={handleClearFilters}
          className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
