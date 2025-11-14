/**
 * Format number to Indian currency format
 */
export function formatCurrency(value) {
  if (value === null || value === undefined) return 'N/A';
  
  const num = Number(value);
  if (isNaN(num)) return 'N/A';
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(num);
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
 */
export function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined) return 'N/A';
  
  const num = Number(value);
  if (isNaN(num)) return 'N/A';
  
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
  if (value === null || value === undefined || value === 0) return 'text-gray-600';
  return value > 0 ? 'text-positive' : 'text-negative';
}

/**
 * Get background color class for change value
 */
export function getChangeBgColor(value) {
  if (value === null || value === undefined || value === 0) return 'bg-gray-100';
  return value > 0 ? 'bg-positive' : 'bg-negative';
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

