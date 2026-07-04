import FinancialResults from './FinancialResults';
import BalanceSheet from './BalanceSheet';
import CashFlows from './CashFlows';

/**
 * Financials tab composing quarterly results, balance sheet, and cash flows
 * @component
 */
export default function FinancialsTab({ symbol }) {
  return (
    <div className="space-y-8">
      <FinancialResults symbol={symbol} />
      <BalanceSheet symbol={symbol} />
      <CashFlows symbol={symbol} />
    </div>
  );
}
