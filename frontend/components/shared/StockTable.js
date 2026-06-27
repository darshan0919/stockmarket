/**
 * Unified live-stock table shared by the Top Gainers and Screener pages.
 *
 * Columns match the top-gainers enrichment shape plus live order-book depth.
 * All sorting is client-side. Filtering (sell offers / buy bids) is mutual-exclusive.
 */
import { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import {
  formatPercentage,
  formatNumber,
  formatPercent,
  getChangeColor,
} from '../../lib/utils/formatters';

const fmtVol = (v) => {
  if (v == null) return 'N/A';
  const n = Number(v);
  if (isNaN(n)) return 'N/A';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

export const COLUMNS = [
  {
    id: 'name',
    header: 'Name',
    sortKey: 'symbol',
    align: 'left',
    always: true,
    render: (row) => (
      <div className="flex flex-col">
        <span className="font-semibold">{row.symbol}</span>
      </div>
    ),
  },
  {
    id: 'price',
    header: 'Price (₹)',
    sortKey: 'price',
    align: 'right',
    render: (row) => (
      <div className="flex flex-col items-end">
        <span className="font-medium">
          {row.price != null ? Number(row.price).toFixed(2) : 'N/A'}
        </span>
        <span className={`text-xs ${getChangeColor(row.changePercent)}`}>
          {formatPercentage(row.changePercent)}
        </span>
      </div>
    ),
  },
  {
    id: 'bidLevels',
    header: 'Bids',
    sortKey: 'bidLevels',
    align: 'right',
    render: (row) => (
      <div className="flex flex-col items-end">
        <span className="text-success font-medium">
          {row.bidLevels != null ? row.bidLevels : 'N/A'}
        </span>
        {row.totalBidQty != null && (
          <span className="text-xs text-base-content/40">{fmtVol(row.totalBidQty)}</span>
        )}
      </div>
    ),
  },
  {
    id: 'offerLevels',
    header: 'Offers',
    sortKey: 'offerLevels',
    align: 'right',
    render: (row) => (
      <div className="flex flex-col items-end">
        <span className="text-error font-medium">
          {row.offerLevels != null ? row.offerLevels : 'N/A'}
        </span>
        {row.totalOfferQty != null && (
          <span className="text-xs text-base-content/40">{fmtVol(row.totalOfferQty)}</span>
        )}
      </div>
    ),
  },
  {
    id: 'volume',
    header: 'Volume',
    sortKey: 'volume',
    align: 'right',
    render: (row) => fmtVol(row.volume),
  },
  {
    id: 'value',
    header: 'Value (Rs Cr)',
    sortKey: 'value',
    align: 'right',
    render: (row) => (row.value != null ? (row.value / 1e7).toFixed(2) : 'N/A'),
  },
  {
    id: 'deliveryValue',
    header: 'Del Value (Rs Cr)',
    sortKey: 'deliveryValue',
    align: 'right',
    render: (row) => (row.deliveryValue != null ? (row.deliveryValue / 1e7).toFixed(2) : 'N/A'),
  },
  {
    id: 'delVsMcap',
    header: 'Del Val / MCap %',
    sortKey: 'delVsMcap',
    align: 'right',
    render: (row) =>
      row.delVsMcap != null ? `${Number(row.delVsMcap).toFixed(3)}%` : 'N/A',
  },
  {
    id: 'valVsMcap',
    header: 'Val / MCap %',
    sortKey: 'valVsMcap',
    align: 'right',
    render: (row) =>
      row.valVsMcap != null ? `${Number(row.valVsMcap).toFixed(3)}%` : 'N/A',
  },
  {
    id: 'marketCapCr',
    header: 'Mkt Cap (Rs Cr)',
    sortKey: 'marketCapCr',
    align: 'right',
    render: (row) =>
      row.marketCapCr != null ? Number(row.marketCapCr).toFixed(0) : 'N/A',
  },
  {
    id: 'retailHolding',
    header: 'Retail %',
    sortKey: 'retailHoldingPercent',
    align: 'right',
    render: (row) => formatPercent(row.retailHoldingPercent),
  },
  {
    id: 'deliveryPercent',
    header: 'Del % (Day)',
    sortKey: 'deliveryPercent',
    align: 'right',
    render: (row) => formatPercent(row.deliveryPercent),
  },
  {
    id: 'avgDelivery',
    header: 'Del % (30D Avg)',
    sortKey: 'avgDeliveryPercent30d',
    align: 'right',
    render: (row) => formatPercent(row.avgDeliveryPercent30d),
  },
  {
    id: 'pe',
    header: 'P/E',
    sortKey: 'pe',
    align: 'right',
    render: (row) => formatNumber(row.pe, 1),
  },
  {
    id: 'patGrowth',
    header: 'PAT Growth TTM',
    sortKey: 'patGrowthTtm',
    align: 'right',
    render: (row) =>
      row.patGrowthTtm != null ? (
        <span className={row.patGrowthTtm >= 0 ? 'text-success' : 'text-error'}>
          {Number(row.patGrowthTtm).toFixed(1)}%
        </span>
      ) : (
        'N/A'
      ),
  },
  {
    id: 'weekChange',
    header: '1W Change',
    sortKey: 'weekChangePercent',
    align: 'right',
    render: (row) => (
      <span className={getChangeColor(row.weekChangePercent)}>
        {formatPercentage(row.weekChangePercent)}
      </span>
    ),
  },
];

export function useColumnState() {
  const [hiddenCols, setHiddenCols] = useState(new Set(['bidLevels', 'offerLevels']));
  const toggleColumn = (id) =>
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { hiddenCols, toggleColumn };
}

export function ColumnPicker({ hiddenCols, toggleColumn }) {
  return (
    <div className="dropdown dropdown-end">
      <label tabIndex={0} className="btn btn-sm btn-ghost gap-1 text-base-content/60">
        Columns
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </label>
      <div
        tabIndex={0}
        className="dropdown-content z-10 p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-300 mt-1 max-h-80 overflow-y-auto"
      >
        {COLUMNS.filter((c) => !c.always).map((col) => (
          <label
            key={col.id}
            className="flex items-center gap-2 cursor-pointer py-1 px-2 hover:bg-base-200 rounded"
          >
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={!hiddenCols.has(col.id)}
              onChange={() => toggleColumn(col.id)}
            />
            <span className="text-sm">{col.header}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SortIcon({ direction }) {
  if (!direction) {
    return (
      <svg className="w-3.5 h-3.5 opacity-30 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 opacity-80 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {direction === 'asc' ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      )}
    </svg>
  );
}

const compare = (a, b, key, dir) => {
  const va = a[key];
  const vb = b[key];
  if (va === null || va === undefined) return 1;
  if (vb === null || vb === undefined) return -1;
  const asc = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
  return dir === 'asc' ? asc : -asc;
};

/**
 * @param {{
 *   rows: Object[],
 *   hiddenCols: Set<string>,
 *   sellOffersOnly: boolean,
 *   buyBidsOnly: boolean,
 *   emptyMessage?: string,
 * }} props
 */
export default function StockTable({ rows, hiddenCols, sellOffersOnly, buyBidsOnly, emptyMessage }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState('delVsMcap');
  const [sortDir, setSortDir] = useState('desc');

  const enrichedRows = useMemo(
    () =>
      rows.map((row) => {
        const deliveryValue =
          row.value != null && row.deliveryPercent != null
            ? row.value * (row.deliveryPercent / 100)
            : null;
        const delVsMcap =
          deliveryValue != null && row.marketCapCr != null && row.marketCapCr > 0
            ? (deliveryValue / (row.marketCapCr * 1e7)) * 100
            : null;
        const valVsMcap =
          row.value != null && row.marketCapCr != null && row.marketCapCr > 0
            ? (row.value / (row.marketCapCr * 1e7)) * 100
            : null;
        return { ...row, deliveryValue, delVsMcap, valVsMcap };
      }),
    [rows]
  );

  const handleHeaderClick = (key) => {
    if (!key) return;
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    let rows = enrichedRows.filter((row) => {
      // Market Cap < 300 Cr → hide
      if (row.marketCapCr != null && row.marketCapCr < 300) return false;
      // Del Value < 5 Cr → hide (deliveryValue is in rupees; 5 Cr = 5e7)
      if (row.deliveryValue != null && row.deliveryValue < 5e7) return false;
      // Retail % > 50 → hide
      if (row.retailHoldingPercent != null && row.retailHoldingPercent > 50) return false;
      // Retail Stake < 50 Cr → hide
      if (row.marketCapCr != null && row.retailHoldingPercent != null &&
          (row.marketCapCr * row.retailHoldingPercent) / 100 < 50) return false;
      return true;
    });
    if (sellOffersOnly) return rows.filter((r) => r.offerLevels != null && r.offerLevels > 0);
    if (buyBidsOnly) return rows.filter((r) => r.bidLevels != null && r.bidLevels > 0);
    return rows;
  }, [enrichedRows, sellOffersOnly, buyBidsOnly]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [filtered, sortKey, sortDir]);

  const visibleColumns = COLUMNS.filter((col) => col.always || !hiddenCols.has(col.id));

  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/40 text-sm">
        {emptyMessage || 'No data available'}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/40 text-sm">
        {buyBidsOnly
          ? 'No stocks with active buy bids right now.'
          : 'No stocks with active sell offers right now.'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="finance-table">
        <thead>
          <tr>
            {visibleColumns.map((col) => (
              <th
                key={col.id}
                className={[
                  col.align === 'right' ? 'num' : '',
                  col.sortKey ? 'cursor-pointer select-none hover:opacity-80 transition-opacity' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleHeaderClick(col.sortKey)}
              >
                {col.header}
                {col.sortKey && <SortIcon direction={sortKey === col.sortKey ? sortDir : null} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.symbol}
              className="cursor-pointer"
              onClick={() => router.push(`/stock/${row.symbol}`)}
            >
              {visibleColumns.map((col) => (
                <td key={col.id} className={col.align === 'right' ? 'num' : ''}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
