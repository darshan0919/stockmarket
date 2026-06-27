import { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { formatPercentage, getChangeColor } from '../../lib/utils/formatters';

const fmt = (v, decimals = 2) => {
  if (v === null || v === undefined) return 'N/A';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const fmtInt = (v) => {
  if (v === null || v === undefined) return 'N/A';
  const n = Number(v);
  if (isNaN(n)) return 'N/A';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

/**
 * Fixed live columns shown before the scan's dynamic metric columns.
 */
const LIVE_COLUMNS = [
  {
    id: 'price',
    header: 'Price (₹)',
    live: true,
    align: 'right',
    sortKey: 'price',
    render: (row) => (
      <div className="flex flex-col items-end">
        <span className="font-medium">{row.price != null ? fmt(row.price) : 'N/A'}</span>
        {row.changePercent != null && (
          <span className={`text-xs ${getChangeColor(row.changePercent)}`}>
            {formatPercentage(row.changePercent)}
          </span>
        )}
      </div>
    ),
  },
  {
    id: 'volume',
    header: 'Volume',
    live: true,
    align: 'right',
    sortKey: 'volume',
    render: (row) => fmtInt(row.volume),
  },
  {
    id: 'deliveryPercent',
    header: 'Del %',
    live: true,
    align: 'right',
    sortKey: 'deliveryPercent',
    render: (row) =>
      row.deliveryPercent != null ? `${fmt(row.deliveryPercent, 1)}%` : 'N/A',
  },
  {
    id: 'bidLevels',
    header: 'Bids',
    live: true,
    align: 'right',
    sortKey: 'bidLevels',
    render: (row) => (
      <div className="flex flex-col items-end">
        <span className="text-success font-medium">
          {row.bidLevels != null ? row.bidLevels : 'N/A'}
        </span>
        {row.totalBidQty != null && (
          <span className="text-xs text-base-content/40">{fmtInt(row.totalBidQty)}</span>
        )}
      </div>
    ),
  },
  {
    id: 'offerLevels',
    header: 'Offers',
    live: true,
    align: 'right',
    sortKey: 'offerLevels',
    render: (row) => (
      <div className="flex flex-col items-end">
        <span className="text-error font-medium">
          {row.offerLevels != null ? row.offerLevels : 'N/A'}
        </span>
        {row.totalOfferQty != null && (
          <span className="text-xs text-base-content/40">{fmtInt(row.totalOfferQty)}</span>
        )}
      </div>
    ),
  },
];

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
  const asc = typeof va === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb);
  return dir === 'asc' ? asc : -asc;
};

export function useColumnState(columnIds) {
  const [hiddenCols, setHiddenCols] = useState(new Set());
  const toggleColumn = (id) =>
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { hiddenCols, toggleColumn };
}

export function ColumnPicker({ liveColumns, scanColumns, hiddenCols, toggleColumn }) {
  const all = [...liveColumns, ...scanColumns];
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
        {all.map((col) => (
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
            <span className="text-sm">
              {col.header}
              {col.live && (
                <span className="ml-1 text-xs text-secondary opacity-60">live</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ScanResultsTable({ rows, columns, hiddenCols, sellOffersOnly, buyBidsOnly }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  // Build dynamic scan columns from the server-returned column definitions
  const scanColumns = useMemo(
    () =>
      columns.map((col) => ({
        id: col.key,
        header: col.label,
        live: false,
        align: col.type === 'number' ? 'right' : 'left',
        sortKey: col.key,
        render: (row) => {
          const val = row.metrics?.[col.key];
          if (val === null || val === undefined) return 'N/A';
          if (col.type === 'number') return fmt(val, 2);
          return String(val);
        },
      })),
    [columns]
  );

  const allColumns = [...LIVE_COLUMNS, ...scanColumns];

  const handleHeaderClick = (key) => {
    if (!key) return;
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    if (sellOffersOnly) return rows.filter((r) => r.offerLevels != null && r.offerLevels > 0);
    if (buyBidsOnly) return rows.filter((r) => r.bidLevels != null && r.bidLevels > 0);
    return rows;
  }, [rows, sellOffersOnly, buyBidsOnly]);

  const sorted = useMemo(() => {
    if (!sortKey || !filtered.length) return filtered;

    // Live column? read directly off row. Scan column? read from row.metrics
    const isLiveKey = LIVE_COLUMNS.some((c) => c.sortKey === sortKey);

    return [...filtered].sort((a, b) => {
      const va = isLiveKey ? a[sortKey] : a.metrics?.[sortKey];
      const vb = isLiveKey ? b[sortKey] : b.metrics?.[sortKey];
      const patchedA = { ...a, [sortKey]: va };
      const patchedB = { ...b, [sortKey]: vb };
      return compare(patchedA, patchedB, sortKey, sortDir);
    });
  }, [filtered, sortKey, sortDir]);

  const visibleColumns = allColumns.filter((col) => !hiddenCols.has(col.id));

  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/40 text-sm">
        No results. Select a scan to run it.
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
            <th className="sticky-col">Name</th>
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
                {col.live && (
                  <span className="ml-1 text-xs text-secondary opacity-50">⚡</span>
                )}
                {col.sortKey && (
                  <SortIcon direction={sortKey === col.sortKey ? sortDir : null} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.companyId}
              className="cursor-pointer"
              onClick={() => router.push(`/stock/${row.symbol}`)}
            >
              <td className="sticky-col">
                <div className="flex flex-col">
                  <span className="font-semibold">{row.symbol}</span>
                  <span className="text-xs text-base-content/40">{row.exchange}</span>
                </div>
              </td>
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
