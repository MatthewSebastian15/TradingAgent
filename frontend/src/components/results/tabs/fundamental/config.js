import { Activity, BarChart3, Landmark, Percent, Table2, TrendingUp } from 'lucide-react';

export const UNAVAILABLE_CELL = { value: null, display: 'N/A', status: 'unavailable' };
export const CHART_WIDTH = 1040;
export const CHART_HEIGHT = 292;
export const CHART_LEFT = 84;
export const CHART_RIGHT = 78;
export const CHART_TOP = 52;
export const CHART_BOTTOM = 58;
export const CHART_GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
export const CHART_AXIS_COLOR = 'rgba(255, 255, 255, 0.18)';
export const CHART_ZERO_COLOR = '#525252';
export const CHART_SERIES_COLORS = [
  '#f97316',
  '#38bdf8',
  '#22c55e',
  '#a78bfa',
  '#facc15',
  '#fb7185',
];
export const CHART_TOOLTIP_MIN_WIDTH = 204;
export const CHART_TOOLTIP_MAX_WIDTH = 320;
export const CHART_TOOLTIP_HEIGHT = 58;

export function metricLabelsForChart(chart) {
  return [...(chart.metrics || []), ...(chart.barMetrics || []), ...(chart.lineMetrics || [])];
}

export const FUNDAMENTAL_CHART_GROUPS = [
  {
    id: 'income',
    label: 'Income',
    Icon: TrendingUp,
    charts: [
      {
        id: 'income-revenue-ebitda-net-profit',
        title: 'Revenue, EBITDA, Net Profit',
        description: 'Shows top-line revenue, operating profitability proxy, and final profit.',
        type: 'grouped_bar',
        metrics: ['Revenue', 'EBITDA', 'Net Profit'],
      },
      {
        id: 'income-growth',
        title: 'Revenue Growth (%) vs Net Profit Growth (%)',
        description: 'Shows whether profit growth follows revenue growth.',
        type: 'line',
        metrics: ['Revenue Growth (%)', 'Net Profit Growth (%)'],
      },
      {
        id: 'income-margin',
        title: 'EBITDA Margin (%) vs Net Profit Margin (%)',
        description:
          'Shows margin quality before and after non-operating items, taxes, and interest.',
        type: 'line',
        metrics: ['EBITDA Margin (%)', 'Net Profit Margin (%)'],
      },
      {
        id: 'income-eps',
        title: 'EPS',
        description: 'Shows earnings per share trend.',
        type: 'line',
        metrics: ['EPS'],
      },
      {
        id: 'income-gross-profit-cost-revenue',
        title: 'Gross Profit vs Cost of Revenue',
        description: 'Shows core production or service delivery efficiency.',
        type: 'grouped_bar',
        metrics: ['Gross Profit', 'Cost of Revenue'],
      },
      {
        id: 'income-operating-pretax-net-profit',
        title: 'Operating Income / EBIT vs Pretax Income vs Net Profit',
        description: 'Shows profit waterfall from operating level to final net income.',
        type: 'grouped_bar',
        metrics: ['Operating Income / EBIT', 'Pretax Income', 'Net Profit'],
      },
    ],
  },
  {
    id: 'balance_sheet',
    label: 'Balance Sheet',
    Icon: Landmark,
    charts: [
      {
        id: 'balance-bvps',
        title: 'BVPS',
        description: 'Shows book value per share trend.',
        type: 'line',
        metrics: ['BVPS'],
      },
      {
        id: 'balance-net-debt',
        title: 'Net Debt',
        description: 'Shows debt burden after cash position.',
        type: 'bar',
        metrics: ['Net Debt'],
      },
      {
        id: 'balance-cash-equity-ratio',
        title: 'Cash Ratio vs Equity Ratio',
        description: 'Shows liquidity strength and capital structure strength.',
        type: 'line',
        metrics: ['Cash Ratio', 'Equity Ratio'],
      },
      {
        id: 'balance-assets-liabilities-equity',
        title: 'Total Assets vs Total Liabilities vs Total Equity',
        description: 'Shows balance sheet structure and capital base.',
        type: 'grouped_bar',
        metrics: ['Total Assets', 'Total Liabilities', 'Total Equity'],
      },
      {
        id: 'balance-current-working-capital',
        title: 'Current Assets vs Current Liabilities vs Working Capital',
        description: 'Shows short-term liquidity and working capital condition.',
        type: 'grouped_bar',
        metrics: ['Current Assets', 'Current Liabilities', 'Working Capital'],
      },
      {
        id: 'balance-liquidity-debt-ratios',
        title: 'Current Ratio vs Quick Ratio vs Debt Ratio',
        description: 'Shows liquidity ratios and debt pressure.',
        type: 'line',
        metrics: ['Current Ratio', 'Quick Ratio', 'Debt Ratio'],
      },
    ],
  },
  {
    id: 'cash_flow',
    label: 'Cash Flow',
    Icon: Activity,
    charts: [
      {
        id: 'cashflow-free-cash-flow',
        title: 'B. Free Cash Flow',
        description: 'Shows cash available after capital expenditure.',
        type: 'bar',
        metrics: ['Free Cash Flow'],
      },
      {
        id: 'cashflow-cfo-net-income',
        title: 'CFO / Net Income',
        description: 'Shows earnings quality by comparing operating cash flow to reported profit.',
        type: 'line',
        metrics: ['CFO / Net Income'],
      },
      {
        id: 'cashflow-capex-fcf-coverage',
        title: 'Capex Intensity (%) vs FCF Coverage',
        description:
          'Shows how heavy capital expenditure is and whether free cash flow covers key obligations.',
        type: 'line',
        metrics: ['Capex Intensity (%)', 'FCF Coverage'],
      },
      {
        id: 'cashflow-operating-investing-financing',
        title: 'Operating Cash Flow vs Investing Cash Flow vs Financing Cash Flow',
        description: 'Shows where cash comes from and where cash goes.',
        type: 'grouped_bar',
        metrics: ['Operating Cash Flow', 'Investing Cash Flow', 'Financing Cash Flow'],
      },
      {
        id: 'cashflow-capex-fcf',
        title: 'Capital Expenditure vs Free Cash Flow',
        description: 'Shows whether capital expenditure is consuming too much cash generation.',
        type: 'grouped_bar',
        metrics: ['Capital Expenditure', 'Free Cash Flow'],
      },
      {
        id: 'cashflow-fcf-cfo-growth',
        title: 'FCF Margin (%) vs FCF Growth (%) vs CFO Growth (%)',
        description: 'Shows cash flow quality, growth, and conversion trend.',
        type: 'line',
        metrics: ['FCF Margin (%)', 'FCF Growth (%)', 'CFO Growth (%)'],
      },
    ],
  },
  {
    id: 'ratios',
    label: 'Ratios',
    Icon: Percent,
    charts: [
      {
        id: 'ratios-roe',
        title: 'ROE (%)',
        description: 'Shows return generated from shareholder equity.',
        type: 'line',
        metrics: ['ROE (%)'],
      },
      {
        id: 'ratios-leverage-risk',
        title: 'DER vs Debt / EBITDA',
        description:
          'Shows leverage risk from balance sheet and operating cash earnings perspective.',
        type: 'line',
        metrics: ['DER', 'Debt / EBITDA'],
      },
      {
        id: 'ratios-dividend-quality',
        title: 'Dividend Yield (%) vs Payout Ratio (%)',
        description: 'Shows dividend attractiveness and dividend sustainability.',
        type: 'line',
        metrics: ['Dividend Yield (%)', 'Payout Ratio (%)'],
      },
      {
        id: 'ratios-market-cap-enterprise-value',
        title: 'Market Cap vs Enterprise Value',
        description: 'Shows equity value compared with debt-adjusted enterprise value.',
        type: 'grouped_bar',
        metrics: ['Market Cap', 'Enterprise Value'],
      },
      {
        id: 'ratios-return-quality',
        title: 'ROA (%) vs ROIC (%) vs ROE (%)',
        description:
          'Shows return quality across assets, invested capital, and shareholder equity.',
        type: 'line',
        metrics: ['ROA (%)', 'ROIC (%)', 'ROE (%)'],
      },
      {
        id: 'ratios-yield-quality',
        title: 'FCF Yield (%) vs Earnings Yield (%)',
        description: 'Shows valuation quality from both accounting earnings and free cash flow.',
        type: 'line',
        metrics: ['FCF Yield (%)', 'Earnings Yield (%)'],
      },
    ],
  },
];

export const FUNDAMENTAL_GROUPS = FUNDAMENTAL_CHART_GROUPS.map(({ id, label, Icon, charts }) => ({
  id,
  label,
  Icon,
  charts,
  metrics: [...new Set(charts.flatMap(metricLabelsForChart))],
}));

export const FUNDAMENTAL_VIEW_MODES = [
  { id: 'table', label: 'Table', Icon: Table2 },
  { id: 'chart', label: 'Chart', Icon: BarChart3 },
];

export const METRIC_KEY_ALIASES = {
  Revenue: ['revenue'],
  EBITDA: ['ebitda'],
  'Net Profit': ['net_profit'],
  'Revenue Growth (%)': ['revenue_growth'],
  'Net Profit Growth (%)': ['net_profit_growth'],
  'EBITDA Margin (%)': ['ebitda_margin'],
  'Net Profit Margin (%)': ['net_profit_margin'],
  EPS: ['eps'],
  'Gross Profit': ['gross_profit'],
  'Cost of Revenue': ['cost_of_revenue'],
  'Operating Income / EBIT': ['operating_income', 'operating_profit'],
  'Operating Expense': ['operating_expense'],
  'Pretax Income': ['pretax_income'],
  'Income Tax Expense': ['income_tax_expense'],
  'Interest Expense': ['interest_expense'],
  'EBITDA Growth (%)': ['ebitda_growth'],
  'Operating Income Growth (%)': ['operating_income_growth'],
  'Gross Margin (%)': ['gross_margin'],
  'Operating Margin (%)': ['operating_margin'],
  'Tax Rate (%)': ['tax_rate'],
  BVPS: ['bvps'],
  'Net Debt': ['net_debt'],
  'Cash Ratio': ['cash_ratio'],
  'Equity Ratio': ['equity_ratio'],
  'Total Assets': ['total_assets', 'assets'],
  'Total Liabilities': ['total_liabilities'],
  'Total Equity': ['total_equity', 'equity'],
  'Cash & Cash Equivalents': ['cash'],
  'Total Debt': ['total_debt'],
  'Current Assets': ['current_assets'],
  'Current Liabilities': ['current_liabilities'],
  'Working Capital': ['working_capital'],
  'Invested Capital': ['invested_capital'],
  'Net Debt / Equity': ['net_debt_to_equity'],
  'Current Ratio': ['current_ratio'],
  'Quick Ratio': ['quick_ratio'],
  'Debt Ratio': ['debt_ratio'],
  'CFO / Net Income': ['cfo_to_net_income'],
  'Free Cash Flow': ['free_cash_flow'],
  'Capex Intensity (%)': ['capex_intensity_percent'],
  'FCF Coverage': ['fcf_coverage'],
  'Operating Cash Flow': ['operating_cash_flow'],
  'Investing Cash Flow': ['investing_cash_flow'],
  'Financing Cash Flow': ['financing_cash_flow'],
  'Capital Expenditure': ['capital_expenditure', 'capex'],
  'Cash Dividends Paid': ['cash_dividends_paid'],
  'Share Repurchase': ['share_repurchase'],
  'Depreciation & Amortization': ['depreciation_amortization'],
  'Change in Working Capital': ['change_in_working_capital'],
  'Stock Based Compensation': ['stock_based_compensation'],
  'FCF Margin (%)': ['fcf_margin'],
  'FCF Growth (%)': ['fcf_growth'],
  'CFO Growth (%)': ['cfo_growth'],
  'Dividend Coverage by FCF': ['dividend_coverage_by_fcf'],
  'ROE (%)': ['roe'],
  DER: ['der', 'balance_der'],
  'Debt / EBITDA': ['debt_to_ebitda'],
  'Interest Coverage': ['interest_coverage'],
  'Equity Multiplier': ['equity_multiplier'],
  'Dividend Yield (%)': ['dividend_yield', 'dividend_yield_percent'],
  'Payout Ratio (%)': ['payout_ratio', 'payout_ratio_percent'],
  'Market Cap': ['market_cap'],
  'Enterprise Value': ['enterprise_value'],
  'P/E': ['pe'],
  'P/BV': ['pbv'],
  'P/S': ['ps'],
  'EV/EBITDA': ['ev_ebitda'],
  'Price / FCF': ['price_fcf'],
  'EV / Sales': ['ev_sales'],
  'EV / FCF': ['ev_fcf'],
  'PEG Ratio': ['peg_ratio'],
  Beta: ['beta'],
  'Shares Outstanding': ['shares_outstanding'],
  'Float Shares': ['float_shares'],
  'Revenue Per Share': ['revenue_per_share'],
  'Cash Per Share': ['cash_per_share'],
  'ROA (%)': ['roa'],
  'ROIC (%)': ['roic'],
  'FCF Yield (%)': ['fcf_yield'],
  'Earnings Yield (%)': ['earnings_yield'],
  'Asset Turnover': ['asset_turnover'],
};

export const METRIC_LABEL_ALIASES = {
  'Net Profit Margin (%)': ['Net Profit Margin / Profit Margin (%)'],
  'Dividend Yield (%)': ['Dividend Yield'],
  'Payout Ratio (%)': ['Payout Ratio'],
};

export const METRIC_FORMAT_TYPES = {
  Revenue: 'currency_scaled',
  EBITDA: 'currency_scaled',
  'Net Profit': 'currency_scaled',
  'Revenue Growth (%)': 'percent',
  'Net Profit Growth (%)': 'percent',
  'EBITDA Margin (%)': 'percent',
  'Net Profit Margin (%)': 'percent',
  EPS: 'per_share',
  'Gross Profit': 'currency_scaled',
  'Cost of Revenue': 'currency_scaled',
  'Operating Income / EBIT': 'currency_scaled',
  'Operating Expense': 'currency_scaled',
  'Pretax Income': 'currency_scaled',
  'Income Tax Expense': 'currency_scaled',
  'Interest Expense': 'currency_scaled',
  'EBITDA Growth (%)': 'percent',
  'Operating Income Growth (%)': 'percent',
  'Gross Margin (%)': 'percent',
  'Operating Margin (%)': 'percent',
  'Tax Rate (%)': 'percent',
  BVPS: 'per_share',
  'Net Debt': 'currency_scaled',
  'Cash Ratio': 'ratio',
  'Equity Ratio': 'percent',
  'Total Assets': 'currency_scaled',
  'Total Liabilities': 'currency_scaled',
  'Total Equity': 'currency_scaled',
  'Cash & Cash Equivalents': 'currency_scaled',
  'Total Debt': 'currency_scaled',
  'Current Assets': 'currency_scaled',
  'Current Liabilities': 'currency_scaled',
  'Working Capital': 'currency_scaled',
  'Invested Capital': 'currency_scaled',
  'Net Debt / Equity': 'ratio',
  'Current Ratio': 'ratio',
  'Quick Ratio': 'ratio',
  'Debt Ratio': 'ratio',
  'CFO / Net Income': 'ratio',
  'Free Cash Flow': 'currency_scaled',
  'Capex Intensity (%)': 'percent',
  'FCF Coverage': 'ratio',
  'Operating Cash Flow': 'currency_scaled',
  'Investing Cash Flow': 'currency_scaled',
  'Financing Cash Flow': 'currency_scaled',
  'Capital Expenditure': 'currency_scaled',
  'Cash Dividends Paid': 'currency_scaled',
  'Share Repurchase': 'currency_scaled',
  'Depreciation & Amortization': 'currency_scaled',
  'Change in Working Capital': 'currency_scaled',
  'Stock Based Compensation': 'currency_scaled',
  'FCF Margin (%)': 'percent',
  'FCF Growth (%)': 'percent',
  'CFO Growth (%)': 'percent',
  'Dividend Coverage by FCF': 'ratio',
  'ROE (%)': 'percent',
  DER: 'ratio',
  'Debt / EBITDA': 'ratio',
  'Interest Coverage': 'ratio',
  'Equity Multiplier': 'ratio',
  'Dividend Yield (%)': 'percent',
  'Payout Ratio (%)': 'percent',
  'Market Cap': 'currency_scaled',
  'Enterprise Value': 'currency_scaled',
  'P/E': 'ratio',
  'P/BV': 'ratio',
  'P/S': 'ratio',
  'EV/EBITDA': 'ratio',
  'Price / FCF': 'ratio',
  'EV / Sales': 'ratio',
  'EV / FCF': 'ratio',
  'PEG Ratio': 'ratio',
  Beta: 'ratio',
  'Shares Outstanding': 'number',
  'Float Shares': 'number',
  'Revenue Per Share': 'per_share',
  'Cash Per Share': 'per_share',
  'ROA (%)': 'percent',
  'ROIC (%)': 'percent',
  'FCF Yield (%)': 'percent',
  'Earnings Yield (%)': 'percent',
  'Asset Turnover': 'ratio',
};

export const metricGroupRow = (key, label, format = METRIC_FORMAT_TYPES[label]) => ({
  key,
  label,
  format,
});

export const FUNDAMENTAL_TABLE_GROUPS = {
  income: [
    {
      title: 'A. Revenue & Gross Profit',
      metrics: [
        metricGroupRow('revenue', 'Revenue', 'currency_scaled'),
        metricGroupRow('revenue_growth', 'Revenue Growth (%)', 'percent'),
        metricGroupRow('gross_profit', 'Gross Profit', 'currency_scaled'),
        metricGroupRow('cost_of_revenue', 'Cost of Revenue', 'currency_scaled'),
        metricGroupRow('gross_margin', 'Gross Margin (%)', 'percent'),
      ],
    },
    {
      title: 'B. Operating Performance',
      metrics: [
        metricGroupRow('ebitda', 'EBITDA', 'currency_scaled'),
        metricGroupRow('ebitda_growth', 'EBITDA Growth (%)', 'percent'),
        metricGroupRow('ebitda_margin', 'EBITDA Margin (%)', 'percent'),
        metricGroupRow('operating_income', 'Operating Income / EBIT', 'currency_scaled'),
        metricGroupRow('operating_income_growth', 'Operating Income Growth (%)', 'percent'),
        metricGroupRow('operating_margin', 'Operating Margin (%)', 'percent'),
        metricGroupRow('operating_expense', 'Operating Expense', 'currency_scaled'),
      ],
    },
    {
      title: 'C. Profitability',
      metrics: [
        metricGroupRow('net_profit', 'Net Profit', 'currency_scaled'),
        metricGroupRow('net_profit_growth', 'Net Profit Growth (%)', 'percent'),
        metricGroupRow('net_profit_margin', 'Net Profit Margin (%)', 'percent'),
        metricGroupRow('pretax_income', 'Pretax Income', 'currency_scaled'),
        metricGroupRow('income_tax_expense', 'Income Tax Expense', 'currency_scaled'),
        metricGroupRow('tax_rate', 'Tax Rate (%)', 'percent'),
      ],
    },
    {
      title: 'D. Per Share & Financing Cost',
      metrics: [
        metricGroupRow('eps', 'EPS', 'per_share'),
        metricGroupRow('interest_expense', 'Interest Expense', 'currency_scaled'),
      ],
    },
  ],
  balance_sheet: [
    {
      title: 'A. Asset Structure',
      metrics: [
        metricGroupRow('total_assets', 'Total Assets', 'currency_scaled'),
        metricGroupRow('current_assets', 'Current Assets', 'currency_scaled'),
        metricGroupRow('cash', 'Cash & Cash Equivalents', 'currency_scaled'),
      ],
    },
    {
      title: 'B. Liability & Debt',
      metrics: [
        metricGroupRow('total_liabilities', 'Total Liabilities', 'currency_scaled'),
        metricGroupRow('current_liabilities', 'Current Liabilities', 'currency_scaled'),
        metricGroupRow('total_debt', 'Total Debt', 'currency_scaled'),
        metricGroupRow('net_debt', 'Net Debt', 'currency_scaled'),
        metricGroupRow('net_debt_to_equity', 'Net Debt / Equity', 'ratio'),
        metricGroupRow('debt_ratio', 'Debt Ratio', 'ratio'),
      ],
    },
    {
      title: 'C. Equity & Book Value',
      metrics: [
        metricGroupRow('total_equity', 'Total Equity', 'currency_scaled'),
        metricGroupRow('bvps', 'BVPS', 'per_share'),
        metricGroupRow('equity_ratio', 'Equity Ratio', 'percent'),
      ],
    },
    {
      title: 'D. Liquidity',
      metrics: [
        metricGroupRow('cash_ratio', 'Cash Ratio', 'ratio'),
        metricGroupRow('current_ratio', 'Current Ratio', 'ratio'),
        metricGroupRow('quick_ratio', 'Quick Ratio', 'ratio'),
        metricGroupRow('working_capital', 'Working Capital', 'currency_scaled'),
      ],
    },
    {
      title: 'E. Capital Efficiency',
      metrics: [metricGroupRow('invested_capital', 'Invested Capital', 'currency_scaled')],
    },
  ],
  cash_flow: [
    {
      title: 'A. Core Cash Flow',
      metrics: [
        metricGroupRow('operating_cash_flow', 'Operating Cash Flow', 'currency_scaled'),
        metricGroupRow('cfo_to_net_income', 'CFO / Net Income', 'ratio'),
        metricGroupRow('cfo_growth', 'CFO Growth (%)', 'percent'),
      ],
    },
    {
      title: 'B. Free Cash Flow',
      metrics: [
        metricGroupRow('free_cash_flow', 'Free Cash Flow', 'currency_scaled'),
        metricGroupRow('fcf_growth', 'FCF Growth (%)', 'percent'),
        metricGroupRow('fcf_margin', 'FCF Margin (%)', 'percent'),
        metricGroupRow('fcf_coverage', 'FCF Coverage', 'ratio'),
        metricGroupRow('dividend_coverage_by_fcf', 'Dividend Coverage by FCF', 'ratio'),
      ],
    },
    {
      title: 'C. Investment Activity',
      metrics: [
        metricGroupRow('investing_cash_flow', 'Investing Cash Flow', 'currency_scaled'),
        metricGroupRow('capital_expenditure', 'Capital Expenditure', 'currency_scaled'),
        metricGroupRow('capex_intensity_percent', 'Capex Intensity (%)', 'percent'),
      ],
    },
    {
      title: 'D. Financing Activity',
      metrics: [
        metricGroupRow('financing_cash_flow', 'Financing Cash Flow', 'currency_scaled'),
        metricGroupRow('cash_dividends_paid', 'Cash Dividends Paid', 'currency_scaled'),
        metricGroupRow('share_repurchase', 'Share Repurchase', 'currency_scaled'),
      ],
    },
    {
      title: 'E. Non-Cash & Working Capital Adjustment',
      metrics: [
        metricGroupRow(
          'depreciation_amortization',
          'Depreciation & Amortization',
          'currency_scaled'
        ),
        metricGroupRow('change_in_working_capital', 'Change in Working Capital', 'currency_scaled'),
        metricGroupRow('stock_based_compensation', 'Stock Based Compensation', 'currency_scaled'),
      ],
    },
  ],
  ratios: [
    {
      title: 'A. Profitability Ratios',
      metrics: [
        metricGroupRow('roe', 'ROE (%)', 'percent'),
        metricGroupRow('roa', 'ROA (%)', 'percent'),
        metricGroupRow('roic', 'ROIC (%)', 'percent'),
        metricGroupRow('earnings_yield', 'Earnings Yield (%)', 'percent'),
        metricGroupRow('fcf_yield', 'FCF Yield (%)', 'percent'),
      ],
    },
    {
      title: 'B. Leverage & Solvency',
      metrics: [
        metricGroupRow('der', 'DER', 'ratio'),
        metricGroupRow('debt_to_ebitda', 'Debt / EBITDA', 'ratio'),
        metricGroupRow('interest_coverage', 'Interest Coverage', 'ratio'),
        metricGroupRow('equity_multiplier', 'Equity Multiplier', 'ratio'),
      ],
    },
    {
      title: 'C. Valuation Ratios',
      metrics: [
        metricGroupRow('pe', 'P/E', 'ratio'),
        metricGroupRow('pbv', 'P/BV', 'ratio'),
        metricGroupRow('ps', 'P/S', 'ratio'),
        metricGroupRow('ev_ebitda', 'EV/EBITDA', 'ratio'),
        metricGroupRow('price_fcf', 'Price / FCF', 'ratio'),
        metricGroupRow('ev_sales', 'EV / Sales', 'ratio'),
        metricGroupRow('ev_fcf', 'EV / FCF', 'ratio'),
        metricGroupRow('peg_ratio', 'PEG Ratio', 'ratio'),
      ],
    },
    {
      title: 'D. Dividend Ratios',
      metrics: [
        metricGroupRow('dividend_yield', 'Dividend Yield (%)', 'percent'),
        metricGroupRow('payout_ratio', 'Payout Ratio (%)', 'percent'),
      ],
    },
    {
      title: 'E. Market Value',
      metrics: [
        metricGroupRow('market_cap', 'Market Cap', 'currency_scaled'),
        metricGroupRow('enterprise_value', 'Enterprise Value', 'currency_scaled'),
        metricGroupRow('beta', 'Beta', 'ratio'),
      ],
    },
    {
      title: 'F. Share Data',
      metrics: [
        metricGroupRow('shares_outstanding', 'Shares Outstanding', 'number'),
        metricGroupRow('float_shares', 'Float Shares', 'number'),
      ],
    },
    {
      title: 'G. Per Share Metrics',
      metrics: [
        metricGroupRow('revenue_per_share', 'Revenue Per Share', 'per_share'),
        metricGroupRow('cash_per_share', 'Cash Per Share', 'per_share'),
      ],
    },
    {
      title: 'H. Efficiency Ratios',
      metrics: [metricGroupRow('asset_turnover', 'Asset Turnover', 'ratio')],
    },
  ],
};

export const LEGACY_FUNDAMENTAL_SECTIONS = [
  {
    key: 'valuation_multiples',
    title: 'VALUATION MULTIPLES',
    payloadKey: 'valuation_multiples',
    rows: [
      ['market_cap', 'Market Cap', 'currency_scaled'],
      ['enterprise_value', 'Enterprise Value', 'currency_scaled'],
      ['pe', 'P/E', 'ratio'],
      ['pbv', 'P/BV', 'ratio'],
      ['ps', 'P/S', 'ratio'],
      ['ev_ebitda', 'EV/EBITDA', 'ratio'],
    ],
  },
  {
    key: 'quality_of_earnings',
    title: 'QUALITY OF EARNINGS',
    payloadKey: 'quality_of_earnings',
    rows: [
      ['cfo_to_net_income', 'CFO / Net Income', 'ratio'],
      ['free_cash_flow', 'Free Cash Flow', 'currency_scaled'],
      ['capex_intensity_percent', 'Capex Intensity (%)', 'percent'],
    ],
  },
  {
    key: 'balance_sheet_risk',
    title: 'BALANCE SHEET RISK',
    payloadKey: 'balance_sheet_risk',
    rows: [
      ['der', 'DER', 'ratio'],
      ['net_debt', 'Net Debt', 'currency_scaled'],
      ['debt_to_ebitda', 'Debt / EBITDA', 'ratio'],
      ['cash_ratio', 'Cash Ratio', 'ratio'],
      ['equity_ratio', 'Equity Ratio', 'ratio'],
    ],
  },
  {
    key: 'dividend_quality',
    title: 'DIVIDEND QUALITY',
    payloadKey: 'dividend_quality',
    rows: [
      ['dividend_yield_percent', 'Dividend Yield', 'percent'],
      ['payout_ratio_percent', 'Payout Ratio', 'percent'],
      ['fcf_coverage', 'FCF Coverage', 'ratio'],
    ],
  },
];
