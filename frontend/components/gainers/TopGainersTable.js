import { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import {
  formatPercentage,
  formatNumber,
  formatPercent,
  getChangeColor,
} from '../../lib/utils/formatters';

const formatVolume = (value) => {
  if (value === null || value === undefined) return 'N/A';
  const num = Number(value);
  if (isNaN(num)) return 'N/A';
  return num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
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
        {row.name && row.name !== row.symbol && (
          <span className="text-xs text-base-content/50">{row.name}</span>
        )}
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
    id: 'changePercent',
    header: '% Day',
    sortKey: 'changePercent',
    align: 'right',
    render: (row) => (
      <span className={getChangeColor(row.changePercent)}>
        {formatPercentage(row.changePercent)}
      </span>
    ),
  },
  {
    id: 'volume',
    header: 'Volume',
    sortKey: 'volume',
    align: 'right',
    render: (row) => formatVolume(row.volume),
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
    render: (row) => (row.marketCapCr != null ? Number(row.marketCapCr).toFixed(0) : 'N/A'),
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

/** Hook to manage column visibility state. Use in the parent page. */
export function useColumnState() {
  const [hiddenCols, setHiddenCols] = useState(new Set());
  const toggleColumn = (id) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return { hiddenCols, toggleColumn };
}

/** Dropdown column picker to render in the page header. */
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
        className="dropdown-content z-10 p-2 shadow-lg bg-base-100 rounded-box w-48 border border-base-300 mt-1"
      >
        {COLUMNS.filter((col) => !col.always).map((col) => (
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
      <svg
        className="w-3.5 h-3.5 opacity-30 ml-1 inline"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"
        />
      </svg>
    );
  }
  return (
    <svg
      className="w-3.5 h-3.5 opacity-80 ml-1 inline"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
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

export default function TopGainersTable({ rows, hiddenCols }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState('deliveryValue');
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
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return enrichedRows;
    return [...enrichedRows].sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [enrichedRows, sortKey, sortDir]);

  const visibleColumns = COLUMNS.filter((col) => col.always || !hiddenCols.has(col.id));

  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/40 text-sm">
        No gainers available right now
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
                  col.sortKey
                    ? 'cursor-pointer select-none hover:opacity-80 transition-opacity'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
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
