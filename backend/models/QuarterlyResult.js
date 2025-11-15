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

    // Growth (calculated)
    yoy_revenue_growth: Number,
    yoy_profit_growth: Number,
    qoq_revenue_growth: Number,
    qoq_profit_growth: Number,

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

