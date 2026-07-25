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

// Signal thresholds must match stock-api's eventReactionSignals.SIGNAL_THRESHOLDS
// (1day > 4%, 1week > 6%, 1month > 10%) — duplicated here (not imported) since
// screener-web doesn't currently depend on @stock/api; keep in sync manually
// if the backend thresholds change.
const EVENT_SIGNAL_THRESHOLDS = { oneDay: 0.04, oneWeek: 0.06, oneMonth: 0.1 };

const fmtReturn = (v) => {
  if (v == null) return <span className="text-base-content/30">—</span>;
  return (
    <span className={getChangeColor(v * 100)}>
      {v >= 0 ? '+' : ''}
      {(v * 100).toFixed(1)}%
    </span>
  );
};

/** Small badge: is this return a "signal" (clears the threshold) vs noise vs not-yet-computable. */
const fmtSignal = (v, threshold) => {
  if (v == null) return <span className="text-base-content/30">—</span>;
  const isSignal = Math.abs(v) >= threshold;
  return (
    <span
      className={`badge badge-xs ${isSignal ? (v >= 0 ? 'badge-success' : 'badge-error') : 'badge-ghost'}`}
      title={isSignal ? 'Signal — clears threshold' : 'Noise — below threshold'}
    >
      {isSignal ? (v >= 0 ? '▲ signal' : '▼ signal') : 'noise'}
    </span>
  );
};

/**
 * Column groups. Every column belongs to exactly one group (id must match a
 * key here). Groups back the bulk add/hide buttons in ColumnPicker — clicking
 * a group button toggles every column in that group at once; users can still
 * toggle individual columns within a group afterward.
 */
export const COLUMN_GROUPS = {
  core: { label: 'Core' },
  orderBook: { label: 'Order Book' },
  volumeDelivery: { label: 'Volume & Delivery' },
  fundamentals: { label: 'Valuation & Fundamentals' },
  priceAction: { label: 'Price Action' },
  eventReactionResults: { label: 'Event Reaction — Results' },
};

export const COLUMNS = [
  {
    id: 'name',
    header: 'Name',
    sortKey: 'symbol',
    align: 'left',
    group: 'core',
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
    group: 'core',
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
    group: 'orderBook',
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
    group: 'orderBook',
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
    group: 'volumeDelivery',
    render: (row) => fmtVol(row.volume),
  },
  {
    id: 'value',
    header: 'Value (Rs Cr)',
    sortKey: 'value',
    align: 'right',
    group: 'volumeDelivery',
    render: (row) => (row.value != null ? (row.value / 1e7).toFixed(2) : 'N/A'),
  },
  {
    id: 'deliveryValue',
    header: 'Del Value (Rs Cr)',
    sortKey: 'deliveryValue',
    align: 'right',
    group: 'volumeDelivery',
    render: (row) => (row.deliveryValue != null ? (row.deliveryValue / 1e7).toFixed(2) : 'N/A'),
  },
  {
    id: 'delVsMcap',
    header: 'Del Val / MCap %',
    sortKey: 'delVsMcap',
    align: 'right',
    group: 'volumeDelivery',
    render: (row) => (row.delVsMcap != null ? `${Number(row.delVsMcap).toFixed(3)}%` : 'N/A'),
  },
  {
    id: 'valVsMcap',
    header: 'Val / MCap %',
    sortKey: 'valVsMcap',
    align: 'right',
    group: 'volumeDelivery',
    render: (row) => (row.valVsMcap != null ? `${Number(row.valVsMcap).toFixed(3)}%` : 'N/A'),
  },
  {
    id: 'deliveryPercent',
    header: 'Del % (Day)',
    sortKey: 'deliveryPercent',
    align: 'right',
    group: 'volumeDelivery',
    render: (row) => formatPercent(row.deliveryPercent),
  },
  {
    id: 'avgDelivery',
    header: 'Del % (30D Avg)',
    sortKey: 'avgDeliveryPercent30d',
    align: 'right',
    group: 'volumeDelivery',
    render: (row) => formatPercent(row.avgDeliveryPercent30d),
  },
  {
    id: 'marketCapCr',
    header: 'Mkt Cap (Rs Cr)',
    sortKey: 'marketCapCr',
    align: 'right',
    group: 'fundamentals',
    render: (row) => (row.marketCapCr != null ? Number(row.marketCapCr).toFixed(0) : 'N/A'),
  },
  {
    id: 'retailHolding',
    header: 'Retail %',
    sortKey: 'retailHoldingPercent',
    align: 'right',
    group: 'fundamentals',
    render: (row) => formatPercent(row.retailHoldingPercent),
  },
  {
    id: 'pe',
    header: 'P/E',
    sortKey: 'pe',
    align: 'right',
    group: 'fundamentals',
    render: (row) => formatNumber(row.pe, 1),
  },
  {
    id: 'patGrowth',
    header: 'PAT Growth TTM',
    sortKey: 'patGrowthTtm',
    align: 'right',
    group: 'fundamentals',
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
    group: 'priceAction',
    render: (row) => (
      <span className={getChangeColor(row.weekChangePercent)}>
        {formatPercentage(row.weekChangePercent)}
      </span>
    ),
  },
  // ── Event Reaction — Results ──────────────────────────────────────────────
  // Sourced from stock-api's eventReactionSignals/reactionCandlesFetcher
  // pipeline (exact NSE/BSE announcement timestamp -> Stockscans 1m/15m/1D
  // OHLCV -> computeReactionMetrics). Populated by screener-api from a
  // precomputed cache (live per-row computation is too slow/expensive to run
  // synchronously across a whole screener page — see screenerController.js).
  // `row.eventReaction` shape: { timestamp, sinceResult, oneHour, oneDay,
  // oneWeek, oneMonth } | null (null/missing while uncached).
  {
    id: 'resultEventDate',
    header: 'Last Result',
    sortKey: 'eventReactionTimestamp',
    align: 'right',
    group: 'eventReactionResults',
    render: (row) =>
      row.eventReaction?.timestamp ? (
        new Date(row.eventReaction.timestamp).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: '2-digit',
        })
      ) : (
        <span className="text-base-content/30">—</span>
      ),
  },
  {
    id: 'sinceResult',
    header: 'Returns Since Result',
    sortKey: 'sinceResultReturn',
    align: 'right',
    group: 'eventReactionResults',
    render: (row) => fmtReturn(row.eventReaction?.sinceResult),
  },
  {
    id: 'oneHourPostResult',
    header: '1Hr Post-Result',
    sortKey: 'oneHourPostResultReturn',
    align: 'right',
    group: 'eventReactionResults',
    render: (row) => fmtReturn(row.eventReaction?.oneHour),
  },
  {
    id: 'oneDayPostResult',
    header: '1Day Post-Result',
    sortKey: 'oneDayPostResultReturn',
    align: 'right',
    group: 'eventReactionResults',
    render: (row) => fmtReturn(row.eventReaction?.oneDay),
  },
  {
    id: 'oneDaySignal',
    header: '1Day Signal (>4%)',
    sortKey: 'oneDayPostResultReturn',
    align: 'right',
    group: 'eventReactionResults',
    render: (row) => fmtSignal(row.eventReaction?.oneDay, EVENT_SIGNAL_THRESHOLDS.oneDay),
  },
  {
    id: 'oneWeekPostResult',
    header: '1Week Post-Result',
    sortKey: 'oneWeekPostResultReturn',
    align: 'right',
    group: 'eventReactionResults',
    render: (row) => fmtReturn(row.eventReaction?.oneWeek),
  },
  {
    id: 'oneWeekSignal',
    header: '1Week Signal (>6%)',
    sortKey: 'oneWeekPostResultReturn',
    align: 'right',
    group: 'eventReactionResults',
    render: (row) => fmtSignal(row.eventReaction?.oneWeek, EVENT_SIGNAL_THRESHOLDS.oneWeek),
  },
  {
    id: 'oneMonthPostResult',
    header: '1Month Post-Result',
    sortKey: 'oneMonthPostResultReturn',
    align: 'right',
    group: 'eventReactionResults',
    render: (row) => fmtReturn(row.eventReaction?.oneMonth),
  },
  {
    id: 'oneMonthSignal',
    header: '1Month Signal (>10%)',
    sortKey: 'oneMonthPostResultReturn',
    align: 'right',
    group: 'eventReactionResults',
    render: (row) => fmtSignal(row.eventReaction?.oneMonth, EVENT_SIGNAL_THRESHOLDS.oneMonth),
  },
];

const TOGGLEABLE_COLUMNS = COLUMNS.filter((c) => !c.always);
const COLUMNS_BY_GROUP = TOGGLEABLE_COLUMNS.reduce((acc, col) => {
  (acc[col.group] ||= []).push(col);
  return acc;
}, {});

export function useColumnState() {
  const [hiddenCols, setHiddenCols] = useState(new Set(['bidLevels', 'offerLevels']));
  const toggleColumn = (id) =>
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /** Show or hide every column in a group with one call — the "package" bulk toggle. */
  const setGroupVisible = (groupId, visible) =>
    setHiddenCols((prev) => {
      const next = new Set(prev);
      const ids = (COLUMNS_BY_GROUP[groupId] || []).map((c) => c.id);
      if (visible) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  return { hiddenCols, toggleColumn, setGroupVisible };
}

export function ColumnPicker({ hiddenCols, toggleColumn, setGroupVisible }) {
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
        className="dropdown-content z-10 p-2 shadow-lg bg-base-100 rounded-box w-72 border border-base-300 mt-1 max-h-96 overflow-y-auto"
      >
        {Object.entries(COLUMNS_BY_GROUP).map(([groupId, cols]) => {
          const group = COLUMN_GROUPS[groupId] || { label: groupId };
          const visibleCount = cols.filter((c) => !hiddenCols.has(c.id)).length;
          const allVisible = visibleCount === cols.length;
          const noneVisible = visibleCount === 0;
          return (
            <div key={groupId} className="mb-2 last:mb-0">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold uppercase text-base-content/50">
                  {group.label}
                </span>
                {setGroupVisible && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn btn-2xs btn-ghost px-1.5 py-0 h-5 min-h-0 text-xs"
                      disabled={allVisible}
                      onClick={() => setGroupVisible(groupId, true)}
                      title={`Show all ${group.label} columns`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className="btn btn-2xs btn-ghost px-1.5 py-0 h-5 min-h-0 text-xs"
                      disabled={noneVisible}
                      onClick={() => setGroupVisible(groupId, false)}
                      title={`Hide all ${group.label} columns`}
                    >
                      None
                    </button>
                  </div>
                )}
              </div>
              {cols.map((col) => (
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
          );
        })}
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

/**
 * @param {{
 *   rows: Object[],
 *   hiddenCols: Set<string>,
 *   sellOffersOnly: boolean,
 *   buyBidsOnly: boolean,
 *   emptyMessage?: string,
 * }} props
 */
export default function StockTable({
  rows,
  hiddenCols,
  sellOffersOnly,
  buyBidsOnly,
  emptyMessage,
}) {
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
    else {
      setSortKey(key);
      setSortDir('desc');
    }
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
      if (
        row.marketCapCr != null &&
        row.retailHoldingPercent != null &&
        (row.marketCapCr * row.retailHoldingPercent) / 100 < 50
      )
        return false;
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
