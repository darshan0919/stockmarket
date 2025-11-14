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
  if (!technicals) return <div className="text-center py-8 text-gray-500">No technical data available</div>;

  const getRSISignal = (rsi) => {
    if (!rsi) return { text: 'N/A', color: 'text-gray-600' };
    if (rsi >= 70) return { text: 'Overbought', color: 'text-red-600' };
    if (rsi <= 30) return { text: 'Oversold', color: 'text-green-600' };
    return { text: 'Neutral', color: 'text-gray-600' };
  };

  const getMACDSignal = (macd) => {
    if (!macd || macd.macd === null || macd.signal === null) return { text: 'N/A', color: 'text-gray-600' };
    if (macd.macd > macd.signal) return { text: 'Bullish', color: 'text-green-600' };
    if (macd.macd < macd.signal) return { text: 'Bearish', color: 'text-red-600' };
    return { text: 'Neutral', color: 'text-gray-600' };
  };

  const rsiSignal = getRSISignal(technicals.rsi_14);
  const macdSignal = getMACDSignal(technicals.macd);

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Technical Indicators</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Price */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="text-sm text-gray-600 mb-2">Current Price</div>
          <div className="text-3xl font-bold text-gray-900">
            {formatCurrency(technicals.current_price)}
          </div>
        </div>

        {/* SMA 50 */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="text-sm text-gray-600 mb-2">SMA 50</div>
          <div className="text-3xl font-bold text-gray-900">
            {formatCurrency(technicals.sma_50)}
          </div>
          <div className="text-xs text-gray-500 mt-1">50-day Simple Moving Average</div>
        </div>

        {/* SMA 200 */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="text-sm text-gray-600 mb-2">SMA 200</div>
          <div className="text-3xl font-bold text-gray-900">
            {formatCurrency(technicals.sma_200)}
          </div>
          <div className="text-xs text-gray-500 mt-1">200-day Simple Moving Average</div>
        </div>

        {/* RSI */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="text-sm text-gray-600 mb-2">RSI (14)</div>
          <div className="text-3xl font-bold text-gray-900">
            {formatNumber(technicals.rsi_14)}
          </div>
          <div className={`text-sm font-semibold mt-1 ${rsiSignal.color}`}>
            {rsiSignal.text}
          </div>
          <div className="text-xs text-gray-500 mt-1">Relative Strength Index</div>
        </div>

        {/* MACD */}
        <div className="border border-gray-200 rounded-lg p-6 md:col-span-2">
          <div className="text-sm text-gray-600 mb-3">MACD (Moving Average Convergence Divergence)</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">MACD Line</div>
              <div className="text-xl font-bold text-gray-900">
                {formatNumber(technicals.macd?.macd)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Signal Line</div>
              <div className="text-xl font-bold text-gray-900">
                {formatNumber(technicals.macd?.signal)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Histogram</div>
              <div className="text-xl font-bold text-gray-900">
                {formatNumber(technicals.macd?.histogram)}
              </div>
            </div>
          </div>
          <div className={`text-sm font-semibold mt-3 ${macdSignal.color}`}>
            Signal: {macdSignal.text}
          </div>
        </div>
      </div>

      {/* Interpretation Guide */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">Interpretation Guide</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>RSI &gt; 70:</strong> Overbought (potential sell signal)</li>
          <li>• <strong>RSI &lt; 30:</strong> Oversold (potential buy signal)</li>
          <li>• <strong>MACD above Signal:</strong> Bullish momentum</li>
          <li>• <strong>MACD below Signal:</strong> Bearish momentum</li>
          <li>• <strong>Price above SMA:</strong> Uptrend</li>
          <li>• <strong>Price below SMA:</strong> Downtrend</li>
        </ul>
      </div>
    </div>
  );
}

