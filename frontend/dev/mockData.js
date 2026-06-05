// frontend/dev/mockData.js
// Central mock source for /analysis.test.
// Mock mode mirrors the backend analysis contract so UI, HTML preview, PDF print,
// direct mock URLs, and history can be debugged without spending API calls.

export const AGENTS_USED = [
  'Market Analyst',
  'News Analyst',
  'Fundamentals Analyst',
  'Risk Manager',
  'Portfolio Manager',
];

const PIPELINE_AGENTS = [
  'Data Collection',
  'Market Analyst',
  'News Analyst',
  'Fundamentals Analyst',
  'Bull Researcher',
  'Bear Researcher',
  'Research Manager',
  'Trader',
  'Risk Analysts',
  'Portfolio Manager',
];

const MOCK_ANALYSIS_CREATED_AT = '2026-05-18T09:00:00.000Z';

export function resolveDisplaySignal(rawAiSignal, hasExistingPosition, rebalancingAction = null) {
  const signal = String(rawAiSignal || 'HOLD')
    .toUpperCase()
    .trim();
  const action = String(rebalancingAction || '').trim();

  if (!hasExistingPosition) {
    return signal === 'BUY' && action === 'Open new position' ? 'BUY' : 'WAIT';
  }

  if (action === 'Trim position') return 'REDUCE';
  if (action === 'Exit position') return 'SELL';
  if (signal === 'SELL') return 'SELL';
  return 'HOLD';
}

export const MOCK_ANALYSIS_SCENARIOS = {
  BBCA_BUY_NO_POSITION: {
    id: 'mock-bbca-buy-no-position',
    request_id: 'mock-bbca-buy-no-position',
    input_ticker: 'BBCA',
    normalized_ticker: 'BBCA.JK',
    has_existing_position: false,
    raw_ai_signal: 'BUY',
    display_signal: 'BUY',
    rebalancing_action: 'Open new position',
    new_entry_action: 'Allowed with validated entry',
    position_size_hint: 'Use smaller starter size due to high volatility.',
    signal_context: 'User has no existing position. AI signal BUY remains BUY.',
  },
  BBRI_HOLD_EXISTING_POSITION: {
    id: 'mock-bbri-hold-existing-position',
    request_id: 'mock-bbri-hold-existing-position',
    input_ticker: 'BBRI',
    normalized_ticker: 'BBRI.JK',
    has_existing_position: true,
    raw_ai_signal: 'HOLD',
    display_signal: 'HOLD',
    rebalancing_action: 'Maintain position',
    new_entry_action: 'No new entry; maintain existing position',
    position_size_hint: 'Maintain current position size; no additional exposure suggested.',
    signal_context: 'User has an existing position. AI signal HOLD remains HOLD.',
  },
  TLKM_SELL_EXISTING_POSITION: {
    id: 'mock-tlkm-sell-existing-position',
    request_id: 'mock-tlkm-sell-existing-position',
    input_ticker: 'TLKM',
    normalized_ticker: 'TLKM.JK',
    has_existing_position: true,
    raw_ai_signal: 'SELL',
    display_signal: 'SELL',
    rebalancing_action: 'Exit position',
    new_entry_action: 'No new entry; exit existing position',
    position_size_hint: 'Exit existing position; no new exposure suggested.',
    signal_context: 'User has an existing position. AI signal SELL remains SELL.',
  },
  PTRO_WAIT_NO_POSITION: {
    id: 'mock-ptro-wait-no-position',
    request_id: 'mock-ptro-wait-no-position',
    input_ticker: 'PTRO',
    normalized_ticker: 'PTRO.JK',
    has_existing_position: false,
    raw_ai_signal: 'HOLD',
    display_signal: 'WAIT',
    rebalancing_action: 'No position to rebalance',
    new_entry_action: 'Wait for valid entry setup',
    position_size_hint: '0% allocation until setup improves.',
    signal_context: 'User has no existing position. AI signal HOLD translated to WAIT.',
  },
  TPIA_REDUCE_EXISTING_POSITION: {
    id: 'mock-tpia-reduce-existing-position',
    request_id: 'mock-tpia-reduce-existing-position',
    input_ticker: 'TPIA',
    normalized_ticker: 'TPIA.JK',
    has_existing_position: true,
    raw_ai_signal: 'SELL',
    display_signal: 'REDUCE',
    rebalancing_action: 'Trim position',
    new_entry_action: 'Do not add; reduce existing exposure',
    position_size_hint: 'Reduce position size gradually; no new exposure suggested.',
    signal_context: 'User has an existing position. Trim position translated to REDUCE.',
  },
};

const MOCK_ACTION_COPY_BY_SIGNAL = {
  BUY: {
    rebalancing_action: 'Open new position',
    position_action: null,
    new_entry_action: 'Allowed with validated entry',
    position_size_hint: 'Use smaller starter size due to high volatility.',
  },
  HOLD: {
    rebalancing_action: 'Maintain position',
    position_action: 'Maintain position',
    new_entry_action: 'No new entry; maintain existing position',
    position_size_hint: 'Maintain current position size; no additional exposure suggested.',
  },
  SELL: {
    rebalancing_action: 'Exit position',
    position_action: 'Exit position',
    new_entry_action: 'No new entry; exit existing position',
    position_size_hint: 'Exit existing position; no new exposure suggested.',
  },
  WAIT: {
    rebalancing_action: 'No position to rebalance',
    position_action: null,
    new_entry_action: 'Wait for valid entry setup',
    position_size_hint: '0% allocation until setup improves.',
  },
  REDUCE: {
    rebalancing_action: 'Trim position',
    position_action: 'Trim position',
    new_entry_action: 'Do not add; reduce existing exposure',
    position_size_hint: 'Reduce position size gradually; no new exposure suggested.',
  },
};

function applyMockActionCopy(response) {
  const displaySignal = response.display_signal || 'WAIT';
  const copy = MOCK_ACTION_COPY_BY_SIGNAL[displaySignal];
  if (!copy) return response;

  response.rebalancing_action = copy.rebalancing_action;
  response.position_action = response.has_existing_position ? copy.position_action : null;
  response.new_entry_action = copy.new_entry_action;
  response.position_size_hint = copy.position_size_hint;
  response.action_status = displaySignal;

  return response;
}

export const MOCK_RECENT_ANALYSES = [
  {
    id: 'mock-bbca-buy-no-position',
    request_id: 'mock-bbca-buy-no-position',
    ticker: 'BBCA.JK',
    created_at: '2026-06-04T12:15:00+07:00',
    saved_at: '2026-06-04T12:15:00+07:00',
    horizon: '1M',
    time_horizon_months: 1,
    display_signal: 'BUY',
    confidence_score: 78,
    confidence_tier: 'high',
  },
  {
    id: 'mock-bbri-hold-existing-position',
    request_id: 'mock-bbri-hold-existing-position',
    ticker: 'BBRI.JK',
    created_at: '2026-06-04T12:10:00+07:00',
    saved_at: '2026-06-04T12:10:00+07:00',
    horizon: '1M',
    time_horizon_months: 1,
    display_signal: 'HOLD',
    confidence_score: 72,
    confidence_tier: 'moderate',
  },
  {
    id: 'mock-tlkm-sell-existing-position',
    request_id: 'mock-tlkm-sell-existing-position',
    ticker: 'TLKM.JK',
    created_at: '2026-06-04T12:05:00+07:00',
    saved_at: '2026-06-04T12:05:00+07:00',
    horizon: '1M',
    time_horizon_months: 1,
    display_signal: 'SELL',
    confidence_score: 46,
    confidence_tier: 'very_low',
  },
  {
    id: 'mock-ptro-wait-no-position',
    request_id: 'mock-ptro-wait-no-position',
    ticker: 'PTRO.JK',
    created_at: '2026-06-04T12:00:00+07:00',
    saved_at: '2026-06-04T12:00:00+07:00',
    horizon: '1M',
    time_horizon_months: 1,
    display_signal: 'WAIT',
    confidence_score: 55,
    confidence_tier: 'low',
  },
  {
    id: 'mock-tpia-reduce-existing-position',
    request_id: 'mock-tpia-reduce-existing-position',
    ticker: 'TPIA.JK',
    created_at: '2026-06-04T11:55:00+07:00',
    saved_at: '2026-06-04T11:55:00+07:00',
    horizon: '1M',
    time_horizon_months: 1,
    display_signal: 'REDUCE',
    confidence_score: 55,
    confidence_tier: 'low',
  },
];

const COMMON_FIELD_QUALITY = {
  revenue: {
    status: 'available',
    source: 'normalized_financial_rows',
    confidence_score: 92,
    warnings: [],
    as_of_date: '2026-03-31',
    freshness_status: {
      status: 'fresh',
      is_stale: false,
      age_seconds: 120000,
      ttl_seconds: 604800,
      as_of_date: '2026-03-31T00:00:00+00:00',
      warnings: [],
    },
  },
  sma_20: {
    status: 'calculated',
    source: 'local_calculation_from_historical_price',
    confidence_score: 88,
    warnings: [],
    as_of_date: '2026-05-18',
    freshness_status: {
      status: 'fresh',
      is_stale: false,
      ttl_seconds: 86400,
      as_of_date: '2026-05-18T00:00:00+00:00',
      warnings: [],
    },
  },
  sma_200: {
    status: 'source_unavailable',
    source: 'local_calculation_from_historical_price',
    confidence_score: 35,
    reason: 'Not enough price history for SMA 200.',
    warnings: ['SMA 200 requires at least 200 close prices.'],
  },
  dividend_yield: {
    status: 'no_dividend_history',
    source: 'idx_official',
    reason: 'No cash dividend found for selected period',
    warnings: [],
  },
  company_news: {
    status: 'available',
    source: 'marketaux',
    confidence_score: 84,
    warnings: [],
    as_of_date: '2026-05-17T10:30:00Z',
    freshness_status: {
      status: 'fresh',
      is_stale: false,
      ttl_seconds: 3600,
      as_of_date: '2026-05-17T10:30:00+00:00',
      warnings: [],
    },
  },
};

const COMMON_MOCK_QUALITY = {
  price_data: 'mock',
  trade_levels: 'mock_validated',
  llm_output: 'mock',
  volatility_data: 'mock',
  fundamentals: 'mock',
  news: 'mock',
  warnings: ['Mock data only. No backend, provider, or LLM call was executed.'],
  field_quality: COMMON_FIELD_QUALITY,
};

export const mockConflictDataQuality = {
  field_quality: {
    last_price: {
      status: 'conflict',
      source: 'yfinance',
      confidence_score: 65,
      warnings: [
        'last_price conflict: yfinance=1000, finnhub=1060, difference=6.0%, tolerance=3.0%',
      ],
      freshness_status: {
        status: 'fresh',
        is_stale: false,
        ttl_seconds: 300,
        as_of_date: '2026-06-05T09:00:00+00:00',
        warnings: [],
      },
      vendor_values: {
        yfinance: 1000,
        finnhub: 1060,
      },
    },
  },
};

export const mockFreshnessAndQuality = {
  data_quality: {
    field_quality: {
      revenue: {
        status: 'stale',
        source: 'idx_official',
        confidence_score: 90,
        reason: null,
        warnings: ['Data is stale based on field freshness policy'],
        as_of_date: '2024-03-31',
        freshness_status: {
          status: 'stale',
          is_stale: true,
          age_seconds: 700000,
          ttl_seconds: 604800,
          warnings: ['Data is stale based on field freshness policy'],
        },
      },
      last_price: mockConflictDataQuality.field_quality.last_price,
      sma_20: COMMON_FIELD_QUALITY.sma_20,
      sma_200: COMMON_FIELD_QUALITY.sma_200,
      dividend_yield: COMMON_FIELD_QUALITY.dividend_yield,
    },
  },
};

const MOCK_COMPANY_PROFILE = {
  available: true,
  ticker: 'NVDA',
  company_name: 'NVIDIA Corporation',
  exchange: 'NASDAQ',
  currency: 'USD',
  country: 'United States',
  sector: 'Technology',
  industry: 'Semiconductors',
  website: 'https://www.nvidia.com',
  market_cap: 2300000000000,
  shares_outstanding: 24400000000,
  current_price: 940,
  fiscal_year_end: 'January',
  employee_count: 36000,
  business_summary:
    'NVIDIA Corporation provides accelerated computing platforms, graphics processors, networking products, and software for data center, gaming, professional visualization, and automotive markets.',
  officers: [
    { name: 'Mr. Jen-Hsun Huang', title: 'President, CEO & Director' },
    { name: 'Ms. Colette M. Kress', title: 'Executive VP & CFO' },
  ],
  data_quality: { status: 'complete', missing_fields: [], sources_used: ['mock'] },
};

const MOCK_IDX_COMPANY_PROFILE = {
  available: true,
  ticker: 'BBCA.JK',
  company_name: 'PT Bank Central Asia Tbk',
  exchange: 'IDX',
  currency: 'IDR',
  country: 'Indonesia',
  sector: 'Financial Services',
  industry: 'Banks - Regional',
  website: 'https://www.bca.co.id',
  market_cap: 1205000000000000,
  shares_outstanding: 123275050000,
  current_price: 9800,
  fiscal_year_end: 'December',
  employee_count: 27682,
  business_summary:
    'PT Bank Central Asia Tbk provides commercial banking and other financial services. The company offers deposits, loans, credit cards, investment products, and transaction banking services.',
  officers: [
    { name: 'Mr. Gregory Hendra Lembong', title: 'President Director' },
    { name: 'Mr. Armand Wahyudi Hartono', title: 'Deputy President Director' },
    { name: 'Mr. John Kosasih', title: 'Commercial & SME Banking Director' },
  ],
  data_quality: { status: 'complete', missing_fields: [], sources_used: ['mock'] },
};

const MOCK_NEWS_CONTEXT = {
  enabled: true,
  ticker: 'NVDA',
  company_name: 'NVIDIA Corporation',
  window_days: 30,
  providers_used: ['marketaux', 'newsdata'],
  provider_status: {
    marketaux: 'success',
    newsdata: 'success',
  },
  articles_found: 2,
  articles_used_in_prompt: 2,
  average_sentiment: 'neutral_positive',
  articles: [
    {
      provider: 'marketaux',
      provider_article_id: 'mock-marketaux-1',
      ticker: 'NVDA',
      company_name: 'NVIDIA Corporation',
      title: 'Mock earnings coverage supports a measured large-cap outlook',
      summary:
        'Synthetic MarketAux article used to verify normalized news rendering without spending vendor quota.',
      url: 'https://example.com/mock-marketaux-news',
      source: 'example-finance.test',
      published_at: '2026-05-17T09:30:00Z',
      sentiment_label: 'positive',
      sentiment_score: 0.32,
      relevance_score: 92,
      relevance_reasons: ['exact_entity_symbol', 'company_name_in_title'],
      entities: [{ symbol: 'NVDA', name: 'NVIDIA Corporation', match_score: 88.4 }],
    },
    {
      provider: 'newsdata',
      provider_article_id: 'mock-newsdata-1',
      ticker: 'NVDA',
      company_name: 'NVIDIA Corporation',
      title: 'Mock market report tracks sector demand and valuation risk',
      summary:
        'Synthetic NewsData.io fallback article used to verify provider badges, summaries, and links.',
      url: 'https://example.com/mock-newsdata-news',
      source: 'example-market.test',
      published_at: '2026-05-16T08:00:00Z',
      sentiment_label: 'neutral',
      sentiment_score: 0.04,
      relevance_score: 76,
      relevance_reasons: ['company_alias_in_summary'],
      entities: [{ symbol: 'NVDA', name: 'NVIDIA Corporation' }],
    },
  ],
  empty_reason: null,
  cache: { hit: false },
};

const MOCK_FINANCIAL_HIGHLIGHTS_BASE = {
  title: 'Key Financial Highlights',
  currency: 'USD',
  scale: 'billion',
  analysis_date: '2026-05-18',
  period_logic: 'fy22_to_analysis_quarter',
  periods: [
    { key: 'FY22', label: 'FY22', type: 'annual', year: 2022, quarter: null },
    { key: 'FY23', label: 'FY23', type: 'annual', year: 2023, quarter: null },
    { key: 'FY24', label: 'FY24', type: 'annual', year: 2024, quarter: null },
    { key: 'FY25', label: 'FY25', type: 'annual', year: 2025, quarter: null },
    { key: 'FY26Q1', label: 'Q1 2026', type: 'quarterly', year: 2026, quarter: 1 },
  ],
  rows: [
    {
      key: 'revenue',
      label: 'Revenue',
      unit: 'USD Bn',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable', source_vendor: null },
        FY23: { value: 60.9, display: '60.9', status: 'reported', source_vendor: 'mock' },
        FY24: { value: 130.5, display: '130.5', status: 'reported', source_vendor: 'mock' },
        FY25: { value: 208.7, display: '208.7', status: 'reported', source_vendor: 'mock' },
        FY26Q1: {
          value: null,
          display: 'N/A',
          status: 'unavailable',
          source_vendor: null,
        },
      },
    },
    {
      key: 'revenue_growth',
      label: 'Revenue Growth (%)',
      unit: '%',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: { value: 126, display: '126', status: 'calculated', formula: 'Revenue YoY growth' },
        FY24: {
          value: 114.3,
          display: '114.3',
          status: 'calculated',
          formula: 'Revenue YoY growth',
        },
        FY25: { value: 59.9, display: '59.9', status: 'calculated', formula: 'Revenue YoY growth' },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
    {
      key: 'ebitda',
      label: 'EBITDA',
      unit: 'USD Bn',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: { value: 32.9, display: '32.9', status: 'reported', source_vendor: 'mock' },
        FY24: { value: 88.2, display: '88.2', status: 'reported', source_vendor: 'mock' },
        FY25: { value: 141.9, display: '141.9', status: 'reported', source_vendor: 'mock' },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
    {
      key: 'ebitda_margin',
      label: 'EBITDA Margin (%)',
      unit: '%',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: { value: 54, display: '54', status: 'calculated', formula: 'EBITDA / Revenue' },
        FY24: { value: 67.6, display: '67.6', status: 'calculated', formula: 'EBITDA / Revenue' },
        FY25: { value: 68, display: '68', status: 'calculated', formula: 'EBITDA / Revenue' },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
    {
      key: 'net_profit',
      label: 'Net Profit',
      unit: 'USD Bn',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: { value: 29.8, display: '29.8', status: 'reported', source_vendor: 'mock' },
        FY24: { value: 72.9, display: '72.9', status: 'reported', source_vendor: 'mock' },
        FY25: { value: 113.4, display: '113.4', status: 'reported', source_vendor: 'mock' },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
    {
      key: 'net_profit_growth',
      label: 'Net Profit Growth (%)',
      unit: '%',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: {
          value: 581.3,
          display: '581.3',
          status: 'calculated',
          formula: 'Net Profit YoY growth',
        },
        FY24: {
          value: 144.6,
          display: '144.6',
          status: 'calculated',
          formula: 'Net Profit YoY growth',
        },
        FY25: {
          value: 55.6,
          display: '55.6',
          status: 'calculated',
          formula: 'Net Profit YoY growth',
        },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
    {
      key: 'net_profit_margin',
      label: 'Net Profit Margin (%)',
      unit: '%',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: {
          value: 48.9,
          display: '48.9',
          status: 'calculated',
          formula: 'Net Profit / Revenue',
        },
        FY24: {
          value: 55.9,
          display: '55.9',
          status: 'calculated',
          formula: 'Net Profit / Revenue',
        },
        FY25: {
          value: 54.3,
          display: '54.3',
          status: 'calculated',
          formula: 'Net Profit / Revenue',
        },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
    {
      key: 'roe',
      label: 'ROE (%)',
      unit: '%',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: {
          value: 69.2,
          display: '69.2',
          status: 'calculated',
          formula: 'Net Profit / Average Equity',
        },
        FY24: {
          value: 115.7,
          display: '115.7',
          status: 'calculated',
          formula: 'Net Profit / Average Equity',
        },
        FY25: {
          value: 101.5,
          display: '101.5',
          status: 'calculated',
          formula: 'Net Profit / Average Equity',
        },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
    {
      key: 'eps',
      label: 'EPS',
      unit: 'USD/share',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: { value: 1.19, display: '1.19', status: 'reported', source_vendor: 'mock' },
        FY24: { value: 2.94, display: '2.94', status: 'reported', source_vendor: 'mock' },
        FY25: { value: 4.62, display: '4.62', status: 'reported', source_vendor: 'mock' },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
    {
      key: 'bvps',
      label: 'BVPS',
      unit: 'USD/share',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: {
          value: 1.73,
          display: '1.73',
          status: 'calculated',
          formula: 'Total Equity / Shares Outstanding',
        },
        FY24: {
          value: 2.66,
          display: '2.66',
          status: 'calculated',
          formula: 'Total Equity / Shares Outstanding',
        },
        FY25: {
          value: 4.28,
          display: '4.28',
          status: 'calculated',
          formula: 'Total Equity / Shares Outstanding',
        },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
    {
      key: 'der',
      label: 'DER',
      unit: 'Ratio',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: {
          value: 0.45,
          display: '0.45',
          status: 'calculated',
          formula: 'Total Debt / Total Equity',
        },
        FY24: {
          value: 0.41,
          display: '0.41',
          status: 'calculated',
          formula: 'Total Debt / Total Equity',
        },
        FY25: {
          value: 0.38,
          display: '0.38',
          status: 'calculated',
          formula: 'Total Debt / Total Equity',
        },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
    {
      key: 'dividend_yield',
      label: 'Dividend Yield (%)',
      unit: '%',
      values: {
        FY22: { value: null, display: 'N/A', status: 'unavailable' },
        FY23: {
          value: 0.03,
          display: '0.03',
          status: 'calculated',
          formula: 'Dividend per Share / Reference Price',
        },
        FY24: {
          value: 0.03,
          display: '0.03',
          status: 'calculated',
          formula: 'Dividend per Share / Reference Price',
        },
        FY25: {
          value: 0.03,
          display: '0.03',
          status: 'calculated',
          formula: 'Dividend per Share / Reference Price',
        },
        FY26Q1: { value: null, display: 'N/A', status: 'unavailable' },
      },
    },
  ],
  notes: [
    'Periods start from FY22 and extend dynamically based on the analysis date quarter.',
    'Older historical periods remain visible even when vendor data is unavailable; missing values are shown as N/A.',
    'Unavailable values are shown as N/A.',
  ],
  data_quality: {
    status: 'partial',
    missing_metrics: [],
    missing_periods: ['FY22', 'Q1 2026'],
    sources_used: ['mock'],
  },
};

const FINANCIAL_SECTIONS = [
  ['market_scale', 'Market & Scale', ['revenue', 'ebitda', 'net_profit']],
  ['growth', 'Growth', ['revenue_growth', 'net_profit_growth']],
  ['profitability', 'Profitability', ['ebitda_margin', 'net_profit_margin', 'roe']],
  ['per_share_balance_sheet', 'Per Share & Balance Sheet', ['eps', 'bvps', 'der']],
  ['dividends', 'Dividends', ['dividend_yield', 'payout_ratio']],
];

function createMockFinancialHighlights({ currency = 'USD', currencyLabel = 'US Dollar' } = {}) {
  const payload = JSON.parse(JSON.stringify(MOCK_FINANCIAL_HIGHLIGHTS_BASE));
  const isIdr = currency === 'IDR';
  const scale = isIdr ? 'billion' : 'million';
  const scaleLabel = `${currency} ${isIdr ? 'Bn' : 'Mn'}`;
  const sectionByMetric = Object.fromEntries(
    FINANCIAL_SECTIONS.flatMap(([sectionKey, _title, keys]) => keys.map((key) => [key, sectionKey]))
  );
  const percentKeys = new Set([
    'revenue_growth',
    'ebitda_margin',
    'net_profit_growth',
    'net_profit_margin',
    'roe',
    'dividend_yield',
    'payout_ratio',
  ]);
  const currencyKeys = new Set(['revenue', 'ebitda', 'net_profit']);

  payload.rows.push({
    key: 'payout_ratio',
    label: 'Payout Ratio (%)',
    unit: '%',
    values: Object.fromEntries(
      payload.periods.map((period) => [
        period.key,
        { value: null, display: 'N/A', status: 'unavailable' },
      ])
    ),
  });

  payload.rows = payload.rows.map((row) => {
    const formatType = currencyKeys.has(row.key)
      ? 'currency_scaled'
      : percentKeys.has(row.key)
        ? 'percent'
        : row.key === 'der'
          ? 'ratio'
          : 'per_share';
    const unit =
      formatType === 'currency_scaled'
        ? scaleLabel
        : formatType === 'per_share'
          ? `${currency}/share`
          : formatType === 'ratio'
            ? 'x'
            : '%';
    const values = Object.fromEntries(
      Object.entries(row.values).map(([period, cell]) => {
        if (cell.status === 'unavailable' || cell.value == null) return [period, cell];
        const value =
          formatType === 'currency_scaled' ? Number(cell.value) * 1000 : Number(cell.value);
        const display =
          formatType === 'currency_scaled'
            ? value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            : formatType === 'percent'
              ? `${value.toFixed(2)}%`
              : formatType === 'ratio'
                ? `${value.toFixed(2)}x`
                : value.toFixed(2);
        return [period, { ...cell, value, display }];
      })
    );
    return {
      ...row,
      label: row.key === 'net_profit_margin' ? 'Net Profit Margin / Profit Margin (%)' : row.label,
      unit,
      format_type: formatType,
      section_key: sectionByMetric[row.key],
      values,
    };
  });
  payload.currency = currency;
  payload.currency_label = currencyLabel;
  payload.scale = scale;
  payload.scale_label = scaleLabel;
  payload.unit_note = `Currency: ${currency} (${currencyLabel}) | Amount figures: in ${scale}s (${scaleLabel}) | Per-share values: ${currency}/share | Percent metrics: shown with % | DER: ratio (x)`;
  payload.point_in_time = [
    {
      key: 'market_cap',
      label: 'Market Cap',
      value: isIdr ? 1205000 : 2300000,
      display: isIdr ? '1,205,000.0' : '2,300,000.0',
      unit: scaleLabel,
      as_of: payload.analysis_date,
      status: 'reported',
      source_vendor: 'mock',
      source_field: 'market_cap',
    },
  ];
  payload.sections = FINANCIAL_SECTIONS.map(([key, title, rowKeys]) => ({
    key,
    title,
    rows: rowKeys.map((rowKey) => payload.rows.find((row) => row.key === rowKey)),
  }));
  payload.data_quality.missing_metrics = ['payout_ratio'];
  return payload;
}

export const MOCK_FINANCIAL_HIGHLIGHTS = createMockFinancialHighlights();
const MOCK_IDX_FINANCIAL_HIGHLIGHTS = createMockFinancialHighlights({
  currency: 'IDR',
  currencyLabel: 'Indonesian Rupiah',
});

export const mockNormalizedPeriodRows = [
  {
    period: {
      period_label: 'FY2024',
      period_type: 'annual',
      fiscal_year: 2024,
      fiscal_quarter: null,
      period_start: '2024-01-01',
      period_end: '2024-12-31',
      reported_date: '2025-03-31',
      as_of_date: '2025-03-31',
      is_restated: false,
      audit_status: 'audited',
      currency: 'IDR',
      unit: 'raw',
    },
    revenue: {
      raw_value: 106000000000000,
      raw_unit: 'raw',
      raw_currency: 'IDR',
      normalized_value: 106000000000000,
      normalized_currency: 'IDR',
      status: 'available',
      warnings: [],
    },
  },
];

function mockMetric(value, display, formula, status = 'calculated') {
  return { value, display, status: value == null ? 'unavailable' : status, formula };
}

function createMockFundamentalAnalysis({
  currency = 'USD',
  currentPrice = 920,
  financialSector = false,
  highlights = MOCK_FINANCIAL_HIGHLIGHTS,
  primaryTicker = 'NVDA',
  peerTicker = 'AMD',
  peerName = 'Advanced Micro Devices, Inc.',
} = {}) {
  const isIdr = currency === 'IDR';
  const primaryMethod = financialSector ? 'P/BV' : 'EV/EBITDA';
  const fairValues = isIdr ? [8400, 10500, 12600] : [760, 940, 1120];
  const upside = fairValues.map((value) =>
    Number((((value - currentPrice) / currentPrice) * 100).toFixed(2))
  );
  const quality = { status: 'complete', missing_fields: [], fallback_used: [], warnings: [] };
  const partialQuality = {
    status: 'partial',
    missing_fields: ['Q1 2026 net_profit_growth_percent'],
    fallback_used: [],
    warnings: ['Latest quarterly growth comparison is unavailable.'],
  };
  const fairValueDetails = {
    current_price: mockMetric(
      currentPrice,
      `${currency} ${currentPrice.toLocaleString()}`,
      'Last close price'
    ),
    bear: mockMetric(
      fairValues[0],
      `${currency} ${fairValues[0].toLocaleString()}`,
      `${primaryMethod} bear policy`
    ),
    base: mockMetric(
      fairValues[1],
      `${currency} ${fairValues[1].toLocaleString()}`,
      `${primaryMethod} base policy`
    ),
    bull: mockMetric(
      fairValues[2],
      `${currency} ${fairValues[2].toLocaleString()}`,
      `${primaryMethod} bull policy`
    ),
    bear_upside_percent: mockMetric(
      upside[0],
      `${upside[0]}%`,
      '(Bear Fair Value - Current Price) / Current Price * 100'
    ),
    base_upside_percent: mockMetric(
      upside[1],
      `${upside[1]}%`,
      '(Base Fair Value - Current Price) / Current Price * 100'
    ),
    bull_upside_percent: mockMetric(
      upside[2],
      `${upside[2]}%`,
      '(Bull Fair Value - Current Price) / Current Price * 100'
    ),
  };
  const scenarioDetails = Object.fromEntries(
    ['bear', 'base', 'bull'].map((key, index) => {
      const growth = 12 + index * 3;
      const margin = 42 + index * 2;
      return [
        key,
        {
          fair_value: fairValueDetails[key],
          upside_downside_percent: fairValueDetails[`${key}_upside_percent`],
          revenue_growth_assumption_percent: mockMetric(
            growth,
            `${growth}%`,
            'Latest revenue growth adjusted for scenario'
          ),
          margin_assumption_percent: mockMetric(
            margin,
            `${margin}%`,
            'Latest net profit margin adjusted for scenario'
          ),
        },
      ];
    })
  );
  const trendMapping = {
    revenue: 'revenue',
    revenue_growth_percent: 'revenue_growth',
    ebitda: 'ebitda',
    ebitda_margin_percent: 'ebitda_margin',
    net_profit: 'net_profit',
    net_profit_growth_percent: 'net_profit_growth',
    net_profit_margin_percent: 'net_profit_margin',
    roe_percent: 'roe',
    eps: 'eps',
    bvps: 'bvps',
    der: 'der',
  };
  const trendDetails = Object.fromEntries(
    Object.entries(trendMapping).map(([key, rowKey]) => [
      key,
      highlights.periods.map((period) => {
        const cell = highlights.rows.find((row) => row.key === rowKey)?.values?.[period.key] || {
          value: null,
          display: 'N/A',
          status: 'unavailable',
        };
        return { ...cell, formula: cell.formula || 'Financial highlight period value' };
      }),
    ])
  );
  const valuationDetails = isIdr
    ? {
        market_cap: mockMetric(
          1205000000000000,
          '1,205,000.0 IDR Bn',
          'Current Price * Shares Outstanding'
        ),
        enterprise_value: mockMetric(
          1240000000000000,
          '1,240,000.0 IDR Bn',
          'Market Cap + Total Debt - Cash'
        ),
        pe: mockMetric(19.4, '19.40x', 'Market Cap / Net Profit'),
        pbv: mockMetric(4.2, '4.20x', 'Market Cap / Total Equity'),
        ps: mockMetric(7.1, '7.10x', 'Market Cap / Revenue'),
        ev_ebitda: mockMetric(16.8, '16.80x', 'Enterprise Value / EBITDA'),
      }
    : {
        market_cap: mockMetric(
          2244800000000,
          '2,244,800.0 USD Mn',
          'Current Price * Shares Outstanding'
        ),
        enterprise_value: mockMetric(
          2260000000000,
          '2,260,000.0 USD Mn',
          'Market Cap + Total Debt - Cash'
        ),
        pe: mockMetric(44.5, '44.50x', 'Market Cap / Net Profit'),
        pbv: mockMetric(38.2, '38.20x', 'Market Cap / Total Equity'),
        ps: mockMetric(20.1, '20.10x', 'Market Cap / Revenue'),
        ev_ebitda: mockMetric(30.4, '30.40x', 'Enterprise Value / EBITDA'),
      };
  const earningsDetails = {
    cfo_to_net_income: mockMetric(
      isIdr ? 1.08 : 1.22,
      isIdr ? '1.08x' : '1.22x',
      'Operating Cash Flow / Net Income'
    ),
    free_cash_flow: mockMetric(
      isIdr ? 52000000000000 : 65000000000,
      isIdr ? '52,000.0 IDR Bn' : '65,000.0 USD Mn',
      'Operating Cash Flow - Capex'
    ),
    capex_intensity_percent: mockMetric(
      isIdr ? 2.1 : 4.8,
      isIdr ? '2.10%' : '4.80%',
      'Capex / Revenue * 100'
    ),
  };
  const balanceSheetDetails = {
    der: mockMetric(isIdr ? 0.62 : 0.35, isIdr ? '0.62x' : '0.35x', 'Total Debt / Total Equity'),
    net_debt: mockMetric(
      isIdr ? 35000000000000 : -12000000000,
      isIdr ? '35,000.0 IDR Bn' : '-12,000.0 USD Mn',
      'Total Debt - Cash'
    ),
    debt_to_ebitda: mockMetric(
      isIdr ? 1.6 : 0.42,
      isIdr ? '1.60x' : '0.42x',
      'Total Debt / EBITDA'
    ),
    cash_ratio: mockMetric(
      isIdr ? 0.19 : 1.32,
      isIdr ? '0.19x' : '1.32x',
      'Cash / Current Liabilities'
    ),
    equity_ratio: mockMetric(
      isIdr ? 0.14 : 0.58,
      isIdr ? '0.14x' : '0.58x',
      'Total Equity / Total Assets'
    ),
  };
  const dividendDetails = {
    dividend_yield_percent: mockMetric(
      isIdr ? 2.7 : 0.04,
      isIdr ? '2.70%' : '0.04%',
      'Dividend per Share / Current Price * 100'
    ),
    payout_ratio_percent: mockMetric(
      isIdr ? 48 : 1.8,
      isIdr ? '48.00%' : '1.80%',
      'Dividend per Share / EPS * 100'
    ),
    fcf_coverage: mockMetric(
      isIdr ? 2.2 : 18.5,
      isIdr ? '2.20x' : '18.50x',
      'Free Cash Flow / Dividend Paid'
    ),
  };
  const financialWarnings = financialSector
    ? [
        'Generic DER risk level is not applied to financial-sector companies. Use sector-specific review.',
      ]
    : [];

  return {
    financial_trends: {
      currency,
      scale: highlights.scale,
      scale_label: highlights.scale_label,
      unit_note: highlights.unit_note,
      periods: highlights.periods,
      metrics: Object.fromEntries(
        Object.entries(trendDetails).map(([key, cells]) => [key, cells.map((cell) => cell.value)])
      ),
      metric_details: trendDetails,
      summary: {
        growth_trend: 'improving',
        margin_trend: 'stable',
        profitability_trend: 'improving',
        leverage_trend: 'stable',
      },
      data_quality: partialQuality,
    },
    valuation_multiples: {
      currency,
      ...Object.fromEntries(
        Object.entries(valuationDetails).map(([key, item]) => [key, item.value])
      ),
      metric_details: valuationDetails,
      interpretation: {
        valuation_label: financialSector ? 'expensive' : 'expensive',
        primary_method: primaryMethod,
        main_reason: `${primaryMethod} is compared with the documented base policy multiple.`,
      },
      data_quality: quality,
    },
    fair_value_range: {
      currency,
      ...Object.fromEntries(
        Object.entries(fairValueDetails).map(([key, item]) => [key, item.value])
      ),
      metric_details: fairValueDetails,
      method: 'multiple-based valuation',
      primary_method: primaryMethod,
      assumptions: [`Base case uses the documented ${primaryMethod} policy multiple.`],
      data_quality: quality,
    },
    scenario_analysis: {
      currency,
      bear: {
        fair_value: fairValues[0],
        fair_value_display: fairValueDetails.bear.display,
        upside_downside_percent: upside[0],
        upside_downside_display: `${upside[0]}%`,
        revenue_growth_assumption_percent: 12,
        margin_assumption_percent: 42,
        valuation_multiple: financialSector ? '1.0x P/BV' : '6.0x EV/EBITDA',
        assumption: 'Lower growth and multiple compression',
      },
      base: {
        fair_value: fairValues[1],
        fair_value_display: fairValueDetails.base.display,
        upside_downside_percent: upside[1],
        upside_downside_display: `${upside[1]}%`,
        revenue_growth_assumption_percent: 15,
        margin_assumption_percent: 44,
        valuation_multiple: financialSector ? '1.5x P/BV' : '8.0x EV/EBITDA',
        assumption: 'Current operating profile and base policy multiple',
      },
      bull: {
        fair_value: fairValues[2],
        fair_value_display: fairValueDetails.bull.display,
        upside_downside_percent: upside[2],
        upside_downside_display: `${upside[2]}%`,
        revenue_growth_assumption_percent: 18,
        margin_assumption_percent: 46,
        valuation_multiple: financialSector ? '2.0x P/BV' : '10.0x EV/EBITDA',
        assumption: 'Higher growth and multiple expansion',
      },
      metric_details: scenarioDetails,
      data_quality: quality,
    },
    quality_of_earnings: {
      ...Object.fromEntries(
        Object.entries(earningsDetails).map(([key, item]) => [key, item.value])
      ),
      metric_details: earningsDetails,
      accrual_risk: 'low',
      rating: 'healthy',
      notes: ['Operating cash flow covers reported net income.'],
      data_quality: quality,
    },
    balance_sheet_risk: {
      ...Object.fromEntries(
        Object.entries(balanceSheetDetails).map(([key, item]) => [key, item.value])
      ),
      metric_details: balanceSheetDetails,
      risk_level: financialSector ? 'N/A' : 'low',
      risk_flags: financialWarnings.length ? financialWarnings : ['Leverage remains manageable.'],
      data_quality: {
        ...quality,
        status: financialWarnings.length ? 'partial' : 'complete',
        warnings: financialWarnings,
      },
    },
    dividend_quality: {
      ...Object.fromEntries(
        Object.entries(dividendDetails).map(([key, item]) => [key, item.value])
      ),
      metric_details: dividendDetails,
      sustainability: 'sustainable',
      notes: ['Dividend quality uses reported dividend data.'],
      data_quality: quality,
    },
    peer_comparison: {
      primary_ticker: primaryTicker,
      peers: [peerTicker],
      metrics: [
        {
          ticker: primaryTicker,
          company_name: financialSector ? 'PT Bank Central Asia Tbk' : 'NVIDIA Corporation',
          pe: valuationDetails.pe.display,
          pbv: valuationDetails.pbv.display,
          roe_percent: financialSector ? 24.5 : 89.3,
          net_profit_margin_percent: financialSector ? 45.1 : 55.2,
          der: balanceSheetDetails.der.display,
          dividend_yield_percent: dividendDetails.dividend_yield_percent.value,
        },
        {
          ticker: peerTicker,
          company_name: peerName,
          pe: '31.20x',
          pbv: '4.10x',
          roe_percent: 18.4,
          net_profit_margin_percent: 16.8,
          der: '0.28x',
          dividend_yield_percent: 1.2,
        },
      ],
      ranking_summary: {
        valuation: 'Primary ticker trades above its peer on the selected policy multiple.',
      },
      data_quality: quality,
    },
  };
}

export const MOCK_FUNDAMENTAL_ANALYSIS = createMockFundamentalAnalysis();
const MOCK_IDX_FUNDAMENTAL_ANALYSIS = createMockFundamentalAnalysis({
  currency: 'IDR',
  currentPrice: 9800,
  financialSector: true,
  highlights: MOCK_IDX_FINANCIAL_HIGHLIGHTS,
  primaryTicker: 'BBCA.JK',
  peerTicker: 'BBRI.JK',
  peerName: 'PT Bank Rakyat Indonesia (Persero) Tbk',
});

export const MOCK_PIPELINE_STEPS = [
  {
    agent_id: 'data_collection',
    agent_name: 'DATA COLLECTION',
    running: 'Fetching mock price history, fundamentals, and news snapshot...',
    completed: 'Mock market data package prepared.',
  },
  {
    agent_id: 'market_analyst',
    agent_name: 'MARKET ANALYST',
    running: 'Reading mock price trend, volume behavior, and momentum context...',
    completed: 'Mock market structure analysis complete.',
  },
  {
    agent_id: 'news_analyst',
    agent_name: 'NEWS + SOCIAL',
    running: 'Reviewing mock headlines and sentiment drivers...',
    completed: 'Mock news sentiment analysis complete.',
  },
  {
    agent_id: 'fundamentals',
    agent_name: 'FUNDAMENTALS ANALYST',
    running: 'Checking mock growth, margins, valuation, and balance sheet quality...',
    completed: 'Mock fundamental review complete.',
  },
  {
    agent_id: 'bull_researcher',
    agent_name: 'BULL RESEARCHER',
    running: 'Building the mock optimistic case and upside scenario...',
    completed: 'Mock bull case complete.',
  },
  {
    agent_id: 'bear_researcher',
    agent_name: 'BEAR RESEARCHER',
    running: 'Building the mock downside case and key risk scenario...',
    completed: 'Mock bear case complete.',
  },
  {
    agent_id: 'research_manager',
    agent_name: 'RESEARCH MANAGER',
    running: 'Reconciling mock bull and bear arguments into a decision frame...',
    completed: 'Mock research verdict complete.',
  },
  {
    agent_id: 'trader',
    agent_name: 'TRADER',
    running: 'Drafting mock entry, stop loss, take profit, and execution plan...',
    completed: 'Mock trade plan complete.',
  },
  {
    agent_id: 'risk_analysts',
    agent_name: 'RISK ANALYSTS',
    running: 'Stress testing mock drawdown, volatility, and invalidation levels...',
    completed: 'Mock risk review complete.',
  },
  {
    agent_id: 'portfolio_manager',
    agent_name: 'PORTFOLIO MANAGER',
    running: 'Finalizing mock allocation and portfolio action...',
    completed: 'Mock portfolio decision complete.',
  },
];

function normalizeTimeHorizonMonths(value) {
  const months = Number(value);
  return [1, 2, 3].includes(months) ? months : 1;
}

function formatTimeHorizon(months) {
  const normalized = normalizeTimeHorizonMonths(months);
  return `${normalized} Month${normalized > 1 ? 's' : ''}`;
}

function createMockPriceChart({ ticker = 'BBCA.JK', tradeDate = '2026-05-30', months = 1 } = {}) {
  const lookbackDays = normalizeTimeHorizonMonths(months) * 30 + 30;
  const points = [];
  const end = new Date(`${tradeDate}T00:00:00Z`);
  let previousClose = ticker.endsWith('.JK') ? 9000 : 900;

  for (let i = lookbackDays - 1; i >= 0; i -= 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - i);
    const sequence = lookbackDays - i;
    const scale = ticker.endsWith('.JK') ? 1 : 0.1;
    const direction = sequence % 7 === 0 || sequence % 11 === 0 ? -1 : 1;
    const bodyMove = direction * (20 + (sequence % 6) * 8) * scale;
    const open = previousClose + (sequence % 3 === 0 ? -12 : 10) * scale;
    const close = open + bodyMove;
    const high = Math.max(open, close) + (35 + (sequence % 4) * 8) * scale;
    const low = Math.min(open, close) - (35 + (sequence % 5) * 7) * scale;

    points.push({
      date: date.toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      adjusted_close: close,
      volume: 70000000 + (sequence % 10) * 2500000,
    });

    previousClose = close;
  }

  const closes = points.map((item) => item.close);
  const volumes = points.map((item) => item.volume);
  const startPrice = closes[0];
  const endPrice = closes[closes.length - 1];
  const change = endPrice - startPrice;
  const averageVolume = Math.round(volumes.reduce((sum, value) => sum + value, 0) / volumes.length);
  const latestVolume = volumes[volumes.length - 1];
  const periodReturn = Number(((change / startPrice) * 100).toFixed(2));
  let peak = closes[0];
  let maxDrawdown = 0;
  closes.forEach((close) => {
    if (close > peak) peak = close;
    maxDrawdown = Math.min(maxDrawdown, ((close - peak) / peak) * 100);
  });
  const summary = {
    period_return_percent: periodReturn,
    period_high: Math.max(...points.map((item) => item.high)),
    period_low: Math.min(...points.map((item) => item.low)),
    max_drawdown_percent: Number(maxDrawdown.toFixed(2)),
    average_volume: averageVolume,
    latest_volume: latestVolume,
    latest_close: endPrice,
    volume_trend:
      latestVolume >= averageVolume * 1.1
        ? 'above_average'
        : latestVolume <= averageVolume * 0.9
          ? 'below_average'
          : 'average',
    performance_label: periodReturn > 0 ? 'positive' : periodReturn < 0 ? 'negative' : 'flat',
  };

  return {
    available: true,
    source: 'mock:yfinance',
    ticker,
    trade_date: tradeDate,
    currency: ticker.endsWith('.JK') ? 'IDR' : 'USD',
    window: `${normalizeTimeHorizonMonths(months)}M`,
    window_label: `${normalizeTimeHorizonMonths(months)} Month${normalizeTimeHorizonMonths(months) > 1 ? 's' : ''} Analysis / ${lookbackDays}D Price Window`,
    lookback_days: lookbackDays,
    points,
    data: points,
    stats: {
      start_price: startPrice,
      end_price: endPrice,
      change,
      change_percent: periodReturn,
      high: Math.max(...points.map((item) => item.high)),
      low: Math.min(...points.map((item) => item.low)),
      average_close: Number(
        (closes.reduce((sum, value) => sum + value, 0) / closes.length).toFixed(2)
      ),
      average_volume: averageVolume,
      point_count: points.length,
    },
    summary,
    data_quality: {
      status: 'complete',
      missing_fields: [],
    },
  };
}

function syncMockPriceChart(chart, options) {
  const fallback = createMockPriceChart(options);
  if (
    chart?.ticker === fallback.ticker &&
    chart?.trade_date === fallback.trade_date &&
    chart?.lookback_days === fallback.lookback_days
  ) {
    return chart;
  }
  return fallback;
}

function createFullDecision({ decision, summary, thesis, timeHorizon }) {
  return `**Rating**: ${decision || 'Hold'}\n\n**Executive Summary**: ${summary || 'N/A'}\n\n**Investment Thesis**: ${thesis || 'N/A'}\n\n**Time Horizon**: ${timeHorizon || 'N/A'}`;
}

function cloneMock(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function syncMockNews(news, ticker) {
  const payload = cloneMock(news || MOCK_NEWS_CONTEXT);
  payload.ticker = ticker;
  payload.articles = Array.isArray(payload.articles)
    ? payload.articles.map((article) => ({
        ...article,
        ticker,
        entities: Array.isArray(article.entities)
          ? article.entities.map((entity) => ({ ...entity, symbol: ticker }))
          : [],
      }))
    : [];
  payload.articles_found = payload.articles.length;
  return payload;
}

function createMockRelatedNews({ ticker = 'BBCA.JK', tradeDate = '2026-05-30', months = 1 } = {}) {
  const lookbackDays = normalizeTimeHorizonMonths(months) * 30;

  return {
    available: true,
    ticker,
    trade_date: tradeDate,
    lookback_days: lookbackDays,
    source: 'mock:yfinance+finnhub+alpha_vantage',
    summary: `Top mock related news for ${ticker}. These items are used only to test News tab layout, links, export behavior, and empty-state handling.`,
    items: [
      {
        title: `${ticker} earnings outlook remains constructive in mock coverage`,
        publisher: 'Mock Market Wire',
        published_at: '2026-05-29T10:00:00Z',
        url: 'https://example.com/mock-news-1',
        normalized_url: 'https://example.com/mock-news-1',
        summary: 'Mock article summary used to validate news card layout and source link behavior.',
        source: 'mock',
        event_type: 'earnings',
        related_ticker: ticker,
        relevance_reason: 'Related to earnings and demand assumptions used in the mock analysis.',
      },
      {
        title: `Sector sentiment supports ${ticker} in mock scenario`,
        publisher: 'Mock Finance Daily',
        published_at: '2026-05-28T09:30:00Z',
        url: 'https://example.com/mock-news-2',
        normalized_url: 'https://example.com/mock-news-2',
        summary: 'Mock sector article used to test broader market context rendering.',
        source: 'mock',
        event_type: 'sector',
        related_ticker: ticker,
        relevance_reason: 'Related to sector sentiment and market context in the mock analysis.',
      },
      {
        title: `${ticker} risk factors remain visible in mock monitoring`,
        publisher: 'Mock Risk Journal',
        published_at: '2026-05-27T08:15:00Z',
        url: 'https://example.com/mock-news-3',
        normalized_url: 'https://example.com/mock-news-3',
        summary: 'Mock risk-focused article used to validate balanced news coverage.',
        source: 'mock',
        event_type: 'general',
        related_ticker: ticker,
        relevance_reason: 'Related to invalidation and risk monitoring in the mock analysis.',
      },
    ],
  };
}

function syncMockRelatedNews(relatedNews, options) {
  const fallback = createMockRelatedNews(options);
  if (!relatedNews) return fallback;

  if (!relatedNews.available) {
    return {
      ...relatedNews,
      ticker: fallback.ticker,
      trade_date: fallback.trade_date,
      lookback_days: fallback.lookback_days,
      items: [],
    };
  }

  if (
    relatedNews.ticker === fallback.ticker &&
    relatedNews.trade_date === fallback.trade_date &&
    relatedNews.lookback_days === fallback.lookback_days
  ) {
    return relatedNews;
  }
  return fallback;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function simpleSma(values, windowSize) {
  if (values.length < windowSize) return null;
  return average(values.slice(-windowSize));
}

function simpleRsi(closes, windowSize = 14) {
  if (closes.length <= windowSize) return null;
  const changes = closes.slice(1).map((close, index) => close - closes[index]);
  const recent = changes.slice(-windowSize);
  const gains = recent.map((value) => Math.max(value, 0));
  const losses = recent.map((value) => Math.abs(Math.min(value, 0)));
  const avgGain = average(gains);
  const avgLoss = average(losses);
  if (!avgLoss) return avgGain ? 100 : 50;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function emaSeries(values, span) {
  if (!values.length) return [];
  const alpha = 2 / (span + 1);
  return values.reduce((series, value, index) => {
    if (index === 0) return [value];
    return [...series, value * alpha + series[index - 1] * (1 - alpha)];
  }, []);
}

function createMockTechnicalEntry(chart) {
  const points = Array.isArray(chart?.data) ? chart.data : chart?.points;
  if (!Array.isArray(points) || points.length < 30) {
    return {
      available: false,
      entry_quality: 'N/A',
      trend: 'N/A',
      rsi: null,
      rsi_signal: 'N/A',
      macd: null,
      macd_signal_value: null,
      macd_signal: 'N/A',
      atr: null,
      sma_20: null,
      sma_50: null,
      sma_200: null,
      support: null,
      resistance: null,
      volume_trend: 'N/A',
      reasons: ['At least 30 usable OHLCV rows are required for technical entry quality.'],
      data_quality: { status: 'insufficient', missing_fields: ['ohlcv_history'] },
    };
  }

  const closes = points.map((point) => Number(point.close));
  const latestClose = closes[closes.length - 1];
  const sma20 = simpleSma(closes, 20);
  const sma50 = simpleSma(closes, 50);
  const sma200 = simpleSma(closes, 200);
  const rsi = simpleRsi(closes);
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdValues = ema12.map((value, index) => value - ema26[index]);
  const macdSignalValues = emaSeries(macdValues, 9);
  const macd = macdValues.at(-1);
  const macdSignalValue = macdSignalValues.at(-1);
  const recent = points.slice(-20);
  const support = Math.min(...recent.map((point) => point.low));
  const resistance = Math.max(...recent.map((point) => point.high));
  const trueRanges = points
    .slice(1)
    .map((point, index) =>
      Math.max(
        point.high - point.low,
        Math.abs(point.high - points[index].close),
        Math.abs(point.low - points[index].close)
      )
    );
  const atr = average(trueRanges.slice(-14));
  const trend =
    sma20 && sma50 && latestClose > sma20 && sma20 > sma50
      ? 'uptrend'
      : sma20 && sma50 && latestClose < sma20 && sma20 < sma50
        ? 'downtrend'
        : 'sideways';
  const rsiSignal = rsi >= 70 ? 'overbought' : rsi <= 30 ? 'oversold' : 'neutral';
  const macdSignal =
    macd > macdSignalValue ? 'bullish' : macd < macdSignalValue ? 'bearish' : 'neutral';
  const entryQuality =
    trend === 'downtrend' || rsiSignal === 'overbought'
      ? 'risky'
      : trend === 'uptrend' && rsi < 65 && macdSignal === 'bullish'
        ? 'good'
        : 'neutral';

  return {
    available: true,
    entry_quality: entryQuality,
    trend,
    rsi: Number(rsi.toFixed(2)),
    rsi_signal: rsiSignal,
    macd: Number(macd.toFixed(2)),
    macd_signal_value: Number(macdSignalValue.toFixed(2)),
    macd_signal: macdSignal,
    atr: Number(atr.toFixed(2)),
    sma_20: Number(sma20.toFixed(2)),
    sma_50: sma50 ? Number(sma50.toFixed(2)) : null,
    sma_200: sma200 ? Number(sma200.toFixed(2)) : null,
    support: Number(support.toFixed(2)),
    resistance: Number(resistance.toFixed(2)),
    volume_trend: chart.summary?.volume_trend || 'average',
    reasons: [
      latestClose > sma20
        ? 'Price is above the 20-day moving average.'
        : 'Price is below the 20-day moving average.',
      `RSI is ${rsiSignal}.`,
      `MACD signal is ${macdSignal}.`,
      `Latest volume is ${(chart.summary?.volume_trend || 'average').replace(/_/g, ' ')}.`,
    ],
    data_quality: {
      status: sma200 ? 'complete' : 'partial',
      missing_fields: sma200 ? [] : ['sma_200'],
    },
  };
}

function mockNewsScopeLabel(scope) {
  return String(scope || 'company')
    .replace(/_/g, ' ')
    .toUpperCase();
}

function makeMockHighImpactNews(index, ticker = 'GOTO.JK') {
  const confidenceLabel =
    index === 1 ? 'VERY_HIGH' : index <= 4 ? 'HIGH' : index === 7 ? 'LOW' : 'MEDIUM';
  const source = index === 1 ? 'IDX Official Disclosure' : index === 7 ? 'Local Blog' : 'Reuters';

  return {
    title: `High Impact ${ticker} News ${index}`,
    source,
    publisher: index === 1 ? 'IDX' : source,
    published_at: `2026-06-${String(index).padStart(2, '0')}`,
    sentiment: index % 2 === 0 ? 'negative' : 'neutral',
    impact: 'high',
    impact_score: 80 + index,
    relevance_score: 90,
    recency_score: 85,
    materiality_score: 90,
    materiality_category: index % 2 === 0 ? 'index' : 'corporate_action',
    source_confidence_score: index === 1 ? 95 : index <= 4 ? 85 : index === 7 ? 45 : 70,
    source_confidence_label: confidenceLabel,
    news_scope: 'company',
    scope_label: 'COMPANY',
    impact_reason: `High impact because this article directly matches ${ticker} and passes materiality filter ${index}.`,
    summary: `Mock high impact summary ${index}.`,
    url: `https://example.com/${ticker.toLowerCase()}-high-${index}`,
    normalized_url: `example.com/${ticker.toLowerCase()}-high-${index}`,
    normalized_title: `high impact ${ticker.toLowerCase()} news ${index}`,
    dedupe_key: `high-${ticker}-${index}`,
    is_high_impact: true,
  };
}

function makeMockFullNews(index, ticker = 'GOTO.JK', scope = 'company', overrides = {}) {
  return {
    title:
      overrides.title ||
      (scope === 'market_context'
        ? `Market Context News ${index}`
        : `Full News ${ticker} Article ${index}`),
    source: overrides.source || (index % 3 === 0 ? 'NewsData' : 'MarketAux'),
    publisher: overrides.publisher || (index % 3 === 0 ? 'NewsData' : 'MarketAux'),
    published_at: overrides.published_at || `2026-05-${String(index).padStart(2, '0')}`,
    sentiment: overrides.sentiment || 'neutral',
    impact: overrides.impact || 'medium',
    impact_score: overrides.impact_score ?? 45 + index,
    relevance_score: overrides.relevance_score ?? (scope === 'market_context' ? 66 : 72),
    recency_score: overrides.recency_score ?? 55,
    materiality_score: overrides.materiality_score ?? (scope === 'market_context' ? 45 : 65),
    materiality_category:
      overrides.materiality_category || (scope === 'market_context' ? 'market_context' : 'sector'),
    source_confidence_score: overrides.source_confidence_score ?? 70,
    source_confidence_label: overrides.source_confidence_label || 'MEDIUM',
    news_scope: scope,
    scope_label: mockNewsScopeLabel(scope),
    impact_reason:
      overrides.impact_reason ||
      (scope === 'market_context'
        ? 'Included as market context and not classified as high impact because it does not directly match the ticker.'
        : 'Included as related full news but below high-impact threshold.'),
    summary: overrides.summary || `Mock full news summary ${index}.`,
    url: overrides.url || `https://example.com/${ticker.toLowerCase()}-full-${index}`,
    normalized_url: overrides.normalized_url || `example.com/${ticker.toLowerCase()}-full-${index}`,
    normalized_title:
      overrides.normalized_title || `full news ${ticker.toLowerCase()} article ${index}`,
    dedupe_key: overrides.dedupe_key || `full-${ticker}-${index}`,
    is_high_impact: false,
  };
}

function createMockNewsImpact({ relatedNews, news, ticker }) {
  const relatedItems = Array.isArray(relatedNews?.items) ? relatedNews.items : [];
  const contextItems = Array.isArray(news?.articles) ? news.articles : [];
  const merged = [...relatedItems, ...contextItems].filter((item) => item?.title && item?.url);
  const seen = new Set();
  const deduped = merged.filter((item) => {
    const key = String(item.dedupe_key || item.normalized_url || item.url || item.title).replace(
      /\?.*$/,
      ''
    );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const normalizedTicker = ticker || 'GOTO.JK';
  const highImpactNews = Array.from({ length: 7 }, (_, index) =>
    makeMockHighImpactNews(index + 1, normalizedTicker)
  );
  const vendorFullNews = deduped.slice(0, 9).map((item, index) =>
    makeMockFullNews(index + 1, normalizedTicker, index % 4 === 1 ? 'sector' : 'company', {
      title: item.title,
      source: item.source || item.provider || 'mock',
      publisher: item.publisher || item.source || item.provider || 'Mock News',
      published_at: item.published_at || '2026-05-29',
      sentiment: item.sentiment || item.sentiment_label || 'neutral',
      impact_score: 55 + index,
      relevance_score: item.relevance_score || 78 - index,
      materiality_category: item.event_type || (index % 4 === 1 ? 'sector' : 'company_news'),
      summary: item.summary || `Mock full news summary for ${normalizedTicker}.`,
      impact_reason:
        item.impact_reason ||
        item.relevance_reason ||
        'Included as related full news but below high-impact threshold.',
      url: item.url,
      normalized_url: item.normalized_url || item.url,
      normalized_title: item.normalized_title || String(item.title).toLowerCase(),
      dedupe_key:
        item.dedupe_key ||
        item.normalized_url ||
        item.url ||
        `full-${normalizedTicker}-${index + 1}`,
    })
  );

  const generatedCompanyNews = Array.from(
    { length: Math.max(0, 9 - vendorFullNews.length) },
    (_, index) => makeMockFullNews(vendorFullNews.length + index + 1, normalizedTicker)
  );
  const fullNewsList = [
    ...vendorFullNews,
    ...generatedCompanyNews,
    makeMockFullNews(10, normalizedTicker, 'market_context'),
    makeMockFullNews(11, normalizedTicker, 'market_context'),
  ];

  return {
    available: true,
    overall_sentiment: 'neutral',
    sentiment_score: 52,
    news_count: merged.length + highImpactNews.length + fullNewsList.length,
    deduplicated_count: highImpactNews.length + fullNewsList.length,
    high_impact_count: highImpactNews.length,
    full_news_count: fullNewsList.length,
    duplicate_excluded_count: Math.max(0, merged.length - deduped.length) + 6,
    high_impact_news: highImpactNews,
    full_news_list: fullNewsList,
    data_quality: {
      status: 'available',
      sources_used: ['IDX Official Disclosure', 'Reuters', 'NewsData', 'MarketAux'],
      source_confidence_breakdown: {
        VERY_HIGH: 1,
        HIGH: 3,
        MEDIUM: 13,
        LOW: 1,
      },
      rules: {
        high_impact_limited: false,
        full_news_limited: false,
        high_impact_removed_from_full_list: true,
      },
    },
  };
}

function createMockCatalystTracker(newsImpact) {
  const positive = (newsImpact.full_news_list || [])
    .filter((item) => item.sentiment === 'positive' && item.impact !== 'low')
    .slice(0, 3)
    .map((item) => ({
      type: item.materiality_category || 'sentiment',
      label: `Positive ${(item.materiality_category || 'sentiment').replace(/_/g, ' ')} catalyst`,
      impact: item.impact,
      source: item.source,
      date: item.published_at,
      related_news_title: item.title,
    }));
  const negative = (newsImpact.full_news_list || [])
    .filter((item) => item.sentiment === 'negative' && item.impact !== 'low')
    .slice(0, 3)
    .map((item) => ({
      type: item.materiality_category || 'sentiment',
      label: `Negative ${(item.materiality_category || 'sentiment').replace(/_/g, ' ')} catalyst`,
      impact: item.impact,
      source: item.source,
      date: item.published_at,
      related_news_title: item.title,
    }));

  return {
    positive_catalysts: positive,
    negative_catalysts: negative,
    upcoming_events: newsImpact.available
      ? [
          {
            type: 'earnings',
            label: 'Upcoming quarterly earnings',
            date: '2026-06-20',
            source: 'Finnhub',
            risk_level: 'medium',
          },
        ]
      : [],
    summary: {
      overall_catalyst_bias: positive.length > negative.length ? 'positive' : 'neutral',
      main_message:
        positive.length > negative.length
          ? 'Positive mock catalysts outweigh current negative catalysts.'
          : 'Positive and negative mock catalysts are balanced.',
    },
  };
}

function createMockAnalystConsensus(ticker) {
  if (String(ticker || '').startsWith('UNVR')) {
    return {
      available: false,
      period: null,
      strong_buy: 0,
      buy: 0,
      hold: 0,
      sell: 0,
      strong_sell: 0,
      total: 0,
      consensus_label: 'N/A',
      trend: 'N/A',
      data_quality: { status: 'unavailable', source: 'Finnhub' },
    };
  }
  return {
    available: true,
    period: '2026-05',
    strong_buy: 4,
    buy: 8,
    hold: 5,
    sell: 1,
    strong_sell: 0,
    total: 18,
    consensus_label: 'positive',
    trend: 'improving',
    data_quality: { status: 'complete', source: 'Finnhub' },
  };
}

function confidencePercent(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score <= 1 ? score * 100 : score)));
}

function confidenceTier(value) {
  const score = confidencePercent(value);
  if (score === null || score < 40) return 'very_low';
  if (score < 55) return 'low';
  if (score < 70) return 'moderate';
  if (score < 85) return 'high';
  return 'very_high';
}

function normalizeRawAiSignal(value) {
  const raw = String(value || 'HOLD')
    .toUpperCase()
    .trim();
  if (raw === 'OVERWEIGHT') return 'BUY';
  if (raw === 'UNDERWEIGHT') return 'SELL';
  if (['BUY', 'HOLD', 'SELL', 'AVOID', 'NEUTRAL'].includes(raw)) return raw;
  return 'HOLD';
}

function signalContextForMock(rawAiSignal, hasExistingPosition, displaySignal) {
  const positionText = hasExistingPosition
    ? 'User has an existing position'
    : 'User has no existing position';
  const verb = rawAiSignal === displaySignal ? 'remains' : 'translated to';
  return `${positionText}. AI signal ${rawAiSignal} ${verb} ${displaySignal}.`;
}

function displaySignalForMock(result) {
  const rawAiSignal = normalizeRawAiSignal(
    result.raw_ai_signal || result.final_decision || result.decision || result.rating
  );
  return resolveDisplaySignal(
    rawAiSignal,
    Boolean(result.has_existing_position),
    result.rebalancing_action
  );
}

function createMockConfidenceBreakdown(result) {
  const overall = confidencePercent(result.confidence_score) ?? 70;
  const riskScore = Math.max(0, Math.min(100, 100 - Number(result.volatility_score || 45)));
  const newsUnavailable = result.data_quality?.news === 'unavailable';
  return {
    price_momentum:
      result.final_decision === 'Sell' ? 35 : result.final_decision === 'Hold' ? 55 : 74,
    fundamental_quality: result.financial_highlights?.data_quality?.status === 'partial' ? 58 : 78,
    news_sentiment: newsUnavailable ? 30 : result.final_decision === 'Sell' ? 38 : 66,
    risk_level_score: riskScore,
    data_quality: newsUnavailable ? 64 : 85,
    overall,
  };
}

function createMockDataFreshness(result) {
  const latestArticleDate = result.news?.articles?.[0]?.published_at?.slice(0, 10) || '2026-05-17';
  const periods = Array.isArray(result.financial_highlights?.periods)
    ? result.financial_highlights.periods
    : [];
  const latestPeriod = periods.length ? periods[periods.length - 1] : {};
  return {
    price: {
      timestamp: result.price_timestamp || result.current_price_as_of || result.trade_date,
      type: result.market_status === 'open' ? 'intraday' : 'previous_close',
      freshness_status: 'fresh',
    },
    financials: {
      period: latestPeriod.label || latestPeriod.key || 'Q1 2026',
      period_end_date: latestPeriod.period_end_date || '2026-03-31',
      freshness_status: 'fresh',
    },
    news: {
      lookback_days: result.news?.window_days || 30,
      articles_count: result.news?.articles_found ?? result.news?.articles?.length ?? 0,
      latest_article_date: latestArticleDate,
      freshness_status: result.data_quality?.news === 'unavailable' ? 'unknown' : 'fresh',
    },
    macro: {
      description: 'Latest available from mock provider',
      freshness_status: 'unknown',
    },
  };
}

function createMockTabStatus(result, dataFreshness) {
  const hasStaleFreshness = Object.values(dataFreshness || {}).some((item) =>
    ['stale', 'outdated'].includes(String(item?.freshness_status || '').toLowerCase())
  );
  return {
    analysis: 'ok',
    profile: 'ok',
    fundamental: result.financial_highlights?.data_quality?.status === 'partial' ? 'partial' : 'ok',
    chart_price: result.current_price ? 'ok' : 'error',
    news: result.data_quality?.news === 'unavailable' ? 'partial' : 'ok',
    risk_data_quality: hasStaleFreshness ? 'warning' : 'ok',
  };
}

function createMockAnalysisParams(result) {
  return {
    ticker: String(result.ticker || '').replace(/\.JK$/i, ''),
    normalized_ticker: result.ticker,
    market: result.market,
    horizon: `${result.time_horizon_months || 1}M`,
    trade_date: result.trade_date,
    debate_rounds: 3,
    analysis_depth: ['fast', 'balanced', 'deep'].includes(result.analysis_depth)
      ? result.analysis_depth
      : 'balanced',
    response_detail: result.response_detail || 'full',
    has_existing_position: Boolean(result.has_existing_position),
    position_quantity: result.position_quantity ?? null,
    average_entry_price: result.average_entry_price ?? null,
  };
}

function hasOwnOverride(overrides = {}, key) {
  return Object.prototype.hasOwnProperty.call(overrides, key);
}

function createMockPhase3(completed, overrides = {}) {
  const pricePerformance = hasOwnOverride(overrides, 'price_performance')
    ? overrides.price_performance
    : completed.price_chart?.summary || {};
  const technicalEntry = hasOwnOverride(overrides, 'technical_entry')
    ? overrides.technical_entry
    : createMockTechnicalEntry(completed.price_chart || {});
  const newsImpact = hasOwnOverride(overrides, 'news_impact')
    ? overrides.news_impact
    : createMockNewsImpact({
        relatedNews: completed.related_news,
        news: completed.news,
        ticker: completed.ticker,
      });
  const catalystTracker = hasOwnOverride(overrides, 'catalyst_tracker')
    ? overrides.catalyst_tracker
    : createMockCatalystTracker(newsImpact);
  const analystConsensus = hasOwnOverride(overrides, 'analyst_consensus')
    ? overrides.analyst_consensus
    : createMockAnalystConsensus(completed.ticker);
  const dataFreshness = hasOwnOverride(overrides, 'data_freshness')
    ? overrides.data_freshness
    : createMockDataFreshness(completed);
  const displaySignal = hasOwnOverride(overrides, 'display_signal')
    ? overrides.display_signal
    : displaySignalForMock(completed);

  return {
    price_performance: pricePerformance,
    technical_entry: technicalEntry,
    news_impact: newsImpact,
    catalyst_tracker: catalystTracker,
    analyst_consensus: analystConsensus,
    raw_ai_signal:
      overrides.raw_ai_signal || completed.final_decision || completed.decision || 'Hold',
    display_signal: displaySignal,
    signal_context:
      overrides.signal_context ||
      (completed.has_existing_position
        ? `Existing-position context converted raw signal to ${displaySignal}.`
        : `No-position context converted raw signal to ${displaySignal}.`),
    confidence_label: overrides.confidence_label || confidenceLabel(completed.confidence_score),
    confidence_tier: overrides.confidence_tier || confidenceTier(completed.confidence_score),
    confidence_breakdown:
      overrides.confidence_breakdown || createMockConfidenceBreakdown(completed),
    data_freshness: dataFreshness,
    tab_status: overrides.tab_status || createMockTabStatus(completed, dataFreshness),
    analysis_params: overrides.analysis_params || createMockAnalysisParams(completed),
  };
}

function normalizeDataQuality(overrides = {}) {
  return {
    ...COMMON_MOCK_QUALITY,
    ...overrides,
    warnings: overrides.warnings || COMMON_MOCK_QUALITY.warnings,
    field_quality: {
      ...COMMON_FIELD_QUALITY,
      ...(overrides.field_quality || {}),
    },
  };
}

function confidenceLabel(value) {
  const score = confidencePercent(value);
  if (score === null || score < 40) return 'Very Low Conviction';
  if (score < 60) return 'Low Conviction';
  if (score < 75) return 'Medium Conviction';
  if (score < 90) return 'High Conviction';
  return 'Very High Conviction';
}

function normalizeInlineText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function truncateReasonWords(text, maxWords = 125) {
  const words = normalizeInlineText(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}.`.replace(/\.\.$/, '.');
}

function createMockKeyReasonsParagraph(result = {}) {
  const direct = normalizeInlineText(
    result.key_reasons_paragraph || result.analysis_overview?.key_reasons_paragraph
  );
  if (direct) return truncateReasonWords(direct, 125);

  const ticker = result.normalized_ticker || result.ticker || 'the selected ticker';
  const signal = result.display_signal || result.final_decision || result.decision || 'HOLD';
  const volatility = result.volatility_classification || result.volatility_level || 'measured';
  const catalysts = Array.isArray(result.key_catalysts) ? result.key_catalysts.filter(Boolean) : [];
  const catalystText = catalysts.length
    ? catalysts.slice(0, 2).join(' and ')
    : 'confirmation from price action and refreshed vendor data';

  return truncateReasonWords(
    `The ${signal} recommendation for ${ticker} is supported by a usable mock contract, visible risk controls, and enough cross-tab data to verify the dashboard without relying on live vendors. Current price, action status, catalyst quality, and ${volatility} volatility remain the main anchors, while ${catalystText} should confirm whether conviction can improve. Position sizing stays disciplined because this result is synthetic and must test rendering, serialization, report export, and data-quality warnings rather than pretend to be a live market call.`,
    125
  );
}

function createMockAnalysisOverview(result) {
  const keyReasonsParagraph = createMockKeyReasonsParagraph(result);

  return {
    recommendation: result.final_decision || result.decision || 'Hold',
    confidence: result.confidence_label || confidenceLabel(result.confidence_score),
    executive_summary: result.executive_summary,
    investment_thesis: result.investment_thesis,
    key_reasons: result.key_reasons || result.key_catalysts || [],
    key_reasons_paragraph: keyReasonsParagraph,
    action_plan: {
      current_price: result.current_price,
      entry: result.entry_price,
      stop_loss: result.stop_loss,
      take_profit: result.take_profit,
      max_drawdown: result.max_drawdown_estimate,
      volatility: result.volatility_level,
      position_action: result.position_action || result.new_entry_action,
      position_size_hint: result.position_size_hint,
      risk_reward_ratio: result.risk_reward_ratio,
      risk_reward_display: result.risk_reward_display,
    },
    risk_summary: {
      overall_risk: String(result.volatility_level || 'N/A').toLowerCase(),
      short_reason:
        result.decision_adjusted_reason ||
        result.position_sizing_reason ||
        `Volatility level is ${result.volatility_level || 'N/A'}.`,
    },
  };
}

function createMockRiskDataQuality(result) {
  const currentPrice = Number(result.current_price || 0);
  const takeProfit = Number(result.take_profit || 0);
  const stopLoss = Number(result.stop_loss || 0);
  const upside =
    currentPrice > 0 && takeProfit > 0 ? ((takeProfit - currentPrice) / currentPrice) * 100 : null;
  const downside =
    currentPrice > 0 && stopLoss > 0 ? ((stopLoss - currentPrice) / currentPrice) * 100 : null;
  const ratio = upside !== null && downside ? Math.abs(upside) / Math.abs(downside) : null;
  const newsUnavailable = result.data_quality?.news === 'unavailable';
  const confidenceScore = newsUnavailable ? 68 : 86;
  const missingFields = [
    {
      module: 'financial_highlights',
      field: 'payout_ratio',
      impact: 'low',
      fallback_available: false,
    },
  ];
  if (newsUnavailable) {
    missingFields.push({
      module: 'news_impact',
      field: 'news',
      impact: 'medium',
      fallback_available: false,
    });
  }

  return {
    risk_summary: {
      overall_risk: result.volatility_level === 'High' ? 'moderate' : 'low',
      risk_score: result.volatility_level === 'High' ? 58 : 34,
      main_risks: newsUnavailable
        ? ['High volatility', 'News coverage unavailable', 'Partial data quality']
        : ['High volatility', 'Valuation sensitivity', 'Mock data quality'],
      risk_flags: [
        'Use disciplined stop loss',
        'Monitor catalyst and vendor status',
        'Avoid oversized entry during volatility spikes',
      ],
      risk_explanation:
        'Mock risk combines balance sheet, market, technical, news, and data quality signals.',
    },
    balance_sheet_risk_summary: {
      der: result.balance_sheet_risk?.metric_details?.der?.display || 'N/A',
      net_debt: result.balance_sheet_risk?.metric_details?.net_debt?.display || 'N/A',
      debt_to_ebitda: result.balance_sheet_risk?.metric_details?.debt_to_ebitda?.display || 'N/A',
      cash_ratio: result.balance_sheet_risk?.metric_details?.cash_ratio?.display || 'N/A',
      risk_level: result.balance_sheet_risk?.risk_level || 'N/A',
      interpretation:
        'Leverage appears manageable in mock data, but debt trend should still be monitored.',
    },
    market_risk: {
      volatility_percent: result.volatility_level === 'High' ? 32.4 : 18.6,
      max_drawdown_percent: result.price_performance?.max_drawdown_percent ?? -12.8,
      atr: result.technical_entry?.atr ?? null,
      price_range_percent: 14.6,
      risk_bucket: result.volatility_level === 'High' ? 'medium' : 'low',
      notes: [
        'Volatility is calculated from mock OHLCV history.',
        'Max drawdown uses the selected mock price window.',
      ],
    },
    risk_adjusted_return: {
      upside_percent: upside === null ? null : Number(upside.toFixed(2)),
      downside_percent: downside === null ? null : Number(downside.toFixed(2)),
      risk_reward_ratio: ratio === null ? 'N/A' : `${ratio.toFixed(1)}x`,
      expected_return_label: ratio >= 1.5 && upside > 0 ? 'attractive' : 'balanced',
      notes: ['Upside and downside use the validated mock action plan.'],
    },
    thesis_monitor: {
      overall_thesis_status: newsUnavailable ? 'valid_with_watch_items' : 'valid',
      checklist: [
        {
          category: 'Financial',
          condition: 'Revenue growth turns negative',
          status: 'valid',
          reason: 'Mock revenue growth remains positive.',
        },
        {
          category: 'Price',
          condition: 'Price breaks stop loss',
          status: 'valid',
          reason: 'Current price remains above stop loss.',
        },
        {
          category: 'News',
          condition: 'Major negative catalyst appears',
          status: newsUnavailable ? 'unknown' : 'valid',
          reason: newsUnavailable
            ? 'News coverage is unavailable in this mock scenario.'
            : 'No high-impact negative news dominates the mock set.',
        },
        {
          category: 'Data',
          condition: 'Important fields missing or vendor confidence low',
          status: confidenceScore >= 80 ? 'valid' : 'watch',
          reason: `Data quality score is ${confidenceScore}.`,
        },
      ],
    },
    catalyst_risk: [
      ...(result.catalyst_tracker?.negative_catalysts || []).map((item) => ({
        type: item.type || 'sentiment',
        label: item.label || 'Negative catalyst',
        impact: item.impact || 'medium',
        date: item.date,
        source: item.source || 'mock',
        reason: item.related_news_title || 'Negative catalyst detected in mock news.',
      })),
      ...(result.catalyst_tracker?.upcoming_events || []).map((item) => ({
        type: item.type || 'event',
        label: item.label || 'Upcoming event risk',
        impact: item.risk_level || 'medium',
        date: item.date,
        source: item.source || 'mock',
        reason: 'Upcoming mock event may increase short-term volatility.',
      })),
    ],
    data_quality: {
      score: confidenceScore,
      confidence: confidenceScore >= 80 ? 'high' : 'medium',
      summary: newsUnavailable
        ? 'Core mock data is available, but news coverage is unavailable.'
        : 'Most critical mock financial, price, and news data are available.',
      score_breakdown: {
        price_data: 95,
        financial_data: 82,
        valuation_data: 88,
        news_data: newsUnavailable ? 20 : 85,
        vendor_success: newsUnavailable ? 60 : 95,
        freshness: 90,
      },
    },
    vendor_status: {
      yfinance: {
        status: 'success',
        used_for: ['price', 'profile', 'financials'],
        missing_fields: [],
      },
      alpha_vantage: {
        status: 'skipped',
        used_for: [],
        missing_fields: [],
      },
      finnhub: {
        status: newsUnavailable ? 'unavailable' : 'success',
        used_for: newsUnavailable ? [] : ['profile', 'analyst_consensus', 'news'],
        missing_fields: newsUnavailable ? ['news'] : [],
      },
      marketaux: {
        status: newsUnavailable ? 'unavailable' : 'success',
        used_for: newsUnavailable ? [] : ['news'],
        missing_fields: newsUnavailable ? ['news'] : [],
      },
      newsdata: {
        status: newsUnavailable ? 'rate_limited' : 'success',
        used_for: newsUnavailable ? [] : ['news'],
        missing_fields: newsUnavailable ? ['news'] : [],
      },
    },
    missing_fields: missingFields,
    fallback_used: [
      {
        field: 'market_cap',
        method: 'price_times_shares_outstanding',
        confidence: 'high',
      },
    ],
    stale_data_warning: [],
    calculation_notes: [
      'Revenue Growth = (current revenue - previous revenue) / previous revenue',
      'DER = total debt / total equity',
      'FCF = operating cash flow - capital expenditure',
      'Enterprise Value = market cap + total debt - cash',
      'Risk/reward ratio = expected upside / expected downside',
      'Max Drawdown = largest peak-to-trough decline',
    ],
  };
}

function normalizeInputTicker(ticker) {
  return String(ticker || '')
    .replace(/\.JK$/i, '')
    .toUpperCase();
}

function createMockAgentPipeline(result) {
  const partialFundamentals = result.financial_highlights?.data_quality?.status === 'partial';
  const durations = [1.2, 2.4, 3.1, 2.8, 4.2, 3.9, 5.1, 2.3, 3.7, 6.2];
  return PIPELINE_AGENTS.map((name, index) => ({
    name,
    status: partialFundamentals && name === 'Fundamentals Analyst' ? 'partial' : 'ok',
    duration_seconds: durations[index] ?? 1,
    warning:
      partialFundamentals && name === 'Fundamentals Analyst'
        ? 'Quarterly cashflow data not available from mock provider.'
        : null,
  }));
}

function createMockTechnicalLevels(result) {
  const currentPrice = result.current_price ?? result.last_price ?? null;
  const support =
    result.technical_entry?.support ?? result.price_chart?.summary?.period_low ?? null;
  const resistance =
    result.technical_entry?.resistance ?? result.price_chart?.summary?.period_high ?? null;
  const stopLoss = result.stop_loss ?? null;
  const entry = result.trade_plan_valid ? result.entry_price : null;

  return {
    current_price: currentPrice,
    nearest_support: support,
    nearest_resistance: resistance,
    suggested_stop_loss: stopLoss,
    invalidation_level: stopLoss ?? support,
    entry_range_low: entry,
    entry_range_high: entry,
    risk_reward_ratio: result.risk_reward_display || result.risk_reward_ratio || 'Not attractive',
    technical_levels_available: currentPrice !== null && currentPrice !== undefined,
  };
}

function createMockDataSources(result) {
  const articles = Array.isArray(result.news?.articles) ? result.news.articles : [];
  return {
    price: {
      provider: 'Yahoo Finance',
      method: result.price_source || result.current_price_source || 'mock:yfinance:last_close',
      timestamp: result.price_timestamp || result.current_price_as_of || result.trade_date,
      is_fallback: Boolean(result.price_is_fallback),
    },
    fundamentals: {
      provider: 'Yahoo Finance',
      completeness: result.financial_highlights?.data_quality?.status || 'partial',
      last_period: result.data_freshness?.financials?.period || 'Q1 2026',
      period_end_date: result.data_freshness?.financials?.period_end_date || '2026-03-31',
    },
    news: {
      provider: result.news?.providers_used?.join(', ') || 'Yahoo Finance',
      articles_found: result.news?.articles_found ?? articles.length,
      lookback_days: result.news?.window_days || result.related_news?.lookback_days || 30,
      latest_article_date: articles[0]?.published_at?.slice(0, 10) || result.trade_date,
    },
    macro: {
      provider: 'Yahoo Finance',
      description: 'Latest available from mock provider',
    },
  };
}

function createSimpleFundamentalsAlias(financialHighlights = {}) {
  const periods = Array.isArray(financialHighlights.periods)
    ? financialHighlights.periods.map((period) => period.label || period.key)
    : [];
  const rows = Array.isArray(financialHighlights.rows)
    ? financialHighlights.rows.map((row) => {
        const values = Object.fromEntries(
          periods.map((period) => {
            const sourcePeriod = financialHighlights.periods?.find(
              (item) => (item.label || item.key) === period
            );
            const cell = row.values?.[sourcePeriod?.key || period];
            return [
              period,
              cell?.status === 'unavailable' ? null : (cell?.display ?? cell?.value ?? null),
            ];
          })
        );
        return { metric: row.label, ...values };
      })
    : [];

  return {
    currency: financialHighlights.currency,
    unit: financialHighlights.scale || financialHighlights.scale_label,
    periods,
    rows,
    completeness: financialHighlights.data_quality?.status || 'partial',
    warning: financialHighlights.data_quality?.missing_periods?.length
      ? `Missing periods: ${financialHighlights.data_quality.missing_periods.join(', ')}`
      : null,
  };
}

function createChartPriceAlias(priceChart = {}) {
  const candles = Array.isArray(priceChart.points)
    ? priceChart.points.slice(-30).map((point) => ({
        date: point.date,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
      }))
    : [];

  return {
    ticker: priceChart.ticker,
    range: priceChart.window,
    currency: priceChart.currency,
    candles,
    support: priceChart.summary?.period_low,
    resistance: priceChart.summary?.period_high,
  };
}

function createNewsItemsAlias(result) {
  const relatedItems = Array.isArray(result.related_news?.items) ? result.related_news.items : [];
  const contextItems = Array.isArray(result.news?.articles) ? result.news.articles : [];
  return [...relatedItems, ...contextItems].slice(0, 10).map((item) => ({
    title: item.title,
    source: item.source || item.publisher || item.provider || 'mock',
    published_at: item.published_at,
    url: item.url,
    summary: item.summary,
    sentiment: item.sentiment || item.sentiment_label || 'neutral',
  }));
}

function createMockProductionContract(result, overrides = {}) {
  const ticker = result.ticker || overrides.normalized_ticker || 'NVDA';
  const profile = result.company_profile || {};
  const rawAiSignal = normalizeRawAiSignal(
    overrides.raw_ai_signal ||
      result.raw_ai_signal ||
      result.final_decision ||
      result.decision ||
      result.rating
  );
  const displaySignal =
    overrides.display_signal ||
    resolveDisplaySignal(rawAiSignal, result.has_existing_position, result.rebalancing_action);
  const pipeline =
    overrides.agent_pipeline || result.agent_pipeline || createMockAgentPipeline(result);
  const dataFreshness =
    overrides.data_freshness || result.data_freshness || createMockDataFreshness(result);

  return {
    id: overrides.id || result.id || result.request_id,
    input_ticker: overrides.input_ticker || result.input_ticker || normalizeInputTicker(ticker),
    normalized_ticker: overrides.normalized_ticker || result.normalized_ticker || ticker,
    company_name:
      overrides.company_name ||
      result.company_name ||
      profile.company_name ||
      profile.name ||
      ticker,
    exchange:
      overrides.exchange ||
      result.exchange ||
      profile.exchange ||
      (ticker.endsWith('.JK') ? 'IDX' : 'NASDAQ'),
    currency:
      overrides.currency ||
      result.currency ||
      profile.currency ||
      (ticker.endsWith('.JK') ? 'IDR' : 'USD'),
    market: result.market,
    horizon: overrides.horizon || result.horizon || `${result.time_horizon_months || 1}M`,
    created_at:
      overrides.created_at || result.created_at || result.analysis_created_at || result.saved_at,
    last_price: overrides.last_price ?? result.last_price ?? result.current_price,
    price_currency:
      overrides.price_currency ||
      result.price_currency ||
      result.currency ||
      profile.currency ||
      (ticker.endsWith('.JK') ? 'IDR' : 'USD'),
    price_source:
      overrides.price_source ||
      result.price_source ||
      result.current_price_source ||
      'mock:yfinance:last_close',
    price_timestamp:
      overrides.price_timestamp ||
      result.price_timestamp ||
      result.current_price_as_of ||
      result.trade_date,
    price_is_fallback: Boolean(overrides.price_is_fallback ?? result.price_is_fallback ?? false),
    market_status: overrides.market_status || result.market_status || 'closed',
    raw_ai_signal: rawAiSignal,
    display_signal: displaySignal,
    signal_context:
      overrides.signal_context ||
      result.signal_context ||
      signalContextForMock(rawAiSignal, result.has_existing_position, displaySignal),
    confidence_label:
      overrides.confidence_label ||
      result.confidence_label ||
      confidenceLabel(result.confidence_score),
    confidence_tier:
      overrides.confidence_tier ||
      result.confidence_tier ||
      confidenceTier(result.confidence_score),
    confidence_breakdown:
      overrides.confidence_breakdown ||
      result.confidence_breakdown ||
      createMockConfidenceBreakdown(result),
    volatility_scale: overrides.volatility_scale || result.volatility_scale || '0-100',
    volatility_method:
      overrides.volatility_method ||
      result.volatility_method ||
      'Annualized standard deviation of daily returns, normalized to 0-100',
    volatility_lookback_days:
      overrides.volatility_lookback_days || result.volatility_lookback_days || 20,
    volatility_classification:
      overrides.volatility_classification ||
      result.volatility_classification ||
      result.volatility_level ||
      'Medium',
    mini_risk_summary:
      overrides.mini_risk_summary ||
      result.mini_risk_summary ||
      `${result.volatility_level || 'Medium'}. Maintain risk controls because this is mock data.`,
    action_status: overrides.action_status || result.action_status || displaySignal,
    technical_levels:
      overrides.technical_levels || result.technical_levels || createMockTechnicalLevels(result),
    agent_pipeline: pipeline,
    total_pipeline_seconds:
      overrides.total_pipeline_seconds ||
      result.total_pipeline_seconds ||
      Number(
        pipeline.reduce((sum, item) => sum + Number(item.duration_seconds || 0), 0).toFixed(1)
      ),
    data_sources:
      overrides.data_sources ||
      result.data_sources ||
      createMockDataSources({ ...result, data_freshness: dataFreshness }),
    data_freshness: dataFreshness,
    analysis_params:
      overrides.analysis_params || result.analysis_params || createMockAnalysisParams(result),
    tab_status:
      overrides.tab_status || result.tab_status || createMockTabStatus(result, dataFreshness),
    profile: overrides.profile || result.profile || profile,
    fundamentals:
      overrides.fundamentals ||
      result.fundamentals ||
      createSimpleFundamentalsAlias(result.financial_highlights),
    chart_price:
      overrides.chart_price || result.chart_price || createChartPriceAlias(result.price_chart),
    news_items: overrides.news_items || result.news_items || createNewsItemsAlias(result),
    key_reasons_paragraph:
      overrides.key_reasons_paragraph ||
      result.key_reasons_paragraph ||
      createMockKeyReasonsParagraph(result),
    disclaimer:
      overrides.disclaimer ||
      result.disclaimer ||
      'AI-generated mock analysis. Not financial advice. Verify all data and assumptions before making any investment decision.',
  };
}

function completeMockAnalysis(overrides = {}) {
  const result = {
    request_id: 'mock-nvda-buy',
    ticker: 'NVDA',
    market: 'US',
    trade_date: '2026-05-18',
    analysis_created_at: MOCK_ANALYSIS_CREATED_AT,
    saved_at: MOCK_ANALYSIS_CREATED_AT,
    data_fetched_at: MOCK_ANALYSIS_CREATED_AT,

    llm_decision: 'Buy',
    final_decision: 'Buy',
    decision: 'Buy',
    rating: 'Buy',
    decision_adjusted: false,
    decision_adjusted_reason: null,
    trade_plan_valid: true,

    has_existing_position: false,
    position_quantity: null,
    average_entry_price: null,

    current_price: 940,
    current_price_as_of: '2026-05-18',
    current_price_source: 'mock:yfinance:last_close',
    entry_price: 940,
    stop_loss: 900,
    take_profit: 1060,
    risk_reward_ratio: 3,
    risk_reward_display: '1:3',

    max_drawdown_estimate: '10-16%',
    max_drawdown_min_pct: 10,
    max_drawdown_max_pct: 16,
    volatility_level: 'High',
    volatility_score: 72,

    rebalancing_action: 'Open new position',
    position_action: null,
    new_entry_action: 'Allowed with validated entry',
    position_size_hint: 'Use smaller starter size due to high volatility.',
    position_sizing_reason: 'Use staged allocation because volatility is high.',

    confidence_score: 0.84,
    suggested_allocation_percent: 4,
    time_horizon_months: 2,
    time_horizon: '2 Months',

    executive_summary: `The mock default rating is Buy because the synthetic dashboard package has complete price data, valid trade levels, and enough supporting context to exercise the full report view. The strongest support is the current price anchor at 940, with entry at 940, stop loss at 900, take profit at 1060, and a fixed risk/reward display of 1:3. The biggest risk is that every value is mock data, so it must never be treated as a live market signal or real recommendation. The recommended action is a small staged entry, using about 4 percent allocation, strict stop discipline, and no averaging down if volatility expands. The horizon is 2 Months, and the thesis is confirmed only when the UI, HTML preview, PDF export, quality badges, catalyst list, and invalidation section all render the same contract without missing fields. This keeps manual QA focused on layout and serialization rather than guessing whether a blank card means bad data, broken mapping, or another tiny disaster wearing a frontend costume.`,
    market_report: 'Mock market analyst report.',
    news_report: 'Mock news analyst report.',
    fundamentals_report: 'Mock fundamentals analyst report.',
    risk_report: 'Mock risk manager report.',
    portfolio_report: 'Mock portfolio manager report.',
    investment_thesis: `This default mock exists to mirror a complete backend analysis without calling market vendors, news APIs, or an LLM, so the company story is intentionally generic but structurally realistic. The synthetic company is treated as a liquid large-cap stock with an understandable business, enough volume for normal execution, and a setup that can test every dashboard field. The reason it matters now is not a real catalyst; it is the need to confirm that the application can display price, risk, allocation, narrative, and report sections consistently before expensive provider calls are used. The three key numbers are current price at 940, stop loss at 900, and take profit at 1060, while volatility is marked High with a score of 72. The bull case is that the full action plan is coherent: entry matches current price, downside is defined, reward is three times the risk, and catalysts are visible. The bear case is that all values are fabricated, which means no user should mistake this for live advice. The bull case wins only for UI testing because the objective is rendering accuracy, not investment conviction. The action plan is to show a 4 percent staged allocation, keep the stop loss visible, display take profit as the execution target, and invalidate the scenario if any required dashboard or export field disappears. This mock also checks that longer prose does not break spacing, card heights, storage, recent analysis loading, or report printing. It should behave like a real result from the user perspective, while the source label and quality warnings make the artificial nature obvious.`,
    debate_summary: 'Mock debate summary.',
    full_decision: null,

    key_catalysts: ['Mock catalyst 1', 'Mock catalyst 2'],
    key_reasons_paragraph:
      'The default Buy recommendation is supported by a complete mock contract, valid trade levels, visible catalyst data, and risk controls that can be checked across the dashboard and export flow. Current price, entry, stop loss, take profit, allocation, volatility, and confidence all point to an actionable scenario for testing, while the artificial data label prevents it from being confused with live advice. Position sizing remains staged because the purpose is to verify rendering, serialization, report previews, and data-quality warnings rather than create a real investment call.',
    key_reasons: [
      'The mock trade plan is complete enough to test price, entry, stop loss, take profit, allocation, and risk reward display together.',
      'The dashboard contract includes catalysts, invalidation conditions, confidence metadata, and data-quality warnings for cross-tab validation.',
      'Position sizing stays controlled because every value is synthetic and must not be treated as a live market recommendation.',
    ],
    invalidation_conditions: ['Mock invalidation 1', 'Mock invalidation 2'],

    data_quality: COMMON_MOCK_QUALITY,
    financial_highlights: MOCK_FINANCIAL_HIGHLIGHTS,
    normalized_period_rows: mockNormalizedPeriodRows,
    derived_fundamentals: [],
    ...MOCK_FUNDAMENTAL_ANALYSIS,
    company_profile: MOCK_COMPANY_PROFILE,
    news: MOCK_NEWS_CONTEXT,
    validation_warnings: [],
    agents_used: AGENTS_USED,
    llm_calls_used: 0,
    llm_call_budget: 0,
    analysis_depth: 'mock',
    response_detail: 'full',
    budget_exhausted: false,
    agents_skipped: [],
    raw_agent_state: null,
    source: 'frontend/dev/mockData.js',
    mock: true,

    // Legacy compatibility only. These fields must not be rendered by the UI or reports.
    price_target: null,
    risk_per_share: null,
    reward_per_share: null,
  };

  const completed = {
    ...result,
    ...overrides,
    company_profile: overrides.company_profile || result.company_profile,
    news: syncMockNews(overrides.news || result.news, overrides.ticker || result.ticker),
    price_chart: syncMockPriceChart(overrides.price_chart || result.price_chart, {
      ticker: overrides.ticker || result.ticker || 'BBCA.JK',
      tradeDate: overrides.trade_date || result.trade_date || '2026-05-30',
      months: overrides.time_horizon_months || result.time_horizon_months || 1,
    }),
    related_news: syncMockRelatedNews(overrides.related_news || result.related_news, {
      ticker: overrides.ticker || result.ticker || 'BBCA.JK',
      tradeDate: overrides.trade_date || result.trade_date || '2026-05-30',
      months: overrides.time_horizon_months || result.time_horizon_months || 1,
    }),
    data_quality: normalizeDataQuality(overrides.data_quality || result.data_quality),
  };
  const completedWithPhase3 = {
    ...completed,
    ...createMockPhase3(completed, overrides),
  };
  const completedWithRiskDataQuality = {
    ...completedWithPhase3,
    risk_data_quality:
      overrides.risk_data_quality || createMockRiskDataQuality(completedWithPhase3),
  };

  const contractSynced = {
    ...completedWithRiskDataQuality,
    ...createMockProductionContract(completedWithRiskDataQuality, overrides),
  };

  return {
    ...contractSynced,
    analysis_overview: createMockAnalysisOverview(contractSynced),
    full_decision:
      contractSynced.full_decision ||
      createFullDecision({
        decision: contractSynced.final_decision ?? contractSynced.decision,
        summary: contractSynced.executive_summary,
        thesis: contractSynced.investment_thesis,
        timeHorizon: contractSynced.time_horizon,
      }),
  };
}

export const MOCK_BUY_RESPONSE = completeMockAnalysis({
  request_id: 'mock-nvda-buy',
  ticker: 'NVDA',
  market: 'US',
  trade_date: '2026-05-18',
  time_horizon_months: 3,
  time_horizon: '3 Months',
  confidence_score: 0.86,
  suggested_allocation_percent: 6,
  current_price: 920,
  entry_price: 920,
  stop_loss: 880,
  take_profit: 1040,
  max_drawdown_estimate: '8-12%',
  max_drawdown_min_pct: 8,
  max_drawdown_max_pct: 12,
  volatility_level: 'High',
  volatility_score: 72,
  rebalancing_action: 'Open new position',
  position_action: null,
  new_entry_action: 'Allowed with validated entry',
  position_size_hint: 'Use smaller starter size due to high volatility.',
  position_sizing_reason:
    'Use a smaller staged allocation because volatility is high. Keep the stop loss disciplined and do not add unless the setup keeps a valid 1:3 risk/reward profile.',
  executive_summary: `NVDA is rated Buy because AI infrastructure spending still centers on its GPU, networking, and software ecosystem, giving the company the clearest mock upside setup in this dashboard. The strongest support is the complete action plan: current price and entry are both 920, stop loss is 880, take profit is 1040, volatility is High at 72, and the trade keeps a fixed 1:3 risk/reward profile. The biggest risk is valuation pressure if hyperscaler spending slows or Blackwell demand disappoints, but the mock evidence still favors controlled exposure because demand, margin quality, and platform lock-in remain supportive. The recommended action is to open a staged 6 percent position, respect the stop loss, avoid adding below invalidation, and take profit only at the execution target. The horizon is 3 Months, and the thesis is confirmed by sustained AI capex, supply expansion, and strong data center momentum, or invalidated by heavy-volume weakness below the stop.`,
  market_report:
    'Mock market report: NVDA keeps a constructive trend profile, with the current price used as the entry anchor and take profit locked to the 1:3 risk/reward rule.',
  news_report:
    'Mock news report: AI infrastructure demand remains the main sentiment driver. No external news provider was called.',
  fundamentals_report:
    'Mock fundamentals report: revenue quality, margin strength, and platform lock-in remain supportive for the Buy scenario.',
  risk_report:
    'Mock risk report: high volatility requires smaller sizing, strict stop discipline, and no averaging down below the invalidation level.',
  portfolio_report:
    'Mock portfolio report: position size should stay moderate because volatility is high even though the trade plan is valid.',
  investment_thesis: `NVDA is presented as a leading supplier of accelerated computing hardware and software for AI training, AI inference, cloud data centers, and high-performance workloads. In this mock scenario, the business matters now because large customers still need more compute capacity, and that demand supports pricing power, backlog visibility, and high-margin platform sales. The main tailwind is the continued AI infrastructure cycle, especially demand from hyperscalers that want faster chips, better networking, and a mature developer ecosystem. The important numbers are current price at 920, stop loss at 880, take profit at 1040, suggested allocation at 6 percent, and volatility score at 72. The bull case says the setup is actionable because the entry is anchored to current price, downside is clearly defined, and the 1:3 risk/reward structure is complete. The bear case is that expectations are already high, so any slowdown in cloud capital spending, delayed platform ramps, or margin compression could punish the stock quickly. That bear case matters, but it does not win this mock decision because the risk controls are explicit and the upside drivers remain stronger than the near-term concerns. The action plan is to enter gradually near 920, cap position size at 6 percent, use 880 as the stop loss, take profit at 1040, and reject the idea if AI demand weakens or price breaks support with volume. This longer mock narrative also verifies that the analysis card, saved result, recent analysis entry, HTML preview, and PDF export can carry a realistic paragraph without changing the underlying data shape. It keeps the same fields a real backend response would send, so debugging can focus on mapping, formatting, and validation behavior instead of wondering whether missing text is a rendering bug or just another avoidable contract mismatch.`,
  debate_summary:
    'Bull case favors durable AI infrastructure demand. Bear case focuses on valuation risk. The mock research manager resolves the debate as Buy because the action plan stays valid.',
  key_catalysts: [
    'Sustained AI data center capex from hyperscalers.',
    'Blackwell platform ramp and supply expansion.',
    'High-margin software and networking attach rate.',
  ],
  invalidation_conditions: [
    'Break below the stop loss with heavy volume.',
    'Cloud capex guidance weakens across major customers.',
    'Gross margin compression accelerates for two quarters.',
  ],
  data_quality: {
    trade_levels: 'mock_recomputed',
    llm_output: 'mock_repaired',
    warnings: [
      'Mock data only. No backend, yfinance, Finnhub, provider, or LLM call was executed.',
    ],
  },
  validation_warnings: ['TAKE_PROFIT_RECOMPUTED'],
});

// Backward-compatible export used by existing tests/components.
export const MOCK_RESPONSE = MOCK_BUY_RESPONSE;

export const MOCK_SELL_RESPONSE = completeMockAnalysis({
  request_id: 'mock-tsla-sell',
  ticker: 'TSLA',
  market: 'US',
  llm_decision: 'Sell',
  final_decision: 'Sell',
  decision: 'Sell',
  rating: 'Sell',
  has_existing_position: true,
  position_quantity: 100,
  average_entry_price: 210,
  current_price: 185,
  entry_price: 185,
  stop_loss: 195,
  take_profit: 155,
  time_horizon_months: 1,
  time_horizon: '1 Month',
  confidence_score: 0.78,
  suggested_allocation_percent: 0,
  max_drawdown_estimate: '12-20%',
  max_drawdown_min_pct: 12,
  max_drawdown_max_pct: 20,
  volatility_level: 'Very High',
  volatility_score: 88,
  rebalancing_action: 'Exit position',
  position_action: 'Exit position',
  new_entry_action: 'No new entry; exit existing position',
  position_size_hint: 'Exit existing position; no new exposure suggested.',
  position_sizing_reason:
    'Existing exposure can be exited because the user already has a position and volatility is very high. New exposure is not suggested.',
  executive_summary: `TSLA is rated Sell because the mock setup shows near-term downside pressure from margin compression, intense EV price competition, and uncertain timing for robotaxi or software monetization. The strongest support is the complete downside plan: current price and entry are both 185, stop loss is 195, take profit is 155, volatility is Very High at 88, and the trade is constrained to a valid 1:3 risk/reward structure. The biggest risk to the Sell call is a sharp rebound from delivery strength, energy storage growth, or credible FSD revenue, but the current evidence still favors reducing exposure because the core auto business remains under pressure. The recommended action is to exit the existing position, avoid new exposure, keep allocation at zero, and respect the stop if a short-style plan is being tested. The horizon is 1 Month, and the thesis is confirmed by continued weakness below momentum levels or invalidated by a recovery above the stop with improving volume.`,
  market_report:
    'Mock market report: TSLA is below key momentum levels and the downside plan keeps a fixed 1:3 risk/reward structure.',
  news_report:
    'Mock news report: sentiment remains mixed because long-term optionality still exists, but near-term execution risk dominates.',
  fundamentals_report:
    'Mock fundamentals report: margins and competitive pressure remain the main weakness in this Sell scenario.',
  risk_report:
    'Mock risk report: very high volatility makes new exposure unattractive, while an existing position can be exited under the plan.',
  portfolio_report:
    'Mock portfolio report: reduce exposure to zero for this scenario and avoid opening a fresh position until the setup improves.',
  investment_thesis: `TSLA is treated as an electric vehicle, energy storage, and autonomy company, but this mock decision focuses on the short-term pressure in the core automotive business. The stock matters now because investors are trying to decide whether future optionality can offset present weakness in margins, delivery growth, and competitive positioning. The main headwind is price competition, since lower vehicle prices can hurt gross margin and make the market question how quickly software, FSD, robotaxi, or energy storage can carry earnings. The key numbers are current price at 185, stop loss at 195, take profit at 155, volatility score at 88, and suggested allocation at zero for new exposure. The bear case says the trade is actionable because the downside levels are defined and the existing position can be exited before volatility does more damage. The bull case is that TSLA still owns valuable long-term options in autonomy, energy, manufacturing scale, and brand loyalty, which could trigger a rebound if delivery or software metrics improve. In this mock result, the bear case wins because the 1 Month horizon rewards near-term evidence, not distant promises. The action plan is to exit the existing position, avoid opening a new one, watch 195 as the stop or recovery line, use 155 as the downside execution target, and reconsider only if margins stabilize with stronger volume. This longer mock narrative also verifies that the analysis card, saved result, recent analysis entry, HTML preview, and PDF export can carry a realistic paragraph without changing the underlying data shape. It keeps the same fields a real backend response would send, so debugging can focus on mapping, formatting, and validation behavior instead of wondering whether missing text is a rendering bug or just another avoidable contract mismatch.`,
  debate_summary:
    'The bull case argues for optionality. The bear case wins this mock debate because the near-term risk profile is poor for an existing position.',
  key_catalysts: [
    'Possible rebound if deliveries surprise to the upside.',
    'Energy storage growth could soften automotive weakness.',
  ],
  invalidation_conditions: [
    'Recovery above the stop loss with improving volume.',
    'Gross margin stabilizes and guidance improves.',
    'FSD monetization shows measurable revenue contribution.',
  ],
  data_quality: {
    warnings: ['Mock bearish scenario. Values are synthetic for UI and report debugging.'],
  },
});

export const MOCK_HOLD_RESPONSE = completeMockAnalysis({
  request_id: 'mock-aapl-hold',
  ticker: 'AAPL',
  market: 'US',
  llm_decision: 'Hold',
  final_decision: 'Hold',
  decision: 'Hold',
  rating: 'Hold',
  trade_plan_valid: false,
  current_price: 190,
  entry_price: null,
  stop_loss: null,
  take_profit: null,
  risk_reward_ratio: null,
  risk_reward_display: null,
  time_horizon_months: 2,
  time_horizon: '2 Months',
  confidence_score: 0.72,
  suggested_allocation_percent: 0,
  max_drawdown_estimate: null,
  max_drawdown_min_pct: null,
  max_drawdown_max_pct: null,
  volatility_level: 'Medium',
  volatility_score: 44,
  rebalancing_action: 'No position to rebalance',
  position_action: null,
  new_entry_action: 'Wait for valid entry setup',
  position_size_hint: '0% allocation until setup improves.',
  position_sizing_reason: null,
  executive_summary: `AAPL is rated Hold because the company remains high quality, but the mock setup does not show enough confirmed upside to justify a new actionable trade. The strongest support is the non-actionable contract itself: current price is 190, volatility is Medium at 44, allocation is zero, and entry, stop loss, take profit, and risk/reward are intentionally hidden because the result is not a Buy or Sell. The biggest risk is that users may force a trade in a stable but range-bound stock, and that risk supports patience rather than fake precision. The recommended action is to avoid new entry, keep the stock on the watchlist, and wait for better risk/reward before defining trade levels. The horizon is 2 Months, and the thesis is confirmed by stronger services growth, AI device demand, or cleaner momentum, while it is invalidated by slowing iPhone demand or App Store pressure. This keeps the preview realistic while still making the non-live mock status clear to anyone reading the report.`,
  market_report:
    'Mock market report: AAPL is stable but lacks enough momentum confirmation for a new trade plan.',
  news_report:
    'Mock news report: product cycle and services sentiment are balanced, not decisive enough for a new position.',
  fundamentals_report:
    'Mock fundamentals report: quality remains strong, but valuation and near-term growth do not justify an actionable trade.',
  risk_report:
    'Mock risk report: no fake trade levels are generated because Hold is not actionable.',
  portfolio_report:
    'Mock portfolio report: keep watchlist status and avoid new entry until risk/reward improves.',
  investment_thesis: `AAPL is presented as a premium hardware, software, and services company with a strong ecosystem, loyal users, and large recurring cash flow. The business matters now because investors are weighing stable services revenue and buybacks against slower device growth, regulatory pressure, and uncertainty around the next upgrade cycle. The main tailwind is ecosystem durability, because iPhone, services, wearables, and app monetization can keep earnings resilient even when product demand is uneven. The key numbers in this mock are current price at 190, volatility score at 44, confidence at 0.72, allocation at zero, and no entry, stop loss, or take profit because Hold is not an actionable trade. The bull case is that services growth, buybacks, and possible AI-enabled device upgrades could support the stock over time. The bear case is that valuation may already reflect those strengths, while regulatory pressure and weaker hardware demand could limit upside. Neither side wins strongly enough for a new trade, so the correct decision is patience. The action plan is to avoid opening a fresh position, keep current price and volatility visible for monitoring, wait for a cleaner entry, and only create stop-loss and profit-taking levels if the setup improves enough to support a valid 1:3 structure. This longer mock narrative also verifies that the analysis card, saved result, recent analysis entry, HTML preview, and PDF export can carry a realistic paragraph without changing the underlying data shape. It keeps the same fields a real backend response would send, so debugging can focus on mapping, formatting, and validation behavior instead of wondering whether missing text is a rendering bug or just another avoidable contract mismatch.`,
  debate_summary:
    'Bull and bear arguments are balanced in this mock scenario, so the research manager keeps the final decision at Hold.',
  key_catalysts: [
    'Services growth remains resilient.',
    'AI features may support a future iPhone upgrade cycle.',
    'Large buyback program supports per-share earnings.',
  ],
  invalidation_conditions: [
    'Services growth slows sharply.',
    'Regulatory pressure reduces App Store economics.',
    'iPhone demand weakens across two reporting periods.',
  ],
  data_quality: {
    trade_levels: 'mock_hidden',
    warnings: ['Mock neutral scenario. Trade levels intentionally hidden for Hold UI testing.'],
  },
  validation_warnings: ['HOLD_TRADE_LEVELS_HIDDEN'],
});

export const MOCK_MISSING_PRICE_RESPONSE = completeMockAnalysis({
  request_id: 'mock-missing-price',
  ticker: 'MSFT',
  market: 'US',
  llm_decision: 'Buy',
  final_decision: 'Hold',
  decision: 'Hold',
  rating: 'Hold',
  decision_adjusted: true,
  decision_adjusted_reason: 'Missing current price',
  trade_plan_valid: false,
  current_price: null,
  current_price_as_of: null,
  current_price_source: null,
  entry_price: null,
  stop_loss: null,
  take_profit: null,
  risk_reward_ratio: null,
  risk_reward_display: null,
  time_horizon_months: 1,
  time_horizon: '1 Month',
  confidence_score: 0.52,
  suggested_allocation_percent: 0,
  max_drawdown_estimate: null,
  max_drawdown_min_pct: null,
  max_drawdown_max_pct: null,
  volatility_level: 'Medium',
  volatility_score: 45,
  rebalancing_action: 'No position to rebalance',
  position_action: null,
  new_entry_action: 'Wait until valid price data is available',
  position_size_hint: '0% allocation until valid price data is available.',
  position_sizing_reason: null,
  executive_summary: `MSFT is rated Hold in this missing-price mock because the system cannot verify a current price, and a dashboard should never invent trade levels just to look complete. The strongest support is the validation result itself: current price, entry, stop loss, take profit, and risk/reward are all null, allocation is zero, volatility is Medium at 45, and the original Buy-style idea is downgraded for safety. The biggest risk is false confidence, because a good company story becomes unusable when the execution anchor is missing. The recommended action is to avoid new entry, show the missing price warning, keep position sizing at zero, and wait for market data to recover before any stop-loss or take-profit is displayed. The horizon is 1 Month, and the thesis is confirmed only when a provider returns a fresh price, while it is invalidated if the ticker remains unavailable or stale. This keeps the preview realistic while still making the non-live mock status clear to anyone reading the report.`,
  market_report:
    'Mock market report: current price is intentionally unavailable, so price-dependent trade levels are blocked.',
  news_report: 'Mock news report: the scenario focuses on data availability rather than sentiment.',
  fundamentals_report:
    'Mock fundamentals report: fundamentals are present, but they cannot override missing current price validation.',
  risk_report: 'Mock risk report: no action should be taken when current price cannot be verified.',
  portfolio_report: 'Mock portfolio report: avoid new entry and wait for valid market data.',
  investment_thesis: `MSFT is used here as a missing-current-price scenario, not as a live investment view. The company itself is a durable software, cloud, security, and productivity platform, but even a strong business cannot produce a safe trade plan when the application lacks a verified market price. This matters now because the frontend must prove that it can downgrade an attractive narrative into a non-actionable Hold when a required execution input is absent. The key numbers are deliberately defensive: current price is null, entry is null, stop loss is null, take profit is null, allocation is zero, and volatility score is 45. The bull case is that the business story could still be attractive once price data returns, especially if cloud growth, enterprise AI adoption, and Office cash flow remain healthy. The bear case is stronger because no entry or risk/reward calculation can be trusted without a current price anchor. That process risk wins the decision, since capital protection is more important than making the card look exciting. The action plan is to block new exposure, display the data quality warning, avoid synthetic trade levels, rerun analysis after provider recovery, and only then consider entry, sizing, stop-loss, and profit-taking rules. If price remains stale, the idea stays rejected. This longer mock narrative also verifies that the analysis card, saved result, recent analysis entry, HTML preview, and PDF export can carry a realistic paragraph without changing the underlying data shape. It keeps the same fields a real backend response would send, so debugging can focus on mapping, formatting, and validation behavior instead of wondering whether missing text is a rendering bug or just another avoidable contract mismatch.`,
  debate_summary:
    'The mock manager downgrades the idea because price validation fails before trade planning can be trusted.',
  key_catalysts: ['Price data recovers from the market data provider.'],
  invalidation_conditions: ['Ticker remains unavailable or price data is stale.'],
  data_quality: {
    price_data: 'missing',
    trade_levels: 'invalid',
    llm_output: 'mock_downgraded',
    volatility_data: 'fallback',
    warnings: ['Current price intentionally missing for UI and report debugging.'],
  },
  validation_warnings: [
    'CURRENT_PRICE_MISSING',
    'DECISION_DOWNGRADED_TO_HOLD',
    'TRADE_PLAN_INVALID',
  ],
});

export const MOCK_REPAIRED_RESPONSE = completeMockAnalysis({
  request_id: 'mock-meta-repaired-buy',
  ticker: 'META',
  market: 'US',
  llm_decision: 'Buy',
  final_decision: 'Buy',
  decision: 'Buy',
  rating: 'Buy',
  current_price: 510,
  entry_price: 510,
  stop_loss: 485,
  take_profit: 585,
  time_horizon_months: 2,
  time_horizon: '2 Months',
  confidence_score: 0.8,
  suggested_allocation_percent: 5,
  max_drawdown_estimate: '6-10%',
  max_drawdown_min_pct: 6,
  max_drawdown_max_pct: 10,
  volatility_level: 'Medium',
  volatility_score: 48,
  rebalancing_action: 'Open new position',
  position_action: null,
  new_entry_action: 'Allowed with validated entry',
  position_size_hint: 'Use standard starter size and avoid oversized entry.',
  position_sizing_reason:
    'Mock validation repaired the original levels by forcing risk/reward to 1:3 and recomputing take profit from the current price anchor.',
  executive_summary: `META is rated Buy because the repaired mock confirms that an originally imperfect LLM-style trade can become actionable after backend validation recomputes the levels into the required structure. The strongest support is the corrected plan: current price and entry are both 510, stop loss is 485, take profit is 585, volatility is Medium at 48, allocation is 5 percent, and the final risk/reward is forced to 1:3. The biggest risk is trusting unrepaired model output, but that risk is reduced here because the warning codes clearly show the levels were fixed before display. The recommended action is to open a standard staged position, use only the repaired stop and target, and avoid oversized exposure. The horizon is 2 Months, and the thesis is confirmed by resilient ads, stronger engagement from AI products, and disciplined execution, or invalidated by ad pricing weakness below the stop. This keeps the preview realistic while still making the non-live mock status clear to anyone reading the report.`,
  market_report:
    'Mock market report: META remains constructive after trade levels are repaired to the required 1:3 profile.',
  news_report:
    'Mock news report: ad market sentiment and AI product updates remain supportive enough for a repaired Buy scenario.',
  fundamentals_report:
    'Mock fundamentals report: margin strength and cash generation support the trade case.',
  risk_report:
    'Mock risk report: repaired levels must be treated as the only valid execution plan.',
  portfolio_report:
    'Mock portfolio report: standard sizing is acceptable because volatility is medium and levels were repaired.',
  investment_thesis: `META is treated as a digital advertising, social platform, messaging, and AI infrastructure company with strong cash generation and large user reach. The business matters now because advertisers are still spending on measurable performance channels, while AI tools can improve targeting, content discovery, engagement, and operating efficiency. The main tailwind is margin strength combined with better product execution, which gives the stock room to work if revenue remains resilient. The key numbers are current price at 510, stop loss at 485, take profit at 585, suggested allocation at 5 percent, and volatility score at 48. The bull case says the setup is valid because the repaired levels now obey the fixed 1:3 risk/reward requirement and the company has enough fundamental support to justify a moderate Buy. The bear case is that original model output was not acceptable, so careless use of unrepaired levels could create misleading targets. That bear case is real, but it does not win because the contract exposes warning codes and displays only the validated execution plan. The action plan is to enter near 510, keep position size standard rather than aggressive, use 485 as the stop loss, take profit at 585, and reject the trade if ad pricing weakens or the stock breaks support with poor breadth. This longer mock narrative also verifies that the analysis card, saved result, recent analysis entry, HTML preview, and PDF export can carry a realistic paragraph without changing the underlying data shape. It keeps the same fields a real backend response would send, so debugging can focus on mapping, formatting, and validation behavior instead of wondering whether missing text is a rendering bug or just another avoidable contract mismatch.`,
  debate_summary: 'The mock debate accepts the Buy only after validation repairs the trade levels.',
  key_catalysts: [
    'Ad revenue remains resilient.',
    'AI infrastructure spending improves product engagement.',
  ],
  invalidation_conditions: ['Break below stop loss.', 'Ad pricing weakens materially.'],
  data_quality: {
    trade_levels: 'mock_recomputed',
    llm_output: 'mock_repaired',
    warnings: ['Mock repaired scenario. Original LLM-like levels were intentionally invalid.'],
  },
  validation_warnings: ['RR_FORCED_TO_3', 'TAKE_PROFIT_RECOMPUTED'],
});

export const MOCK_IDX_RESPONSE = completeMockAnalysis({
  request_id: 'mock-bbca-id-buy',
  ticker: 'BBCA.JK',
  market: 'ID',
  llm_decision: 'Buy',
  final_decision: 'Buy',
  decision: 'Buy',
  rating: 'Buy',
  current_price: 9800,
  entry_price: 9800,
  stop_loss: 9300,
  take_profit: 11300,
  time_horizon_months: 3,
  time_horizon: '3 Months',
  confidence_score: 0.81,
  suggested_allocation_percent: 8,
  max_drawdown_estimate: '8-12%',
  max_drawdown_min_pct: 8,
  max_drawdown_max_pct: 12,
  volatility_level: 'High',
  volatility_score: 72,
  rebalancing_action: 'Open new position',
  position_action: null,
  new_entry_action: 'Allowed with validated entry',
  position_size_hint: 'Use smaller starter size due to high volatility.',
  position_sizing_reason:
    'Use staged sizing because the stock is high volatility. IDX prices are rounded using exchange tick-size logic in the backend contract.',
  company_profile: MOCK_IDX_COMPANY_PROFILE,
  financial_highlights: MOCK_IDX_FINANCIAL_HIGHLIGHTS,
  normalized_period_rows: mockNormalizedPeriodRows,
  derived_fundamentals: [],
  ...MOCK_IDX_FUNDAMENTAL_ANALYSIS,
  executive_summary: `BBCA.JK is rated Buy because the IDX mock uses a defensive large-cap bank profile with steady profitability, strong liquidity, and a complete tick-size-rounded trade plan. The strongest support is the validated structure: current price and entry are 9800, stop loss is 9300, take profit is 11300, volatility is High at 72, allocation is 8 percent, and risk/reward is exactly 1:3 after local rounding. The biggest risk is macro pressure from rates, consumption, liquidity, or credit costs, but the mock bank profile still favors controlled exposure because asset quality and deposit strength remain supportive. The recommended action is to open a staged position, use smaller sizing despite the 8 percent allocation limit, respect the stop, and avoid averaging down. The horizon is 3 Months, and the thesis is confirmed by stable net interest margin and loan growth, or invalidated by rising credit costs or a break below support. This keeps the preview realistic while still making the non-live mock status clear to anyone reading the report.`,
  market_report:
    'Mock market report: BBCA.JK remains a high-liquidity IDX large cap with a valid 1:3 trade structure.',
  news_report:
    'Mock news report: domestic bank sentiment is stable with partial news coverage in the mock data quality block.',
  fundamentals_report:
    'Mock fundamentals report: strong deposit franchise, asset quality, and profitability support the scenario.',
  risk_report:
    'Mock risk report: high volatility and IDX tick rounding require disciplined sizing.',
  portfolio_report:
    'Mock portfolio report: staged entry is preferred due to volatility and local market risk.',
  investment_thesis: `BBCA.JK is presented as a high-quality Indonesian bank with a strong deposit franchise, broad customer base, liquid trading profile, and resilient profitability. The business matters now because large banks can benefit from steady loan demand and defensive market rotation, especially when investors want exposure to companies with clearer earnings quality. The main tailwind is the combination of deposit strength and asset quality, which can support margins and reduce the risk of sudden credit stress. The key numbers are current price at 9800, stop loss at 9300, take profit at 11300, suggested allocation at 8 percent, and volatility score at 72. The bull case says the stock is actionable because the IDR formatting, .JK ticker behavior, current price display, and tick-size-rounded levels all survive the same contract used by the real backend. The bear case is that Indonesian macro conditions can change quickly through interest rates, weaker consumption, liquidity pressure, or higher credit cost. That risk matters, but it does not beat the Buy case in this mock because the action plan is defined and the company profile is defensive. The plan is to enter near 9800, use staged sizing, keep 9300 as the stop loss, take profit at 11300, and invalidate the thesis if credit cost rises above expectations or market breadth breaks down. This longer mock narrative also verifies that the analysis card, saved result, recent analysis entry, HTML preview, and PDF export can carry a realistic paragraph without changing the underlying data shape. It keeps the same fields a real backend response would send, so debugging can focus on mapping, formatting, and validation behavior instead of wondering whether missing text is a rendering bug or just another avoidable contract mismatch.`,
  debate_summary:
    'The mock debate favors Buy because defensive quality and valid execution levels outweigh macro risk.',
  key_catalysts: [
    'Stable net interest margin.',
    'Healthy loan growth from corporate and consumer demand.',
    'Defensive large-cap rotation in IDX.',
  ],
  invalidation_conditions: [
    'Credit cost rises above management guidance.',
    'Break below stop loss with weak market breadth.',
    'Banking sector liquidity tightens materially.',
  ],
  data_quality: {
    news: 'partial',
    trade_levels: 'mock_recomputed',
    llm_output: 'mock_repaired',
    warnings: ['Mock IDX scenario. Values are synthetic and intended only for UI debugging.'],
  },
  validation_warnings: ['TAKE_PROFIT_RECOMPUTED', 'INDONESIA_TICK_SIZE_ROUNDED'],
});

export const MOCK_IDX_NEWS_UNAVAILABLE_RESPONSE = completeMockAnalysis({
  ...MOCK_IDX_RESPONSE,
  risk_data_quality: null,
  request_id: 'mock-unvr-news-unavailable-sell',
  ticker: 'UNVR.JK',
  market: 'ID',
  llm_decision: 'Sell',
  final_decision: 'Sell',
  decision: 'Sell',
  rating: 'Sell',
  has_existing_position: false,
  position_quantity: null,
  average_entry_price: null,
  current_price: 2420,
  entry_price: 2420,
  stop_loss: 2600,
  take_profit: 1880,
  volatility_level: 'High',
  volatility_score: 63,
  rebalancing_action: 'No position to rebalance',
  position_action: null,
  new_entry_action: 'Avoid entry; wait for risk to normalize',
  position_size_hint: '0% allocation; stay on watchlist only until risk normalizes.',
  executive_summary: `UNVR.JK is rated Sell because this mock tests an IDX scenario where optional news data is unavailable, yet the remaining price, volatility, and fundamental contract still supports a defensive avoid-entry decision. The strongest support is the downside setup: current price and entry are 2420, stop loss is 2600, take profit is 1880, volatility is High at 63, and warning details clearly mark news as unavailable without blocking validation. The biggest risk to the Sell view is that missing news could hide a positive catalyst, but the safer choice is still to avoid new exposure when enrichment data is incomplete. The recommended action is no new position, no aggressive sizing, and strict respect for the stop if the sell-style plan is reviewed. The horizon follows the mock request, and the thesis is confirmed by continued weakness or invalidated by recovery above the stop with better provider coverage. This keeps the preview realistic while still making the non-live mock status clear to anyone reading the report.`,
  investment_thesis: `UNVR.JK is presented as a consumer staples company with well-known brands, but this mock focuses on how the dashboard behaves when optional news enrichment is unavailable. The business matters now because staples names can look defensive, yet weak growth, margin pressure, or changing consumer demand can still produce poor stock performance. The main headwind in this scenario is uncertainty: price and trade validation are available, but news coverage is missing, so the final decision must stay conservative rather than pretending the information set is complete. The key numbers are current price at 2420, stop loss at 2600, take profit at 1880, volatility score at 63, and allocation effectively kept at zero for new exposure. The bear case says the stock should be avoided because the downside plan is valid and the unavailable news block reduces confidence in any bullish recovery story. The bull case is that consumer staples demand could stabilize and a missing provider result might simply be a data issue, not a business problem. The bear case wins because process reliability and price weakness matter more than a possible hidden catalyst. The action plan is to avoid new entry, keep the warning badges visible, respect 2600 as invalidation if tested, use 1880 only as the risk/reward target, and rerun analysis when news coverage returns. This longer mock narrative also verifies that the analysis card, saved result, recent analysis entry, HTML preview, and PDF export can carry a realistic paragraph without changing the underlying data shape. It keeps the same fields a real backend response would send, so debugging can focus on mapping, formatting, and validation behavior instead of wondering whether missing text is a rendering bug or just another avoidable contract mismatch.`,
  news_report:
    'Mock news report: no usable news was returned. The trade plan remains valid because news is optional and non-blocking.',
  news: {
    enabled: true,
    ticker: 'UNVR.JK',
    company_name: 'Unilever Indonesia',
    window_days: 30,
    providers_used: [],
    provider_status: {
      marketaux: 'unavailable',
      newsdata: 'rate_limited',
      yfinance: 'unavailable',
    },
    articles_found: 0,
    articles_used_in_prompt: 0,
    average_sentiment: null,
    articles: [],
    empty_reason: 'No relevant company-specific news was found.',
    cache: { hit: false },
  },
  price_performance: null,
  technical_entry: null,
  news_impact: null,
  catalyst_tracker: null,
  analyst_consensus: null,
  related_news: {
    available: false,
    ticker: 'UNVR.JK',
    trade_date: '2026-05-18',
    lookback_days: 30,
    source: 'unavailable',
    summary: 'No usable related news was returned for this analysis.',
    items: [],
    warning: 'Related news is unavailable.',
  },
  data_quality: {
    trade_plan: 'valid',
    price_data: 'ok',
    volatility_data: 'ok',
    fundamentals: 'ok',
    news: 'unavailable',
    trade_levels: 'mock_recomputed',
    llm_output: 'mock_repaired',
    warnings: [
      'NEWS_UNAVAILABLE - No usable news was returned for this ticker. Analysis continues without blocking trade validation.',
      'DATA_SOURCE_WARNING - Some optional vendor enrichment was skipped. Analysis continues.',
    ],
    warning_details: [
      {
        code: 'NEWS_UNAVAILABLE',
        severity: 'warning',
        message:
          'No usable news was returned for this ticker. Analysis continues without blocking trade validation.',
        blocking: false,
      },
      {
        code: 'DATA_SOURCE_WARNING',
        severity: 'warning',
        message: 'Some optional vendor enrichment was skipped. Analysis continues.',
        blocking: false,
      },
    ],
  },
  validation_warnings: [
    {
      code: 'RR_FORCED_TO_3',
      severity: 'warning',
      message: 'Risk/reward forced to 1:3.',
      blocking: false,
    },
    'INDONESIA_TICK_SIZE_ROUNDED',
  ],
});

export const MOCK_ERROR_RESPONSE = {
  request_id: 'mock-error',
  ticker: 'ERROR',
  market: 'US',
  trade_date: '2026-05-18',
  error: 'Analysis failed: 429 RESOURCE_EXHAUSTED. Quota exceeded. Please retry later.',
};

function stripGeneratedContractFields(base = {}) {
  const {
    id,
    input_ticker,
    normalized_ticker,
    company_name,
    exchange,
    currency,
    horizon,
    created_at,
    last_price,
    price_currency,
    price_source,
    price_timestamp,
    price_is_fallback,
    market_status,
    raw_ai_signal,
    display_signal,
    signal_context,
    confidence_label,
    confidence_tier,
    confidence_breakdown,
    volatility_scale,
    volatility_method,
    volatility_lookback_days,
    volatility_classification,
    mini_risk_summary,
    action_status,
    technical_levels,
    agent_pipeline,
    total_pipeline_seconds,
    data_sources,
    data_freshness,
    analysis_params,
    tab_status,
    profile,
    fundamentals,
    chart_price,
    news_items,
    disclaimer,
    ...stableBase
  } = base;
  void id;
  void input_ticker;
  void normalized_ticker;
  void company_name;
  void exchange;
  void currency;
  void horizon;
  void created_at;
  void last_price;
  void price_currency;
  void price_source;
  void price_timestamp;
  void price_is_fallback;
  void market_status;
  void raw_ai_signal;
  void display_signal;
  void signal_context;
  void confidence_label;
  void confidence_tier;
  void confidence_breakdown;
  void volatility_scale;
  void volatility_method;
  void volatility_lookback_days;
  void volatility_classification;
  void mini_risk_summary;
  void action_status;
  void technical_levels;
  void agent_pipeline;
  void total_pipeline_seconds;
  void data_sources;
  void data_freshness;
  void analysis_params;
  void tab_status;
  void profile;
  void fundamentals;
  void chart_price;
  void news_items;
  void disclaimer;
  return stableBase;
}

function withOverrides(base, overrides) {
  return completeMockAnalysis({
    ...stripGeneratedContractFields(base),
    full_decision: null,
    ...overrides,
  });
}

const MOCK_BBRI_COMPANY_PROFILE = {
  ...MOCK_IDX_COMPANY_PROFILE,
  ticker: 'BBRI.JK',
  company_name: 'PT Bank Rakyat Indonesia (Persero) Tbk',
  website: 'https://www.bri.co.id',
  current_price: 5500,
  business_summary:
    'PT Bank Rakyat Indonesia (Persero) Tbk provides banking products and services with a focus on micro, small, and medium enterprise lending in Indonesia.',
};

const MOCK_TLKM_COMPANY_PROFILE = {
  ...MOCK_IDX_COMPANY_PROFILE,
  ticker: 'TLKM.JK',
  company_name: 'PT Telkom Indonesia (Persero) Tbk',
  sector: 'Communication Services',
  industry: 'Telecom Services',
  website: 'https://www.telkom.co.id',
  current_price: 3200,
  business_summary:
    'PT Telkom Indonesia (Persero) Tbk provides telecommunications, digital connectivity, internet, and enterprise services in Indonesia.',
};

const MOCK_PTRO_COMPANY_PROFILE = {
  ...MOCK_IDX_COMPANY_PROFILE,
  ticker: 'PTRO.JK',
  company_name: 'PT Petrosea Tbk',
  sector: 'Industrials',
  industry: 'Mining Services',
  website: 'https://www.petrosea.com',
  market_cap: 4800000000000,
  current_price: 4800,
  business_summary:
    'PT Petrosea Tbk is represented in this mock analysis as an Indonesian listed company with exposure to mining services, engineering, and project execution.',
  officers: [{ name: 'Mock Management Team', title: 'Executive Management' }],
};

const MOCK_TPIA_COMPANY_PROFILE = {
  ...MOCK_IDX_COMPANY_PROFILE,
  ticker: 'TPIA.JK',
  company_name: 'Chandra Asri Pacific Tbk',
  sector: 'Basic Materials',
  industry: 'Chemicals',
  website: 'https://www.chandra-asri.com',
  market_cap: 112000000000000,
  current_price: 1400,
  business_summary:
    'Chandra Asri Pacific Tbk is represented in this mock analysis as an Indonesian petrochemical and basic materials company with cyclicality, commodity spread risk, and execution-sensitive earnings quality.',
  officers: [{ name: 'Mock Management Team', title: 'Executive Management' }],
};

const PTRO_SUMMARY = `The current recommendation is WAIT because the stock shows elevated price momentum but does not yet offer a clean risk-reward setup for a new entry. The signal reflects the fact that the user has no existing position, so a neutral raw AI signal is translated into a practical instruction to stay on the sidelines until the setup improves. Recent price action has been strong but uneven, with short-term gains appearing partly supported by momentum rather than a fully confirmed improvement in fundamentals. The stock is trading near a key resistance area, while volatility remains high enough to make chasing the move unattractive. A better entry would require either a pullback toward support or a breakout supported by stronger volume and cleaner market confirmation. Fundamentally, the company has a reasonable operating base, but the available mock financial data still shows partial completeness in quarterly cashflow and margin detail. Revenue growth is improving, although profitability quality remains mixed and should not be treated as fully confirmed without updated financial reports. Balance sheet risk is manageable but not low enough to justify aggressive position sizing. The main risks are elevated volatility, incomplete quarterly data, and the possibility that recent price strength is speculative rather than fundamentally supported. For now, the correct action is to wait, monitor the support zone, and avoid opening a new position unless the risk-reward profile becomes more attractive.`;

const PTRO_THESIS = `PT Petrosea Tbk is represented in this mock analysis as an Indonesian listed company with exposure to mining services, engineering, and project execution. The business profile gives the stock sensitivity to commodity activity, infrastructure spending, and contract execution quality. Its market position can be attractive when project pipelines are expanding, but earnings visibility may fluctuate because revenue depends on contract timing and operating discipline. Recent price movement has been strong enough to attract trader attention, but the move should not automatically be treated as fundamentally confirmed. The stock trades near a resistance zone, while the nearest support remains meaningfully below the current price. That creates an unfavorable entry profile for users without an existing position, especially when volatility is classified as very high. Momentum may continue in the short term, but the mock setup assumes the current level does not provide enough margin of safety for a fresh entry. From a fundamental perspective, revenue trend is improving, but profitability and cashflow quality require careful confirmation. The mock data marks fundamentals as partial because quarterly cashflow information is not fully available. This means the analysis should avoid overconfidence and should clearly communicate that some conclusions depend on incomplete provider data. Balance sheet quality is acceptable in the scenario, but not strong enough to offset the risk of buying after a sharp move. Technically, the important levels are current price around Rp 4,800, nearest support near Rp 4,400, and nearest resistance around Rp 5,000. A suggested stop loss sits near Rp 4,320, while the invalidation level is near Rp 4,350. These levels imply that upside must improve before a new entry becomes attractive. The key macro risk is tighter liquidity or weaker risk appetite across Indonesian equities. The sector risk is a slowdown in commodity-related activity or weaker mining service demand. The company-specific risk is execution weakness, margin pressure, or delayed contract contribution. Final positioning is therefore WAIT for users without an existing position and REDUCE for users who already hold the stock but face weakening confirmation. The view would improve if price breaks resistance with stronger volume and updated fundamentals confirm better earnings quality. The view would deteriorate if price breaks below the invalidation level or if fresh financial data shows weaker margins and cashflow.`;

function buildPtroScenarioResponse(scenarioKey) {
  const scenario = MOCK_ANALYSIS_SCENARIOS[scenarioKey];
  const hasPosition = scenario.has_existing_position;
  const rawSignal = scenario.raw_ai_signal;
  const displaySignal = resolveDisplaySignal(rawSignal, hasPosition, scenario.rebalancing_action);
  const positionAction = hasPosition ? scenario.rebalancing_action : null;
  return withOverrides(MOCK_IDX_RESPONSE, {
    ...scenario,
    request_id: scenario.request_id,
    ticker: scenario.normalized_ticker,
    market: 'ID',
    trade_date: '2026-06-03',
    analysis_created_at: '2026-06-03T14:00:00+07:00',
    saved_at: '2026-06-03T14:00:00+07:00',
    data_fetched_at: '2026-06-03T14:00:00+07:00',
    current_price: 4800,
    last_price: 4800,
    current_price_as_of: '2026-06-03T14:00:00+07:00',
    price_timestamp: '2026-06-03T14:00:00+07:00',
    price_source: 'fast_info.last_price',
    current_price_source: 'fast_info.last_price',
    price_currency: 'IDR',
    currency: 'IDR',
    market_status: 'open',
    price_is_fallback: false,
    final_decision: rawSignal === 'SELL' ? 'Sell' : rawSignal === 'BUY' ? 'Buy' : 'Hold',
    decision: rawSignal === 'SELL' ? 'Sell' : rawSignal === 'BUY' ? 'Buy' : 'Hold',
    rating: rawSignal === 'SELL' ? 'Sell' : rawSignal === 'BUY' ? 'Buy' : 'Hold',
    raw_ai_signal: rawSignal,
    display_signal: displaySignal,
    signal_context: scenario.signal_context,
    has_existing_position: hasPosition,
    position_quantity: hasPosition ? 1000 : null,
    average_entry_price: hasPosition ? 4500 : null,
    trade_plan_valid: false,
    entry_price: null,
    stop_loss: null,
    take_profit: null,
    risk_reward_ratio: null,
    risk_reward_display: 'Not attractive',
    confidence_score: 55,
    confidence_label: 'Low Conviction',
    confidence_tier: 'low',
    volatility_level: 'Very High',
    volatility_score: 81.64,
    volatility_classification: 'Very High',
    volatility_lookback_days: 20,
    volatility_scale: '0-100',
    rebalancing_action: scenario.rebalancing_action,
    position_action: positionAction,
    new_entry_action: scenario.new_entry_action,
    position_size_hint: scenario.position_size_hint,
    action_status: displaySignal,
    mini_risk_summary:
      'Very High. Maintain strict risk control due to elevated volatility, partial quarterly financial data, and unfavorable risk-reward for new entry.',
    executive_summary: PTRO_SUMMARY,
    investment_thesis: PTRO_THESIS,
    company_profile: MOCK_PTRO_COMPANY_PROFILE,
    key_reasons_paragraph:
      'The PTRO scenario supports a WAIT or REDUCE-style conclusion because price is near resistance, downside support is materially lower, and very high volatility makes a fresh entry unattractive without stronger confirmation. Partial quarterly financial data lowers confidence, while the mining services backdrop still needs cleaner news flow and better cash flow visibility before exposure can increase. The model keeps position sizing conservative because risk reward is not attractive at the current level, and the thesis should improve only after stronger volume, updated financials, and healthier sector sentiment align.',
    key_reasons: [
      'Current price is close to resistance while support is meaningfully lower.',
      'Volatility is classified as very high on a 20-day lookback.',
      'Fundamental data is partial because quarterly cashflow data is not fully available.',
      'Risk-reward is not attractive for a new entry at the current level.',
    ],
    key_catalysts: [
      'Breakout above nearest resistance with stronger volume.',
      'Updated quarterly financial report confirming better margin and cashflow quality.',
      'Improvement in sector sentiment for Indonesian mining services.',
    ],
    invalidation_conditions: [
      'Price breaks below the invalidation level near Rp 4,350.',
      'Quarterly financial data shows weaker profitability or cashflow quality.',
      'News flow turns materially negative for contracts, margins, or sector demand.',
    ],
    technical_levels: {
      current_price: 4800,
      nearest_support: 4400,
      nearest_resistance: 5000,
      suggested_stop_loss: 4320,
      invalidation_level: 4350,
      entry_range_low: null,
      entry_range_high: null,
      risk_reward_ratio: 'Not attractive',
      technical_levels_available: true,
    },
    data_sources: {
      price: {
        provider: 'Yahoo Finance',
        method: 'fast_info.last_price',
        timestamp: '2026-06-03T14:00:00+07:00',
        is_fallback: false,
      },
      fundamentals: {
        provider: 'Yahoo Finance',
        completeness: 'partial',
        last_period: 'Q1 2026',
        period_end_date: '2026-03-31',
      },
      news: {
        provider: 'Yahoo Finance',
        articles_found: 5,
        lookback_days: 7,
        latest_article_date: '2026-06-02',
      },
      macro: { provider: 'Yahoo Finance', description: 'Latest available' },
    },
    data_freshness: {
      price: {
        timestamp: '2026-06-03T14:00:00+07:00',
        type: 'intraday',
        freshness_status: 'fresh',
      },
      financials: {
        period: 'Q1 2026',
        period_end_date: '2026-03-31',
        freshness_status: 'fresh',
      },
      news: {
        lookback_days: 7,
        articles_count: 5,
        latest_article_date: '2026-06-02',
        freshness_status: 'fresh',
      },
      macro: { description: 'Latest available from provider', freshness_status: 'unknown' },
    },
    tab_status: {
      analysis: 'ok',
      profile: 'ok',
      fundamental: 'partial',
      chart_price: 'ok',
      news: 'ok',
      risk_data_quality: 'warning',
    },
  });
}

export const MOCK_PTRO_WAIT_RESPONSE = buildPtroScenarioResponse('PTRO_WAIT_NO_POSITION');
export const MOCK_BBCA_BUY_SCENARIO_RESPONSE = withOverrides(MOCK_IDX_RESPONSE, {
  ...MOCK_ANALYSIS_SCENARIOS.BBCA_BUY_NO_POSITION,
  ticker: 'BBCA.JK',
  raw_ai_signal: 'BUY',
  display_signal: resolveDisplaySignal('BUY', false, 'Open new position'),
  signal_context: MOCK_ANALYSIS_SCENARIOS.BBCA_BUY_NO_POSITION.signal_context,
});
export const MOCK_BBRI_HOLD_SCENARIO_RESPONSE = withOverrides(MOCK_IDX_RESPONSE, {
  ...MOCK_ANALYSIS_SCENARIOS.BBRI_HOLD_EXISTING_POSITION,
  ticker: 'BBRI.JK',
  current_price: 5500,
  last_price: 5500,
  company_profile: MOCK_BBRI_COMPANY_PROFILE,
  raw_ai_signal: 'HOLD',
  display_signal: resolveDisplaySignal('HOLD', true, 'Maintain position'),
  signal_context: MOCK_ANALYSIS_SCENARIOS.BBRI_HOLD_EXISTING_POSITION.signal_context,
  has_existing_position: true,
  position_quantity: 1000,
  average_entry_price: 5300,
});
export const MOCK_TLKM_SELL_SCENARIO_RESPONSE = withOverrides(MOCK_SELL_RESPONSE, {
  ...MOCK_ANALYSIS_SCENARIOS.TLKM_SELL_EXISTING_POSITION,
  ticker: 'TLKM.JK',
  market: 'ID',
  company_profile: MOCK_TLKM_COMPANY_PROFILE,
  current_price: 3200,
  last_price: 3200,
  raw_ai_signal: 'SELL',
  display_signal: resolveDisplaySignal('SELL', true, 'Exit position'),
  signal_context: MOCK_ANALYSIS_SCENARIOS.TLKM_SELL_EXISTING_POSITION.signal_context,
  has_existing_position: true,
  position_quantity: 1000,
  average_entry_price: 3500,
});

export const MOCK_TPIA_REDUCE_SCENARIO_RESPONSE = withOverrides(MOCK_SELL_RESPONSE, {
  ...MOCK_ANALYSIS_SCENARIOS.TPIA_REDUCE_EXISTING_POSITION,
  ticker: 'TPIA.JK',
  market: 'ID',
  company_profile: MOCK_TPIA_COMPANY_PROFILE,
  current_price: 1400,
  last_price: 1400,
  current_price_as_of: '2026-06-04T11:55:00+07:00',
  price_timestamp: '2026-06-04T11:55:00+07:00',
  price_source: 'mock:intraday',
  current_price_source: 'mock:intraday',
  price_currency: 'IDR',
  currency: 'IDR',
  has_existing_position: true,
  position_quantity: 1000,
  average_entry_price: 1670,
  raw_ai_signal: 'SELL',
  display_signal: resolveDisplaySignal('SELL', true, 'Trim position'),
  signal_context: MOCK_ANALYSIS_SCENARIOS.TPIA_REDUCE_EXISTING_POSITION.signal_context,
  final_decision: 'Sell',
  decision: 'Sell',
  rating: 'Sell',
  trade_plan_valid: true,
  entry_price: null,
  stop_loss: 1370,
  take_profit: null,
  risk_reward_ratio: null,
  risk_reward_display: 'Not attractive',
  confidence_score: 55,
  confidence_label: 'Low Conviction',
  confidence_tier: 'low',
  volatility_level: 'Very High',
  volatility_score: 100,
  volatility_classification: 'Very High',
  rebalancing_action: 'Trim position',
  position_action: 'Trim position',
  new_entry_action: 'Do not add; reduce existing exposure',
  position_size_hint: 'Reduce position size gradually; no new exposure suggested.',
});

const MOCK_MAP = {
  NVDA: MOCK_BUY_RESPONSE,
  AAPL: MOCK_HOLD_RESPONSE,
  TSLA: MOCK_SELL_RESPONSE,
  'PTRO.JK': MOCK_PTRO_WAIT_RESPONSE,
  'TPIA.JK': MOCK_TPIA_REDUCE_SCENARIO_RESPONSE,
  'BBCA.JK': MOCK_BBCA_BUY_SCENARIO_RESPONSE,
  'BBRI.JK': MOCK_BBRI_HOLD_SCENARIO_RESPONSE,
  'TLKM.JK': MOCK_TLKM_SELL_SCENARIO_RESPONSE,
  META: MOCK_REPAIRED_RESPONSE,
  MSFT: withOverrides(MOCK_BUY_RESPONSE, {
    request_id: 'mock-msft-buy',
    ticker: 'MSFT',
    current_price: 430,
    entry_price: 430,
    stop_loss: 405,
    take_profit: 505,
    volatility_level: 'Medium',
    volatility_score: 46,
    confidence_score: 0.82,
    suggested_allocation_percent: 6,
    executive_summary: `MSFT is rated Buy because the mock path shows a complete backend-style result with cloud growth, enterprise AI adoption, security demand, and durable Office cash flow supporting controlled exposure. The strongest support is the validated plan: current price and entry are 430, stop loss is 405, take profit is 505, volatility is Medium at 46, allocation is 6 percent, and the trade keeps a fixed 1:3 risk/reward profile. The biggest risk is valuation sensitivity if Azure growth or AI monetization disappoints, but the company’s diversified revenue base keeps the mock thesis stronger than the downside case. The recommended action is a staged entry near current price, disciplined sizing, no averaging down below the stop, and profit-taking only at the target. The horizon follows the selected test window, and the thesis is confirmed by steady cloud demand and enterprise AI uptake, or invalidated by a break below support with weaker growth signals.`,
    investment_thesis: `MSFT is presented as a diversified technology company built around Azure cloud, Office productivity, Windows, security, developer tools, gaming, and enterprise AI services. The business matters now because large customers are still modernizing infrastructure and testing AI features, which can lift cloud usage, software attach rates, and long-term customer retention. The main tailwind is enterprise AI adoption, since Microsoft can package models, cloud compute, data tools, and workplace software into products that businesses already use. The important numbers are current price at 430, stop loss at 405, take profit at 505, suggested allocation at 6 percent, and volatility score at 46. The bull case says the setup is actionable because revenue sources are diversified, the trade levels are complete, and Medium volatility allows standard staged sizing. The bear case is that expectations for AI monetization can run ahead of actual revenue, while slower Azure growth or tighter IT budgets could pressure the multiple. That risk is worth monitoring, but the bull case wins in this mock because the company has several profit engines and the execution plan is clearly bounded. The action plan is to enter near 430, keep allocation around 6 percent, use 405 as the stop loss, take profit at 505, and reject the thesis if cloud growth weakens or price breaks support. This longer mock narrative also verifies that the analysis card, saved result, recent analysis entry, HTML preview, and PDF export can carry a realistic paragraph without changing the underlying data shape. It keeps the same fields a real backend response would send, so debugging can focus on mapping, formatting, and validation behavior instead of wondering whether missing text is a rendering bug or just another avoidable contract mismatch.`,
  }),
  'BMRI.JK': withOverrides(MOCK_IDX_RESPONSE, {
    request_id: 'mock-bmri-buy',
    ticker: 'BMRI.JK',
    current_price: 6900,
    entry_price: 6900,
    stop_loss: 6500,
    take_profit: 8100,
  }),
  'ASII.JK': withOverrides(MOCK_HOLD_RESPONSE, {
    request_id: 'mock-asii-hold',
    ticker: 'ASII.JK',
    market: 'ID',
    current_price: 5700,
    volatility_level: 'High',
    volatility_score: 61,
    rebalancing_action: 'No position to rebalance',
    new_entry_action: 'Wait for valid entry setup',
    validation_warnings: ['HOLD_TRADE_LEVELS_HIDDEN'],
  }),
  'GOTO.JK': withOverrides(MOCK_SELL_RESPONSE, {
    request_id: 'mock-goto-sell',
    ticker: 'GOTO.JK',
    market: 'ID',
    has_existing_position: false,
    position_quantity: null,
    average_entry_price: null,
    current_price: 70,
    entry_price: 70,
    stop_loss: 77,
    take_profit: 49,
    rebalancing_action: 'No position to rebalance',
    position_action: null,
    new_entry_action: 'Avoid entry; wait for risk to normalize',
    position_size_hint: '0% allocation; stay on watchlist only until risk normalizes.',
    volatility_level: 'Very High',
    volatility_score: 91,
    validation_warnings: ['INDONESIA_TICK_SIZE_ROUNDED'],
  }),
  'UNVR.JK': MOCK_IDX_NEWS_UNAVAILABLE_RESPONSE,
  ERROR: MOCK_ERROR_RESPONSE,
  MISSING: MOCK_MISSING_PRICE_RESPONSE,
};

const MOCK_IDX_CODES = ['BBCA', 'BBRI', 'TLKM', 'PTRO', 'TPIA', 'BMRI', 'ASII', 'GOTO', 'UNVR'];

function normalizeMockTicker(ticker) {
  const normalizedTicker = String(ticker || 'NVDA')
    .trim()
    .toUpperCase();
  if (MOCK_IDX_CODES.includes(normalizedTicker)) return `${normalizedTicker}.JK`;
  return normalizedTicker;
}

function normalizePositionNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : value;
}

function ensureAllowedRebalancing(response) {
  const positionOnlyActions = new Set(['Exit position', 'Trim position']);

  if (!response.has_existing_position && positionOnlyActions.has(response.rebalancing_action)) {
    response.rebalancing_action = 'No position to rebalance';
    response.position_action = null;
    response.new_entry_action = 'Wait for valid entry setup';
    response.position_size_hint = '0% allocation until setup improves.';
    response.validation_warnings = Array.from(
      new Set([...(response.validation_warnings || []), 'INVALID_REBALANCING_FIXED'])
    );
  }

  return response;
}

function applyResponseDetail(response) {
  if (response.response_detail === 'summary') {
    response.investment_thesis = null;
    response.key_catalysts = [];
    response.invalidation_conditions = [];
    response.market_report = null;
    response.news_report = null;
    response.fundamentals_report = null;
    response.risk_report = null;
    response.portfolio_report = null;
    response.debate_summary = null;
  }

  if (response.response_detail === 'debug') {
    response.raw_agent_state = {
      note: 'Mock debug payload that mirrors the backend raw_agent_state slot.',
      agents: response.agents_used,
      data_quality: response.data_quality,
    };
  }

  return response;
}

export function getMockAnalysisResponse(options = {}) {
  const {
    ticker = 'NVDA',
    market,
    request_id,
    trade_date,
    time_horizon_months = 1,
    max_debate_rounds = 3,
    analysis_depth = 'balanced',
    response_detail = 'full',
    has_existing_position,
    position_quantity = null,
    average_entry_price = null,
  } = options;

  const normalizedTicker = normalizeMockTicker(ticker);
  const normalizedHorizon = normalizeTimeHorizonMonths(time_horizon_months);
  const hasExistingProvided = Object.prototype.hasOwnProperty.call(
    options,
    'has_existing_position'
  );
  let base =
    MOCK_MAP[normalizedTicker] ||
    (normalizedTicker.endsWith('.JK') ? MOCK_IDX_RESPONSE : MOCK_BUY_RESPONSE);

  const response = cloneMock(base);

  response.request_id = request_id || response.request_id;
  response.ticker = normalizedTicker;
  response.market = market || (normalizedTicker.endsWith('.JK') ? 'ID' : 'US');
  response.trade_date = trade_date || response.trade_date;
  response.time_horizon_months = normalizedHorizon;
  response.time_horizon = formatTimeHorizon(normalizedHorizon);
  response.max_debate_rounds = Number(max_debate_rounds);
  response.analysis_depth = analysis_depth;
  response.response_detail = response_detail;
  response.llm_call_budget = 0;
  response.llm_calls_used = 0;
  response.agents_used = response.agents_used || PIPELINE_AGENTS;
  response.has_existing_position = hasExistingProvided
    ? Boolean(has_existing_position)
    : Boolean(response.has_existing_position);
  response.position_quantity = response.has_existing_position
    ? normalizePositionNumber(
        Object.prototype.hasOwnProperty.call(options, 'position_quantity')
          ? position_quantity
          : response.position_quantity
      )
    : null;
  response.average_entry_price = response.has_existing_position
    ? normalizePositionNumber(
        Object.prototype.hasOwnProperty.call(options, 'average_entry_price')
          ? average_entry_price
          : response.average_entry_price
      )
    : null;
  response.analysis_created_at = new Date().toISOString();
  response.saved_at = response.analysis_created_at;
  response.data_fetched_at = response.current_price_as_of || response.analysis_created_at;
  response.current_price_source = response.current_price_source || 'mock:yfinance:last_close';
  response.price_chart = syncMockPriceChart(response.price_chart, {
    ticker: response.ticker,
    tradeDate: response.trade_date,
    months: normalizedHorizon,
  });
  response.news = syncMockNews(response.news, response.ticker);
  response.mock = true;
  response.source = 'frontend/dev/mockData.js';

  const rawAiSignal = normalizeRawAiSignal(
    response.raw_ai_signal || response.final_decision || response.decision || response.rating
  );
  const displaySignal = resolveDisplaySignal(
    rawAiSignal,
    response.has_existing_position,
    response.rebalancing_action
  );
  response.raw_ai_signal = rawAiSignal;
  response.display_signal = displaySignal;
  response.signal_context = signalContextForMock(
    rawAiSignal,
    response.has_existing_position,
    displaySignal
  );

  applyMockActionCopy(response);
  ensureAllowedRebalancing(response);
  applyResponseDetail(response);

  const freshDataFreshness = createMockDataFreshness(response);
  Object.assign(
    response,
    createMockProductionContract(response, {
      raw_ai_signal: response.raw_ai_signal,
      display_signal: response.display_signal,
      signal_context: response.signal_context,
      data_freshness: freshDataFreshness,
      analysis_params: createMockAnalysisParams(response),
      tab_status: createMockTabStatus(response, freshDataFreshness),
    })
  );

  response.full_decision = createFullDecision({
    decision: response.final_decision ?? response.decision,
    summary: response.executive_summary,
    thesis: response.investment_thesis,
    timeHorizon: response.time_horizon,
  });
  response.analysis_overview = createMockAnalysisOverview(response);

  return response;
}

export const MOCK_RESPONSES_BY_REQUEST_ID = {
  'mock-nvda-buy': MOCK_BUY_RESPONSE,
  'mock-tsla-sell': MOCK_SELL_RESPONSE,
  'mock-aapl-hold': MOCK_HOLD_RESPONSE,
  'mock-missing-price': MOCK_MISSING_PRICE_RESPONSE,
  'mock-meta-repaired-buy': MOCK_REPAIRED_RESPONSE,
  'mock-bbca-id-buy': MOCK_IDX_RESPONSE,
  'mock-unvr-news-unavailable-sell': MOCK_IDX_NEWS_UNAVAILABLE_RESPONSE,
  'mock-ptro-wait-no-position': MOCK_PTRO_WAIT_RESPONSE,
  'mock-tpia-reduce-existing-position': MOCK_TPIA_REDUCE_SCENARIO_RESPONSE,
  'mock-bbca-buy-no-position': MOCK_BBCA_BUY_SCENARIO_RESPONSE,
  'mock-bbri-hold-existing-position': MOCK_BBRI_HOLD_SCENARIO_RESPONSE,
  'mock-tlkm-sell-existing-position': MOCK_TLKM_SELL_SCENARIO_RESPONSE,
};

const MOCK_REQUEST_LOOKUP = Object.values(MOCK_MAP).reduce(
  (acc, response) => {
    if (response?.request_id) acc[response.request_id] = response;
    return acc;
  },
  { ...MOCK_RESPONSES_BY_REQUEST_ID }
);

export function getMockAnalysisResponseByRequestId(requestId) {
  if (!requestId) return null;
  const decodedId = decodeURIComponent(String(requestId));
  const exact = MOCK_REQUEST_LOOKUP[decodedId];
  if (exact) return cloneMock(exact);

  const tickerMatch = decodedId.match(
    /^mock-([a-z0-9-]+?)(?:-(?:buy|sell|hold|repaired|id-buy|\d+).*)?$/i
  );
  const guessedTicker = tickerMatch?.[1]?.replace(/-/g, '.').toUpperCase();
  if (guessedTicker)
    return getMockAnalysisResponse({ ticker: guessedTicker, request_id: decodedId });

  return null;
}
