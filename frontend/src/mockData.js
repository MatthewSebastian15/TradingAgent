// frontend/src/mockData.js
// Central mock source for /analysis.test and VITE_ENABLE_MOCK=true.
// Keep the shape close to the backend response so the UI can be debugged
// without spending LLM quota or running the agent pipeline.

const AGENTS_USED = [
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

function normalizeTimeHorizonMonths(value) {
  const months = Number(value);
  return [1, 2, 3].includes(months) ? months : 1;
}

function formatTimeHorizon(months) {
  const normalized = normalizeTimeHorizonMonths(months);
  return `${normalized} Month${normalized > 1 ? 's' : ''}`;
}

export const MOCK_PIPELINE_STEPS = [
  {
    agent_id: 'data_collection',
    agent_name: 'DATA COLLECTION',
    running: 'Fetching price history, fundamentals, and news snapshot...',
    completed: 'Market data package prepared.',
  },
  {
    agent_id: 'market_analyst',
    agent_name: 'MARKET ANALYST',
    running: 'Reading price trend, volume behavior, and momentum context...',
    completed: 'Market structure analysis complete.',
  },
  {
    agent_id: 'news_analyst',
    agent_name: 'NEWS ANALYST',
    running: 'Reviewing recent headlines and sentiment drivers...',
    completed: 'News sentiment analysis complete.',
  },
  {
    agent_id: 'fundamentals',
    agent_name: 'FUNDAMENTALS ANALYST',
    running: 'Checking growth, margins, valuation, and balance sheet quality...',
    completed: 'Fundamental review complete.',
  },
  {
    agent_id: 'bull_researcher',
    agent_name: 'BULL RESEARCHER',
    running: 'Building the optimistic case and upside scenario...',
    completed: 'Bull case complete.',
  },
  {
    agent_id: 'bear_researcher',
    agent_name: 'BEAR RESEARCHER',
    running: 'Building the downside case and key risk scenario...',
    completed: 'Bear case complete.',
  },
  {
    agent_id: 'research_manager',
    agent_name: 'RESEARCH MANAGER',
    running: 'Reconciling bull and bear arguments into a decision frame...',
    completed: 'Research verdict complete.',
  },
  {
    agent_id: 'trader',
    agent_name: 'TRADER',
    running: 'Drafting entry, stop loss, take profit, and execution plan...',
    completed: 'Trade plan complete.',
  },
  {
    agent_id: 'risk_analysts',
    agent_name: 'RISK ANALYSTS',
    running: 'Stress testing drawdown, volatility, and invalidation levels...',
    completed: 'Risk review complete.',
  },
  {
    agent_id: 'portfolio_manager',
    agent_name: 'PORTFOLIO MANAGER',
    running: 'Finalizing allocation and portfolio action...',
    completed: 'Portfolio decision complete.',
  },
];

export const MOCK_RESPONSE = {
  request_id: 'mock-nvda-buy',
  ticker: 'NVDA',
  trade_date: '2026-05-18',
  decision: 'Buy',
  rating: 'Buy',
  price_target: 1050,
  time_horizon_months: 3,
  time_horizon: '3 Months',
  confidence_score: 0.86,
  suggested_allocation_percent: 6,
  entry_price: 920,
  stop_loss: 850,
  take_profit: 1050,
  risk_reward_ratio: '2.6:1',
  max_drawdown_estimate: '8-12%',
  volatility_level: 'High',
  rebalancing_action: 'Add gradually',
  position_sizing_reason:
    'Use a staged 5-7% allocation because momentum remains strong, but valuation risk is still high. Split entries across 2-3 tranches instead of buying all at once.',
  executive_summary:
    'NVDA remains in a strong position because AI infrastructure spending is still concentrated around its GPU and software ecosystem. Demand for accelerated computing stays above available supply, and the company keeps high operating leverage through premium pricing. The main risk is valuation: the market already expects strong execution, so position sizing matters more than blind conviction.',
  investment_thesis:
    'The core thesis is simple: NVDA is still the default supplier for high-end AI training and inference workloads. Its CUDA ecosystem, data center GPU roadmap, and customer lock-in give it a moat that competitors can attack but not quickly erase. The upside case depends on sustained cloud capex, Blackwell adoption, and enterprise AI demand expanding beyond the largest hyperscalers. The downside case is also real: export restrictions, margin normalization, or slower AI monetization could compress the multiple. The practical action is to buy gradually, keep the stop loss disciplined, and avoid oversized exposure just because the chart looks heroic, as humans keep doing before learning nothing.',
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
    price_data: 'ok',
    fundamentals: 'ok',
    news: 'ok',
    warnings: ['Mock data only. No backend, yfinance, or LLM call was executed.'],
  },
  agents_used: AGENTS_USED,
  full_decision: `**Rating**: Buy

**Executive Summary**: NVDA remains in a strong position because AI infrastructure spending is still concentrated around its GPU and software ecosystem.

**Investment Thesis**: Buy gradually, use disciplined risk controls, and avoid oversized exposure.

**Price Target**: 1050.0

**Time Horizon**: 3 Months`,
};

export const MOCK_SELL_RESPONSE = {
  request_id: 'mock-tsla-sell',
  ticker: 'TSLA',
  trade_date: '2026-05-18',
  decision: 'Sell',
  rating: 'Sell',
  price_target: 155,
  time_horizon_months: 1,
  time_horizon: '1 Month',
  confidence_score: 0.78,
  suggested_allocation_percent: 0,
  entry_price: 185,
  stop_loss: 220,
  take_profit: 155,
  risk_reward_ratio: '1.8:1',
  max_drawdown_estimate: '12-18%',
  volatility_level: 'Very High',
  rebalancing_action: 'Reduce exposure',
  position_sizing_reason:
    'Avoid adding new exposure until margins stabilize and the stock regains clear technical strength. Existing positions can be reduced in stages.',
  executive_summary:
    'TSLA faces pressure from price competition, margin compression, and uncertainty around the timing of robotaxi and software monetization. The brand remains valuable, but the current setup lacks a clear near-term catalyst. Risk control matters more than hope, which is tragic news for spreadsheet optimism.',
  investment_thesis:
    'The sell thesis centers on weaker automotive margins and rising EV competition, especially from lower-cost Chinese manufacturers. TSLA still has long-term optionality from energy storage, FSD, and robotics, but those businesses need time before they can offset margin pressure in the core auto segment. In the short term, the stock needs evidence of margin recovery, stronger delivery growth, or credible software revenue acceleration. Until that appears, reducing exposure is cleaner than waiting for narrative magic to repair the P&L.',
  key_catalysts: [
    'Possible rebound if deliveries surprise to the upside.',
    'Energy storage growth could soften automotive weakness.',
  ],
  invalidation_conditions: [
    'Recovery above $220 with improving volume.',
    'Gross margin stabilizes and guidance improves.',
    'FSD monetization shows measurable revenue contribution.',
  ],
  data_quality: {
    price_data: 'ok',
    fundamentals: 'partial',
    news: 'ok',
    warnings: ['Mock bearish scenario. Fundamentals are synthetic for UI debugging.'],
  },
  agents_used: AGENTS_USED,
  full_decision: `**Rating**: Sell

**Executive Summary**: TSLA faces margin and competition pressure.

**Investment Thesis**: Reduce exposure until the setup improves.

**Price Target**: 155.0

**Time Horizon**: 1 Month`,
};

export const MOCK_HOLD_RESPONSE = {
  request_id: 'mock-aapl-hold',
  ticker: 'AAPL',
  trade_date: '2026-05-18',
  decision: 'Hold',
  rating: 'Hold',
  price_target: 210,
  time_horizon_months: 2,
  time_horizon: '2 Months',
  confidence_score: 0.72,
  suggested_allocation_percent: 4,
  entry_price: 190,
  stop_loss: 175,
  take_profit: 210,
  risk_reward_ratio: '1.3:1',
  max_drawdown_estimate: '6-9%',
  volatility_level: 'Medium',
  rebalancing_action: 'Maintain position',
  position_sizing_reason:
    'Keep the position near benchmark weight. The business quality is high, but the short-term upside does not justify aggressive additions.',
  executive_summary:
    'AAPL remains a high-quality compounder with strong services revenue and a resilient ecosystem. The issue is timing. Hardware growth looks mature, and the next upgrade cycle needs clearer evidence before a stronger rating makes sense.',
  investment_thesis:
    'The hold thesis reflects a strong company with limited near-term upside. Services revenue, buybacks, and ecosystem retention support the downside, while AI-driven device upgrades could create a better catalyst later. For now, the stock deserves patience rather than new aggressive buying. Even the machines can see that sometimes doing nothing is a decision, despite humanity requiring dashboards for it.',
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
    price_data: 'ok',
    fundamentals: 'ok',
    news: 'partial',
    warnings: ['Mock neutral scenario. News field is intentionally partial for UI testing.'],
  },
  agents_used: AGENTS_USED,
  full_decision: `**Rating**: Hold

**Executive Summary**: AAPL is stable but lacks a strong near-term catalyst.

**Investment Thesis**: Maintain exposure and wait for better upside confirmation.

**Price Target**: 210.0

**Time Horizon**: 2 Months`,
};

export const MOCK_IDX_RESPONSE = {
  request_id: 'mock-bbca-buy',
  ticker: 'BBCA.JK',
  trade_date: '2026-05-18',
  decision: 'Buy',
  rating: 'Buy',
  price_target: 10800,
  time_horizon_months: 3,
  time_horizon: '3 Months',
  confidence_score: 0.81,
  suggested_allocation_percent: 8,
  entry_price: 9800,
  stop_loss: 9300,
  take_profit: 10800,
  risk_reward_ratio: '2.0:1',
  max_drawdown_estimate: '5-8%',
  volatility_level: 'Medium',
  rebalancing_action: 'Accumulate on pullback',
  position_sizing_reason:
    'Use a larger allocation only when the portfolio needs defensive financial exposure. Add on weakness instead of chasing short rallies.',
  executive_summary:
    'The IDX mock scenario uses a large-cap bank profile with steady profitability, strong liquidity, and defensive characteristics. It helps you test IDR formatting, .JK ticker behavior, and local-market UI cases without hitting the backend.',
  investment_thesis:
    'The buy thesis depends on resilient loan growth, stable asset quality, and strong deposit franchise economics. Upside comes from improving credit demand and consistent profitability. The main risk is macro pressure from rates, weaker consumption, or rising credit costs. This mock exists so the UI can behave like a serious finance tool instead of a decorative loading screen wearing a suit.',
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
    price_data: 'ok',
    fundamentals: 'ok',
    news: 'partial',
    warnings: ['Mock IDX scenario. Values are synthetic and intended only for UI debugging.'],
  },
  agents_used: AGENTS_USED,
  full_decision: `**Rating**: Buy

**Executive Summary**: IDX large-cap bank mock with IDR metrics.

**Investment Thesis**: Accumulate on pullback with disciplined risk control.

**Price Target**: 10800

**Time Horizon**: 3 Months`,
};

export const MOCK_ERROR_RESPONSE = {
  request_id: 'mock-error',
  ticker: 'ERROR',
  trade_date: '2026-05-18',
  error: 'Analysis failed: 429 RESOURCE_EXHAUSTED. Quota exceeded. Please retry later.',
};

const MOCK_MAP = {
  NVDA: MOCK_RESPONSE,
  AAPL: MOCK_HOLD_RESPONSE,
  TSLA: MOCK_SELL_RESPONSE,
  'BBCA.JK': MOCK_IDX_RESPONSE,
  'BBRI.JK': {
    ...MOCK_IDX_RESPONSE,
    request_id: 'mock-bbri-buy',
    ticker: 'BBRI.JK',
    price_target: 6200,
    entry_price: 5500,
    stop_loss: 5200,
    take_profit: 6200,
  },
  'TLKM.JK': {
    ...MOCK_IDX_RESPONSE,
    request_id: 'mock-tlkm-hold',
    ticker: 'TLKM.JK',
    decision: 'Hold',
    rating: 'Hold',
    price_target: 3500,
    entry_price: 3200,
    stop_loss: 3000,
    take_profit: 3500,
    suggested_allocation_percent: 5,
    rebalancing_action: 'Maintain position',
  },
  'BMRI.JK': {
    ...MOCK_IDX_RESPONSE,
    request_id: 'mock-bmri-buy',
    ticker: 'BMRI.JK',
    price_target: 7600,
    entry_price: 6900,
    stop_loss: 6500,
    take_profit: 7600,
  },
  'ASII.JK': {
    ...MOCK_IDX_RESPONSE,
    request_id: 'mock-asii-hold',
    ticker: 'ASII.JK',
    decision: 'Hold',
    rating: 'Hold',
    price_target: 6100,
    entry_price: 5700,
    stop_loss: 5300,
    take_profit: 6100,
    suggested_allocation_percent: 4,
    rebalancing_action: 'Maintain position',
  },
  'GOTO.JK': {
    ...MOCK_IDX_RESPONSE,
    request_id: 'mock-goto-sell',
    ticker: 'GOTO.JK',
    decision: 'Sell',
    rating: 'Sell',
    price_target: 55,
    entry_price: 70,
    stop_loss: 82,
    take_profit: 55,
    suggested_allocation_percent: 0,
    volatility_level: 'Very High',
    rebalancing_action: 'Avoid exposure',
  },
  ERROR: MOCK_ERROR_RESPONSE,
};

const MOCK_IDX_CODES = ['BBCA', 'BBRI', 'TLKM', 'BMRI', 'ASII', 'GOTO', 'UNVR'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeMockTicker(ticker) {
  const normalizedTicker = String(ticker || 'NVDA')
    .trim()
    .toUpperCase();
  if (MOCK_IDX_CODES.includes(normalizedTicker)) return `${normalizedTicker}.JK`;
  return normalizedTicker;
}

export function getMockAnalysisResponse({
  ticker = 'NVDA',
  trade_date,
  time_horizon_months = 1,
  max_debate_rounds = 3,
} = {}) {
  const normalizedTicker = normalizeMockTicker(ticker);
  const base =
    MOCK_MAP[normalizedTicker] ||
    (normalizedTicker.endsWith('.JK') ? MOCK_IDX_RESPONSE : MOCK_RESPONSE);
  const response = clone(base);
  const normalizedHorizon = normalizeTimeHorizonMonths(time_horizon_months);

  response.ticker = normalizedTicker;
  response.trade_date = trade_date || response.trade_date;
  response.time_horizon_months = normalizedHorizon;
  response.time_horizon = formatTimeHorizon(normalizedHorizon);
  if (typeof response.full_decision === 'string') {
    response.full_decision = response.full_decision.replace(
      /\*\*Time Horizon\*\*: .*/,
      `**Time Horizon**: ${response.time_horizon}`
    );
  }
  response.max_debate_rounds = max_debate_rounds;
  response.mock = true;
  response.source = 'frontend/src/mockData.js';

  if (!response.request_id) {
    response.request_id = `mock-${normalizedTicker.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }

  return response;
}
