/**
 * Format number to Indian currency format
 * @param {number|null|undefined} value - Value to format
 * @param {string} [emptyPlaceholder='N/A'] - Placeholder for null/undefined/NaN
 */
export function formatCurrency(value, emptyPlaceholder = 'N/A') {
  if (value === null || value === undefined) return emptyPlaceholder;

  const num = Number(value);
  if (isNaN(num)) return emptyPlaceholder;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format price as simple ₹X.XX (no thousands separator)
 * @param {number|null|undefined} value - Value to format
 * @param {string} [emptyPlaceholder='N/A'] - Placeholder for null/undefined/NaN
 */
export function formatPrice(value, emptyPlaceholder = 'N/A') {
  if (value === null || value === undefined) return emptyPlaceholder;

  const num = Number(value);
  if (isNaN(num)) return emptyPlaceholder;

  return `₹${num.toFixed(2)}`;
}

/**
 * Format quarter date string (e.g., "202512" -> "Dec 2025")
 * @param {string} dateStr - Date string in YYYYMM format
 * @returns {string} Formatted quarter date or original string if invalid
 */
export function formatQuarterDate(dateStr) {
  if (!dateStr || dateStr.length !== 6) return dateStr;
  const year = dateStr.substring(0, 4);
  const month = parseInt(dateStr.substring(4, 6), 10);
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${monthNames[month - 1]} ${year}`;
}

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatLargeNumber(value) {
  if (value === null || value === undefined) return 'N/A';

  const num = Number(value);
  if (isNaN(num)) return 'N/A';

  if (num >= 1e9) {
    return `₹${(num / 1e9).toFixed(2)}B`;
  } else if (num >= 1e7) {
    return `₹${(num / 1e7).toFixed(2)}Cr`;
  } else if (num >= 1e5) {
    return `₹${(num / 1e5).toFixed(2)}L`;
  } else if (num >= 1e3) {
    return `₹${(num / 1e3).toFixed(2)}K`;
  } else {
    return `₹${num.toFixed(2)}`;
  }
}

/**
 * Format percentage
 * @param {number|null|undefined|string} value - Value to format
 * @param {number} [decimals=2] - Decimal places
 * @param {string} [emptyPlaceholder='N/A'] - Placeholder for null/undefined/NaN/empty string
 */
export function formatPercent(value, decimals = 2, emptyPlaceholder = 'N/A') {
  if (value === null || value === undefined || value === '') return emptyPlaceholder;

  const num = Number(value);
  if (isNaN(num)) return emptyPlaceholder;

  return `${num.toFixed(decimals)}%`;
}

/**
 * Format percentage with sign (for growth values)
 */
export function formatPercentage(value, decimals = 2) {
  if (value === null || value === undefined) return 'N/A';

  const num = Number(value);
  if (isNaN(num)) return 'N/A';

  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}%`;
}

/**
 * Format number with decimals
 */
export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return 'N/A';

  const num = Number(value);
  if (isNaN(num)) return 'N/A';

  return num.toFixed(decimals);
}

/**
 * Format date
 */
export function formatDate(date) {
  if (!date) return 'N/A';

  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';

  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format date for charts (short format)
 */
export function formatChartDate(date) {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  return d.toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
  });
}

/**
 * Get color class for change value
 */
export function getChangeColor(value) {
  if (value === null || value === undefined || value === 0) return 'text-base-content/60';
  return value > 0 ? 'text-success' : 'text-error';
}

/**
 * Get background color class for change value
 */
export function getChangeBgColor(value) {
  if (value === null || value === undefined || value === 0) return 'bg-base-200';
  return value > 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error';
}

/**
 * Format change value with sign
 */
export function formatChange(value, decimals = 2) {
  if (value === null || value === undefined) return 'N/A';

  const num = Number(value);
  if (isNaN(num)) return 'N/A';

  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}`;
}

/**
 * Format a currency value with unit label (e.g., "₹1,234 Crore")
 * @param {number|null|undefined} value - The value to format
 * @param {string} [unit='Crore'] - Unit label
 * @param {string} [currency='INR'] - Currency code (INR or USD)
 * @returns {string} Formatted string
 */
export function formatCurrencyWithUnit(value, unit = 'Crore', currency = 'INR') {
  if (value === null || value === undefined) return '-';

  const symbol = currency === 'USD' ? '$' : '₹';
  const formattedValue = value.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  return `${symbol}${formattedValue} ${unit}`;
}

/**
 * Format a capacity value with unit
 * @param {Object} capacity - Capacity object with value and unit
 * @param {number} capacity.value - Numeric value
 * @param {string} capacity.unit - Unit label
 * @returns {string} Formatted string
 */
export function formatCapacity(capacity) {
  if (!capacity || !capacity.value) return '-';
  return `${capacity.value.toLocaleString('en-IN')} ${capacity.unit}`;
}

/**
 * Get human-readable relative time (e.g., "Today", "2 days ago")
 * @param {string} dateStr - ISO date string
 * @returns {string} Relative time string
 */
export function timeAgo(dateStr) {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  } catch (e) {
    return '';
  }
}

/**
 * Format a duration in milliseconds
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "1.5s", "2m 30s")
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/**
 * Format date for result display (e.g., "2026-01-31" -> "Jan 31")
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {string} Formatted short date
 */
export function formatResultDate(dateStr) {
  if (!dateStr) return dateStr;
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
