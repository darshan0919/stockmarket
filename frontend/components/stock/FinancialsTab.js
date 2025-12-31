import FinancialResults from './FinancialResults';
import BalanceSheet from './BalanceSheet';
import CashFlows from './CashFlows';

export default function FinancialsTab({ symbol }) {
  return (
    <div className="space-y-8">
      {/* Financial Results Widget (Quarterly/Yearly) */}
      <div>
        <FinancialResults symbol={symbol} />
      </div>

      {/* Balance Sheet Widget */}
      <div>
        <BalanceSheet symbol={symbol} />
      </div>

      {/* Cash Flows Widget */}
      <div>
        <CashFlows symbol={symbol} />
      </div>
    </div>
  );
}
