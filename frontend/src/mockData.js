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

function createFullDecision({ decision, summary, thesis, priceTarget, timeHorizon }) {
  return `**Rating**: ${decision}\n\n**Executive Summary**: ${summary}\n\n**Investment Thesis**: ${thesis}\n\n**Price Target**: ${priceTarget ?? 'N/A'}\n\n**Time Horizon**: ${timeHorizon}`;
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

const COMMON_QUALITY = {
  price_data: 'ok',
  fundamentals: 'ok',
  news: 'ok',
  volatility_data: 'ok',
};

export const MOCK_RESPONSE = {
  request_id: 'mock-nvda-buy',
  ticker: 'NVDA',
  trade_date: '2026-05-18',
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
  current_price: 920,
  current_price_as_of: '2026-05-18',
  current_price_source: 'yfinance:last_close',
  price_target: 1060,
  time_horizon_months: 3,
  time_horizon: '3 Months',
  confidence_score: 0.86,
  suggested_allocation_percent: 6,
  entry_price: 920,
  stop_loss: 880,
  take_profit: 1040,
  risk_per_share: 40,
  reward_per_share: 120,
  risk_reward_ratio: 3.0,
  risk_reward_display: '1:3',
  max_drawdown_estimate: '8-12%',
  max_drawdown_min_pct: 8,
  max_drawdown_max_pct: 12,
  volatility_level: 'High',
  volatility_score: 72,
  rebalancing_action: 'Buy with tight risk control',
  position_action: null,
  new_entry_action: 'Buy with tight risk control',
  position_size_hint: 'Use smaller size due to High volatility.',
  position_sizing_reason:
    'Use a smaller staged allocation because volatility is high. Keep the stop loss disciplined and do not add unless the setup keeps a valid 1:3 risk/reward profile.',
  executive_summary:
    'NVDA remains in a strong position because AI infrastructure spending is still concentrated around its GPU and software ecosystem. Demand for accelerated computing stays above available supply, and the company keeps high operating leverage through premium pricing. The backend-valid trade plan is actionable only because current price and risk/reward levels are complete.',
  investment_thesis:
    'The core thesis is that NVDA remains a leading supplier for high-end AI training and inference workloads. Its CUDA ecosystem, data center GPU roadmap, and customer lock-in create durable advantages. The upside case depends on sustained cloud capex, Blackwell adoption, and broader enterprise AI demand. The downside case is valuation sensitivity if growth expectations cool. The trade plan uses backend current price as the anchor, not a model-invented number. The setup remains valid only while entry, stop loss, and take profit preserve a risk/reward ratio between 1:3 and 1:5.',
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
    ...COMMON_QUALITY,
    trade_levels: 'recomputed',
    llm_output: 'repaired',
    warnings: ['Mock data only. No backend, yfinance, or LLM call was executed.'],
  },
  validation_warnings: ['TAKE_PROFIT_RECOMPUTED'],
  agents_used: AGENTS_USED,
};
MOCK_RESPONSE.full_decision = createFullDecision({
  decision: MOCK_RESPONSE.final_decision,
  summary: MOCK_RESPONSE.executive_summary,
  thesis: MOCK_RESPONSE.investment_thesis,
  priceTarget: MOCK_RESPONSE.price_target,
  timeHorizon: MOCK_RESPONSE.time_horizon,
});

export const MOCK_SELL_RESPONSE = {
  request_id: 'mock-tsla-sell',
  ticker: 'TSLA',
  trade_date: '2026-05-18',
  llm_decision: 'Sell',
  final_decision: 'Sell',
  decision: 'Sell',
  rating: 'Sell',
  decision_adjusted: false,
  decision_adjusted_reason: null,
  trade_plan_valid: true,
  has_existing_position: true,
  position_quantity: 100,
  average_entry_price: 210,
  current_price: 185,
  current_price_as_of: '2026-05-18',
  current_price_source: 'yfinance:last_close',
  price_target: 155,
  time_horizon_months: 1,
  time_horizon: '1 Month',
  confidence_score: 0.78,
  suggested_allocation_percent: 0,
  entry_price: 185,
  stop_loss: 195,
  take_profit: 155,
  risk_per_share: 10,
  reward_per_share: 30,
  risk_reward_ratio: 3.0,
  risk_reward_display: '1:3',
  max_drawdown_estimate: '12-20%',
  max_drawdown_min_pct: 12,
  max_drawdown_max_pct: 20,
  volatility_level: 'Very High',
  volatility_score: 88,
  rebalancing_action: 'Exit position',
  position_action: 'Exit position',
  new_entry_action: 'Wait for better entry',
  position_size_hint: 'Avoid aggressive sizing. Consider no new entry or very small size only.',
  position_sizing_reason:
    'Existing exposure can be exited because the user already has a position and volatility is very high. New exposure is not suggested.',
  executive_summary:
    'TSLA faces pressure from price competition, margin compression, and uncertainty around the timing of robotaxi and software monetization. The current setup is a valid Sell because backend validation confirms current price, stop loss, take profit, and risk/reward direction. Existing-position context allows the portfolio action to be Exit position.',
  investment_thesis:
    'The sell thesis centers on weaker automotive margins and rising EV competition. TSLA still has long-term optionality from energy storage, FSD, and robotics, but those businesses need time before they can offset pressure in the core auto segment. In the short term, the stock needs evidence of margin recovery, stronger delivery growth, or credible software revenue acceleration. The trade plan treats price target as an analytical target and take profit as the execution target. Risk/reward is constrained at 1:3, keeping the setup testable. The action is valid only because has_existing_position is true.',
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
    ...COMMON_QUALITY,
    trade_levels: 'ok',
    llm_output: 'ok',
    warnings: ['Mock bearish scenario. Values are synthetic for UI debugging.'],
  },
  validation_warnings: [],
  agents_used: AGENTS_USED,
};
MOCK_SELL_RESPONSE.full_decision = createFullDecision({
  decision: MOCK_SELL_RESPONSE.final_decision,
  summary: MOCK_SELL_RESPONSE.executive_summary,
  thesis: MOCK_SELL_RESPONSE.investment_thesis,
  priceTarget: MOCK_SELL_RESPONSE.price_target,
  timeHorizon: MOCK_SELL_RESPONSE.time_horizon,
});

export const MOCK_HOLD_RESPONSE = {
  request_id: 'mock-aapl-hold',
  ticker: 'AAPL',
  trade_date: '2026-05-18',
  llm_decision: 'Buy',
  final_decision: 'Hold',
  decision: 'Hold',
  rating: 'Hold',
  decision_adjusted: true,
  decision_adjusted_reason: 'Invalid risk reward structure',
  trade_plan_valid: false,
  has_existing_position: false,
  position_quantity: null,
  average_entry_price: null,
  current_price: 190,
  current_price_as_of: '2026-05-18',
  current_price_source: 'yfinance:last_close',
  price_target: null,
  time_horizon_months: 2,
  time_horizon: '2 Months',
  confidence_score: 0.72,
  suggested_allocation_percent: 0,
  entry_price: null,
  stop_loss: null,
  take_profit: null,
  risk_per_share: null,
  reward_per_share: null,
  risk_reward_ratio: null,
  risk_reward_display: null,
  max_drawdown_estimate: null,
  max_drawdown_min_pct: null,
  max_drawdown_max_pct: null,
  volatility_level: 'Medium',
  volatility_score: 44,
  rebalancing_action: 'Wait and monitor',
  position_action: null,
  new_entry_action: 'Wait and monitor',
  position_size_hint: 'No new position suggested.',
  position_sizing_reason: null,
  executive_summary:
    'AAPL remains a high-quality company, but the backend downgraded the LLM Buy decision because the trade structure did not meet the required risk/reward contract. Current price is still shown so the user has context. The UI should not render entry, stop loss, take profit, or R/R metrics for this Hold result.',
  investment_thesis:
    'The hold thesis reflects a strong company with limited near-term upside. Services revenue, buybacks, and ecosystem retention support downside stability, while AI-driven device upgrades could become a future catalyst. The decision is not a new trade plan. The backend keeps current price, volatility, and rebalancing visible while hiding invalid trade levels. This mock specifically tests that Hold output stays clean. It also tests that decision_adjusted warnings are visible to the user.',
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
    ...COMMON_QUALITY,
    trade_levels: 'invalid',
    llm_output: 'downgraded',
    warnings: ['Mock neutral scenario. Trade levels intentionally hidden for Hold UI testing.'],
  },
  validation_warnings: ['DECISION_DOWNGRADED_TO_HOLD', 'TRADE_PLAN_INVALID'],
  agents_used: AGENTS_USED,
};
MOCK_HOLD_RESPONSE.full_decision = createFullDecision({
  decision: MOCK_HOLD_RESPONSE.final_decision,
  summary: MOCK_HOLD_RESPONSE.executive_summary,
  thesis: MOCK_HOLD_RESPONSE.investment_thesis,
  priceTarget: MOCK_HOLD_RESPONSE.price_target,
  timeHorizon: MOCK_HOLD_RESPONSE.time_horizon,
});

export const MOCK_IDX_RESPONSE = {
  request_id: 'mock-bbca-buy',
  ticker: 'BBCA.JK',
  trade_date: '2026-05-18',
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
  current_price: 9800,
  current_price_as_of: '2026-05-18',
  current_price_source: 'yfinance:last_close',
  price_target: 11600,
  time_horizon_months: 3,
  time_horizon: '3 Months',
  confidence_score: 0.81,
  suggested_allocation_percent: 8,
  entry_price: 9800,
  stop_loss: 9300,
  take_profit: 11300,
  risk_per_share: 500,
  reward_per_share: 1500,
  risk_reward_ratio: 3.0,
  risk_reward_display: '1:3',
  max_drawdown_estimate: '8-12%',
  max_drawdown_min_pct: 8,
  max_drawdown_max_pct: 12,
  volatility_level: 'High',
  volatility_score: 72,
  rebalancing_action: 'Buy with tight risk control',
  position_action: null,
  new_entry_action: 'Buy with tight risk control',
  position_size_hint: 'Use smaller size due to High volatility.',
  position_sizing_reason:
    'Use staged sizing because the stock is high volatility. IDX prices are rounded using exchange tick-size logic in the backend contract.',
  executive_summary:
    'The IDX mock scenario uses a large-cap bank profile with steady profitability, strong liquidity, and defensive characteristics. It validates IDR formatting, .JK ticker behavior, current price display, and tick-size-rounded trade levels. The Buy decision is valid because risk/reward is exactly 1:3.',
  investment_thesis:
    'The buy thesis depends on resilient loan growth, stable asset quality, and strong deposit franchise economics. Upside comes from improving credit demand and consistent profitability. The main risk is macro pressure from rates, weaker consumption, or rising credit costs. This mock uses backend-style current price as the anchor. Take profit is the execution target based on risk/reward, while price target remains the analytical target. Rebalancing is constrained to the allowed mapping for Buy with High volatility.',
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
    ...COMMON_QUALITY,
    news: 'partial',
    trade_levels: 'recomputed',
    llm_output: 'repaired',
    warnings: ['Mock IDX scenario. Values are synthetic and intended only for UI debugging.'],
  },
  validation_warnings: ['TAKE_PROFIT_RECOMPUTED', 'INDONESIA_TICK_SIZE_ROUNDED'],
  agents_used: AGENTS_USED,
};
MOCK_IDX_RESPONSE.full_decision = createFullDecision({
  decision: MOCK_IDX_RESPONSE.final_decision,
  summary: MOCK_IDX_RESPONSE.executive_summary,
  thesis: MOCK_IDX_RESPONSE.investment_thesis,
  priceTarget: MOCK_IDX_RESPONSE.price_target,
  timeHorizon: MOCK_IDX_RESPONSE.time_horizon,
});

export const MOCK_ERROR_RESPONSE = {
  request_id: 'mock-error',
  ticker: 'ERROR',
  trade_date: '2026-05-18',
  error: 'Analysis failed: 429 RESOURCE_EXHAUSTED. Quota exceeded. Please retry later.',
};

function withFullDecision(response) {
  return {
    ...response,
    full_decision: createFullDecision({
      decision: response.final_decision ?? response.decision,
      summary: response.executive_summary,
      thesis: response.investment_thesis,
      priceTarget: response.price_target,
      timeHorizon: response.time_horizon,
    }),
  };
}

const MOCK_MAP = {
  NVDA: MOCK_RESPONSE,
  AAPL: MOCK_HOLD_RESPONSE,
  TSLA: MOCK_SELL_RESPONSE,
  'BBCA.JK': MOCK_IDX_RESPONSE,
  'BBRI.JK': withFullDecision({
    ...MOCK_IDX_RESPONSE,
    request_id: 'mock-bbri-buy',
    ticker: 'BBRI.JK',
    current_price: 5500,
    price_target: 6600,
    entry_price: 5500,
    stop_loss: 5200,
    take_profit: 6400,
    risk_per_share: 300,
    reward_per_share: 900,
    max_drawdown_estimate: '8-12%',
    max_drawdown_min_pct: 8,
    max_drawdown_max_pct: 12,
  }),
  'TLKM.JK': withFullDecision({
    ...MOCK_HOLD_RESPONSE,
    request_id: 'mock-tlkm-hold',
    ticker: 'TLKM.JK',
    llm_decision: 'Hold',
    final_decision: 'Hold',
    decision: 'Hold',
    rating: 'Hold',
    decision_adjusted: false,
    decision_adjusted_reason: null,
    current_price: 3200,
    volatility_level: 'Medium',
    volatility_score: 38,
    rebalancing_action: 'Wait and monitor',
    validation_warnings: [],
  }),
  'BMRI.JK': withFullDecision({
    ...MOCK_IDX_RESPONSE,
    request_id: 'mock-bmri-buy',
    ticker: 'BMRI.JK',
    current_price: 6900,
    price_target: 8400,
    entry_price: 6900,
    stop_loss: 6500,
    take_profit: 8100,
    risk_per_share: 400,
    reward_per_share: 1200,
  }),
  'ASII.JK': withFullDecision({
    ...MOCK_HOLD_RESPONSE,
    request_id: 'mock-asii-hold',
    ticker: 'ASII.JK',
    llm_decision: 'Hold',
    final_decision: 'Hold',
    decision: 'Hold',
    rating: 'Hold',
    decision_adjusted: false,
    decision_adjusted_reason: null,
    current_price: 5700,
    volatility_level: 'High',
    volatility_score: 61,
    rebalancing_action: 'No new entry',
    validation_warnings: [],
  }),
  'GOTO.JK': withFullDecision({
    ...MOCK_SELL_RESPONSE,
    request_id: 'mock-goto-sell',
    ticker: 'GOTO.JK',
    has_existing_position: false,
    position_quantity: null,
    average_entry_price: null,
    current_price: 70,
    price_target: 49,
    entry_price: 70,
    stop_loss: 77,
    take_profit: 49,
    risk_per_share: 7,
    reward_per_share: 21,
    rebalancing_action: 'Avoid new entry',
    position_action: null,
    new_entry_action: 'Avoid new entry',
    volatility_level: 'Very High',
    volatility_score: 91,
    validation_warnings: ['INDONESIA_TICK_SIZE_ROUNDED'],
  }),
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

export function getMockAnalysisResponse(options = {}) {
  const {
    ticker = 'NVDA',
    trade_date,
    time_horizon_months = 1,
    max_debate_rounds = 3,
    has_existing_position,
    position_quantity = null,
    average_entry_price = null,
  } = options;
  const normalizedTicker = normalizeMockTicker(ticker);
  const base =
    MOCK_MAP[normalizedTicker] ||
    (normalizedTicker.endsWith('.JK') ? MOCK_IDX_RESPONSE : MOCK_RESPONSE);
  const response = clone(base);
  const normalizedHorizon = normalizeTimeHorizonMonths(time_horizon_months);
  const hasExistingProvided = Object.prototype.hasOwnProperty.call(options, 'has_existing_position');

  response.ticker = normalizedTicker;
  response.trade_date = trade_date || response.trade_date;
  response.time_horizon_months = normalizedHorizon;
  response.time_horizon = formatTimeHorizon(normalizedHorizon);
  response.max_debate_rounds = max_debate_rounds;
  response.has_existing_position = hasExistingProvided
    ? Boolean(has_existing_position)
    : Boolean(response.has_existing_position);
  response.position_quantity = position_quantity === '' ? null : position_quantity;
  response.average_entry_price = average_entry_price === '' ? null : average_entry_price;

  const positionOnlyActions = new Set([
    'Exit position',
    'Trim position',
    'Reduce exposure',
    'Hedge or reduce risk',
  ]);
  if (!response.has_existing_position && positionOnlyActions.has(response.rebalancing_action)) {
    response.rebalancing_action = 'Avoid new entry';
    response.position_action = null;
    response.new_entry_action = 'Avoid new entry';
    response.validation_warnings = Array.from(
      new Set([...(response.validation_warnings || []), 'INVALID_REBALANCING_FIXED'])
    );
  }

  response.mock = true;
  response.source = 'frontend/src/mockData.js';
  response.analysis_created_at = new Date().toISOString();

  if (typeof response.full_decision === 'string') {
    response.full_decision = response.full_decision.replace(
      /\*\*Time Horizon\*\*: .*/,
      `**Time Horizon**: ${response.time_horizon}`
    );
  }

  if (!response.request_id) {
    response.request_id = `mock-${normalizedTicker.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }

  return response;
}
