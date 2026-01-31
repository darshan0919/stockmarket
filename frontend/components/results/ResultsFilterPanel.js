/**
 * ResultsFilterPanel component - Filters for declared results
 * @component
 * @see {@link docs/frontend/components/ResultsFilterPanel.md} for documentation
 */

import { useState, useEffect } from 'react';

/**
 * Format date for display (e.g., "2026-01-31" -> "Jan 31")
 */
function formatResultDate(dateStr) {
  if (!dateStr) return dateStr;
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Main filter panel component
 * @param {Object} props
 * @param {Function} props.onFilterChange - Callback when filters change
 * @param {Object} props.filters - Current filter values
 * @param {Array} props.resultDates - Available result dates from API
 * @param {boolean} props.loading - Whether data is loading
 */
export default function ResultsFilterPanel({
  onFilterChange,
  filters,
  resultDates = [],
  loading = false,
}) {
  const [searchQuery, setSearchQuery] = useState(filters.searchCompany || '');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showIndustryDropdown, setShowIndustryDropdown] = useState(false);
  const [showIndexDropdown, setShowIndexDropdown] = useState(false);
  const [showDocTypeDropdown, setShowDocTypeDropdown] = useState(false);

  const sortOptions = [
    { value: 'Last Result Date', label: 'Result Date' },
    { value: 'Market Capitalization', label: 'Market Cap' },
  ];

  const documentTypes = [
    { value: '', label: 'All Documents' },
    { value: 'Transcript Notes', label: 'With Notes' },
    { value: 'Transcript', label: 'Transcript' },
    { value: 'Result', label: 'Result' },
    { value: 'PPT', label: 'Presentation' },
  ];

  const industries = [
    'Information Technology',
    'Banking',
    'Pharmaceuticals',
    'Automobiles',
    'FMCG',
    'Oil & Gas',
    'Metals & Mining',
    'Cement',
    'Power',
    'Chemicals',
    'Textiles',
    'Real Estate',
    'Consumer Durables',
    'Healthcare',
    'Telecom',
  ];

  const indices = ['Nifty 50', 'Nifty Next 50', 'Nifty Midcap 100', 'Nifty Smallcap 100'];

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== filters.searchCompany) {
        onFilterChange({ ...filters, searchCompany: searchQuery, offset: 0 });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSortChange = (orderBy) => {
    onFilterChange({ ...filters, orderBy, offset: 0 });
    setShowSortDropdown(false);
  };

  const handleOrderToggle = () => {
    onFilterChange({
      ...filters,
      order: filters.order === 'desc' ? 'asc' : 'desc',
      offset: 0,
    });
  };

  const handleDateSelect = (date) => {
    onFilterChange({
      ...filters,
      resultDate: date === filters.resultDate ? '' : date,
      offset: 0,
    });
    setShowDateDropdown(false);
  };

  const handleIndustryToggle = (industry) => {
    const currentIndustries = filters.industry || [];
    const newIndustries = currentIndustries.includes(industry)
      ? currentIndustries.filter((i) => i !== industry)
      : [...currentIndustries, industry];
    onFilterChange({ ...filters, industry: newIndustries, offset: 0 });
  };

  const handleIndexToggle = (index) => {
    const currentIndices = filters.index || [];
    const newIndices = currentIndices.includes(index)
      ? currentIndices.filter((i) => i !== index)
      : [...currentIndices, index];
    onFilterChange({ ...filters, index: newIndices, offset: 0 });
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    onFilterChange({
      marketCapMin: 1000,
      index: [],
      industry: [],
      order: 'desc',
      orderBy: 'Last Result Date',
      offset: 0,
      resultDate: '',
      searchCompany: '',
      documentType: '',
    });
  };

  const handleDocTypeChange = (docType) => {
    onFilterChange({ ...filters, documentType: docType, offset: 0 });
    setShowDocTypeDropdown(false);
  };

  const activeFilterCount =
    (filters.resultDate ? 1 : 0) +
    (filters.industry?.length || 0) +
    (filters.index?.length || 0) +
    (filters.searchCompany ? 1 : 0) +
    (filters.documentType ? 1 : 0);

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Date Filter */}
        <div className="relative">
          <button
            onClick={() => setShowDateDropdown(!showDateDropdown)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              filters.resultDate
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            {filters.resultDate ? formatResultDate(filters.resultDate) : 'Date'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showDateDropdown && (
            <div className="absolute z-20 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              <div className="p-2">
                <button
                  onClick={() => handleDateSelect('')}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 ${
                    !filters.resultDate ? 'bg-primary-50 text-primary-700' : ''
                  }`}
                >
                  All Dates
                </button>
                {resultDates.map((date) => (
                  <button
                    key={date}
                    onClick={() => handleDateSelect(date)}
                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 ${
                      filters.resultDate === date ? 'bg-primary-50 text-primary-700' : ''
                    }`}
                  >
                    {formatResultDate(date)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Industry Filter */}
        <div className="relative">
          <button
            onClick={() => setShowIndustryDropdown(!showIndustryDropdown)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              filters.industry?.length > 0
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            Industry
            {filters.industry?.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-primary-600 text-white rounded-full">
                {filters.industry.length}
              </span>
            )}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showIndustryDropdown && (
            <div className="absolute z-20 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              <div className="p-2 space-y-1">
                {industries.map((industry) => (
                  <label
                    key={industry}
                    className="flex items-center px-3 py-2 text-sm rounded hover:bg-gray-100 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.industry?.includes(industry) || false}
                      onChange={() => handleIndustryToggle(industry)}
                      className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    {industry}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Index Filter */}
        <div className="relative">
          <button
            onClick={() => setShowIndexDropdown(!showIndexDropdown)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              filters.index?.length > 0
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            Index
            {filters.index?.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-primary-600 text-white rounded-full">
                {filters.index.length}
              </span>
            )}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showIndexDropdown && (
            <div className="absolute z-20 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg">
              <div className="p-2 space-y-1">
                {indices.map((index) => (
                  <label
                    key={index}
                    className="flex items-center px-3 py-2 text-sm rounded hover:bg-gray-100 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.index?.includes(index) || false}
                      onChange={() => handleIndexToggle(index)}
                      className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    {index}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Document Type Filter */}
        <div className="relative">
          <button
            onClick={() => setShowDocTypeDropdown(!showDocTypeDropdown)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              filters.documentType
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {documentTypes.find((d) => d.value === filters.documentType)?.label || 'All Documents'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showDocTypeDropdown && (
            <div className="absolute z-20 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg">
              <div className="p-2">
                {documentTypes.map((docType) => (
                  <button
                    key={docType.value}
                    onClick={() => handleDocTypeChange(docType.value)}
                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 ${
                      filters.documentType === docType.value ? 'bg-primary-50 text-primary-700' : ''
                    }`}
                  >
                    {docType.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Sort: {sortOptions.find((o) => o.value === filters.orderBy)?.label || 'Result Date'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showSortDropdown && (
            <div className="absolute z-20 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg">
              <div className="p-2">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSortChange(option.value)}
                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 ${
                      filters.orderBy === option.value ? 'bg-primary-50 text-primary-700' : ''
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Order Toggle */}
        <button
          onClick={handleOrderToggle}
          className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          title={filters.order === 'desc' ? 'Descending' : 'Ascending'}
        >
          {filters.order === 'desc' ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          )}
        </button>

        {/* Clear Filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Clear ({activeFilterCount})
          </button>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            Loading...
          </div>
        )}
      </div>

      {/* Click outside handler */}
      {(showDateDropdown ||
        showSortDropdown ||
        showIndustryDropdown ||
        showIndexDropdown ||
        showDocTypeDropdown) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setShowDateDropdown(false);
            setShowSortDropdown(false);
            setShowIndustryDropdown(false);
            setShowIndexDropdown(false);
            setShowDocTypeDropdown(false);
          }}
        />
      )}
    </div>
  );
}
