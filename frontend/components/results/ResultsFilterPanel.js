/**
 * ResultsFilterPanel component - Filters for declared results
 * @component
 * @see {@link docs/frontend/components/ResultsFilterPanel.md} for documentation
 */

import { useState, useEffect } from 'react';
import { formatResultDate } from '../../lib/utils/formatters';

/**
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

  const closeAllDropdowns = () => {
    setShowDateDropdown(false);
    setShowSortDropdown(false);
    setShowIndustryDropdown(false);
    setShowIndexDropdown(false);
    setShowDocTypeDropdown(false);
  };

  const FilterButton = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border transition-colors ${
        active
          ? 'border-secondary/40 bg-secondary/5 text-secondary'
          : 'border-base-300/60 text-base-content/60 hover:border-base-300 hover:bg-base-200/40'
      }`}
    >
      {children}
      <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  return (
    <div className="finance-card mb-5">
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/30"
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
            <input
              type="text"
              placeholder="Search company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-3 text-sm bg-base-200/60 border border-base-300/60 rounded-lg focus:outline-none focus:border-secondary/50 focus:bg-base-100 transition-all"
            />
          </div>

          {/* Date Filter */}
          <div className="relative">
            <FilterButton
              active={!!filters.resultDate}
              onClick={() => {
                closeAllDropdowns();
                setShowDateDropdown(!showDateDropdown);
              }}
            >
              {filters.resultDate ? formatResultDate(filters.resultDate) : 'Date'}
            </FilterButton>
            {showDateDropdown && (
              <DropdownMenu>
                <DropdownItem active={!filters.resultDate} onClick={() => handleDateSelect('')}>
                  All Dates
                </DropdownItem>
                {resultDates.map((date) => (
                  <DropdownItem
                    key={date}
                    active={filters.resultDate === date}
                    onClick={() => handleDateSelect(date)}
                  >
                    {formatResultDate(date)}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            )}
          </div>

          {/* Industry Filter */}
          <div className="relative">
            <FilterButton
              active={filters.industry?.length > 0}
              onClick={() => {
                closeAllDropdowns();
                setShowIndustryDropdown(!showIndustryDropdown);
              }}
            >
              Industry
              {filters.industry?.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-secondary text-white text-2xs flex items-center justify-center">
                  {filters.industry.length}
                </span>
              )}
            </FilterButton>
            {showIndustryDropdown && (
              <DropdownMenu wide>
                {industries.map((industry) => (
                  <label
                    key={industry}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-base-200/60 cursor-pointer rounded-md"
                  >
                    <input
                      type="checkbox"
                      checked={filters.industry?.includes(industry) || false}
                      onChange={() => handleIndustryToggle(industry)}
                      className="checkbox checkbox-xs checkbox-secondary"
                    />
                    <span className="text-base-content/70">{industry}</span>
                  </label>
                ))}
              </DropdownMenu>
            )}
          </div>

          {/* Index Filter */}
          <div className="relative">
            <FilterButton
              active={filters.index?.length > 0}
              onClick={() => {
                closeAllDropdowns();
                setShowIndexDropdown(!showIndexDropdown);
              }}
            >
              Index
              {filters.index?.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-secondary text-white text-2xs flex items-center justify-center">
                  {filters.index.length}
                </span>
              )}
            </FilterButton>
            {showIndexDropdown && (
              <DropdownMenu>
                {indices.map((index) => (
                  <label
                    key={index}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-base-200/60 cursor-pointer rounded-md"
                  >
                    <input
                      type="checkbox"
                      checked={filters.index?.includes(index) || false}
                      onChange={() => handleIndexToggle(index)}
                      className="checkbox checkbox-xs checkbox-secondary"
                    />
                    <span className="text-base-content/70">{index}</span>
                  </label>
                ))}
              </DropdownMenu>
            )}
          </div>

          {/* Document Type */}
          <div className="relative">
            <FilterButton
              active={!!filters.documentType}
              onClick={() => {
                closeAllDropdowns();
                setShowDocTypeDropdown(!showDocTypeDropdown);
              }}
            >
              {documentTypes.find((d) => d.value === filters.documentType)?.label || 'Documents'}
            </FilterButton>
            {showDocTypeDropdown && (
              <DropdownMenu>
                {documentTypes.map((docType) => (
                  <DropdownItem
                    key={docType.value}
                    active={filters.documentType === docType.value}
                    onClick={() => handleDocTypeChange(docType.value)}
                  >
                    {docType.label}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <FilterButton
              active={false}
              onClick={() => {
                closeAllDropdowns();
                setShowSortDropdown(!showSortDropdown);
              }}
            >
              {sortOptions.find((o) => o.value === filters.orderBy)?.label || 'Sort'}
            </FilterButton>
            {showSortDropdown && (
              <DropdownMenu>
                {sortOptions.map((option) => (
                  <DropdownItem
                    key={option.value}
                    active={filters.orderBy === option.value}
                    onClick={() => handleSortChange(option.value)}
                  >
                    {option.label}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            )}
          </div>

          {/* Order Toggle */}
          <button
            onClick={handleOrderToggle}
            className="w-8 h-8 rounded-lg border border-base-300/60 flex items-center justify-center text-base-content/50 hover:border-base-300 hover:bg-base-200/40 transition-colors"
            title={filters.order === 'desc' ? 'Descending' : 'Ascending'}
          >
            <svg
              className={`w-4 h-4 ${filters.order === 'asc' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </button>

          {/* Clear */}
          {activeFilterCount > 0 && (
            <button
              onClick={handleClearFilters}
              className="h-8 px-3 text-xs font-medium text-error/80 hover:text-error hover:bg-error/5 rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          {loading && <span className="loading loading-spinner loading-xs text-secondary" />}
        </div>

        {(showDateDropdown ||
          showSortDropdown ||
          showIndustryDropdown ||
          showIndexDropdown ||
          showDocTypeDropdown) && (
          <div className="fixed inset-0 z-10" onClick={closeAllDropdowns} />
        )}
      </div>
    </div>
  );
}

function DropdownMenu({ children, wide }) {
  return (
    <div
      className={`absolute top-full left-0 mt-1 ${wide ? 'w-56' : 'w-44'} max-h-60 overflow-y-auto finance-card shadow-xl z-20 py-1`}
    >
      {children}
    </div>
  );
}

function DropdownItem({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
        active
          ? 'bg-secondary/10 text-secondary font-medium'
          : 'text-base-content/70 hover:bg-base-200/60'
      }`}
    >
      {children}
    </button>
  );
}
