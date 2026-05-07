/**
 * DeliveryVolumeChartTab — TradingView-style candlestick chart with a
 * two-tone "Delivery Volume" indicator beneath it.
 *
 * Two histogram series share the volume pane:
 *   - Light bar = total traded quantity
 *   - Solid bar = deliverable quantity (drawn over the light bar)
 *
 * Uses TradingView's MIT-licensed `lightweight-charts` so the UX matches
 * trading-view conventions (crosshair, OHLC tooltip, time scale).
 *
 * @see GET /api/stocks/:symbol/delivery-volume
 */
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { stockAPI } from '../../lib/api';

// TradingView default volume colors
const VOL_UP = '#26a69a';
const VOL_DOWN = '#ef5350';
// Light tints for traded-qty layer (≈ 35% alpha)
const VOL_UP_LIGHT = 'rgba(38,166,154,0.35)';
const VOL_DOWN_LIGHT = 'rgba(239,83,80,0.35)';

const RANGES = [
  { id: '1M', days: 30 },
  { id: '3M', days: 90 },
  { id: '6M', days: 180 },
  { id: '1Y', days: 365 },
  { id: '2Y', days: 730 },
  { id: '3Y', days: 1095 },
  { id: '5Y', days: 1825 },
];

const fmtDate = (d) => d.toISOString().slice(0, 10);
const fmtNum = (n) => {
  if (n == null || !Number.isFinite(n)) return '-';
  if (Math.abs(n) >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
  if (Math.abs(n) >= 1e5) return (n / 1e5).toFixed(2) + ' L';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + ' K';
  return String(n);
};

export default function DeliveryVolumeChartTab({ symbol }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const tradedSeriesRef = useRef(null);
  const deliverySeriesRef = useRef(null);
  const candlesRef = useRef([]);

  const [interval, setInterval] = useState('daily');
  const [rangeId, setRangeId] = useState('1Y');
  const [showCandles, setShowCandles] = useState(true);
  const [showTraded, setShowTraded] = useState(false);
  const [showDelivery, setShowDelivery] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);

  // Build chart on mount
  useEffect(() => {
    let disposed = false;
    let chart;

    (async () => {
      const lib = await import('lightweight-charts');
      if (disposed || !containerRef.current) return;

      const isDark =
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-theme') === 'finance-dark';

      chart = lib.createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { type: 'solid', color: 'transparent' },
          textColor: isDark ? '#cbd5e1' : '#334155',
        },
        grid: {
          vertLines: { color: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)' },
          horzLines: { color: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)' },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.32 } },
        timeScale: { borderVisible: false, rightOffset: 4, fixLeftEdge: true },
        crosshair: { mode: lib.CrosshairMode.Normal },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: VOL_UP,
        downColor: VOL_DOWN,
        borderUpColor: VOL_UP,
        borderDownColor: VOL_DOWN,
        wickUpColor: VOL_UP,
        wickDownColor: VOL_DOWN,
      });

      const tradedSeries = chart.addHistogramSeries({
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const deliverySeries = chart.addHistogramSeries({
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
        lastValueVisible: false,
        priceLineVisible: false,
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.72, bottom: 0 },
        borderVisible: false,
      });

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          setHover(null);
          return;
        }
        const c = candlesRef.current.find((x) => x.time === param.time);
        if (c) setHover(c);
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      tradedSeriesRef.current = tradedSeries;
      deliverySeriesRef.current = deliverySeries;

      candleSeriesRef.current.applyOptions({ visible: showCandles });
      tradedSeriesRef.current.applyOptions({ visible: showTraded });
      deliverySeriesRef.current.applyOptions({ visible: showDelivery });
    })();

    return () => {
      disposed = true;
      if (chart) chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      tradedSeriesRef.current = null;
      deliverySeriesRef.current = null;
    };
  }, []);

  // Fetch + render data
  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const range = RANGES.find((r) => r.id === rangeId) || RANGES[3];
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - range.days);
      const resp = await stockAPI.getDeliveryVolume(symbol, {
        from: fmtDate(from),
        to: fmtDate(to),
        interval,
      });
      const candles = resp.data?.data?.candles || [];
      candlesRef.current = candles;

      if (candleSeriesRef.current) {
        candleSeriesRef.current.setData(
          candles.map((c) => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
      }
      if (tradedSeriesRef.current) {
        tradedSeriesRef.current.setData(
          candles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? VOL_UP_LIGHT : VOL_DOWN_LIGHT,
          }))
        );
      }
      if (deliverySeriesRef.current) {
        deliverySeriesRef.current.setData(
          candles.map((c) => ({
            time: c.time,
            value: c.deliveryVolume,
            color: c.close >= c.open ? VOL_UP : VOL_DOWN,
          }))
        );
      }
      chartRef.current?.timeScale().fitContent();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  }, [symbol, rangeId, interval]);

  useEffect(() => {
    load();
  }, [load]);

  // Toggle visibility without refetching
  useEffect(() => {
    candleSeriesRef.current?.applyOptions({ visible: showCandles });
  }, [showCandles]);
  useEffect(() => {
    tradedSeriesRef.current?.applyOptions({ visible: showTraded });
  }, [showTraded]);
  useEffect(() => {
    deliverySeriesRef.current?.applyOptions({ visible: showDelivery });
  }, [showDelivery]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="join">
          {['daily', 'weekly'].map((v) => (
            <button
              key={v}
              onClick={() => setInterval(v)}
              className={`join-item btn btn-xs ${interval === v ? 'btn-secondary' : 'btn-ghost'}`}
            >
              {v === 'daily' ? '1D' : '1W'}
            </button>
          ))}
        </div>
        <div className="join">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRangeId(r.id)}
              className={`join-item btn btn-xs ${rangeId === r.id ? 'btn-secondary' : 'btn-ghost'}`}
            >
              {r.id}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={showCandles}
              onChange={(e) => setShowCandles(e.target.checked)}
            />
            Candles
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={showTraded}
              onChange={(e) => setShowTraded(e.target.checked)}
            />
            Traded Qty
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={showDelivery}
              onChange={(e) => setShowDelivery(e.target.checked)}
            />
            Delivery Qty
          </label>
        </div>
      </div>

      {hover && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono tabular-nums text-base-content/80">
          <span>{hover.time}</span>
          <span>
            O <b>{hover.open}</b>
          </span>
          <span>
            H <b>{hover.high}</b>
          </span>
          <span>
            L <b>{hover.low}</b>
          </span>
          <span>
            C <b>{hover.close}</b>
          </span>
          <span>
            Vol <b>{fmtNum(hover.volume)}</b>
          </span>
          <span>
            Deliv <b>{fmtNum(hover.deliveryVolume)}</b>
          </span>
          <span>
            Deliv% <b>{hover.deliveryPercent?.toFixed?.(2) ?? '-'}</b>
          </span>
        </div>
      )}

      <div className="relative finance-card p-0 overflow-hidden" style={{ height: 520 }}>
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-base-100/50 text-sm">
            Loading chart…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-error px-6 text-center">
            {error}
          </div>
        )}
      </div>

      <p className="text-2xs text-base-content/50">
        Source: NSE historicalOR. Light bars = total traded qty; solid bars = deliverable qty.
      </p>
    </div>
  );
}
