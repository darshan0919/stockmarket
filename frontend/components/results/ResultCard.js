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
  formatQuarterDate,
  getChangeColor,
} from '../../lib/utils/formatters';

function DocumentBadge({ doc }) {
  const styles = {
    Result: 'bg-info/10 text-info',
    Transcript: 'bg-secondary/10 text-secondary',
    PPT: 'bg-warning/10 text-warning',
  };

  const content = (
    <>
      {doc.documentType}
      {doc.fullUrl && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      )}
    </>
  );

  if (!doc.fullUrl) {
    return (
      <span className={`finance-badge ${styles[doc.documentType] || 'bg-base-200 text-base-content/50'}`}>
        {doc.documentType}
      </span>
    );
  }

  return (
    <a
      href={doc.fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`finance-badge gap-1 cursor-pointer hover:opacity-80 transition-opacity ${styles[doc.documentType] || 'bg-base-200 text-base-content/50'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {content}
    </a>
  );
}

function TranscriptNotesBadge({ doc }) {
  if (!doc.notesUrl) return null;

  return (
    <a
      href={doc.notesUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="finance-badge gap-1 bg-success/10 text-success cursor-pointer hover:opacity-80 transition-opacity"
      onClick={(e) => e.stopPropagation()}
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
      </svg>
      Notes
    </a>
  );
}

function FinancialRow({ label, data }) {
  if (!data || data.length < 5) return null;

  const [_, prev, current, latest, qoqGrowth, yoyGrowth] = data;

  return (
    <tr>
      <td className="py-2 pr-3 text-xs font-medium text-base-content/60">{label}</td>
      <td className="py-2 px-2 text-xs text-right font-mono tabular-nums text-base-content/40">
        {formatNumber(prev)}
      </td>
      <td className="py-2 px-2 text-xs text-right font-mono tabular-nums text-base-content/40">
        {formatNumber(current)}
      </td>
      <td className="py-2 px-2 text-xs text-right font-mono tabular-nums font-semibold text-base-content">
        {formatNumber(latest)}
      </td>
      <td className={`py-2 px-2 text-xs text-right font-mono tabular-nums font-medium ${getChangeColor(qoqGrowth)}`}>
        {qoqGrowth !== null ? `${qoqGrowth > 0 ? '+' : ''}${formatNumber(qoqGrowth)}%` : '-'}
      </td>
      <td className={`py-2 px-2 text-xs text-right font-mono tabular-nums font-medium ${getChangeColor(yoyGrowth)}`}>
        {yoyGrowth !== null ? `${yoyGrowth > 0 ? '+' : ''}${formatNumber(yoyGrowth)}%` : '-'}
      </td>
    </tr>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.result - Result data from API
 */
export default function ResultCard({ result }) {
  const [viewType, setViewType] = useState(result.hasConsolidated ? 'C' : 'S');

  const currentData = viewType === 'C' ? result.consolidatedData : result.standaloneData;

  const getRowData = (rowIndex) => {
    if (!currentData || !currentData[rowIndex]) return null;
    return currentData[rowIndex];
  };

  const headers = currentData?.[0] || [];
  const quarters = headers.slice(1, 4);

  return (
    <div className="finance-card-hover">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <Link href={`/stock/${result.symbol}`}>
              <h3 className="text-sm font-bold text-secondary hover:text-secondary/80 transition-colors truncate">
                {result.symbol}
              </h3>
            </Link>
            <p className="text-xs text-base-content/50 mt-0.5 truncate" title={result.name}>
              {result.name}
            </p>
          </div>
          <div className="text-right ml-3 flex-shrink-0">
            <p className="text-2xs text-base-content/40">Result Date</p>
            <p className="text-sm font-semibold">{result.lastResultDate || 'N/A'}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs mb-3">
          <div>
            <span className="text-base-content/40">P/E</span>{' '}
            <span className="font-medium font-mono tabular-nums">
              {result.priceToEarnings ? formatNumber(result.priceToEarnings) : '-'}
            </span>
          </div>
          <div>
            <span className="text-base-content/40">MCap</span>{' '}
            <span className="font-medium">
              {result.marketCap ? formatLargeNumber(result.marketCap) : '-'}
            </span>
          </div>
        </div>

        {/* C/S Toggle */}
        {result.hasConsolidated && result.hasStandalone && (
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setViewType('C')}
              className={`finance-badge cursor-pointer transition-colors ${
                viewType === 'C'
                  ? 'bg-secondary text-white'
                  : 'bg-base-200 text-base-content/50 hover:bg-base-300'
              }`}
            >
              Consolidated
            </button>
            <button
              onClick={() => setViewType('S')}
              className={`finance-badge cursor-pointer transition-colors ${
                viewType === 'S'
                  ? 'bg-secondary text-white'
                  : 'bg-base-200 text-base-content/50 hover:bg-base-300'
              }`}
            >
              Standalone
            </button>
          </div>
        )}

        {/* Financial Data */}
        <div className="overflow-x-auto -mx-1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-base-200">
                <th className="pb-1.5 text-left"></th>
                {quarters.map((q, idx) => (
                  <th key={idx} className="pb-1.5 text-right text-2xs font-medium text-base-content/40 px-2">
                    {formatQuarterDate(String(q))}
                  </th>
                ))}
                <th className="pb-1.5 text-right text-2xs font-medium text-base-content/40 px-2">QoQ</th>
                <th className="pb-1.5 text-right text-2xs font-medium text-base-content/40 px-2">YoY</th>
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

        {/* Documents */}
        {result.documents && result.documents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 mt-3 border-t border-base-200/60">
            {result.documents.map((doc, idx) => (
              <DocumentBadge key={`doc-${idx}`} doc={doc} />
            ))}
            {result.documents
              .filter((doc) => doc.hasNotes && doc.notesUrl)
              .map((doc, idx) => (
                <TranscriptNotesBadge key={`notes-${idx}`} doc={doc} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
