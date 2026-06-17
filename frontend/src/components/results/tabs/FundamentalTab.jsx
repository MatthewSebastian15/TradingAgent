import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Activity, BarChart3, Landmark, Percent, Table2, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import FinancialHighlightsTable from '../FinancialHighlightsTable';
import SectionHeader from '../SectionHeader';

const UNAVAILABLE_CELL = { value: null, display: 'N/A', status: 'unavailable' };
const CHART_WIDTH = 1040;
const CHART_HEIGHT = 292;
const CHART_LEFT = 84;
const CHART_RIGHT = 78;
const CHART_TOP = 52;
const CHART_BOTTOM = 58;
const CHART_GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const CHART_AXIS_COLOR = 'rgba(255, 255, 255, 0.18)';
const CHART_ZERO_COLOR = '#525252';
const CHART_SERIES_COLORS = ['#f97316', '#38bdf8', '#22c55e', '#a78bfa', '#facc15', '#fb7185'];
const CHART_TOOLTIP_MIN_WIDTH = 204;
const CHART_TOOLTIP_MAX_WIDTH = 320;
const CHART_TOOLTIP_HEIGHT = 58;

function metricLabelsForChart(chart) {
  return [...(chart.metrics || []), ...(chart.barMetrics || []), ...(chart.lineMetrics || [])];
}

const FUNDAMENTAL_CHART_GROUPS = [
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
        description: 'Shows margin quality before and after non-operating items, taxes, and interest.',
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
        title: 'Free Cash Flow',
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
        description: 'Shows how heavy capital expenditure is and whether free cash flow covers key obligations.',
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
        description: 'Shows leverage risk from balance sheet and operating cash earnings perspective.',
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
        description: 'Shows return quality across assets, invested capital, and shareholder equity.',
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

const FUNDAMENTAL_GROUPS = FUNDAMENTAL_CHART_GROUPS.map(({ id, label, Icon, charts }) => ({
  id,
  label,
  Icon,
  charts,
  metrics: [...new Set(charts.flatMap(metricLabelsForChart))],
}));

const FUNDAMENTAL_VIEW_MODES = [
  { id: 'table', label: 'Table', Icon: Table2 },
  { id: 'chart', label: 'Chart', Icon: BarChart3 },
];

const METRIC_KEY_ALIASES = {
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

const METRIC_LABEL_ALIASES = {
  'Net Profit Margin (%)': ['Net Profit Margin / Profit Margin (%)'],
  'Dividend Yield (%)': ['Dividend Yield'],
  'Payout Ratio (%)': ['Payout Ratio'],
};

const METRIC_FORMAT_TYPES = {
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


const metricGroupRow = (key, label, format = METRIC_FORMAT_TYPES[label]) => ({ key, label, format });

const FUNDAMENTAL_TABLE_GROUPS = {
  income: [
    {
      title: 'Revenue & Gross Profit',
      metrics: [
        metricGroupRow('revenue', 'Revenue', 'currency_scaled'),
        metricGroupRow('revenue_growth', 'Revenue Growth (%)', 'percent'),
        metricGroupRow('gross_profit', 'Gross Profit', 'currency_scaled'),
        metricGroupRow('cost_of_revenue', 'Cost of Revenue', 'currency_scaled'),
        metricGroupRow('gross_margin', 'Gross Margin (%)', 'percent'),
      ],
    },
    {
      title: 'Operating Performance',
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
      title: 'Profitability',
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
      title: 'Per Share & Financing Cost',
      metrics: [
        metricGroupRow('eps', 'EPS', 'per_share'),
        metricGroupRow('interest_expense', 'Interest Expense', 'currency_scaled'),
      ],
    },
  ],
  balance_sheet: [
    {
      title: 'Asset Structure',
      metrics: [
        metricGroupRow('total_assets', 'Total Assets', 'currency_scaled'),
        metricGroupRow('current_assets', 'Current Assets', 'currency_scaled'),
        metricGroupRow('cash', 'Cash & Cash Equivalents', 'currency_scaled'),
      ],
    },
    {
      title: 'Liability & Debt',
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
      title: 'Equity & Book Value',
      metrics: [
        metricGroupRow('total_equity', 'Total Equity', 'currency_scaled'),
        metricGroupRow('bvps', 'BVPS', 'per_share'),
        metricGroupRow('equity_ratio', 'Equity Ratio', 'percent'),
      ],
    },
    {
      title: 'Liquidity',
      metrics: [
        metricGroupRow('cash_ratio', 'Cash Ratio', 'ratio'),
        metricGroupRow('current_ratio', 'Current Ratio', 'ratio'),
        metricGroupRow('quick_ratio', 'Quick Ratio', 'ratio'),
        metricGroupRow('working_capital', 'Working Capital', 'currency_scaled'),
      ],
    },
    {
      title: 'Capital Efficiency',
      metrics: [metricGroupRow('invested_capital', 'Invested Capital', 'currency_scaled')],
    },
  ],
  cash_flow: [
    {
      title: 'Core Cash Flow',
      metrics: [
        metricGroupRow('operating_cash_flow', 'Operating Cash Flow', 'currency_scaled'),
        metricGroupRow('cfo_to_net_income', 'CFO / Net Income', 'ratio'),
        metricGroupRow('cfo_growth', 'CFO Growth (%)', 'percent'),
      ],
    },
    {
      title: 'Free Cash Flow',
      metrics: [
        metricGroupRow('free_cash_flow', 'Free Cash Flow', 'currency_scaled'),
        metricGroupRow('fcf_growth', 'FCF Growth (%)', 'percent'),
        metricGroupRow('fcf_margin', 'FCF Margin (%)', 'percent'),
        metricGroupRow('fcf_coverage', 'FCF Coverage', 'ratio'),
        metricGroupRow('dividend_coverage_by_fcf', 'Dividend Coverage by FCF', 'ratio'),
      ],
    },
    {
      title: 'Investment Activity',
      metrics: [
        metricGroupRow('investing_cash_flow', 'Investing Cash Flow', 'currency_scaled'),
        metricGroupRow('capital_expenditure', 'Capital Expenditure', 'currency_scaled'),
        metricGroupRow('capex_intensity_percent', 'Capex Intensity (%)', 'percent'),
      ],
    },
    {
      title: 'Financing Activity',
      metrics: [
        metricGroupRow('financing_cash_flow', 'Financing Cash Flow', 'currency_scaled'),
        metricGroupRow('cash_dividends_paid', 'Cash Dividends Paid', 'currency_scaled'),
        metricGroupRow('share_repurchase', 'Share Repurchase', 'currency_scaled'),
      ],
    },
    {
      title: 'Non-Cash & Working Capital Adjustment',
      metrics: [
        metricGroupRow('depreciation_amortization', 'Depreciation & Amortization', 'currency_scaled'),
        metricGroupRow('change_in_working_capital', 'Change in Working Capital', 'currency_scaled'),
        metricGroupRow('stock_based_compensation', 'Stock Based Compensation', 'currency_scaled'),
      ],
    },
  ],
  ratios: [
    {
      title: 'Profitability Ratios',
      metrics: [
        metricGroupRow('roe', 'ROE (%)', 'percent'),
        metricGroupRow('roa', 'ROA (%)', 'percent'),
        metricGroupRow('roic', 'ROIC (%)', 'percent'),
        metricGroupRow('earnings_yield', 'Earnings Yield (%)', 'percent'),
        metricGroupRow('fcf_yield', 'FCF Yield (%)', 'percent'),
      ],
    },
    {
      title: 'Leverage & Solvency',
      metrics: [
        metricGroupRow('der', 'DER', 'ratio'),
        metricGroupRow('debt_to_ebitda', 'Debt / EBITDA', 'ratio'),
        metricGroupRow('interest_coverage', 'Interest Coverage', 'ratio'),
        metricGroupRow('equity_multiplier', 'Equity Multiplier', 'ratio'),
      ],
    },
    {
      title: 'Valuation Ratios',
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
      title: 'Dividend Ratios',
      metrics: [
        metricGroupRow('dividend_yield', 'Dividend Yield (%)', 'percent'),
        metricGroupRow('payout_ratio', 'Payout Ratio (%)', 'percent'),
      ],
    },
    {
      title: 'Market Value',
      metrics: [
        metricGroupRow('market_cap', 'Market Cap', 'currency_scaled'),
        metricGroupRow('enterprise_value', 'Enterprise Value', 'currency_scaled'),
        metricGroupRow('beta', 'Beta', 'ratio'),
      ],
    },
    {
      title: 'Share Data',
      metrics: [
        metricGroupRow('shares_outstanding', 'Shares Outstanding', 'number'),
        metricGroupRow('float_shares', 'Float Shares', 'number'),
      ],
    },
    {
      title: 'Per Share Metrics',
      metrics: [
        metricGroupRow('revenue_per_share', 'Revenue Per Share', 'per_share'),
        metricGroupRow('cash_per_share', 'Cash Per Share', 'per_share'),
      ],
    },
    {
      title: 'Efficiency Ratios',
      metrics: [metricGroupRow('asset_turnover', 'Asset Turnover', 'ratio')],
    },
  ],
};

const LEGACY_FUNDAMENTAL_SECTIONS = [
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

function unitForFormat(formatType, financialHighlights) {
  if (formatType === 'currency_scaled') {
    return financialHighlights?.scale_label || financialHighlights?.currency || '';
  }
  if (formatType === 'percent') return '%';
  if (formatType === 'ratio') return 'x';
  if (formatType === 'per_share') return `${financialHighlights?.currency || ''}/share`;
  if (formatType === 'number') return '';
  return '';
}

function expandYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  if (year < 100) return year < 50 ? 2000 + year : 1900 + year;
  return year;
}

function displayPeriodLabel(period) {
  const raw = String(period?.display_period || period?.label || period?.period || '').trim();
  let match = raw.match(/^FY\s?(\d{2}|\d{4})$/i);
  if (match) {
    const year = expandYear(match[1]);
    return year ? `FY ${year}` : '-';
  }

  match = raw.match(/^FY\s?(\d{2}|\d{4})Q([1-4])$/i) || raw.match(/^Q([1-4])\s?(\d{2}|\d{4})$/i);
  if (match) {
    const quarter = match[0].toUpperCase().startsWith('FY') ? match[2] : match[1];
    const year = expandYear(match[0].toUpperCase().startsWith('FY') ? match[1] : match[2]);
    return year ? `Q${quarter} ${year}` : '-';
  }

  return raw || '-';
}

function periodSortValue(period) {
  if (period?.sort_key) return String(period.sort_key);
  const label = displayPeriodLabel(period);
  const annual = label.match(/^FY\s(\d{4})$/i);
  if (annual) return `${annual[1]}1231`;
  const quarterLabel = label.match(/^Q([1-4])\s(\d{4})$/i);
  if (quarterLabel)
    return `${quarterLabel[2]}${String(Number(quarterLabel[1]) * 3).padStart(2, '0')}31`;
  const year = Number(period?.year || period?.fiscal_year || 0);
  const quarter = Number(period?.quarter || period?.fiscal_quarter || 0);
  return `${String(year).padStart(4, '0')}${String(quarter).padStart(2, '0')}`;
}

function sortPeriodsForChart(periods) {
  return [...periods].sort((left, right) =>
    periodSortValue(left).localeCompare(periodSortValue(right))
  );
}

function normalizeMetric(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function metricLabelCandidates(metricLabel) {
  return [metricLabel, ...(METRIC_LABEL_ALIASES[metricLabel] || [])].map(normalizeMetric);
}

function flattenFinancialRows(financialHighlights) {
  const sectionRows = Array.isArray(financialHighlights?.sections)
    ? financialHighlights.sections.flatMap((section) => section?.rows || [])
    : [];
  const rows = Array.isArray(financialHighlights?.rows) ? financialHighlights.rows : [];
  return [...sectionRows, ...rows].filter(Boolean);
}

function isUnavailableValue(value) {
  if (value === null || value === undefined || value === '') return true;
  return ['n/a', 'na', 'source unavailable', 'none', 'null', '-'].includes(
    String(value).trim().toLowerCase()
  );
}

function cellHasValue(cell) {
  if (!cell || cell.status === 'unavailable') return false;
  return !isUnavailableValue(cell.display ?? cell.value);
}

function parseDisplayNumber(value) {
  const match = String(value || '')
    .replace(/,/g, '')
    .match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function chartCellValue(cell) {
  if (!cell || cell.status === 'unavailable') return null;
  const number = Number(cell.value);
  if (Number.isFinite(number)) return number;
  return parseDisplayNumber(cell.display);
}

function chartCellDisplay(cell) {
  if (!cell || cell.status === 'unavailable') return 'N/A';
  const display = cell.display ?? cell.value;
  return isUnavailableValue(display) ? 'N/A' : String(display);
}

function rowValueScore(row, periods) {
  return periods.reduce(
    (score, period) => score + (cellHasValue(row.values?.[period.key]) ? 1 : 0),
    0
  );
}

function findMetricRow(financialHighlights, metricLabel, usedSourceRows) {
  const keyAliases = new Set(METRIC_KEY_ALIASES[metricLabel] || []);
  const labelAliases = new Set(metricLabelCandidates(metricLabel));

  return flattenFinancialRows(financialHighlights)
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (usedSourceRows.has(row)) return false;
      if (keyAliases.has(row.key)) return true;
      return labelAliases.has(normalizeMetric(row.label));
    })
    .sort(
      (left, right) =>
        rowValueScore(right.row, financialHighlights.periods || []) -
          rowValueScore(left.row, financialHighlights.periods || []) || left.index - right.index
    )[0]?.row;
}

function pointInTimeRow(financialHighlights, metricLabel, periods) {
  const keyAliases = new Set(METRIC_KEY_ALIASES[metricLabel] || []);
  const labelAliases = new Set(metricLabelCandidates(metricLabel));
  const item = (financialHighlights?.point_in_time || []).find(
    (snapshot) => keyAliases.has(snapshot.key) || labelAliases.has(normalizeMetric(snapshot.label))
  );
  const latestPeriodKey = periods[periods.length - 1]?.key;
  if (!item || !latestPeriodKey) return null;

  return {
    key: `${normalizeMetric(metricLabel).replace(/\s+/g, '_')}_point_in_time`,
    label: metricLabel,
    unit: item.unit || unitForFormat(METRIC_FORMAT_TYPES[metricLabel], financialHighlights),
    format_type: METRIC_FORMAT_TYPES[metricLabel],
    values: Object.fromEntries(
      periods.map((period) => [
        period.key,
        period.key === latestPeriodKey ? item : { ...UNAVAILABLE_CELL },
      ])
    ),
  };
}

function metricPlaceholderRow(financialHighlights, metricLabel, periods) {
  const key = normalizeMetric(metricLabel).replace(/\s+/g, '_');
  const formatType = METRIC_FORMAT_TYPES[metricLabel];
  return {
    key,
    label: metricLabel,
    unit: unitForFormat(formatType, financialHighlights),
    format_type: formatType,
    values: Object.fromEntries(periods.map((period) => [period.key, { ...UNAVAILABLE_CELL }])),
  };
}

function groupMetricRow(financialHighlights, metricLabel, periods, usedSourceRows) {
  const sourceRow = findMetricRow(financialHighlights, metricLabel, usedSourceRows);
  const snapshotRow = pointInTimeRow(financialHighlights, metricLabel, periods);
  if (sourceRow && rowValueScore(sourceRow, periods) === 0 && snapshotRow) return snapshotRow;

  if (sourceRow) {
    usedSourceRows.add(sourceRow);
    return {
      ...sourceRow,
      key: normalizeMetric(metricLabel).replace(/\s+/g, '_'),
      label: metricLabel,
      unit: sourceRow.unit || unitForFormat(METRIC_FORMAT_TYPES[metricLabel], financialHighlights),
      format_type: sourceRow.format_type || METRIC_FORMAT_TYPES[metricLabel],
      values: Object.fromEntries(
        periods.map((period) => [
          period.key,
          sourceRow.values?.[period.key] || { ...UNAVAILABLE_CELL },
        ])
      ),
    };
  }

  return snapshotRow || metricPlaceholderRow(financialHighlights, metricLabel, periods);
}

function groupFinancialHighlights(financialHighlights, group) {
  const periods = Array.isArray(financialHighlights?.periods) ? financialHighlights.periods : [];
  if (!periods.length || !group) return financialHighlights;

  const usedSourceRows = new Set();
  const rows = group.metrics.map((metricLabel) =>
    groupMetricRow(financialHighlights, metricLabel, periods, usedSourceRows)
  );

  return {
    ...financialHighlights,
    rows,
    point_in_time: [],
    sections: [
      {
        key: group.id,
        title: group.label,
        rows,
      },
    ],
  };
}


function metricPlaceholderRowFromDefinition(financialHighlights, metricDefinition, periods) {
  return {
    key: metricDefinition.key,
    label: metricDefinition.label,
    unit: unitForFormat(metricDefinition.format, financialHighlights),
    format_type: metricDefinition.format,
    values: Object.fromEntries(periods.map((period) => [period.key, { ...UNAVAILABLE_CELL }])),
  };
}

function groupTableMetricRow(financialHighlights, metricDefinition, periods, usedSourceRows) {
  const sourceRow = findMetricRow(financialHighlights, metricDefinition.label, usedSourceRows);
  const snapshotRow = pointInTimeRow(financialHighlights, metricDefinition.label, periods);
  if (sourceRow && rowValueScore(sourceRow, periods) === 0 && snapshotRow) return snapshotRow;

  if (sourceRow) {
    usedSourceRows.add(sourceRow);
    return {
      ...sourceRow,
      key: metricDefinition.key,
      label: metricDefinition.label,
      unit: sourceRow.unit || unitForFormat(metricDefinition.format, financialHighlights),
      format_type: sourceRow.format_type || metricDefinition.format,
      values: Object.fromEntries(
        periods.map((period) => [
          period.key,
          sourceRow.values?.[period.key] || { ...UNAVAILABLE_CELL },
        ])
      ),
    };
  }

  return snapshotRow || metricPlaceholderRowFromDefinition(financialHighlights, metricDefinition, periods);
}

function groupFundamentalTableHighlights(financialHighlights, group) {
  const periods = Array.isArray(financialHighlights?.periods) ? financialHighlights.periods : [];
  const groupDefinitions = FUNDAMENTAL_TABLE_GROUPS[group?.id] || [];
  if (!periods.length || !group || !groupDefinitions.length) return financialHighlights;

  const usedSourceRows = new Set();
  const tableGroups = groupDefinitions.map((groupDefinition) => {
    const rows = groupDefinition.metrics.map((metricDefinition) =>
      groupTableMetricRow(financialHighlights, metricDefinition, periods, usedSourceRows)
    );

    return {
      key: normalizeMetric(groupDefinition.title).replace(/\s+/g, '_'),
      title: groupDefinition.title,
      rows,
    };
  });

  return {
    ...financialHighlights,
    rows: tableGroups.flatMap((tableGroup) => tableGroup.rows),
    point_in_time: [],
    sections: [
      {
        key: group.id,
        title: group.label,
        groups: tableGroups,
      },
    ],
  };
}

function legacyCell(payload, key) {
  const details = payload?.metric_details || {};
  const detail = details[key];
  if (detail && typeof detail === 'object') return detail;
  if (payload && Object.prototype.hasOwnProperty.call(payload, key)) {
    const value = payload[key];
    return value === null || value === undefined
      ? UNAVAILABLE_CELL
      : { value, display: String(value), status: 'reported' };
  }
  return UNAVAILABLE_CELL;
}

function appendLegacyFundamentalSections(financialHighlights, result) {
  const periods = Array.isArray(financialHighlights?.periods) ? financialHighlights.periods : [];
  const sections = Array.isArray(financialHighlights?.sections) ? financialHighlights.sections : [];
  if (!periods.length) return financialHighlights;

  const latestPeriodKey = periods[periods.length - 1]?.key;
  const extraSections = [];
  const extraRows = [];

  for (const sectionDefinition of LEGACY_FUNDAMENTAL_SECTIONS) {
    const payload = result?.[sectionDefinition.payloadKey];
    if (!payload) continue;

    const rows = sectionDefinition.rows.map(([key, label, formatType]) => {
      const row = {
        key,
        label,
        unit: unitForFormat(formatType, financialHighlights),
        format_type: formatType,
        section_key: sectionDefinition.key,
        values: Object.fromEntries(periods.map((period) => [period.key, { ...UNAVAILABLE_CELL }])),
      };
      if (latestPeriodKey) {
        row.values[latestPeriodKey] = legacyCell(payload, key);
      }
      extraRows.push(row);
      return row;
    });

    extraSections.push({
      key: sectionDefinition.key,
      title: sectionDefinition.title,
      rows,
    });
  }

  if (!extraSections.length) return financialHighlights;

  return {
    ...financialHighlights,
    rows: [...(financialHighlights.rows || []), ...extraRows],
    sections: [...sections, ...extraSections],
  };
}

function findRowForChartMetric(financialHighlights, metricLabel) {
  const keyAliases = new Set(METRIC_KEY_ALIASES[metricLabel] || []);
  const labelAliases = new Set(metricLabelCandidates(metricLabel));
  return flattenFinancialRows(financialHighlights).find(
    (row) => keyAliases.has(row.key) || labelAliases.has(normalizeMetric(row.label))
  );
}

function axisDomain(values, includeZero = false) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (!numericValues.length) return { min: 0, max: 1, range: 1 };

  let min = Math.min(...numericValues, includeZero ? 0 : Number.POSITIVE_INFINITY);
  let max = Math.max(...numericValues, includeZero ? 0 : Number.NEGATIVE_INFINITY);

  if (min === max) {
    const padding = Math.abs(max || 1) * 0.12;
    min -= padding;
    max += padding;
  }

  const padding = (max - min) * 0.08;
  return {
    min: min - padding,
    max: max + padding,
    range: max - min + padding * 2 || 1,
  };
}

function axisTicks(domain) {
  return [domain.max, domain.min + domain.range / 2, domain.min];
}

function formatAxisNumber(value) {
  if (!Number.isFinite(value)) return '0';
  const absolute = Math.abs(value);
  if (absolute >= 1000) return value.toFixed(0);
  if (absolute >= 100) return value.toFixed(1).replace(/\.0$/, '');
  if (absolute >= 10) return value.toFixed(1).replace(/\.0$/, '');
  return value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

function seriesRenderType(chartDefinition, metricLabel) {
  if (chartDefinition.type === 'mixed') {
    return chartDefinition.barMetrics?.includes(metricLabel) ? 'bar' : 'line';
  }
  return chartDefinition.type === 'bar' || chartDefinition.type === 'grouped_bar' ? 'bar' : 'line';
}

function buildMetricChart(financialHighlights, chartDefinition) {
  const periods = Array.isArray(financialHighlights?.periods)
    ? sortPeriodsForChart(financialHighlights.periods)
    : [];

  const series = metricLabelsForChart(chartDefinition).map((metricLabel, index) => {
    const row = findRowForChartMetric(financialHighlights, metricLabel);
    const points = periods.map((period) => {
      const cell = row?.values?.[period.key];
      return {
        periodKey: period.key,
        periodLabel: displayPeriodLabel(period),
        value: chartCellValue(cell),
        display: chartCellDisplay(cell),
      };
    });

    return {
      key: row?.key || normalizeMetric(metricLabel).replace(/\s+/g, '_'),
      label: metricLabel,
      renderType: seriesRenderType(chartDefinition, metricLabel),
      color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
      points,
    };
  });

  return { periods, series };
}

function pointPath(points, yForValue, xForIndex) {
  let hasOpenSegment = false;
  return points
    .map((point, index) => {
      if (!Number.isFinite(point.value)) {
        hasOpenSegment = false;
        return '';
      }
      const command = hasOpenSegment ? 'L' : 'M';
      hasOpenSegment = true;
      return `${command} ${xForIndex(index)} ${yForValue(point.value)}`;
    })
    .filter(Boolean)
    .join(' ');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function tooltipSize(point) {
  const longestText = Math.max(
    point.label?.length || 0,
    `${point.periodLabel || ''} ${point.display || ''}`.length
  );

  return {
    width: clamp(longestText * 7.4 + 44, CHART_TOOLTIP_MIN_WIDTH, CHART_TOOLTIP_MAX_WIDTH),
    height: CHART_TOOLTIP_HEIGHT,
  };
}

function tooltipPosition(point, size) {
  const margin = 10;
  const offset = 14;
  const bounds = {
    left: CHART_LEFT + margin,
    right: CHART_WIDTH - CHART_RIGHT - margin,
    top: CHART_TOP + margin,
    bottom: CHART_HEIGHT - CHART_BOTTOM - margin,
  };
  const preferRight = point.x < (bounds.left + bounds.right) / 2;
  const preferBelow = point.y < (bounds.top + bounds.bottom) / 2;
  const xOptions = preferRight
    ? [point.x + offset, point.x - size.width - offset]
    : [point.x - size.width - offset, point.x + offset];
  const yOptions = preferBelow
    ? [point.y + offset, point.y - size.height - offset]
    : [point.y - size.height - offset, point.y + offset];
  const candidates = [
    { x: xOptions[0], y: yOptions[0] },
    { x: xOptions[0], y: yOptions[1] },
    { x: xOptions[1], y: yOptions[0] },
    { x: xOptions[1], y: yOptions[1] },
    { x: point.x - size.width / 2, y: yOptions[0] },
    { x: point.x - size.width / 2, y: yOptions[1] },
  ];
  const fits = (candidate) =>
    candidate.x >= bounds.left &&
    candidate.x + size.width <= bounds.right &&
    candidate.y >= bounds.top &&
    candidate.y + size.height <= bounds.bottom;
  const overlapsPoint = (candidate) =>
    point.x >= candidate.x - margin &&
    point.x <= candidate.x + size.width + margin &&
    point.y >= candidate.y - margin &&
    point.y <= candidate.y + size.height + margin;
  const exact = candidates.find((candidate) => fits(candidate) && !overlapsPoint(candidate));
  if (exact) return exact;

  const clamped = candidates.map((candidate) => ({
    x: clamp(candidate.x, bounds.left, bounds.right - size.width),
    y: clamp(candidate.y, bounds.top, bounds.bottom - size.height),
  }));
  return clamped.find((candidate) => !overlapsPoint(candidate)) || clamped[0];
}

function ChartLegend({ series }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-3 font-mono text-[10px] uppercase tracking-wider text-bloomberg-muted">
      {series.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="h-2 w-2" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

ChartLegend.propTypes = {
  series: PropTypes.array.isRequired,
};

function FundamentalMetricChart({ financialHighlights, chartDefinition }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const chart = useMemo(
    () => buildMetricChart(financialHighlights, chartDefinition),
    [financialHighlights, chartDefinition]
  );

  const hasChartData = chart.series.some((series) =>
    series.points.some((point) => Number.isFinite(point.value))
  );

  if (!chart.periods.length || !chart.series.length || !hasChartData) {
    return (
      <div className="overflow-hidden rounded-md border border-bloomberg-border bg-black">
        <div className="border-b border-bloomberg-border px-3 py-2">
          <div className="font-mono text-xs uppercase tracking-wider text-bloomberg-orange">
            {chartDefinition.title}
          </div>
          {chartDefinition.description && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-bloomberg-muted">
              {chartDefinition.description}
            </div>
          )}
        </div>
        <div className="flex min-h-[292px] items-center justify-center px-4 py-8 font-mono text-xs uppercase tracking-wider text-bloomberg-muted">
          No fundamental data available
        </div>
      </div>
    );
  }

  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const barSeries = chart.series.filter((series) => series.renderType === 'bar');
  const lineSeries = chart.series.filter((series) => series.renderType === 'line');
  const isMixed = chartDefinition.type === 'mixed' && barSeries.length && lineSeries.length;
  const allValues = chart.series.flatMap((series) => series.points.map((point) => point.value));
  const barValues = barSeries.flatMap((series) => series.points.map((point) => point.value));
  const lineValues = lineSeries.flatMap((series) => series.points.map((point) => point.value));
  const singleDomain = axisDomain(allValues, chartDefinition.type !== 'line');
  const barDomain = isMixed ? axisDomain(barValues, true) : singleDomain;
  const lineDomain = isMixed ? axisDomain(lineValues, false) : singleDomain;
  const periodSlotWidth = plotWidth / chart.periods.length;
  const barSlotCenter = (index) => CHART_LEFT + periodSlotWidth * index + periodSlotWidth / 2;
  const lineX = barSlotCenter;
  const yForDomain = (domain) => (value) =>
    CHART_TOP + ((domain.max - value) / domain.range) * plotHeight;
  const yBar = yForDomain(barDomain);
  const yLine = yForDomain(lineDomain);
  const zeroY = yBar(0);
  const maxBarGroupWidth = chartDefinition.type === 'grouped_bar' || isMixed ? 124 : 64;
  const barGroupWidth = Math.min(maxBarGroupWidth, Math.max(18, periodSlotWidth * 0.66));
  const barWidth = Math.max(4, Math.min(34, barGroupWidth / Math.max(1, barSeries.length) - 3));
  const tooltipSizeValue = hoveredPoint ? tooltipSize(hoveredPoint) : null;
  const tooltip = hoveredPoint ? tooltipPosition(hoveredPoint, tooltipSizeValue) : null;

  return (
    <div className="overflow-hidden rounded-md border border-bloomberg-border bg-black">
      <div className="border-b border-bloomberg-border px-3 py-2">
        <div className="font-mono text-xs uppercase tracking-wider text-bloomberg-orange">
          {chartDefinition.title}
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-bloomberg-muted">
          {chartDefinition.description ||
            (chartDefinition.type === 'mixed'
              ? 'Bars + Lines'
              : chartDefinition.type.replace('_', ' '))}
        </div>
      </div>
      <div className="overflow-hidden">
        <svg
          role="img"
          aria-label={`${chartDefinition.title} chart`}
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          className="block h-auto w-full font-mono"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <rect width={CHART_WIDTH} height={CHART_HEIGHT} fill="black" />

          {axisTicks(isMixed ? barDomain : singleDomain).map((tick) => {
            const y = (isMixed ? yBar : yForDomain(singleDomain))(tick);
            return (
              <g key={`left-${tick}`}>
                <line
                  x1={CHART_LEFT}
                  x2={CHART_WIDTH - CHART_RIGHT}
                  y1={y}
                  y2={y}
                  stroke={CHART_GRID_COLOR}
                />
                <text
                  x={CHART_LEFT - 12}
                  y={y + 4}
                  fill={CHART_ZERO_COLOR}
                  fontFamily="monospace"
                  fontSize="10"
                  textAnchor="end"
                >
                  {formatAxisNumber(tick)}
                </text>
              </g>
            );
          })}

          {isMixed &&
            axisTicks(lineDomain).map((tick) => {
              const y = yLine(tick);
              return (
                <text
                  key={`right-${tick}`}
                  x={CHART_WIDTH - CHART_RIGHT + 12}
                  y={y + 4}
                  fill={CHART_ZERO_COLOR}
                  fontFamily="monospace"
                  fontSize="10"
                  textAnchor="start"
                >
                  {formatAxisNumber(tick)}
                </text>
              );
            })}

          {chart.periods.map((period, index) => {
            const x = barSlotCenter(index);
            return (
              <g key={period.key}>
                <line
                  x1={x}
                  x2={x}
                  y1={CHART_TOP}
                  y2={CHART_HEIGHT - CHART_BOTTOM}
                  stroke={CHART_GRID_COLOR}
                  strokeDasharray="4 6"
                />
                <text
                  x={x}
                  y={CHART_HEIGHT - 24}
                  fill={CHART_ZERO_COLOR}
                  fontFamily="monospace"
                  fontSize="11"
                  textAnchor="middle"
                >
                  {displayPeriodLabel(period)}
                </text>
              </g>
            );
          })}

          <line
            x1={CHART_LEFT}
            x2={CHART_LEFT}
            y1={CHART_TOP}
            y2={CHART_HEIGHT - CHART_BOTTOM}
            stroke={CHART_AXIS_COLOR}
          />
          <line
            x1={CHART_LEFT}
            x2={CHART_WIDTH - CHART_RIGHT}
            y1={CHART_HEIGHT - CHART_BOTTOM}
            y2={CHART_HEIGHT - CHART_BOTTOM}
            stroke={CHART_AXIS_COLOR}
          />
          {isMixed && (
            <line
              x1={CHART_WIDTH - CHART_RIGHT}
              x2={CHART_WIDTH - CHART_RIGHT}
              y1={CHART_TOP}
              y2={CHART_HEIGHT - CHART_BOTTOM}
              stroke={CHART_AXIS_COLOR}
            />
          )}
          {barDomain.min < 0 && barDomain.max > 0 && (
            <line
              x1={CHART_LEFT}
              x2={CHART_WIDTH - CHART_RIGHT}
              y1={zeroY}
              y2={zeroY}
              stroke={CHART_AXIS_COLOR}
            />
          )}

          {barSeries.map((series, seriesIndex) =>
            series.points.map((point, pointIndex) => {
              if (!Number.isFinite(point.value)) return null;
              const center = barSlotCenter(pointIndex);
              const x =
                center -
                (barWidth * barSeries.length + 3 * (barSeries.length - 1)) / 2 +
                seriesIndex * (barWidth + 3);
              const valueY = yBar(point.value);
              const baseY = yBar(0);
              const y = Math.min(valueY, baseY);
              const height = Math.max(2, Math.abs(baseY - valueY));
              const hoverPoint = {
                label: series.label,
                periodLabel: point.periodLabel,
                display: point.display,
                color: series.color,
                x: center,
                y: point.value === 0 ? baseY - 1 : valueY,
              };

              return (
                <rect
                  key={`${series.key}-${point.periodKey}`}
                  x={x}
                  y={point.value === 0 ? baseY - 1 : y}
                  width={barWidth}
                  height={height}
                  fill={series.color}
                  opacity={point.value === 0 ? 0.7 : 0.9}
                  data-metric={series.label}
                  data-period={point.periodLabel}
                  data-value={point.value}
                  tabIndex={0}
                  aria-label={`${series.label} ${point.periodLabel}: ${point.display}`}
                  onMouseEnter={() => setHoveredPoint(hoverPoint)}
                  onMouseMove={() => setHoveredPoint(hoverPoint)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  onFocus={() => setHoveredPoint(hoverPoint)}
                  onBlur={() => setHoveredPoint(null)}
                >
                  <title>
                    {series.label} {point.periodLabel}: {point.display}
                  </title>
                </rect>
              );
            })
          )}

          {lineSeries.map((series) => (
            <g key={series.key}>
              <path
                d={pointPath(series.points, isMixed ? yLine : yForDomain(singleDomain), lineX)}
                fill="none"
                stroke={series.color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {series.points.map((point, index) => {
                if (!Number.isFinite(point.value)) return null;
                const x = lineX(index);
                const y = (isMixed ? yLine : yForDomain(singleDomain))(point.value);
                const hoverPoint = {
                  label: series.label,
                  periodLabel: point.periodLabel,
                  display: point.display,
                  color: series.color,
                  x,
                  y,
                };
                return (
                  <g key={`${series.key}-${point.periodKey}`}>
                    <circle cx={x} cy={y} r="3.5" fill={series.color} />
                    <circle
                      cx={x}
                      cy={y}
                      r="13"
                      fill="transparent"
                      data-metric={series.label}
                      data-period={point.periodLabel}
                      data-value={point.value}
                      tabIndex={0}
                      aria-label={`${series.label} ${point.periodLabel}: ${point.display}`}
                      onMouseEnter={() => setHoveredPoint(hoverPoint)}
                      onMouseMove={() => setHoveredPoint(hoverPoint)}
                      onMouseLeave={() => setHoveredPoint(null)}
                      onFocus={() => setHoveredPoint(hoverPoint)}
                      onBlur={() => setHoveredPoint(null)}
                    >
                      <title>
                        {series.label} {point.periodLabel}: {point.display}
                      </title>
                    </circle>
                  </g>
                );
              })}
            </g>
          ))}

          {hoveredPoint && tooltip && (
            <g pointerEvents="none">
              <line
                x1={hoveredPoint.x}
                x2={hoveredPoint.x}
                y1={CHART_TOP}
                y2={CHART_HEIGHT - CHART_BOTTOM}
                stroke={hoveredPoint.color}
                strokeOpacity="0.35"
                strokeDasharray="3 5"
              />
              <g transform={`translate(${tooltip.x} ${tooltip.y})`}>
                <rect
                  width={tooltipSizeValue.width}
                  height={tooltipSizeValue.height}
                  rx="6"
                  fill="#050505"
                  stroke={hoveredPoint.color}
                  strokeOpacity="0.9"
                />
                <circle cx="14" cy="17" r="4" fill={hoveredPoint.color} />
                <text
                  x="26"
                  y="20"
                  fill="#f97316"
                  fontFamily="monospace"
                  fontSize="11"
                  fontWeight="700"
                >
                  {hoveredPoint.label}
                </text>
                <text x="14" y="40" fill="#d4d4d4" fontFamily="monospace" fontSize="11">
                  {hoveredPoint.periodLabel}
                </text>
                <text
                  x={tooltipSizeValue.width - 14}
                  y="40"
                  fill="#ffffff"
                  fontFamily="monospace"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor="end"
                >
                  {hoveredPoint.display}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>
      <ChartLegend series={chart.series} />
    </div>
  );
}

FundamentalMetricChart.propTypes = {
  financialHighlights: PropTypes.object,
  chartDefinition: PropTypes.shape({
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    type: PropTypes.string.isRequired,
    metrics: PropTypes.array,
    barMetrics: PropTypes.array,
    lineMetrics: PropTypes.array,
  }).isRequired,
};

function FundamentalChartsPanel({ financialHighlights, activeGroup }) {
  const { title, unit_note: unitNote } = financialHighlights || {};
  const groupedPayload = groupFinancialHighlights(financialHighlights, activeGroup);

  return (
    <section className="space-y-5 border-b border-bloomberg-border bg-bloomberg-bg px-4 py-4">
      <div>
        <SectionHeader label={title || 'KEY FINANCIAL HIGHLIGHTS'} />
        {unitNote && <p className="font-mono text-[11px] text-bloomberg-muted">{unitNote}</p>}
      </div>

      <div className="space-y-3">
        <div className="font-mono text-xs uppercase tracking-wider text-bloomberg-orange">
          {activeGroup.label}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {activeGroup.charts.map((chartDefinition) => (
            <FundamentalMetricChart
              key={chartDefinition.id}
              financialHighlights={groupedPayload}
              chartDefinition={chartDefinition}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

FundamentalChartsPanel.propTypes = {
  activeGroup: PropTypes.shape({
    label: PropTypes.string.isRequired,
    charts: PropTypes.array.isRequired,
  }).isRequired,
  financialHighlights: PropTypes.object,
};

export default function FundamentalTab({ financialHighlights, result = {} }) {
  const [selectedFundamentalGroup, setSelectedFundamentalGroup] = useState('income');
  const [fundamentalViewMode, setFundamentalViewMode] = useState('table');
  const activeGroup =
    FUNDAMENTAL_GROUPS.find((group) => group.id === selectedFundamentalGroup) ||
    FUNDAMENTAL_GROUPS[0];
  const tablePayload = appendLegacyFundamentalSections(financialHighlights, result);
  const groupedTablePayload = groupFundamentalTableHighlights(tablePayload, activeGroup);

  return (
    <>
      <div className="border-b border-bloomberg-border bg-black px-4 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {FUNDAMENTAL_GROUPS.map((group) => {
            const isActive = group.id === activeGroup.id;
            const Icon = group.Icon;
            return (
              <Button
                key={group.id}
                type="button"
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                aria-pressed={isActive}
                onClick={() => setSelectedFundamentalGroup(group.id)}
                className={`h-10 whitespace-nowrap rounded-md border px-3 font-mono text-xs uppercase tracking-wider ${
                  isActive
                    ? 'border-bloomberg-orange bg-bloomberg-surface text-bloomberg-orange'
                    : 'border-bloomberg-border bg-black text-bloomberg-muted hover:border-bloomberg-orange hover:text-bloomberg-white'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {group.label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="border-b border-bloomberg-border bg-black px-4 py-3">
        <div className="flex gap-2" aria-label="Fundamental view mode">
          {FUNDAMENTAL_VIEW_MODES.map((mode) => {
            const isActive = mode.id === fundamentalViewMode;
            const Icon = mode.Icon;
            return (
              <Button
                key={mode.id}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={isActive}
                onClick={() => setFundamentalViewMode(mode.id)}
                className={`h-8 gap-0 rounded-md border px-3 font-mono text-xs uppercase tracking-wider [&_svg]:h-3.5 [&_svg]:w-3.5 ${
                  isActive
                    ? 'border-bloomberg-orange bg-bloomberg-surface text-bloomberg-orange'
                    : 'border-bloomberg-border bg-black text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-card hover:text-bloomberg-white'
                }`}
              >
                <Icon className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                {mode.label}
              </Button>
            );
          })}
        </div>
      </div>
      {fundamentalViewMode === 'table' ? (
        <FinancialHighlightsTable financialHighlights={groupedTablePayload} />
      ) : (
        <FundamentalChartsPanel financialHighlights={tablePayload} activeGroup={activeGroup} />
      )}
    </>
  );
}

FundamentalTab.propTypes = {
  financialHighlights: PropTypes.object,
  result: PropTypes.object,
};
