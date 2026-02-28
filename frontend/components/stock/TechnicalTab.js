import { useState, useEffect } from 'react';
import { stockAPI } from '../../lib/api';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatCurrency, formatNumber } from '../../lib/utils/formatters';

export default function TechnicalTab({ symbol }) {
  const [technicals, setTechnicals] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTechnicals = async () => {
      try {
        setLoading(true);
        const response = await stockAPI.getTechnicals(symbol);
        if (response.data.success) {
          setTechnicals(response.data.data);
        }
      } catch (error) {
        console.error('Error fetching technicals:', error);
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchTechnicals();
    }
  }, [symbol]);

  if (loading) return <LoadingSpinner size="sm" />;
  if (!technicals)
    return <div className="text-center py-8 opacity-50">No technical data available</div>;

  const getRSISignal = (rsi) => {
    if (!rsi) return { text: 'N/A', color: 'opacity-60' };
    if (rsi >= 70) return { text: 'Overbought', color: 'text-error' };
    if (rsi <= 30) return { text: 'Oversold', color: 'text-success' };
    return { text: 'Neutral', color: 'opacity-60' };
  };

  const getMACDSignal = (macd) => {
    if (!macd || macd.macd === null || macd.signal === null)
      return { text: 'N/A', color: 'opacity-60' };
    if (macd.macd > macd.signal) return { text: 'Bullish', color: 'text-success' };
    if (macd.macd < macd.signal) return { text: 'Bearish', color: 'text-error' };
    return { text: 'Neutral', color: 'opacity-60' };
  };

  const rsiSignal = getRSISignal(technicals.rsi_14);
  const macdSignal = getMACDSignal(technicals.macd);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Technical Indicators</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="finance-stat">
          <div className="text-2xs text-base-content/40 uppercase tracking-wider">Current Price</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">{formatCurrency(technicals.current_price)}</div>
        </div>

        <div className="finance-stat">
          <div className="text-2xs text-base-content/40 uppercase tracking-wider">SMA 50</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">{formatCurrency(technicals.sma_50)}</div>
          <div className="text-2xs text-base-content/40 mt-1">50-day Simple Moving Average</div>
        </div>

        <div className="finance-stat">
          <div className="text-2xs text-base-content/40 uppercase tracking-wider">SMA 200</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">{formatCurrency(technicals.sma_200)}</div>
          <div className="text-2xs text-base-content/40 mt-1">200-day Simple Moving Average</div>
        </div>

        <div className="finance-stat">
          <div className="text-2xs text-base-content/40 uppercase tracking-wider">RSI (14)</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">{formatNumber(technicals.rsi_14)}</div>
          <div className={`text-sm font-semibold mt-1 ${rsiSignal.color}`}>{rsiSignal.text}</div>
          <div className="text-2xs text-base-content/40 mt-1">Relative Strength Index</div>
        </div>

        <div className="finance-stat md:col-span-2">
          <div className="text-2xs text-base-content/40 uppercase tracking-wider mb-3">
            MACD (Moving Average Convergence Divergence)
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xs text-base-content/40 mb-1">MACD Line</div>
              <div className="text-xl font-bold font-mono tabular-nums">{formatNumber(technicals.macd?.macd)}</div>
            </div>
            <div>
              <div className="text-2xs text-base-content/40 mb-1">Signal Line</div>
              <div className="text-xl font-bold font-mono tabular-nums">{formatNumber(technicals.macd?.signal)}</div>
            </div>
            <div>
              <div className="text-2xs text-base-content/40 mb-1">Histogram</div>
              <div className="text-xl font-bold font-mono tabular-nums">{formatNumber(technicals.macd?.histogram)}</div>
            </div>
          </div>
          <div className={`text-sm font-semibold mt-3 ${macdSignal.color}`}>
            Signal: {macdSignal.text}
          </div>
        </div>
      </div>

      <div className="mt-6 finance-stat">
        <h4 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">Interpretation Guide</h4>
        <ul className="text-sm text-base-content/70 space-y-1.5">
          <li>
            • <strong>RSI &gt; 70:</strong> Overbought (potential sell signal)
          </li>
          <li>
            • <strong>RSI &lt; 30:</strong> Oversold (potential buy signal)
          </li>
          <li>
            • <strong>MACD above Signal:</strong> Bullish momentum
          </li>
          <li>
            • <strong>MACD below Signal:</strong> Bearish momentum
          </li>
          <li>
            • <strong>Price above SMA:</strong> Uptrend
          </li>
          <li>
            • <strong>Price below SMA:</strong> Downtrend
          </li>
        </ul>
      </div>
    </div>
  );
}
