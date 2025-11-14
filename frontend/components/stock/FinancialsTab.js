import { useState, useEffect } from 'react';
import { stockAPI } from '../../lib/api';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatLargeNumber } from '../../lib/utils/formatters';
import QuarterlyResults from './QuarterlyResults';

export default function FinancialsTab({ symbol }) {
  const [financials, setFinancials] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFinancials = async () => {
      try {
        setLoading(true);
        const response = await stockAPI.getFinancials(symbol, 4);
        if (response.data.success) {
          setFinancials(response.data.data);
        }
      } catch (error) {
        console.error('Error fetching financials:', error);
        // Set empty financials data on error so the page doesn't break
        setFinancials({ p_and_l: [], balance_sheet: [] });
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchFinancials();
    }
  }, [symbol]);

  if (loading) return <LoadingSpinner size="sm" />;

  return (
    <div className="space-y-8">
      {/* Quarterly Results Widget */}
      <div>
        <QuarterlyResults symbol={symbol} />
      </div>

      {/* P&L Statement */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Profit & Loss Statement</h3>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Gross Profit</th>
                <th className="text-right">Operating Profit</th>
                <th className="text-right">EBITDA</th>
                <th className="text-right">Net Profit</th>
              </tr>
            </thead>
            <tbody>
              {financials.p_and_l && financials.p_and_l.length > 0 ? (
                financials.p_and_l.map((item, index) => (
                  <tr key={index}>
                    <td className="font-semibold">{item.period}</td>
                    <td className="text-right">{formatLargeNumber(item.revenue)}</td>
                    <td className="text-right">{formatLargeNumber(item.gross_profit)}</td>
                    <td className="text-right">{formatLargeNumber(item.operating_profit)}</td>
                    <td className="text-right">{formatLargeNumber(item.ebitda)}</td>
                    <td className="text-right">{formatLargeNumber(item.net_profit)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-gray-500">
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Balance Sheet */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Balance Sheet</h3>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th className="text-right">Total Assets</th>
                <th className="text-right">Total Liabilities</th>
                <th className="text-right">Shareholders Equity</th>
                <th className="text-right">Total Debt</th>
                <th className="text-right">Current Assets</th>
                <th className="text-right">Current Liabilities</th>
              </tr>
            </thead>
            <tbody>
              {financials.balance_sheet && financials.balance_sheet.length > 0 ? (
                financials.balance_sheet.map((item, index) => (
                  <tr key={index}>
                    <td className="font-semibold">{item.period}</td>
                    <td className="text-right">{formatLargeNumber(item.total_assets)}</td>
                    <td className="text-right">{formatLargeNumber(item.total_liabilities)}</td>
                    <td className="text-right">{formatLargeNumber(item.shareholders_equity)}</td>
                    <td className="text-right">{formatLargeNumber(item.total_debt)}</td>
                    <td className="text-right">{formatLargeNumber(item.current_assets)}</td>
                    <td className="text-right">{formatLargeNumber(item.current_liabilities)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-gray-500">
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

