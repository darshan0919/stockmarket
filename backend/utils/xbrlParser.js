const axios = require("axios");
const xml2js = require("xml2js");

/**
 * XBRL field mappings to our schema
 */
const XBRL_FIELD_MAP = {
  // Revenue
  "in-bse-fin:RevenueFromOperations": "revenue",
  "in-bse-fin:OtherIncome": "other_income",
  "in-bse-fin:Income": "total_income",

  // Expenses
  "in-bse-fin:CostOfMaterialsConsumed": "cost_of_materials",
  "in-bse-fin:EmployeeBenefitExpense": "employee_expenses",
  "in-bse-fin:FinanceCosts": "finance_costs",
  "in-bse-fin:DepreciationDepletionAndAmortisationExpense": "depreciation",
  "in-bse-fin:OtherExpenses": "other_expenses",
  "in-bse-fin:Expenses": "total_expenses",

  // Profitability
  "in-bse-fin:ProfitBeforeExceptionalItemsAndTax": "operating_profit",
  "in-bse-fin:ProfitBeforeTax": "profit_before_tax",
  "in-bse-fin:TaxExpense": "tax_expense",
  "in-bse-fin:ProfitLossForPeriod": "net_profit",

  // Per share
  "in-bse-fin:BasicEarningsLossPerShareFromContinuingOperations": "eps_basic",
  "in-bse-fin:DilutedEarningsLossPerShareFromContinuingOperations":
    "eps_diluted",
  "in-bse-fin:FaceValueOfEquityShareCapital": "face_value",
  "in-bse-fin:PaidUpValueOfEquityShareCapital": "paid_up_capital",

  // Metadata
  "in-bse-fin:NameOfTheCompany": "company_name",
  "in-bse-fin:DateOfStartOfReportingPeriod": "from_date",
  "in-bse-fin:DateOfEndOfReportingPeriod": "to_date",
  "in-bse-fin:WhetherResultsAreAuditedOrUnaudited": "audited_status",
  "in-bse-fin:NatureOfReportStandaloneConsolidated": "report_type",
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
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
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
      const cleanField = xbrlField.replace("in-bse-fin:", "");

      if (xbrl[cleanField]) {
        const entries = Array.isArray(xbrl[cleanField])
          ? xbrl[cleanField]
          : [xbrl[cleanField]];

        // Find the quarterly data (context OneD)
        const quarterlyEntry = entries.find(
          (e) =>
            e.$ && (e.$.contextRef === "OneD" || e.$.contextRef === "FourD")
        );

        if (quarterlyEntry) {
          let value = quarterlyEntry._;

          // Convert to number if applicable
          if (typeof value === "string" && !isNaN(value)) {
            value = parseFloat(value);

            // Convert from INR to Crores (divide by 10^7)
            if (quarterlyEntry.$.unitRef === "INR") {
              value = value / 10000000;
            }
          }

          // Handle special cases
          if (ourField === "audited_status") {
            data.audited = value === "Audited";
          } else if (ourField === "report_type") {
            data.consolidated = value === "Consolidated";
          } else {
            data[ourField] = value;
          }
        }
      }
    }

    // Calculate derived fields
    if (data.revenue && data.operating_profit) {
      data.opm_percent = (data.operating_profit / data.revenue) * 100;
    }

    if (data.profit_before_tax && data.tax_expense) {
      data.tax_percent = (data.tax_expense / data.profit_before_tax) * 100;
    }

    return data;
  } catch (error) {
    console.error("XBRL parsing error:", error.message);
    throw new Error(`Failed to parse XBRL: ${error.message}`);
  }
}

/**
 * Extract context periods from XBRL
 */
function extractPeriods(xbrl) {
  const periods = {};

  if (xbrl.context) {
    const contexts = Array.isArray(xbrl.context)
      ? xbrl.context
      : [xbrl.context];

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

