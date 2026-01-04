const axios = require('axios');
const xml2js = require('xml2js');

/**
 * XBRL field mappings to our schema
 */
const XBRL_FIELD_MAP = {
  // Revenue
  'in-bse-fin:RevenueFromOperations': 'revenue',
  'in-bse-fin:GrossPremiumIncome': 'revenue',
  'in-bse-fin:OtherIncome': 'other_income',
  'in-bse-fin:Income': 'total_income',

  // Expenses
  'in-bse-fin:CostOfMaterialsConsumed': 'cost_of_materials',
  'in-bse-fin:EmployeeBenefitExpense': 'employee_expenses',
  'in-bse-fin:FinanceCosts': 'finance_costs',
  'in-bse-fin:DepreciationDepletionAndAmortisationExpense': 'depreciation',
  'in-bse-fin:OtherExpenses': 'other_expenses',
  'in-bse-fin:Expenses': 'total_expenses',

  // Profitability
  'in-bse-fin:ProfitBeforeExceptionalItemsAndTax': 'operating_profit',
  'in-bse-fin:OperatingProfitOrLoss': 'operating_profit_or_loss',
  'in-bse-fin:ProfitLossBeforeTax': 'operating_profit',
  'in-bse-fin:ProfitOrLoss': 'profit_or_loss',
  'in-bse-fin:ProfitBeforeTax': 'profit_before_tax',
  'in-bse-fin:TaxExpense': 'tax_expense',
  'in-bse-fin:ProfitLossForPeriod': 'net_profit',

  // Per share
  'in-bse-fin:BasicEarningsLossPerShareFromContinuingOperations': 'eps_basic',
  'in-bse-fin:DilutedEarningsLossPerShareFromContinuingOperations': 'eps_diluted',
  'in-bse-fin:FaceValueOfEquityShareCapital': 'face_value',
  'in-bse-fin:PaidUpValueOfEquityShareCapital': 'paid_up_capital',

  // Balance Sheet - Liabilities
  'in-bse-fin:EquityShareCapital': 'equity_capital',
  'in-bse-fin:ShareCapital': 'equity_capital',
  'in-bse-fin:ReservesAndSurplus': 'reserves',
  'in-bse-fin:OtherEquity': 'other_equity',
  'in-bse-fin:BorrowingsNoncurrent': 'long_term_borrowings',
  'in-bse-fin:BorrowingsCurrent': 'short_term_borrowings',
  'in-bse-fin:Borrowings': 'borrowings',
  'in-bse-fin:TradePay ables': 'trade_payables',
  'in-bse-fin:OtherCurrentLiabilities': 'other_current_liabilities',
  'in-bse-fin:OtherNonCurrentLiabilities': 'other_non_current_liabilities',
  'in-bse-fin:OtherNoncurrentFinancialLiabilities': 'other_non_curr_financial_liabilities',
  'in-bse-fin:OtherCurrentFinancialLiabilities': 'other_curr_financial_liabilities',
  'in-bse-fin:Provisions': 'provisions',
  'in-bse-fin:DeferredTaxLiabilitiesNet': 'deferred_tax_liabilities',
  'in-bse-fin:TotalEquityAndLiabilities': 'total_liabilities',

  // Balance Sheet - Assets
  'in-bse-fin:PropertyPlantAndEquipment': 'property_plant_equipment',
  'in-bse-fin:CapitalWorkInProgress': 'cwip',
  'in-bse-fin:InvestmentProperty': 'investment_property',
  'in-bse-fin:IntangibleAssets': 'intangible_assets',
  'in-bse-fin:IntangibleAssetsUnderDevelopment': 'intangible_assets_under_dev',
  'in-bse-fin:NonCurrentInvestments': 'non_current_investments',
  'in-bse-fin:CurrentInvestments': 'current_investments',
  'in-bse-fin:Investments': 'investments',
  'in-bse-fin:TradeReceivables': 'trade_receivables',
  'in-bse-fin:CashAndCashEquivalents': 'cash_and_equivalents',
  'in-bse-fin:BankBalanceOtherThanCashAndCashEquivalents': 'other_bank_balance',
  'in-bse-fin:Inventories': 'inventories',
  'in-bse-fin:OtherCurrentAssets': 'other_current_assets',
  'in-bse-fin:OtherNonCurrentAssets': 'other_non_current_assets',
  'in-bse-fin:TotalAssets': 'total_assets',

  // Cash Flows (NSE format in-capmkt namespace)
  'in-capmkt:CashFlowsFromUsedInOperatingActivities': 'cash_from_operating',
  'in-bse-fin:CashFlowFromOperatingActivities': 'cash_from_operating',
  'in-bse-fin:NetCashFlowFromUsedInOperatingActivities': 'cash_from_operating',
  'in-capmkt:CashFlowsFromUsedInInvestingActivities': 'cash_from_investing',
  'in-bse-fin:CashFlowFromInvestingActivities': 'cash_from_investing',
  'in-bse-fin:NetCashFlowFromUsedInInvestingActivities': 'cash_from_investing',
  'in-capmkt:CashFlowsFromUsedInFinancingActivities': 'cash_from_financing',
  'in-bse-fin:CashFlowFromFinancingActivities': 'cash_from_financing',
  'in-bse-fin:NetCashFlowFromUsedInFinancingActivities': 'cash_from_financing',
  'in-capmkt:IncreaseDecreaseInCashAndCashEquivalents': 'net_cash_flow',
  'in-bse-fin:NetIncreaseDecreaseInCashAndCashEquivalents': 'net_cash_flow',

  // Metadata
  'in-bse-fin:NameOfTheCompany': 'company_name',
  'in-bse-fin:DateOfStartOfReportingPeriod': 'from_date',
  'in-bse-fin:DateOfEndOfReportingPeriod': 'to_date',
  'in-bse-fin:WhetherResultsAreAuditedOrUnaudited': 'audited_status',
  'in-bse-fin:NatureOfReportStandaloneConsolidated': 'report_type',
};

/**
 * Parse XBRL XML document
 * @param {string} xbrlUrl - URL to XBRL XML file
 * @returns {Promise<Object>} Parsed financial data
 */
async function parseXBRL(xbrlUrl) {
  try {
    console.log(`Fetching XBRL from: ${xbrlUrl}`);

    const response = await axios.get(xbrlUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    // Parse XML to JSON
    const parser = new xml2js.Parser({
      explicitArray: false,
      tagNameProcessors: [xml2js.processors.stripPrefix],
    });

    const result = await parser.parseStringPromise(response.data);
    const xbrl = result.xbrl;

    // Extract data based on context (OneD for quarterly)
    const data = {};

    // Find fields and extract values
    for (const [xbrlField, ourField] of Object.entries(XBRL_FIELD_MAP)) {
      const cleanField = xbrlField.replace('in-bse-fin:', '').replace('in-capmkt:', '');

      if (xbrl[cleanField]) {
        const entries = Array.isArray(xbrl[cleanField]) ? xbrl[cleanField] : [xbrl[cleanField]];

        // Find the quarterly data
        // P&L/Cash Flow: context OneD or FourD (duration)
        // Balance Sheet: context AsOf_EndOfReportingPeriod or similar (instant)
        let quarterlyEntry = entries.find(
          (e) =>
            e.$ &&
<<<<<<< Updated upstream
            (e.$.contextRef === 'OneD' ||
              e.$.contextRef === 'OneI' ||
              e.$.contextRef?.includes('AsOf') ||
              e.$.contextRef?.includes('EndOfReportingPeriod'))
=======
            (e.$.contextRef === "OneD")
>>>>>>> Stashed changes
        );

        if (!quarterlyEntry) {
          quarterlyEntry = entries.find(
            (e) =>
<<<<<<< Updated upstream
              (e.$ && e.$.contextRef === 'FourD') ||
              e.$.contextRef === 'Current' ||
              e.$.contextRef === 'I_Current'
          );
=======
              e.$ &&
              (e.$.contextRef === "FourD") ||
              e.$.contextRef === "Current" ||
              e.$.contextRef === "I_Current" ||
              e.$.contextRef === "OneI" ||
              e.$.contextRef?.includes("AsOf") ||
              e.$.contextRef?.includes("EndOfReportingPeriod"))
>>>>>>> Stashed changes
        }

        if (quarterlyEntry) {
          let value = quarterlyEntry._;

          // Convert to number if applicable
          if (typeof value === 'string' && !isNaN(value)) {
            value = parseFloat(value);

            // Convert from INR to Crores (divide by 10^7)
            if (quarterlyEntry.$.unitRef === 'INR') {
              value = value / 10000000;
            }
          }

          // Handle special cases
          if (ourField === 'audited_status') {
            data.audited = value === 'Audited';
          } else if (ourField === 'report_type') {
            data.consolidated = value === 'Consolidated';
          } else {
            data[ourField] = value;
          }
        }
      }
    }

    if (!data.operating_profit && data.operating_profit_or_loss) {
      data.operating_profit = data.operating_profit_or_loss;
    }

    // Calculate derived fields
    if (data.revenue && data.operating_profit) {
      data.opm_percent = (data.operating_profit / data.revenue) * 100;
    }

    if (data.profit_before_tax && data.tax_expense) {
      data.tax_percent = (data.tax_expense / data.profit_before_tax) * 100;
    }

    // Calculate aggregate balance sheet fields if not provided
    // Fixed Assets = PPE + CWIP + Investment Property + Intangible Assets
    if (!data.fixed_assets) {
      data.fixed_assets =
        (data.property_plant_equipment || 0) +
        (data.cwip || 0) +
        (data.investment_property || 0) +
        (data.intangible_assets || 0) +
        (data.intangible_assets_under_dev || 0);
    }

    // Total Borrowings = Long Term + Short Term
    if (!data.borrowings && (data.long_term_borrowings || data.short_term_borrowings)) {
      data.borrowings = (data.long_term_borrowings || 0) + (data.short_term_borrowings || 0);
    }

    // Total Investments = Non-Current + Current
    if (!data.investments && (data.non_current_investments || data.current_investments)) {
      data.investments = (data.non_current_investments || 0) + (data.current_investments || 0);
    }

    // Other Liabilities = Trade Payables + Other Current/Non-Current Liabilities + Provisions
    if (!data.other_liabilities) {
      data.other_liabilities =
        (data.trade_payables || 0) +
        (data.other_current_liabilities || 0) +
        (data.other_non_current_liabilities || 0) +
        (data.provisions || 0) +
        (data.deferred_tax_liabilities || 0);
    }

    // Other Assets = Trade Receivables + Cash + Inventories + Other Assets
    if (!data.other_assets) {
      data.other_assets =
        (data.trade_receivables || 0) +
        (data.cash_and_equivalents || 0) +
        (data.other_bank_balance || 0) +
        (data.inventories || 0) +
        (data.other_current_assets || 0) +
        (data.other_non_current_assets || 0);
    }

    // Ensure total equity includes reserves
    if (data.equity_capital && data.reserves && !data.total_equity) {
      data.total_equity = data.equity_capital + data.reserves + (data.other_equity || 0);
    }

    return data;
  } catch (error) {
    console.error('XBRL parsing error:', error);
    throw new Error(`Failed to parse XBRL: ${error}`);
  }
}

/**
 * Extract context periods from XBRL
 */
function extractPeriods(xbrl) {
  const periods = {};

  if (xbrl.context) {
    const contexts = Array.isArray(xbrl.context) ? xbrl.context : [xbrl.context];

    contexts.forEach((ctx) => {
      if (ctx.$ && ctx.$.id && ctx.period) {
        periods[ctx.$.id] = {
          start: ctx.period.startDate,
          end: ctx.period.endDate || ctx.period.instant,
        };
      }
    });
  }

  return periods;
}

module.exports = {
  parseXBRL,
  extractPeriods,
  XBRL_FIELD_MAP,
};
