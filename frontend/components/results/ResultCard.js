/**
 * ResultCard component - Displays a single company's quarterly result
 * @component
 * @see {@link docs/frontend/components/ResultCard.md} for documentation
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  formatNumber,
  formatLargeNumber,
  formatDate,
  getChangeColor,
} from '../../lib/utils/formatters';

/**
 * Format quarter date (e.g., "202512" -> "Dec 2025")
 */
function formatQuarterDate(dateStr) {
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
 * Document badge component
 */
function DocumentBadge({ doc }) {
  const typeColors = {
    Result: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
    Transcript: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
    PPT: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
  };

  const typeLabels = {
    Result: 'Result',
    Transcript: 'Transcript',
    PPT: 'PPT',
  };

  if (!doc.fullUrl) {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${typeColors[doc.documentType] || 'bg-gray-100 text-gray-800'}`}
      >
        {typeLabels[doc.documentType] || doc.documentType}
      </span>
    );
  }

  return (
    <a
      href={doc.fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${typeColors[doc.documentType] || 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {typeLabels[doc.documentType] || doc.documentType}
      <svg className="ml-1 w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
}

/**
 * Transcript Notes badge component - separate button for AI-generated notes
 */
function TranscriptNotesBadge({ doc }) {
  if (!doc.notesUrl) return null;

  return (
    <a
      href={doc.notesUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer bg-green-100 text-green-800 hover:bg-green-200"
      onClick={(e) => e.stopPropagation()}
    >
      <svg className="mr-1 w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
      </svg>
      Notes
      <svg className="ml-1 w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
}

/**
 * Financial data row component
 */
function FinancialRow({ label, data, isGrowthRow = false }) {
  if (!data || data.length < 5) return null;

  const [_, prev, current, latest, qoqGrowth, yoyGrowth] = data;

  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="py-1.5 pr-2 text-xs text-gray-600 font-medium">{label}</td>
      <td className="py-1.5 px-2 text-xs text-right text-gray-500">{formatNumber(prev)}</td>
      <td className="py-1.5 px-2 text-xs text-right text-gray-500">{formatNumber(current)}</td>
      <td className="py-1.5 px-2 text-xs text-right text-gray-900 font-semibold">
        {formatNumber(latest)}
      </td>
      <td className={`py-1.5 px-2 text-xs text-right font-medium ${getChangeColor(qoqGrowth)}`}>
        {qoqGrowth !== null ? `${qoqGrowth > 0 ? '+' : ''}${formatNumber(qoqGrowth)}%` : '-'}
      </td>
      <td className={`py-1.5 px-2 text-xs text-right font-medium ${getChangeColor(yoyGrowth)}`}>
        {yoyGrowth !== null ? `${yoyGrowth > 0 ? '+' : ''}${formatNumber(yoyGrowth)}%` : '-'}
      </td>
    </tr>
  );
}

/**
 * Main ResultCard component
 * @param {Object} props
 * @param {Object} props.result - Result data from API
 */
export default function ResultCard({ result }) {
  const [viewType, setViewType] = useState(result.hasConsolidated ? 'C' : 'S');

  const currentData = viewType === 'C' ? result.consolidatedData : result.standaloneData;

  // Parse the financial data rows
  const getRowData = (rowIndex) => {
    if (!currentData || !currentData[rowIndex]) return null;
    return currentData[rowIndex];
  };

  // Get quarter headers from the first row
  const headers = currentData?.[0] || [];
  const quarters = headers.slice(1, 4); // Get the 3 quarter columns

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <Link href={`/stock/${result.symbol}`}>
              <h3 className="text-sm font-bold text-primary-600 hover:text-primary-700 cursor-pointer truncate">
                {result.symbol}
              </h3>
            </Link>
            <p className="text-xs text-gray-600 mt-0.5 truncate" title={result.name}>
              {result.name}
            </p>
          </div>
          <div className="text-right ml-2 flex-shrink-0">
            <p className="text-xs text-gray-500">Result Date</p>
            <p className="text-sm font-semibold text-gray-900">{result.lastResultDate || 'N/A'}</p>
          </div>
        </div>

        {/* Meta Info */}
        <div className="flex items-center gap-4 mt-3 text-xs">
          <div>
            <span className="text-gray-500">P/E:</span>{' '}
            <span className="font-medium text-gray-900">
              {result.priceToEarnings ? formatNumber(result.priceToEarnings) : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">MCap:</span>{' '}
            <span className="font-medium text-gray-900">
              {result.marketCap ? formatLargeNumber(result.marketCap) : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Toggle C/S */}
      {result.hasConsolidated && result.hasStandalone && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
          <div className="flex gap-2">
            <button
              onClick={() => setViewType('C')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                viewType === 'C'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Consolidated
            </button>
            <button
              onClick={() => setViewType('S')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                viewType === 'S'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Standalone
            </button>
          </div>
        </div>
      )}

      {/* Financial Data Table */}
      <div className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-1.5 pr-2 text-left text-gray-500 font-medium"></th>
                {quarters.map((q, idx) => (
                  <th key={idx} className="py-1.5 px-2 text-right text-gray-500 font-medium">
                    {formatQuarterDate(String(q))}
                  </th>
                ))}
                <th className="py-1.5 px-2 text-right text-gray-500 font-medium">QoQ</th>
                <th className="py-1.5 px-2 text-right text-gray-500 font-medium">YoY</th>
              </tr>
            </thead>
            <tbody>
              <FinancialRow label="Revenue" data={getRowData(1)} />
              <FinancialRow label="Op. Profit" data={getRowData(2)} />
              <FinancialRow label="OPM %" data={getRowData(3)} />
              <FinancialRow label="PAT" data={getRowData(4)} />
              <FinancialRow label="NPM %" data={getRowData(5)} />
              <FinancialRow label="EPS" data={getRowData(6)} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Documents */}
      {result.documents && result.documents.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {result.documents.map((doc, idx) => (
              <DocumentBadge key={`doc-${idx}`} doc={doc} />
            ))}
            {/* Render separate Notes buttons for documents that have notes */}
            {result.documents
              .filter((doc) => doc.hasNotes && doc.notesUrl)
              .map((doc, idx) => (
                <TranscriptNotesBadge key={`notes-${idx}`} doc={doc} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
