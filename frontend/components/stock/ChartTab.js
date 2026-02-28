import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatChartDate, formatCurrency } from '../../lib/utils/formatters';

/**
 * Price chart tab with SMA overlays using Recharts
 * @component
 */
export default function ChartTab({ priceHistory }) {
  if (!priceHistory || priceHistory.length === 0) {
    return <div className="text-center py-8 text-base-content/50">No price history available</div>;
  }

  const calculateSMA = (data, period) => {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const sum = slice.reduce((acc, val) => acc + val.close, 0);
        result.push(sum / period);
      }
    }
    return result;
  };

  const sma50 = calculateSMA(priceHistory, 50);
  const sma200 = calculateSMA(priceHistory, 200);

  const chartData = priceHistory.map((item, index) => ({
    date: formatChartDate(item.date),
    fullDate: new Date(item.date).toLocaleDateString('en-IN'),
    close: item.close,
    sma50: sma50[index],
    sma200: sma200[index],
  }));

  const sampleRate = Math.ceil(chartData.length / 250);
  const sampledData = chartData.filter((_, index) => index % sampleRate === 0);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-base-100 p-3 border border-base-300 rounded-box shadow-lg">
          <p className="text-sm opacity-60 mb-1">{payload[0].payload.fullDate}</p>
          <p className="text-sm font-semibold">Close: {formatCurrency(payload[0].value)}</p>
          {payload[1]?.value && (
            <p className="text-sm text-success">SMA 50: {formatCurrency(payload[1].value)}</p>
          )}
          {payload[2]?.value && (
            <p className="text-sm text-warning">SMA 200: {formatCurrency(payload[2].value)}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Price Chart (5 Years)</h3>
      <div className="bg-base-200/30 rounded-box p-4">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={sampledData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
            <XAxis
              dataKey="date"
              stroke="rgba(128,128,128,0.5)"
              style={{ fontSize: '12px' }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="rgba(128,128,128,0.5)"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `₹${value.toFixed(0)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="close"
              name="Close Price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="sma50"
              name="SMA 50"
              stroke="#10b981"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="5 5"
            />
            <Line
              type="monotone"
              dataKey="sma200"
              name="SMA 200"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 text-sm opacity-60">
        <p>Blue line: Closing price</p>
        <p>Green dashed: 50-day SMA</p>
        <p>Orange dashed: 200-day SMA</p>
      </div>
    </div>
  );
}
