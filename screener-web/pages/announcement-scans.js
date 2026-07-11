import Head from 'next/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { announcementScansAPI } from '../src/core/lib/api';
import { useSnackbar } from '../src/core/lib/contexts/SnackbarContext';

const LOCAL_SCANS_KEY = 'announcementScans.local';
const LAST_ACTIVE_SCAN_KEY = 'announcementScans.lastActive';
const SEARCH_DEBOUNCE_MS = 250;

const FALLBACK_SCAN = {
  scanId: '',
  scanName: 'Default Scan',
  filters: [{ left: 'Market Capitalization', right: '1000', sign: '>=' }],
  index: [],
  industry: [],
  watchlistIds: [],
  announcementType: 'All',
  searchFilters: [],
  alerts: false,
  searchMode: 'full',
  companyFilters: [],
};

const EMPTY_IGNORED_KEYWORDS = { titleKeywordsToIgnore: [], descriptionKeywordsToIgnore: [] };

const COMMON_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'shall',
  'should',
  'can',
  'could',
  'may',
  'might',
  'must',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'of',
  'to',
  'in',
  'for',
  'on',
  'at',
  'by',
  'with',
  'from',
  'as',
  'into',
  'if',
  'then',
  'so',
  'no',
  'not',
  'only',
  'same',
  'than',
  'also',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'any',
  'about',
  'after',
  'before',
  'above',
  'below',
  'between',
  'under',
]);

const FILTER_FIELDS = [
  'Market Capitalization',
  'P/E',
  'P/B',
  'ROE (%)',
  'ROCE (%)',
  'Debt to Equity',
  'Sales Growth 3Y (%)',
  'Profit Growth TTM (%)',
];

const SIGNS = ['>=', '<=', '>', '<', '='];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeKeywordArray(value, limit = 50) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((keyword, index, arr) => {
      const lower = keyword.toLowerCase();
      return arr.findIndex((item) => item.toLowerCase() === lower) === index;
    })
    .slice(0, limit);
}

function normalizeScan(scan) {
  const source = { ...FALLBACK_SCAN, ...(scan || {}) };
  return {
    ...source,
    filters: Array.isArray(source.filters) ? source.filters : clone(FALLBACK_SCAN.filters),
    index: Array.isArray(source.index) ? source.index : [],
    industry: Array.isArray(source.industry) ? source.industry : [],
    watchlistIds: Array.isArray(source.watchlistIds) ? source.watchlistIds : [],
    searchFilters: normalizeKeywordArray(source.searchFilters, 12),
    companyFilters: Array.isArray(source.companyFilters)
      ? source.companyFilters
      : Array.isArray(source.companyIds)
        ? source.companyIds.map((companyId) => ({ companyId }))
        : [],
    announcementType: source.announcementType || 'All',
    searchMode: source.searchMode === 'quick' ? 'quick' : 'full',
    alerts: source.alerts === true,
  };
}

function getLocalScans() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_SCANS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeScan) : [];
  } catch {
    return [];
  }
}

function setLocalScans(scans) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_SCANS_KEY, JSON.stringify(scans));
}

// Ignore keywords used to be a per-scan, localStorage-overlaid concept (see git
// history if you need it) — they're now a single, app-agnostic list shared with
// the watchlist-insights job (@stock/api/utils/announcementNoiseFilter), fetched
// and saved once via announcementScansAPI.getIgnoredKeywords/saveIgnoredKeywords
// rather than per scan. See the `ignoredKeywords` state in AnnouncementScansPage.

function quarterLabel(quarterDate) {
  const value = String(quarterDate || '');
  if (!/^\d{6}$/.test(value)) return value || 'Latest';
  const months = {
    '03': 'Mar',
    '06': 'Jun',
    '09': 'Sep',
    12: 'Dec',
  };
  return `${months[value.slice(4, 6)] || value.slice(4, 6)} ${value.slice(0, 4)}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function parseAnnouncementDateTime(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/
  );
  if (match) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAnnouncementTimestamp(value) {
  const date = parseAnnouncementDateTime(value);
  if (!date) return value || '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours %= 12;
  if (hours === 0) hours = 12;
  return `${day}-${month}-${year} ${String(hours).padStart(2, '0')}:${minutes} ${suffix}`;
}

function sanitizeHighlight(html) {
  const escaped = String(html || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/&lt;(\/?)mark&gt;/gi, '<$1mark>');
}

function scanKey(scan, quarterDate) {
  return JSON.stringify({ scan, quarterDate });
}

function hasRunnableScan(scan) {
  if (!scan) return false;
  return (
    scan.searchFilters.length > 0 ||
    scan.companyFilters.length > 0 ||
    scan.announcementType !== 'All' ||
    scan.index.length > 0 ||
    scan.industry.length > 0 ||
    scan.watchlistIds.length > 0 ||
    scan.filters.length > 0
  );
}

// Ignore keywords are a single global list (not per-scan), so this takes the
// `ignoredKeywords` state shape `{titleKeywordsToIgnore, descriptionKeywordsToIgnore}`
// rather than a scan.
function totalIgnoreKeywords(ignoredKeywords) {
  return (
    (ignoredKeywords?.titleKeywordsToIgnore?.length || 0) +
    (ignoredKeywords?.descriptionKeywordsToIgnore?.length || 0)
  );
}

// Client-side mirror of @stock/api/utils/announcementNoiseFilter's
// shouldIgnoreAnnouncement (title/description checked separately). Results
// already sent from the server were filtered against the *saved* keyword file,
// but the "Ignore announcements" panel edits an in-memory `ignoredKeywords`
// state before it's saved — this re-filters whatever's already on screen
// against that in-progress state so a newly-typed keyword hides matching rows
// immediately, without waiting for Save + a re-run of the scan.
function normalizeIgnoreText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function clientShouldIgnoreAnnouncement(announcement, ignoredKeywords) {
  const title = normalizeIgnoreText(announcement?.title || announcement?.highlightedTitle);
  const titleHit = (ignoredKeywords?.titleKeywordsToIgnore || []).some((kw) =>
    title.includes(kw.toLowerCase())
  );
  if (titleHit) return true;
  const description = normalizeIgnoreText(announcement?.description);
  return (ignoredKeywords?.descriptionKeywordsToIgnore || []).some((kw) =>
    description.includes(kw.toLowerCase())
  );
}

function filterAnnouncementsByIgnoreKeywords(announcements, ignoredKeywords) {
  if (!totalIgnoreKeywords(ignoredKeywords)) return announcements || [];
  return (announcements || []).filter(
    (announcement) => !clientShouldIgnoreAnnouncement(announcement, ignoredKeywords)
  );
}

function activeUniverseLabels(scan) {
  const labels = [];
  if (scan.companyFilters.length) labels.push(`${scan.companyFilters.length} companies`);
  if (scan.industry.length) labels.push(`${scan.industry.length} industries`);
  if (scan.index.length) labels.push(`${scan.index.length} indices`);
  if (scan.watchlistIds.length) labels.push(`${scan.watchlistIds.length} watchlists`);
  if (!labels.length) labels.push('All companies');
  return labels;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function scanActivitySummary(scan, ignoreCount = 0) {
  const includeCount = (scan.searchFilters?.length || 0) + (scan.companyFilters?.length || 0);
  const filterCount =
    (scan.filters?.length || 0) +
    (scan.industry?.length || 0) +
    (scan.index?.length || 0) +
    (scan.watchlistIds?.length || 0) +
    (scan.announcementType && scan.announcementType !== 'All' ? 1 : 0);
  return {
    includeCount,
    filterCount,
    // Ignore rules are global (apply to every scan equally), not per scan.
    ignoreCount,
    universe: activeUniverseLabels(scan).join(' / '),
  };
}

function IconButton({ children, label, onClick, disabled, className = '' }) {
  return (
    <button
      type="button"
      className={`btn btn-sm btn-ghost btn-square ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function SearchIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function PlusIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function XIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ExternalLinkIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14 3h7m0 0v7m0-7L10 14m-2-9H5a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-3"
      />
    </svg>
  );
}

function ChevronIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function normalizeDropdownOption(option) {
  if (option && typeof option === 'object') {
    return {
      value: String(option.value),
      label: String(option.label ?? option.value),
      disabled: option.disabled === true,
    };
  }
  return { value: String(option), label: String(option), disabled: false };
}

function Dropdown({
  label,
  options = [],
  value,
  values,
  multiple = false,
  searchable = false,
  placeholder = 'Select',
  empty = 'No options',
  disabled = false,
  onChange,
  className = '',
  buttonClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const normalized = useMemo(() => options.map(normalizeDropdownOption), [options]);
  const selectedValues = useMemo(() => {
    const source = multiple ? values || [] : value ? [value] : [];
    return new Set(source.map((item) => String(item)));
  }, [multiple, value, values]);
  const selectedOptions = normalized.filter((option) => selectedValues.has(option.value));
  const displayLabel = multiple
    ? selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length <= 2
        ? selectedOptions.map((option) => option.label).join(', ')
        : `${selectedOptions
            .slice(0, 2)
            .map((option) => option.label)
            .join(', ')} +${selectedOptions.length - 2}`
    : selectedOptions[0]?.label || placeholder;

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((option) => option.label.toLowerCase().includes(q));
  }, [normalized, query]);

  const selectOption = (option) => {
    if (option.disabled) return;
    if (multiple) {
      const next = new Set(selectedValues);
      if (next.has(option.value)) next.delete(option.value);
      else next.add(option.value);
      onChange?.(Array.from(next));
      return;
    }
    onChange?.(option.value);
    setOpen(false);
  };

  return (
    <div className={`relative min-w-0 ${className}`} ref={ref}>
      {label && (
        <label className="block text-xs font-medium text-base-content/60 mb-1">{label}</label>
      )}
      <button
        type="button"
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-100 px-3 text-left text-sm shadow-sm transition-colors hover:border-secondary/50 disabled:opacity-50 ${buttonClassName}`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selectedOptions.length ? 'truncate' : 'truncate text-base-content/50'}>
          {displayLabel}
        </span>
        <ChevronIcon
          className={`h-4 w-4 flex-none transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-40 mt-2 w-full min-w-[240px] overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl">
          {searchable && (
            <div className="border-b border-base-200 p-2">
              <input
                autoFocus
                className="input input-sm input-bordered w-full bg-base-100"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search..."
              />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const checked = selectedValues.has(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      checked ? 'bg-secondary/10 text-secondary' : 'hover:bg-base-200'
                    } ${option.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                    onClick={() => selectOption(option)}
                    disabled={option.disabled}
                  >
                    {multiple && (
                      <span
                        className={`h-4 w-4 rounded border ${
                          checked ? 'border-secondary bg-secondary' : 'border-base-300'
                        }`}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-4 text-sm text-base-content/50">{empty}</div>
            )}
          </div>
          {multiple && selectedOptions.length > 0 && (
            <div className="border-t border-base-200 p-2">
              <button
                type="button"
                className="btn btn-xs btn-ghost w-full"
                onClick={() => onChange?.([])}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScanList({
  scans,
  activeScanId,
  activeName,
  source,
  onSelect,
  onNew,
  onMove,
  onDelete,
  ignoreCount,
}) {
  return (
    <div className="finance-card overflow-hidden lg:sticky lg:top-20">
      <div className="p-4 border-b border-base-300 bg-base-200/50 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Scan Library</h2>
          <p className="text-xs text-base-content/50 mt-0.5">
            {source === 'stockscans'
              ? 'Saved in StockScans'
              : source === 'local'
                ? 'Saved in this browser'
                : 'Unsaved default scan'}
          </p>
        </div>
        <button
          className="btn btn-sm btn-secondary btn-square"
          type="button"
          onClick={onNew}
          title="New scan"
        >
          <PlusIcon />
        </button>
      </div>
      <div className="max-h-80 lg:max-h-[calc(100vh-190px)] min-h-[220px] overflow-y-auto">
        {scans.length === 0 ? (
          <button
            type="button"
            className="w-full text-left p-4 bg-secondary/10"
            onClick={() => onSelect(null)}
          >
            <div className="text-sm font-semibold">{activeName || 'Default Scan'}</div>
            <div className="text-xs text-base-content/50 mt-1">Current unsaved workspace</div>
          </button>
        ) : (
          scans.map((scan, index) => {
            const active =
              (activeScanId && scan.scanId === activeScanId) ||
              (!activeScanId && scan.scanName === activeName);
            const summary = scanActivitySummary(scan, ignoreCount);
            return (
              <div
                key={scan.scanId || `${scan.scanName}-${index}`}
                className={`group relative border-b border-base-200 transition-colors ${
                  active ? 'bg-secondary/10' : 'hover:bg-base-200/70'
                }`}
              >
                {active && <div className="absolute left-0 top-0 h-full w-1 bg-secondary" />}
                <button
                  type="button"
                  onClick={() => onSelect(scan)}
                  className="w-full text-left py-3 pl-4 pr-3 min-w-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{scan.scanName}</div>
                      <div className="text-xs text-base-content/50 truncate mt-0.5">
                        {(scan.searchFilters || []).join(', ') || 'No keywords'}
                      </div>
                    </div>
                    {scan.alerts && (
                      <span className="finance-badge bg-success/10 text-success">Alerts</span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-base-content/50">
                    <span className="rounded bg-base-100/70 px-2 py-1">
                      {pluralize(summary.includeCount, 'input')}
                    </span>
                    <span className="rounded bg-base-100/70 px-2 py-1">
                      {pluralize(summary.filterCount, 'filter')}
                    </span>
                    <span className="rounded bg-base-100/70 px-2 py-1">
                      {pluralize(summary.ignoreCount, 'ignore')}
                    </span>
                  </div>
                </button>
                <div className="px-2 pb-3 flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <IconButton
                    label="Move up"
                    onClick={() => onMove(index, -1)}
                    disabled={index === 0}
                  >
                    <span aria-hidden>↑</span>
                  </IconButton>
                  <IconButton
                    label="Move down"
                    onClick={() => onMove(index, 1)}
                    disabled={index === scans.length - 1}
                  >
                    <span aria-hidden>↓</span>
                  </IconButton>
                  <IconButton label="Delete scan" onClick={() => onDelete(scan)}>
                    <XIcon />
                  </IconButton>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function KeywordBuilder({
  scan,
  onScanChange,
  onAddKeyword,
  onRemoveKeyword,
  metadata,
  setUnsaved,
  onSave,
  saving,
  saved,
  onOpenTrending,
  companyResults,
  onCompanySearch,
  companySearching,
  onAddCompany,
  onRemoveCompany,
  ignoredKeywords,
  onAddIgnoreKeyword,
  onRemoveIgnoreKeyword,
  onSaveIgnoredKeywords,
  savingIgnoredKeywords,
}) {
  const [input, setInput] = useState('');
  const [titleIgnoreInput, setTitleIgnoreInput] = useState('');
  const [descriptionIgnoreInput, setDescriptionIgnoreInput] = useState('');
  const isCompanySearch = input.startsWith('@');
  const companyQuery = isCompanySearch ? input.slice(1).trim() : '';
  const debounceRef = useRef(null);
  const summary = scanActivitySummary(scan, totalIgnoreKeywords(ignoredKeywords));

  useEffect(() => {
    if (!isCompanySearch || companyQuery.length < 1) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onCompanySearch(companyQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [companyQuery, isCompanySearch, onCompanySearch]);

  const submitKeyword = () => {
    if (isCompanySearch) return;
    const ok = onAddKeyword(input);
    if (ok) setInput('');
  };

  const submitIgnoreKeyword = (category, value) => {
    const ok = onAddIgnoreKeyword(category, value);
    if (!ok) return;
    if (category === 'title') setTitleIgnoreInput('');
    else setDescriptionIgnoreInput('');
  };

  return (
    <div className="finance-card overflow-hidden">
      <div className="p-4 border-b border-base-300 bg-base-200/40 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase text-secondary">Active Scan</div>
          <input
            className="input input-sm input-ghost w-full max-w-2xl px-0 text-xl font-semibold"
            value={scan.scanName}
            onChange={(event) => {
              onScanChange({ ...scan, scanName: event.target.value || 'Untitled Scan' });
              setUnsaved();
            }}
          />
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-base-content/50">
            <span>{pluralize(summary.includeCount, 'input')}</span>
            <span>/</span>
            <span>{pluralize(summary.filterCount, 'filter')}</span>
            <span>/</span>
            <span>{pluralize(summary.ignoreCount, 'ignore rule')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-base-300 bg-base-100 cursor-pointer shadow-sm">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-secondary"
              checked={scan.alerts}
              onChange={(event) => {
                onScanChange({ ...scan, alerts: event.target.checked });
                setUnsaved();
              }}
            />
            <span className="text-sm">Alerts</span>
          </label>
          <button
            type="button"
            className={`btn btn-sm min-w-[6rem] gap-1.5 ${saved ? 'btn-outline btn-secondary' : 'btn-secondary'}`}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? <span className="loading loading-spinner loading-xs" /> : null}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3">
          <div className="relative min-w-0">
            <label className="text-xs font-medium text-base-content/60">Search builder</label>
            <div className="mt-1 flex rounded-xl border border-base-300 bg-base-100 shadow-sm focus-within:border-secondary/60 focus-within:ring-2 focus-within:ring-secondary/10">
              <div className="px-3 flex items-center text-base-content/40">
                <SearchIcon />
              </div>
              <input
                className="input input-md min-w-0 flex-1 border-0 focus:outline-none bg-transparent"
                placeholder="Search keywords or start with @ to filter by a company"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitKeyword();
                  }
                }}
              />
              <Dropdown
                className="w-28"
                buttonClassName="h-12 rounded-none border-0 border-l border-base-300 bg-base-200 shadow-none"
                options={[
                  { value: 'full', label: 'Full' },
                  { value: 'quick', label: 'Quick' },
                ]}
                value={scan.searchMode}
                onChange={(nextMode) => {
                  onScanChange({ ...scan, searchMode: nextMode });
                  setUnsaved();
                }}
              />
              <button
                type="button"
                className="btn btn-md btn-primary rounded-l-none rounded-r-[11px]"
                onClick={submitKeyword}
                disabled={isCompanySearch}
              >
                Add
              </button>
            </div>
            {isCompanySearch && (
              <div className="absolute z-20 mt-2 w-full max-w-xl finance-card shadow-xl overflow-hidden">
                {companySearching ? (
                  <div className="px-4 py-3 text-sm text-base-content/50">
                    Searching companies...
                  </div>
                ) : companyResults.length > 0 ? (
                  companyResults.slice(0, 8).map((company) => {
                    const exists = scan.companyFilters.some(
                      (item) => item.companyId === company.companyId
                    );
                    return (
                      <button
                        key={company.companyId}
                        type="button"
                        className="w-full px-4 py-3 text-left hover:bg-base-200 flex items-center justify-between gap-3"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          if (!exists) {
                            onAddCompany(company);
                            setInput('');
                          }
                        }}
                      >
                        <span>
                          <span className="block text-sm font-semibold">
                            {company.name || company.Name}
                          </span>
                          <span className="block text-xs text-base-content/50">
                            {company.companyId}
                          </span>
                        </span>
                        {exists && (
                          <span className="finance-badge bg-success/10 text-success">Added</span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-4 py-3 text-sm text-base-content/50">No companies found</div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-md btn-outline btn-secondary xl:self-end gap-1.5"
            onClick={onOpenTrending}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7h6v6M22 7l-8.5 8.5-5-5L2 17"
              />
            </svg>
            Trending
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <TokenPanel
            title="Included keywords"
            empty="Add terms like Order Book, Capex or USFDA."
            tone="secondary"
            items={scan.searchFilters}
            renderItem={(keyword) => keyword}
            onRemove={onRemoveKeyword}
          />
          <TokenPanel
            title="Company filters"
            empty="Start with @ in the search box to add companies."
            tone="outline"
            items={scan.companyFilters}
            renderItem={(item) => `@${item.companyId}`}
            itemKey={(item) => item.companyId}
            onRemove={(item) => onRemoveCompany(item.companyId)}
          />
        </div>

        {metadata?.announcementTypes?.length ? (
          <p className="text-xs text-base-content/50">
            Full Search scans titles and PDF text. Quick Search scans titles only.
          </p>
        ) : null}

        <div className="rounded-xl border border-base-300 bg-base-200/40 p-3 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-1">
            <div>
              <h3 className="text-sm font-semibold">Ignore announcements</h3>
              <p className="text-xs text-base-content/50">
                Applies to every scan — remove rows when the selected field contains one of
                these keywords.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline btn-secondary gap-1.5"
              onClick={onSaveIgnoredKeywords}
              disabled={savingIgnoredKeywords}
            >
              {savingIgnoredKeywords ? (
                <span className="loading loading-spinner loading-xs" />
              ) : null}
              Save ignore rules
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <IgnoreKeywordInput
              label="Title keywords to ignore"
              placeholder="e.g. board meeting"
              value={titleIgnoreInput}
              keywords={ignoredKeywords.titleKeywordsToIgnore}
              onChange={setTitleIgnoreInput}
              onSubmit={() => submitIgnoreKeyword('title', titleIgnoreInput)}
              onRemove={(keyword) => onRemoveIgnoreKeyword('title', keyword)}
            />
            <IgnoreKeywordInput
              label="Description keywords to ignore"
              placeholder="e.g. trading window"
              value={descriptionIgnoreInput}
              keywords={ignoredKeywords.descriptionKeywordsToIgnore}
              onChange={setDescriptionIgnoreInput}
              onSubmit={() => submitIgnoreKeyword('description', descriptionIgnoreInput)}
              onRemove={(keyword) => onRemoveIgnoreKeyword('description', keyword)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenPanel({ title, empty, tone, items, renderItem, onRemove, itemKey = (item) => item }) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-3 min-h-[92px]">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-xs font-semibold uppercase text-base-content/50">{title}</h3>
        <span className="text-[11px] text-base-content/40">{items.length}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <span
              key={itemKey(item)}
              className={`badge gap-1 py-3 max-w-full ${
                tone === 'secondary' ? 'badge-secondary' : 'badge-outline'
              }`}
            >
              <span className="truncate max-w-[220px]">{renderItem(item)}</span>
              <button
                type="button"
                onClick={() => onRemove(item)}
                aria-label={`Remove ${renderItem(item)}`}
              >
                <XIcon className="w-3 h-3" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-sm text-base-content/50">{empty}</span>
        )}
      </div>
    </div>
  );
}

function IgnoreKeywordInput({ label, placeholder, value, keywords, onChange, onSubmit, onRemove }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/50 p-3">
      <label className="text-xs text-base-content/50">{label}</label>
      <div className="mt-1 flex rounded-lg border border-base-300 bg-base-100 focus-within:border-secondary/60">
        <input
          className="input input-sm flex-1 border-0 focus:outline-none bg-transparent"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <button type="button" className="btn btn-sm btn-outline rounded-l-none" onClick={onSubmit}>
          Add
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 min-h-[28px]">
        {keywords.length > 0 ? (
          keywords.map((keyword) => (
            <span key={keyword} className="badge badge-outline gap-1 py-3">
              {keyword}
              <button
                type="button"
                onClick={() => onRemove(keyword)}
                aria-label={`Remove ignore keyword ${keyword}`}
              >
                <XIcon className="w-3 h-3" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-xs text-base-content/40">No ignore keywords</span>
        )}
      </div>
    </div>
  );
}

function ScanFilters({ scan, metadata, quarterDate, onScanChange, onQuarterChange, setUnsaved }) {
  const watchlists = metadata.watchlists || [];
  const watchlistOptions = watchlists.map((watchlist) => ({
    value: String(watchlist.watchlistId || watchlist.watchlistName || watchlist.name),
    label: String(watchlist.watchlistName || watchlist.name || watchlist.watchlistId),
  }));

  const updateFilters = (filters) => {
    onScanChange({ ...scan, filters });
    setUnsaved();
  };

  const updateListValue = (key, next) => {
    onScanChange({ ...scan, [key]: next });
    setUnsaved();
  };

  return (
    <div className="finance-card overflow-hidden">
      <div className="p-4 border-b border-base-300 bg-base-200/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Filters & Universe</h2>
          <p className="text-xs text-base-content/50 mt-0.5">
            {activeUniverseLabels(scan).join(' / ')}
          </p>
        </div>
        <div className="text-xs text-base-content/50">
          {pluralize(scan.filters.length, 'financial filter')} /{' '}
          {pluralize(
            scan.industry.length + scan.index.length + scan.watchlistIds.length,
            'universe tag'
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {scan.companyFilters.length > 0 && (
          <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-content">
            StockScans disables industry, index and watchlist tags when company filters are
            selected.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <Dropdown
            label="Industry"
            multiple
            searchable
            options={metadata.industryList || []}
            values={scan.industry}
            disabled={scan.companyFilters.length > 0}
            placeholder="All industries"
            onChange={(next) => updateListValue('industry', next)}
          />
          <Dropdown
            label="Index"
            multiple
            searchable
            options={metadata.indexList || []}
            values={scan.index}
            disabled={scan.companyFilters.length > 0}
            placeholder="All indices"
            onChange={(next) => updateListValue('index', next)}
          />
          <Dropdown
            label="Watchlist"
            multiple
            searchable
            options={watchlistOptions}
            values={scan.watchlistIds}
            disabled={scan.companyFilters.length > 0 || watchlists.length === 0}
            placeholder="No watchlist"
            empty="No StockScans watchlists"
            onChange={(next) => updateListValue('watchlistIds', next)}
          />
          <Dropdown
            label="Type"
            options={metadata.announcementTypes || ['All']}
            value={scan.announcementType}
            onChange={(nextType) => {
              onScanChange({ ...scan, announcementType: nextType });
              setUnsaved();
            }}
          />
          <Dropdown
            label="Quarter"
            searchable
            options={(metadata.quarterDates || []).map((value) => ({
              value,
              label: quarterLabel(value),
            }))}
            value={quarterDate}
            onChange={(nextQuarter) => {
              onQuarterChange(nextQuarter);
              setUnsaved();
            }}
          />
        </div>

        <div className="rounded-xl border border-base-300 bg-base-100 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Financial filters</h3>
            <button
              type="button"
              className="btn btn-sm btn-outline gap-1"
              onClick={() =>
                updateFilters([
                  ...scan.filters,
                  { left: 'Market Capitalization', sign: '>=', right: '1000' },
                ])
              }
            >
              <PlusIcon />
              Add filter
            </button>
          </div>

          <div className="space-y-2">
            {scan.filters.map((filter, index) => (
              <div
                key={`${filter.left}-${index}`}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_110px_minmax(120px,0.7fr)_40px] gap-2"
              >
                <Dropdown
                  options={FILTER_FIELDS}
                  value={filter.left}
                  searchable
                  onChange={(nextField) => {
                    const next = [...scan.filters];
                    next[index] = { ...filter, left: nextField };
                    updateFilters(next);
                  }}
                />
                <Dropdown
                  options={SIGNS}
                  value={filter.sign}
                  onChange={(nextSign) => {
                    const next = [...scan.filters];
                    next[index] = { ...filter, sign: nextSign };
                    updateFilters(next);
                  }}
                />
                <input
                  className="input input-sm input-bordered h-9 bg-base-100"
                  value={filter.right}
                  onChange={(event) => {
                    const next = [...scan.filters];
                    next[index] = { ...filter, right: event.target.value };
                    updateFilters(next);
                  }}
                />
                <IconButton
                  label="Remove filter"
                  onClick={() => updateFilters(scan.filters.filter((_, i) => i !== index))}
                >
                  <XIcon />
                </IconButton>
              </div>
            ))}
            {scan.filters.length === 0 && (
              <div className="rounded-lg border border-dashed border-base-300 px-3 py-4 text-sm text-base-content/50">
                No financial filters added.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnnouncementCard({ announcement }) {
  const snippets = Array.isArray(announcement.snippet) ? announcement.snippet : [];
  return (
    <div className="finance-card-hover group relative overflow-hidden min-h-[260px] flex flex-col">
      <div className="absolute inset-x-0 top-0 h-1 bg-secondary/80" />
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-secondary mb-2 truncate">
              {announcement.name || announcement.symbol}
            </p>
            <h3 className="font-semibold text-[15px] leading-snug">{announcement.title}</h3>
          </div>
          {announcement.attachmentUrl && (
            <a
              href={announcement.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-ghost btn-square flex-none"
              title="Open document"
              aria-label={`Open document for ${announcement.title}`}
            >
              <ExternalLinkIcon />
            </a>
          )}
        </div>
        {announcement.description && (
          <p className="text-sm text-base-content/60 mt-3 line-clamp-2">
            {announcement.description}
          </p>
        )}
        <div className="mt-4 space-y-2 flex-1">
          {snippets.slice(0, 2).map((snippet, index) => (
            <div
              key={index}
              className="rounded-lg border border-base-300/70 bg-base-200/70 p-3 text-xs leading-relaxed"
            >
              <span dangerouslySetInnerHTML={{ __html: sanitizeHighlight(snippet.text) }} />
              {snippet.pageNumber && (
                <span className="ml-2 font-mono text-[10px] text-base-content/40">
                  p. {snippet.pageNumber}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-base-200">
          <div className="text-[11px] font-medium text-base-content/50">
            {formatAnnouncementTimestamp(announcement.createdAt || announcement.date)}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatisticsTable({ params, enabled, onQuotaExceeded }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!enabled || !params?.scan?.searchFilters?.length) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const res = await announcementScansAPI.getStatistics(params);
        if (!res.data.success) throw new Error(res.data.error || 'Statistics failed');
        if (!cancelled) setStats(res.data.data);
      } catch (err) {
        if (!cancelled) {
          if (err.response?.status === 402 || err.response?.status === 401) onQuotaExceeded?.();
          setError(err.response?.data?.error || err.message || 'Statistics failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, params, onQuotaExceeded]);

  const rows = useMemo(() => {
    const keywords = stats?.keywords || params?.scan?.searchFilters || [];
    const mapped = (stats?.companyData || []).map((item) => {
      const [companyKey, name, companyId, counts] = item;
      return {
        companyKey,
        name,
        companyId,
        keywordBreakdown: Object.fromEntries(
          keywords.map((keyword, index) => [keyword, counts?.[index] || 0])
        ),
      };
    });
    const q = query.trim().toLowerCase();
    const filtered = q
      ? mapped.filter(
          (row) =>
            row.name.toLowerCase().includes(q) || String(row.companyId).toLowerCase().includes(q)
        )
      : mapped;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      return (b.keywordBreakdown[sortKey] || 0) - (a.keywordBreakdown[sortKey] || 0);
    });
  }, [params?.scan?.searchFilters, query, sortKey, stats]);

  if (!params?.scan?.searchFilters?.length) {
    return (
      <div className="finance-card p-8 text-center text-base-content/50">
        Add at least one keyword to use the statistics table.
      </div>
    );
  }

  if (loading && !stats) {
    return (
      <div className="finance-card p-4 space-y-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-10 rounded-lg bg-base-300/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error && !stats) {
    return <div className="finance-card p-5 text-error text-sm">{error}</div>;
  }

  const keywords = stats?.keywords || params.scan.searchFilters;

  return (
    <div className="space-y-4">
      <div className="finance-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            Found <span className="text-secondary">{stats?.totalMatches || 0}</span> mentions across{' '}
            <span className="text-secondary">{stats?.totalCompanies || 0}</span> companies
          </div>
          <p className="text-xs text-base-content/50 mt-1">
            Click a non-zero count to view highlighted PDFs for that company.
          </p>
        </div>
        <input
          className="input input-sm input-bordered bg-base-100 w-full md:w-72"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a company"
        />
      </div>

      <div className="finance-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="finance-table">
            <thead>
              <tr>
                <th className="sticky left-0 bg-base-100 z-10 min-w-[220px]">
                  <button
                    type="button"
                    onClick={() => setSortKey('name')}
                    className="font-semibold"
                  >
                    Company
                  </button>
                </th>
                {keywords.map((keyword) => (
                  <th key={keyword} className="text-center min-w-[140px]">
                    <button
                      type="button"
                      onClick={() => setSortKey(keyword)}
                      className="font-semibold"
                    >
                      {keyword}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, index) => (
                <tr key={row.companyKey || row.companyId}>
                  <td className="sticky left-0 bg-base-100 z-10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-base-content/35 w-6">{index + 1}</span>
                      <div>
                        <div className="font-semibold">{row.name}</div>
                        <div className="text-xs text-base-content/50">{row.companyId}</div>
                      </div>
                    </div>
                  </td>
                  {keywords.map((keyword) => {
                    const count = row.keywordBreakdown[keyword] || 0;
                    return (
                      <td key={keyword} className="text-center">
                        <button
                          type="button"
                          className={`font-mono tabular-nums rounded px-3 py-1 ${
                            count > 0
                              ? 'bg-secondary/10 text-secondary hover:bg-secondary/20'
                              : 'text-base-content/30'
                          }`}
                          disabled={count === 0}
                          onClick={() => setDetail({ company: row, keyword })}
                        >
                          {count || '-'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <CompanyDetailModal detail={detail} params={params} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

function CompanyDetailModal({ detail, params, onClose }) {
  const [scope, setScope] = useState('quarter');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    announcementScansAPI
      .getCompanyAnnouncements({
        companyKey: detail.company.companyKey,
        keywords: [detail.keyword],
        quarterDate: params.quarterDate,
        allTime: scope === 'all-time',
        announcementType: params.scan.announcementType,
        searchMode: params.scan.searchMode,
        // Ignore keywords are applied server-side from the single shared list
        // (@stock/api/utils/announcementNoiseFilter) — no longer a per-scan param.
      })
      .then((res) => {
        if (!cancelled) setRows(res.data.data?.announcements || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail, params, scope]);

  const grouped = useMemo(() => {
    const groups = new Map();
    rows.forEach((row) => {
      const label = formatDate(row.date);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    });
    return Array.from(groups.entries());
  }, [rows]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="finance-card w-full max-w-5xl max-h-[86vh] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-4 border-b border-base-300 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              {detail.company.name} <span className="text-base-content/40">/</span>{' '}
              <span className="text-secondary">{detail.keyword}</span>
            </h3>
            <p className="text-xs text-base-content/50">{detail.company.companyId}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="join">
              <button
                type="button"
                className={`btn btn-sm join-item ${scope === 'quarter' ? 'btn-secondary' : 'btn-outline'}`}
                onClick={() => setScope('quarter')}
              >
                {quarterLabel(params.quarterDate)}
              </button>
              <button
                type="button"
                className={`btn btn-sm join-item ${scope === 'all-time' ? 'btn-secondary' : 'btn-outline'}`}
                onClick={() => setScope('all-time')}
              >
                All time
              </button>
            </div>
            <IconButton label="Close" onClick={onClose}>
              <XIcon />
            </IconButton>
          </div>
        </div>
        <div className="p-4 overflow-auto max-h-[calc(86vh-86px)]">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-36 rounded-lg bg-base-300/50 animate-pulse" />
              ))}
            </div>
          ) : grouped.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {grouped.map(([date, items]) => (
                <div key={date} className="min-w-[280px] max-w-[340px]">
                  <div className="text-xs font-semibold text-base-content/50 mb-2">{date}</div>
                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <a
                        key={`${item.ssUrl}-${index}`}
                        href={item.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg border border-base-300 bg-base-100 p-3 hover:border-secondary/50"
                      >
                        <div className="text-sm font-semibold">{item.title}</div>
                        {(item.snippet || []).slice(0, 2).map((snippet, i) => (
                          <p
                            key={i}
                            className="text-xs text-base-content/60 mt-2 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: sanitizeHighlight(snippet.text) }}
                          />
                        ))}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-base-content/50">No announcements found.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrendingModal({ metadata, activeKeywords, onSelect, onRemove, onCreateScan, onClose }) {
  const categories = Object.keys(metadata.trendingKeywords || {});
  const [category, setCategory] = useState(categories[0] || '');
  const keywords = metadata.trendingKeywords?.[category] || [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="finance-card w-full max-w-5xl max-h-[86vh] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-4 border-b border-base-300 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Trending keywords</h3>
            <p className="text-xs text-base-content/50">
              Tap a keyword to add it to your current scan.
            </p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <XIcon />
          </IconButton>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] max-h-[calc(86vh-82px)]">
          <div className="border-r border-base-300 overflow-y-auto p-3">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={`w-full text-left rounded-lg px-3 py-2 text-sm mb-1 ${
                  category === item ? 'bg-secondary text-secondary-content' : 'hover:bg-base-200'
                }`}
                onClick={() => setCategory(item)}
              >
                <span className="font-semibold">{item}</span>
                <span className="float-right text-xs opacity-70">
                  {metadata.trendingKeywords[item].length}
                </span>
              </button>
            ))}
          </div>
          <div className="p-4 overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h4 className="font-semibold">{category}</h4>
              <button
                type="button"
                className="btn btn-sm btn-outline btn-secondary"
                onClick={() => onCreateScan(category, keywords)}
              >
                Create scan
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword) => {
                const active = activeKeywords.includes(keyword);
                return (
                  <button
                    key={keyword}
                    type="button"
                    className={`btn btn-sm ${active ? 'btn-secondary' : 'btn-outline'}`}
                    onClick={() => (active ? onRemove(keyword) : onSelect(keyword))}
                  >
                    {keyword}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IgnoredAnnouncementsWidget({ data }) {
  const hasData = Object.keys(data.title).length > 0 || Object.keys(data.description).length > 0;
  
  if (!hasData) {
    return (
      <div className="finance-card overflow-hidden lg:sticky lg:top-20">
        <div className="p-4 border-b border-base-300 bg-base-200/50">
          <h2 className="text-sm font-semibold">Ignored Announcements</h2>
          <p className="text-xs text-base-content/50 mt-0.5">Categorized by keyword</p>
        </div>
        <div className="p-4 text-sm text-base-content/50">
          No ignored announcements in current results.
        </div>
      </div>
    );
  }

  return (
    <div className="finance-card overflow-hidden lg:sticky lg:top-20 max-h-[calc(100vh-100px)] flex flex-col">
      <div className="p-4 border-b border-base-300 bg-base-200/50">
        <h2 className="text-sm font-semibold">Ignored Announcements</h2>
        <p className="text-xs text-base-content/50 mt-0.5">Categorized by keyword</p>
      </div>
      <div className="overflow-y-auto p-4 space-y-6">
        {Object.keys(data.title).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase text-secondary mb-3 border-b border-base-200 pb-1">Title Keywords</h3>
            <div className="space-y-4">
              {Object.entries(data.title).map(([keyword, items]) => (
                <div key={keyword}>
                  <div className="inline-block px-2 py-1 bg-base-200 rounded text-xs font-semibold mb-2">{keyword}</div>
                  <ul className="space-y-2">
                    {items.map((item, idx) => (
                      <li key={idx} className="text-xs border-l-2 border-base-300 pl-2 py-1">
                        {item.title || item.highlightedTitle}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {Object.keys(data.description).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase text-secondary mb-3 border-b border-base-200 pb-1">Description Keywords</h3>
            <div className="space-y-4">
              {Object.entries(data.description).map(([keyword, items]) => (
                <div key={keyword}>
                  <div className="inline-block px-2 py-1 bg-base-200 rounded text-xs font-semibold mb-2">{keyword}</div>
                  <ul className="space-y-2">
                    {items.map((item, idx) => (
                      <li key={idx} className="text-xs border-l-2 border-base-300 pl-2 py-1">
                        {item.description}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnnouncementScansPage() {
  const { showSnackbar } = useSnackbar();
  const [metadata, setMetadata] = useState({
    indexList: [],
    industryList: [],
    announcementTypes: [
      'All',
      'Financial Results',
      'Earnings Call',
      'Presentation',
      'Annual Report',
    ],
    trendingKeywords: {},
    quarterDates: [],
    watchlists: [],
  });
  const [savedScans, setSavedScans] = useState([]);
  const [savedSource, setSavedSource] = useState('none');
  const [activeScan, setActiveScan] = useState(normalizeScan(FALLBACK_SCAN));
  const [ignoredKeywords, setIgnoredKeywords] = useState(EMPTY_IGNORED_KEYWORDS);
  const [quarterDate, setQuarterDate] = useState('');
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState(null);
  const [authNotice, setAuthNotice] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingIgnoredKeywords, setSavingIgnoredKeywords] = useState(false);
  const [activeTab, setActiveTab] = useState('card');
  const [results, setResults] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [runError, setRunError] = useState(null);
  const [companyResults, setCompanyResults] = useState([]);
  const [companySearching, setCompanySearching] = useState(false);
  const [showTrending, setShowTrending] = useState(false);
  const lastRunKey = useRef('');

  // Resizing logic
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(400);
  const dragState = useRef({ type: null, startX: 0, startWidth: 0 });

  const onLeftDragStart = useCallback((e) => {
    dragState.current = { type: 'left', startX: e.clientX, startWidth: leftWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftWidth]);

  const onRightDragStart = useCallback((e) => {
    dragState.current = { type: 'right', startX: e.clientX, startWidth: rightWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [rightWidth]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (dragState.current.type === 'left') {
        const delta = e.clientX - dragState.current.startX;
        setLeftWidth(Math.max(180, Math.min(600, dragState.current.startWidth + delta)));
      } else if (dragState.current.type === 'right') {
        const delta = dragState.current.startX - e.clientX;
        setRightWidth(Math.max(280, Math.min(800, dragState.current.startWidth + delta)));
      }
    };
    const handleMouseUp = () => {
      dragState.current.type = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const params = useMemo(
    () => ({
      scan: activeScan,
      offset: 0,
      quarterDate,
    }),
    [activeScan, quarterDate]
  );

  // Re-filter whatever's already been fetched against the in-progress
  // (possibly unsaved) ignoredKeywords state, so adding a keyword hides
  // matching rows immediately instead of waiting for Save + a re-run.
  const visibleAnnouncements = useMemo(
    () => filterAnnouncementsByIgnoreKeywords(results?.announcements, ignoredKeywords),
    [results, ignoredKeywords]
  );

  const ignoredAnnouncementsList = useMemo(() => {
    if (!results?.announcements) return { title: {}, description: {} };
    const titleMap = {};
    const descMap = {};

    results.announcements.forEach((ann) => {
      const title = normalizeIgnoreText(ann?.title || ann?.highlightedTitle);
      const titleHit = (ignoredKeywords?.titleKeywordsToIgnore || []).find((kw) =>
        title.includes(kw.toLowerCase())
      );
      
      if (titleHit) {
        if (!titleMap[titleHit]) titleMap[titleHit] = [];
        if (!titleMap[titleHit].some(a => a.title === ann.title && a.highlightedTitle === ann.highlightedTitle)) {
          titleMap[titleHit].push(ann);
        }
      } else {
        const description = normalizeIgnoreText(ann?.description);
        const descHit = (ignoredKeywords?.descriptionKeywordsToIgnore || []).find((kw) => {
          return description.includes(kw.toLowerCase());
        });
        
        if (descHit) {
          if (!descMap[descHit]) descMap[descHit] = [];
          if (!descMap[descHit].some(a => a.description === ann.description)) {
            descMap[descHit].push(ann);
          }
        }
      }
    });
    return { title: titleMap, description: descMap };
  }, [results, ignoredKeywords]);

  const setUnsaved = useCallback(() => {
    setIsSaved(false);
    setResults(null);
    lastRunKey.current = '';
  }, []);

  const replaceScan = useCallback((scan, saved = false) => {
    const normalized = normalizeScan(scan);
    setActiveScan(normalized);
    setIsSaved(saved);
    setResults(null);
    lastRunKey.current = '';
    if (typeof window !== 'undefined' && normalized.scanId) {
      window.localStorage.setItem(LAST_ACTIVE_SCAN_KEY, normalized.scanId);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        setBootLoading(true);
        const metaRes = await announcementScansAPI.getMetadata();
        if (!metaRes.data.success) throw new Error(metaRes.data.error || 'Metadata failed');
        const meta = metaRes.data.data;
        let watchlists = [];
        try {
          const watchRes = await announcementScansAPI.getWatchlists();
          watchlists = watchRes.data.data?.watchlists || [];
        } catch {
          watchlists = [];
        }

        try {
          const ignoreRes = await announcementScansAPI.getIgnoredKeywords();
          setIgnoredKeywords({
            titleKeywordsToIgnore: ignoreRes.data.data?.titleKeywordsToIgnore || [],
            descriptionKeywordsToIgnore: ignoreRes.data.data?.descriptionKeywordsToIgnore || [],
          });
        } catch {
          setIgnoredKeywords(EMPTY_IGNORED_KEYWORDS);
        }

        let scans = [];
        let source = 'none';
        try {
          const savedRes = await announcementScansAPI.getSavedScans();
          scans = (savedRes.data.data?.announcementScans || []).map(normalizeScan);
          source = 'stockscans';
          setAuthNotice(null);
        } catch (err) {
          scans = getLocalScans();
          source = scans.length > 0 ? 'local' : 'none';
          setAuthNotice(
            err.response?.data?.error ||
              'StockScans saved scans unavailable. Save will use this browser until STOCKSCANS_AUTH_TOKEN is configured.'
          );
        }

        if (cancelled) return;
        const quarterDates = meta.quarterDates || [];
        const defaultScan = normalizeScan(meta.defaultScan || FALLBACK_SCAN);
        const lastId =
          typeof window !== 'undefined' ? window.localStorage.getItem(LAST_ACTIVE_SCAN_KEY) : null;
        const active =
          scans.find((scan) => scan.scanId && scan.scanId === lastId) || scans[0] || defaultScan;

        setMetadata({ ...meta, watchlists });
        setSavedScans(scans);
        setSavedSource(source);
        setQuarterDate(quarterDates[0] || '');
        replaceScan(active, scans.length > 0 && !!active.scanId);
        setBootError(null);
      } catch (err) {
        if (!cancelled) {
          setBootError(
            err.response?.data?.error || err.message || 'Failed to load announcement scans'
          );
        }
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [replaceScan]);

  useEffect(() => {
    if (bootLoading || !quarterDate || activeTab !== 'card' || !hasRunnableScan(activeScan)) return;
    const key = scanKey(activeScan, quarterDate);
    if (lastRunKey.current === key) return;
    lastRunKey.current = key;
    let cancelled = false;
    setLoadingResults(true);
    setRunError(null);
    announcementScansAPI
      .runScan({ scan: activeScan, offset: 0, quarterDate, skipIgnoreFilter: true })
      .then((res) => {
        if (!cancelled) setResults(res.data.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setRunError(err.response?.data?.error || err.message || 'Announcement scan failed');
          setResults(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingResults(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeScan, activeTab, bootLoading, quarterDate]);

  const addKeyword = (raw) => {
    const keyword = String(raw || '').trim();
    if (keyword.length < 3 || keyword.length > 100) {
      showSnackbar('Please enter a valid search term (3-100 characters).', 'warning');
      return false;
    }
    if (COMMON_WORDS.has(keyword.toLowerCase())) {
      showSnackbar(`Common words like "${keyword}" cannot be used as search terms.`, 'warning');
      return false;
    }
    if (activeScan.searchFilters.length >= 12) {
      showSnackbar('Maximum 12 keywords allowed.', 'warning');
      return false;
    }
    if (!activeScan.searchFilters.includes(keyword)) {
      setActiveScan({ ...activeScan, searchFilters: [...activeScan.searchFilters, keyword] });
      setUnsaved();
    }
    return true;
  };

  const removeKeyword = (keyword) => {
    setActiveScan({
      ...activeScan,
      searchFilters: activeScan.searchFilters.filter((item) => item !== keyword),
    });
    setUnsaved();
  };

  // Ignore keywords are a single global list, not per-scan — these edit the
  // `ignoredKeywords` state directly (not activeScan) and don't touch
  // setUnsaved()/isSaved, since they're independent of whichever scan happens to
  // be active. handleSaveIgnoredKeywords below persists them to the shared file.
  const addIgnoreKeyword = (category, raw) => {
    const keyword = String(raw || '').trim();
    if (keyword.length < 2 || keyword.length > 100) {
      showSnackbar('Please enter an ignore keyword between 2 and 100 characters.', 'warning');
      return false;
    }
    const key = category === 'title' ? 'titleKeywordsToIgnore' : 'descriptionKeywordsToIgnore';
    const exists = ignoredKeywords[key].some(
      (item) => item.toLowerCase() === keyword.toLowerCase()
    );
    if (exists) return true;
    if (ignoredKeywords[key].length >= 50) {
      showSnackbar('Maximum 50 ignore keywords allowed per category.', 'warning');
      return false;
    }
    setIgnoredKeywords({ ...ignoredKeywords, [key]: [...ignoredKeywords[key], keyword] });
    return true;
  };

  const removeIgnoreKeyword = (category, keyword) => {
    const key = category === 'title' ? 'titleKeywordsToIgnore' : 'descriptionKeywordsToIgnore';
    setIgnoredKeywords({
      ...ignoredKeywords,
      [key]: ignoredKeywords[key].filter((item) => item !== keyword),
    });
  };

  const handleSaveIgnoredKeywords = async () => {
    setSavingIgnoredKeywords(true);
    try {
      const res = await announcementScansAPI.saveIgnoredKeywords(ignoredKeywords);
      setIgnoredKeywords({
        titleKeywordsToIgnore: res.data.data?.titleKeywordsToIgnore || [],
        descriptionKeywordsToIgnore: res.data.data?.descriptionKeywordsToIgnore || [],
      });
      showSnackbar(
        `Ignore rules saved to ${res.data.data?.path || 'project data file'}.`,
        'success',
        5000
      );
    } catch (err) {
      showSnackbar(err.response?.data?.error || 'Failed to save ignore rules.', 'error');
    } finally {
      setSavingIgnoredKeywords(false);
    }
  };

  const searchCompanies = useCallback(async (query) => {
    setCompanySearching(true);
    try {
      const res = await announcementScansAPI.searchCompanies(query);
      setCompanyResults(res.data.data?.companies || []);
    } catch {
      setCompanyResults([]);
    } finally {
      setCompanySearching(false);
    }
  }, []);

  const addCompany = (company) => {
    if (activeScan.companyFilters.some((item) => item.companyId === company.companyId)) return;
    setActiveScan({
      ...activeScan,
      companyFilters: [...activeScan.companyFilters, { companyId: company.companyId }],
    });
    setUnsaved();
  };

  const removeCompany = (companyId) => {
    setActiveScan({
      ...activeScan,
      companyFilters: activeScan.companyFilters.filter((item) => item.companyId !== companyId),
    });
    setUnsaved();
  };

  const saveLocal = (scan) => {
    const normalized = normalizeScan({
      ...scan,
      scanId: scan.scanId || `local-${Date.now()}`,
      scanName: scan.scanName || 'Untitled Scan',
    });
    const next = [
      normalized,
      ...getLocalScans().filter((item) => item.scanId !== normalized.scanId),
    ];
    setLocalScans(next);
    setSavedScans(next);
    setSavedSource('local');
    replaceScan(normalized, true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await announcementScansAPI.saveScan(activeScan);
      const scanId = res.data.data?.scanId || activeScan.scanId;
      const saved = normalizeScan({ ...activeScan, scanId });
      const next = [saved, ...savedScans.filter((scan) => scan.scanId !== saved.scanId)];
      setSavedScans(next);
      setSavedSource('stockscans');
      replaceScan(saved, true);
      showSnackbar('Announcement Scan saved.', 'success');
    } catch (err) {
      saveLocal(activeScan);
      showSnackbar(
        err.response?.data?.code === 'STOCKSCANS_AUTH_REQUIRED'
          ? 'Saved locally. Add STOCKSCANS_AUTH_TOKEN to save in StockScans.'
          : 'Saved locally because StockScans save failed.',
        'warning',
        5000
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (scan) => {
    if (!scan) return;
    const localDelete = () => {
      const next = savedScans.filter((item) => item.scanId !== scan.scanId);
      if (savedSource === 'local') setLocalScans(next);
      setSavedScans(next);
      replaceScan(next[0] || metadata.defaultScan || FALLBACK_SCAN, next.length > 0);
    };
    if (savedSource === 'stockscans' && scan.scanId && !scan.scanId.startsWith('local-')) {
      try {
        await announcementScansAPI.deleteScan(scan.scanId);
        localDelete();
        showSnackbar('Announcement Scan deleted.', 'success');
      } catch (err) {
        showSnackbar(err.response?.data?.error || 'Delete failed.', 'error');
      }
    } else {
      localDelete();
      showSnackbar('Announcement Scan deleted.', 'success');
    }
  };

  const handleMove = async (index, direction) => {
    const next = [...savedScans];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSavedScans(next);
    if (savedSource === 'local') setLocalScans(next);
    if (savedSource === 'stockscans') {
      try {
        await announcementScansAPI.reorderScans(next.map((scan) => scan.scanId));
      } catch {
        showSnackbar('Reordered locally, but StockScans order save failed.', 'warning');
      }
    }
  };

  const handleLoadMore = async () => {
    if (!results || loadingMore || results.end >= results.total) return;
    setLoadingMore(true);
    try {
      const res = await announcementScansAPI.runScan({
        scan: activeScan,
        offset: results.end,
        quarterDate,
        skipIgnoreFilter: true,
      });
      const next = res.data.data;
      setResults({
        ...next,
        announcements: [...(results.announcements || []), ...(next.announcements || [])],
      });
    } catch (err) {
      showSnackbar(err.response?.data?.error || 'Failed to load more announcements.', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const createScanFromCategory = (name, keywords) => {
    const next = normalizeScan({
      ...FALLBACK_SCAN,
      scanId: '',
      scanName: name,
      searchFilters: keywords.slice(0, 12),
    });
    replaceScan(next, false);
    setShowTrending(false);
  };

  if (bootLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-72 rounded-lg bg-base-300/60 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="h-80 rounded-xl bg-base-300/50 animate-pulse" />
          <div className="lg:col-span-3 h-80 rounded-xl bg-base-300/50 animate-pulse" />
        </div>
      </div>
    );
  }

  if (bootError) {
    return <div className="finance-card p-6 text-error">{bootError}</div>;
  }

  const canLoadMore = results && results.end < results.total;

  return (
    <>
      <Head>
        <title>Announcement Scans</title>
        <meta name="description" content="StockScans announcement scan clone" />
      </Head>

      <div className="announcement-workbench w-full mx-auto space-y-5 px-2 xl:px-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase text-secondary mb-1">
              Announcement intelligence
            </div>
            <h1 className="page-header">Announcement Scans</h1>
            <p className="section-subtitle mt-1 max-w-3xl">
              Search official corporate announcements by keyword, company, quarter, universe and
              ignore rules.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-outline btn-secondary gap-1.5"
              onClick={() => setShowTrending(true)}
            >
              Trending
            </button>
            <button
              type="button"
              className="btn btn-secondary gap-1.5"
              onClick={() =>
                replaceScan({ ...FALLBACK_SCAN, scanName: 'New Announcement Scan' }, false)
              }
            >
              <PlusIcon />
              New Scan
            </button>
          </div>
        </div>

        {authNotice && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
            {authNotice}
          </div>
        )}

        <div 
          className="grid grid-cols-1 lg:grid-cols-[var(--left-width)_minmax(0,1fr)] xl:grid-cols-[var(--left-width)_minmax(0,1fr)_var(--right-width)] gap-5 items-start"
          style={{ '--left-width': `${leftWidth}px`, '--right-width': `${rightWidth}px` }}
        >
          <aside className="order-1 relative">
            <div 
              className="absolute -right-2.5 top-0 bottom-0 w-5 cursor-col-resize z-10 group hidden lg:flex items-center justify-center"
              onMouseDown={onLeftDragStart}
            >
              <div className="w-1 h-12 rounded-full bg-base-300 group-hover:bg-secondary transition-colors" />
            </div>
            <ScanList
              scans={savedScans}
              activeScanId={activeScan.scanId}
              activeName={activeScan.scanName}
              source={savedSource}
              onSelect={(scan) =>
                replaceScan(scan || metadata.defaultScan || FALLBACK_SCAN, !!scan)
              }
              onNew={() =>
                replaceScan({ ...FALLBACK_SCAN, scanName: 'New Announcement Scan' }, false)
              }
              onMove={handleMove}
              onDelete={handleDelete}
              ignoreCount={totalIgnoreKeywords(ignoredKeywords)}
            />
          </aside>

          <section className="order-2 space-y-5 min-w-0">
            <KeywordBuilder
              scan={activeScan}
              metadata={metadata}
              onScanChange={setActiveScan}
              setUnsaved={setUnsaved}
              onAddKeyword={addKeyword}
              onRemoveKeyword={removeKeyword}
              onSave={handleSave}
              saving={saving}
              saved={isSaved}
              onOpenTrending={() => setShowTrending(true)}
              companyResults={companyResults}
              companySearching={companySearching}
              onCompanySearch={searchCompanies}
              onAddCompany={addCompany}
              onRemoveCompany={removeCompany}
              ignoredKeywords={ignoredKeywords}
              onAddIgnoreKeyword={addIgnoreKeyword}
              onRemoveIgnoreKeyword={removeIgnoreKeyword}
              onSaveIgnoredKeywords={handleSaveIgnoredKeywords}
              savingIgnoredKeywords={savingIgnoredKeywords}
            />

            <ScanFilters
              scan={activeScan}
              metadata={metadata}
              quarterDate={quarterDate}
              onScanChange={setActiveScan}
              onQuarterChange={setQuarterDate}
              setUnsaved={setUnsaved}
            />

            <div className="finance-card p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="join shadow-sm">
                <button
                  type="button"
                  className={`btn btn-sm join-item ${activeTab === 'card' ? 'btn-secondary' : 'btn-outline'}`}
                  onClick={() => setActiveTab('card')}
                >
                  Card
                </button>
                <button
                  type="button"
                  className={`btn btn-sm join-item ${activeTab === 'table' ? 'btn-secondary' : 'btn-outline'}`}
                  onClick={() => setActiveTab('table')}
                  disabled={activeScan.searchFilters.length === 0}
                >
                  Table
                </button>
              </div>
              <div className="flex items-center gap-3 text-sm text-base-content/50">
                {activeTab === 'card' && results ? (
                  <span>
                    Showing{' '}
                    <span className="font-semibold text-base-content">
                      {visibleAnnouncements.length}
                    </span>{' '}
                    of <span className="font-semibold text-base-content">{results.total || 0}</span>
                  </span>
                ) : (
                  <span>Table view aggregates keyword matches by company.</span>
                )}
                {totalIgnoreKeywords(ignoredKeywords) > 0 && (
                  <span className="finance-badge bg-warning/10 text-warning border border-warning/20">
                    {pluralize(totalIgnoreKeywords(ignoredKeywords), 'ignore')}
                  </span>
                )}
              </div>
            </div>

            {activeTab === 'card' ? (
              !hasRunnableScan(activeScan) ? (
                <div className="finance-card p-10 text-center text-base-content/50">
                  Add a keyword, company or tag to run an announcement scan.
                </div>
              ) : loadingResults && !results ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <div key={index} className="h-56 rounded-xl bg-base-300/50 animate-pulse" />
                  ))}
                </div>
              ) : runError ? (
                <div className="finance-card p-5 text-error">{runError}</div>
              ) : visibleAnnouncements.length ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {visibleAnnouncements.map((announcement, index) => (
                      <AnnouncementCard
                        key={`${announcement.ssUrl}-${index}`}
                        announcement={announcement}
                      />
                    ))}
                  </div>
                  {canLoadMore && (
                    <div className="text-center">
                      <button
                        type="button"
                        className="btn btn-outline btn-secondary"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : null}
                        Load more
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="finance-card p-10 text-center text-base-content/50">
                  No announcements found.
                </div>
              )
            ) : (
              <StatisticsTable
                params={params}
                enabled={activeTab === 'table'}
                onQuotaExceeded={() =>
                  showSnackbar(
                    'StockScans subscription or login required for this table.',
                    'warning'
                  )
                }
              />
            )}
          </section>
          
          <aside className="order-3 lg:col-span-2 xl:col-span-1 relative">
            <div 
              className="absolute -left-2.5 top-0 bottom-0 w-5 cursor-col-resize z-10 group hidden xl:flex items-center justify-center"
              onMouseDown={onRightDragStart}
            >
              <div className="w-1 h-12 rounded-full bg-base-300 group-hover:bg-secondary transition-colors" />
            </div>
            <IgnoredAnnouncementsWidget data={ignoredAnnouncementsList} />
          </aside>
        </div>
      </div>

      {showTrending && (
        <TrendingModal
          metadata={metadata}
          activeKeywords={activeScan.searchFilters}
          onSelect={addKeyword}
          onRemove={removeKeyword}
          onCreateScan={createScanFromCategory}
          onClose={() => setShowTrending(false)}
        />
      )}
    </>
  );
}

export { getServerSideProps } from '../src/core/lib/forceServerSide';
