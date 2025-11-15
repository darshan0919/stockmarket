const mongoose = require("mongoose");

const quarterlyResultSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    company_name: String,

    // Period information
    from_date: { type: Date, required: true },
    to_date: { type: Date, required: true, index: true },
    period: String, // "Q1 2024"
    quarter: Number, // 1-4
    fiscal_year: Number, // 2024

    // Filing information
    filing_date: Date,
    broadcast_date: Date,
    audited: { type: Boolean, default: false },
    consolidated: { type: Boolean, default: false },

    // Financial metrics (in crores INR)
    revenue: Number,
    other_income: Number,
    total_income: Number,

    // Expenses
    cost_of_materials: Number,
    employee_expenses: Number,
    finance_costs: Number, // Interest
    depreciation: Number,
    other_expenses: Number,
    total_expenses: Number,

    // Profitability
    operating_profit: Number,
    profit_before_tax: Number,
    tax_expense: Number,
    net_profit: Number,

    // Ratios
    opm_percent: Number, // Operating Profit Margin %
    tax_percent: Number,

    // Per share
    eps_basic: Number,
    eps_diluted: Number,
    face_value: Number,
    paid_up_capital: Number,

    // Balance Sheet - Liabilities (in crores INR)
    equity_capital: Number,
    reserves: Number,
    other_equity: Number,
    total_equity: Number,
    long_term_borrowings: Number,
    short_term_borrowings: Number,
    borrowings: Number,
    trade_payables: Number,
    other_current_liabilities: Number,
    other_non_current_liabilities: Number,
    other_liabilities: Number,
    provisions: Number,
    deferred_tax_liabilities: Number,
    total_liabilities: Number,

    // Balance Sheet - Assets (in crores INR)
    property_plant_equipment: Number,
    cwip: Number,
    investment_property: Number,
    intangible_assets: Number,
    intangible_assets_under_dev: Number,
    fixed_assets: Number,
    non_current_investments: Number,
    current_investments: Number,
    investments: Number,
    trade_receivables: Number,
    cash_and_equivalents: Number,
    other_bank_balance: Number,
    inventories: Number,
    other_current_assets: Number,
    other_non_current_assets: Number,
    other_assets: Number,
    total_assets: Number,

    // Cash Flows (in crores INR)
    cash_from_operating: Number,
    cash_from_investing: Number,
    cash_from_financing: Number,
    net_cash_flow: Number,

    // Growth (calculated)
    yoy_revenue_growth: Number,
    yoy_profit_growth: Number,
    yoy_eps_growth: Number,
    qoq_revenue_growth: Number,
    qoq_profit_growth: Number,
    qoq_eps_growth: Number,

    // Source tracking
    xbrl_url: String,
    seq_number: String,

    // Cache management
    fetched_at: { type: Date, default: Date.now },
    last_updated: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
quarterlyResultSchema.index({ symbol: 1, to_date: -1 });
quarterlyResultSchema.index({ symbol: 1, fiscal_year: -1, quarter: -1 });

module.exports = mongoose.model("QuarterlyResult", quarterlyResultSchema);

