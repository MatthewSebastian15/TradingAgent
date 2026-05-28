// frontend/src/mockData.js
// Central mock source for /analysis.test.
// Mock mode deliberately reuses the same form, workspace, result card, history,
// and agent-log components as /analysis. Only the job runner and response source
// are replaced, so UI regressions show up before humans spend LLM quota. A rare
// victory against needless API bills.

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

const COMMON_QUALITY = {
  price_data: 'ok',
  fundamentals: 'ok',
  news: 'ok',
  volatility_data: 'ok',
};

const DEFAULT_ANALYSIS_CREATED_AT = '2026-05-18T15:36:00+07:00';

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
    agent_name: 'NEWS + SOCIAL',
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

function normalizeTimeHorizonMonths(value) {
  const months = Number(value);
  return [1, 2, 3].includes(months) ? months : 1;
}

function formatTimeHorizon(months) {
  const normalized = normalizeTimeHorizonMonths(months);
  return `${normalized} Month${normalized > 1 ? 's' : ''}`;
}

function createFullDecision({ decision, summary, thesis, priceTarget, timeHorizon }) {
  return `**Rating**: ${decision}\n\n**Executive Summary**: ${summary || 'N/A'}\n\n**Investment Thesis**: ${thesis || 'N/A'}\n\n**Price Target**: ${priceTarget ?? 'N/A'}\n\n**Time Horizon**: ${timeHorizon || 'N/A'}`;
}

function completeResponse(response) {
  const completed = {
    max_debate_rounds: 3,
    analysis_depth: 'balanced',
    response_detail: 'full',
    data_fetched_at: DEFAULT_ANALYSIS_CREATED_AT,
    analysis_created_at: DEFAULT_ANALYSIS_CREATED_AT,
    llm_call_budget: 9,
    llm_calls_used: 9,
    budget_exhausted: false,
    agents_skipped: [],
    raw_agent_state: null,
    source: 'frontend/src/mockData.js',
    mock: true,
    ...response,
  };

  return {
    ...completed,
    full_decision:
      completed.full_decision ||
      createFullDecision({
        decision: completed.final_decision ?? completed.decision,
        summary: completed.executive_summary,
        thesis: completed.investment_thesis,
        priceTarget: completed.price_target,
        timeHorizon: completed.time_horizon,
      }),
  };
}

export const MOCK_RESPONSE = completeResponse({
  request_id: 'mock-nvda-buy',
  ticker: 'NVDA',
  market: 'US',
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
  rebalancing_action: 'Open new position',
  position_action: null,
  new_entry_action: 'Open new position',
  position_size_hint: 'Use smaller size due to High volatility.',
  position_sizing_reason:
    'Use a smaller staged allocation because volatility is high. Keep the stop loss disciplined and do not add unless the setup keeps a valid 1:3 risk/reward profile.',
  executive_summary:
    'NVDA remains in a strong position because AI infrastructure spending is still concentrated around its GPU and software ecosystem. Demand for accelerated computing stays above available supply, and the backend-valid trade plan is actionable because current price and risk/reward levels are complete.',
  investment_thesis:
    'The core thesis is that NVDA remains a leading supplier for high-end AI training and inference workloads. Its CUDA ecosystem, data center GPU roadmap, and customer lock-in create durable advantages. The upside case depends on sustained cloud capex, Blackwell adoption, and broader enterprise AI demand. The downside case is valuation sensitivity if growth expectations cool. The setup remains valid only while entry, stop loss, and take profit preserve the fixed 1:3 risk/reward ratio.',
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
});

export const MOCK_SELL_RESPONSE = completeResponse({
  request_id: 'mock-tsla-sell',
  ticker: 'TSLA',
  market: 'US',
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
    'TSLA faces pressure from price competition, margin compression, and uncertainty around the timing of robotaxi and software monetization. The current setup is a valid Sell because backend validation confirms current price, stop loss, take profit, and risk/reward direction.',
  investment_thesis:
    'The sell thesis centers on weaker automotive margins and rising EV competition. TSLA still has long-term optionality from energy storage, FSD, and robotics, but those businesses need time before they can offset pressure in the core auto segment. In the short term, the stock needs evidence of margin recovery, stronger delivery growth, or credible software revenue acceleration. Risk/reward is constrained at 1:3, keeping the setup testable.',
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
});

export const MOCK_HOLD_RESPONSE = completeResponse({
  request_id: 'mock-aapl-hold',
  ticker: 'AAPL',
  market: 'US',
  trade_date: '2026-05-18',
  llm_decision: 'Hold',
  final_decision: 'Hold',
  decision: 'Hold',
  rating: 'Hold',
  decision_adjusted: false,
  decision_adjusted_reason: null,
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
  rebalancing_action: 'Avoid new entry',
  position_action: null,
  new_entry_action: 'Avoid new entry',
  position_size_hint: 'No new position suggested.',
  position_sizing_reason: null,
  executive_summary:
    'AAPL remains a high-quality company, but the current setup does not offer enough confirmed upside for a new actionable trade. Current price, volatility, and rebalancing context remain visible while entry, stop loss, take profit, and R/R metrics stay hidden for the Hold result.',
  investment_thesis:
    'The hold thesis reflects a strong company with limited near-term upside. Services revenue, buybacks, and ecosystem retention support downside stability, while AI-driven device upgrades could become a future catalyst. The decision is intentionally not a new trade plan, so the UI keeps current price, volatility, and rebalancing visible while hiding trade levels.',
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
    trade_levels: 'hidden',
    llm_output: 'ok',
    warnings: ['Mock neutral scenario. Trade levels intentionally hidden for Hold UI testing.'],
  },
  validation_warnings: ['HOLD_TRADE_LEVELS_HIDDEN'],
  agents_used: AGENTS_USED,
});

export const MOCK_MISSING_PRICE_RESPONSE = completeResponse({
  request_id: 'mock-missing-price',
  ticker: 'MSFT',
  market: 'US',
  trade_date: '2026-05-18',
  llm_decision: 'Buy',
  final_decision: 'Hold',
  decision: 'Hold',
  rating: 'Hold',
  decision_adjusted: true,
  decision_adjusted_reason: 'Missing current price',
  trade_plan_valid: false,
  has_existing_position: false,
  position_quantity: null,
  average_entry_price: null,
  current_price: null,
  current_price_as_of: null,
  current_price_source: null,
  price_target: null,
  time_horizon_months: 1,
  time_horizon: '1 Month',
  confidence_score: 0.52,
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
  volatility_score: 45,
  rebalancing_action: 'Avoid new entry',
  position_action: null,
  new_entry_action: 'Avoid new entry',
  position_size_hint: 'No new position suggested.',
  position_sizing_reason: null,
  executive_summary:
    'The backend could not verify a current price, so the LLM Buy recommendation was downgraded to Hold. The UI should show the missing price warning, data quality badges, and no synthetic trade levels.',
  investment_thesis:
    'This mock exists to validate the missing-current-price path. Because current price is unavailable, no entry, stop loss, take profit, or risk/reward value should be rendered. The frontend should treat this as a safe non-actionable Hold instead of inventing a price.',
  key_catalysts: ['Price data recovers from the market data provider.'],
  invalidation_conditions: ['Ticker remains unavailable or price data is stale.'],
  data_quality: {
    ...COMMON_QUALITY,
    price_data: 'missing',
    trade_levels: 'invalid',
    llm_output: 'downgraded',
    volatility_data: 'fallback',
    warnings: ['Current price intentionally missing for UI debugging.'],
  },
  validation_warnings: [
    'CURRENT_PRICE_MISSING',
    'DECISION_DOWNGRADED_TO_HOLD',
    'TRADE_PLAN_INVALID',
  ],
  agents_used: AGENTS_USED,
});

export const MOCK_REPAIRED_RESPONSE = completeResponse({
  request_id: 'mock-meta-repaired-buy',
  ticker: 'META',
  market: 'US',
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
  current_price: 510,
  current_price_as_of: '2026-05-18',
  current_price_source: 'yfinance:last_close',
  price_target: 585,
  time_horizon_months: 2,
  time_horizon: '2 Months',
  confidence_score: 0.8,
  suggested_allocation_percent: 5,
  entry_price: 510,
  stop_loss: 485,
  take_profit: 585,
  risk_per_share: 25,
  reward_per_share: 75,
  risk_reward_ratio: 3.0,
  risk_reward_display: '1:3',
  max_drawdown_estimate: '6-10%',
  max_drawdown_min_pct: 6,
  max_drawdown_max_pct: 10,
  volatility_level: 'Medium',
  volatility_score: 48,
  rebalancing_action: 'Open new position',
  position_action: null,
  new_entry_action: 'Open new position',
  position_size_hint: 'Use standard risk management and avoid oversized position.',
  position_sizing_reason:
    'Backend validation repaired the original LLM levels by forcing risk/reward to 1:3 and recomputing the take profit from the current price anchor.',
  executive_summary:
    'META is a repaired Buy mock. The final decision remains Buy, but the backend contract marks the trade levels as recomputed because the original LLM risk/reward was not acceptable.',
  investment_thesis:
    'This scenario tests that repaired-but-valid trade plans still render as actionable. The UI should show the full action plan, data quality status, and validation warning codes in readable form. Price target remains the analytical target, while take profit is the execution target created from entry, stop, and the 1:3 risk/reward requirement.',
  key_catalysts: [
    'Ad revenue remains resilient.',
    'AI infrastructure spending improves product engagement.',
  ],
  invalidation_conditions: ['Break below stop loss.', 'Ad pricing weakens materially.'],
  data_quality: {
    ...COMMON_QUALITY,
    trade_levels: 'recomputed',
    llm_output: 'repaired',
    warnings: ['Mock repaired scenario. Original LLM levels were intentionally invalid.'],
  },
  validation_warnings: ['RR_FORCED_TO_3', 'TAKE_PROFIT_RECOMPUTED', 'PRICE_TARGET_RECOMPUTED'],
  agents_used: AGENTS_USED,
});

export const MOCK_IDX_RESPONSE = completeResponse({
  request_id: 'mock-bbca-buy',
  ticker: 'BBCA.JK',
  market: 'ID',
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
  rebalancing_action: 'Open new position',
  position_action: null,
  new_entry_action: 'Open new position',
  position_size_hint: 'Use smaller size due to High volatility.',
  position_sizing_reason:
    'Use staged sizing because the stock is high volatility. IDX prices are rounded using exchange tick-size logic in the backend contract.',
  executive_summary:
    'The IDX mock scenario uses a large-cap bank profile with steady profitability, strong liquidity, and defensive characteristics. It validates IDR formatting, .JK ticker behavior, current price display, and tick-size-rounded trade levels. The Buy decision is valid because risk/reward is exactly 1:3.',
  investment_thesis:
    'The buy thesis depends on resilient loan growth, stable asset quality, and strong deposit franchise economics. Upside comes from improving credit demand and consistent profitability. The main risk is macro pressure from rates, weaker consumption, or rising credit costs. This mock uses backend-style current price as the anchor. Take profit is the execution target based on risk/reward, while price target remains the analytical target.',
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
});

export const MOCK_ERROR_RESPONSE = {
  request_id: 'mock-error',
  ticker: 'ERROR',
  market: 'US',
  trade_date: '2026-05-18',
  error: 'Analysis failed: 429 RESOURCE_EXHAUSTED. Quota exceeded. Please retry later.',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withOverrides(base, overrides) {
  return completeResponse({ ...base, ...overrides });
}

const MOCK_MAP = {
  NVDA: MOCK_RESPONSE,
  AAPL: MOCK_HOLD_RESPONSE,
  TSLA: MOCK_SELL_RESPONSE,
  META: MOCK_REPAIRED_RESPONSE,
  MSFT: withOverrides(MOCK_RESPONSE, {
    request_id: 'mock-msft-buy',
    ticker: 'MSFT',
    current_price: 430,
    price_target: 505,
    entry_price: 430,
    stop_loss: 405,
    take_profit: 505,
    risk_per_share: 25,
    reward_per_share: 75,
    volatility_level: 'Medium',
    volatility_score: 46,
    confidence_score: 0.82,
    suggested_allocation_percent: 6,
    executive_summary:
      'MSFT is a complete Buy mock that mirrors the normal backend display path: current price is available, trade levels are valid, and risk/reward is fixed at 1:3.',
    investment_thesis:
      'The thesis centers on cloud growth, enterprise AI adoption, security software, and durable Office cash flow. This scenario exists so /analysis.test shows the same complete UI layout as a real analysis without using backend data.',
  }),
  'BBCA.JK': MOCK_IDX_RESPONSE,
  'BBRI.JK': withOverrides(MOCK_IDX_RESPONSE, {
    request_id: 'mock-bbri-buy',
    ticker: 'BBRI.JK',
    current_price: 5500,
    price_target: 6600,
    entry_price: 5500,
    stop_loss: 5200,
    take_profit: 6400,
    risk_per_share: 300,
    reward_per_share: 900,
  }),
  'TLKM.JK': withOverrides(MOCK_HOLD_RESPONSE, {
    request_id: 'mock-tlkm-hold',
    ticker: 'TLKM.JK',
    market: 'ID',
    llm_decision: 'Hold',
    final_decision: 'Hold',
    decision: 'Hold',
    rating: 'Hold',
    decision_adjusted: false,
    decision_adjusted_reason: null,
    current_price: 3200,
    volatility_level: 'Medium',
    volatility_score: 38,
    rebalancing_action: 'Avoid new entry',
    validation_warnings: ['HOLD_TRADE_LEVELS_HIDDEN'],
  }),
  'BMRI.JK': withOverrides(MOCK_IDX_RESPONSE, {
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
  'ASII.JK': withOverrides(MOCK_HOLD_RESPONSE, {
    request_id: 'mock-asii-hold',
    ticker: 'ASII.JK',
    market: 'ID',
    llm_decision: 'Hold',
    final_decision: 'Hold',
    decision: 'Hold',
    rating: 'Hold',
    decision_adjusted: false,
    decision_adjusted_reason: null,
    current_price: 5700,
    volatility_level: 'High',
    volatility_score: 61,
    rebalancing_action: 'Avoid new entry',
    new_entry_action: 'Avoid new entry',
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
  'UNVR.JK': withOverrides(MOCK_IDX_RESPONSE, {
    request_id: 'mock-unvr-buy',
    ticker: 'UNVR.JK',
    current_price: 2420,
    price_target: 2960,
    entry_price: 2420,
    stop_loss: 2240,
    take_profit: 2960,
    risk_per_share: 180,
    reward_per_share: 540,
    volatility_level: 'High',
    volatility_score: 63,
  }),
  ERROR: MOCK_ERROR_RESPONSE,
  MISSING: MOCK_MISSING_PRICE_RESPONSE,
};

const MOCK_IDX_CODES = ['BBCA', 'BBRI', 'TLKM', 'BMRI', 'ASII', 'GOTO', 'UNVR'];

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
  const positionOnlyActions = new Set([
    'Exit position',
    'Trim position',
  ]);

  if (!response.has_existing_position && positionOnlyActions.has(response.rebalancing_action)) {
    response.rebalancing_action = 'Avoid new entry';
    response.position_action = null;
    response.new_entry_action = 'Avoid new entry';
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
  const base =
    MOCK_MAP[normalizedTicker] ||
    (normalizedTicker.endsWith('.JK') ? MOCK_IDX_RESPONSE : MOCK_RESPONSE);
  const response = clone(base);
  const normalizedHorizon = normalizeTimeHorizonMonths(time_horizon_months);
  const hasExistingProvided = Object.prototype.hasOwnProperty.call(
    options,
    'has_existing_position'
  );

  response.request_id = request_id || response.request_id;
  response.ticker = normalizedTicker;
  response.market = market || (normalizedTicker.endsWith('.JK') ? 'ID' : 'US');
  response.trade_date = trade_date || response.trade_date;
  response.time_horizon_months = normalizedHorizon;
  response.time_horizon = formatTimeHorizon(normalizedHorizon);
  response.max_debate_rounds = Number(max_debate_rounds);
  response.analysis_depth = analysis_depth;
  response.response_detail = response_detail;
  response.llm_call_budget = analysis_depth === 'fast' ? 5 : analysis_depth === 'deep' ? 12 : 9;
  response.llm_calls_used = Math.min(response.llm_call_budget, response.agents_used?.length || 0);
  response.has_existing_position = hasExistingProvided
    ? Boolean(has_existing_position)
    : Boolean(response.has_existing_position);
  response.position_quantity = normalizePositionNumber(position_quantity);
  response.average_entry_price = normalizePositionNumber(average_entry_price);
  response.analysis_created_at = new Date().toISOString();
  response.data_fetched_at = response.current_price_as_of || response.analysis_created_at;
  response.mock = true;
  response.source = 'frontend/src/mockData.js';

  ensureAllowedRebalancing(response);
  applyResponseDetail(response);

  response.full_decision = createFullDecision({
    decision: response.final_decision ?? response.decision,
    summary: response.executive_summary,
    thesis: response.investment_thesis,
    priceTarget: response.price_target,
    timeHorizon: response.time_horizon,
  });

  return response;
}

const MOCK_REQUEST_LOOKUP = Object.values(MOCK_MAP).reduce((acc, response) => {
  if (response?.request_id) acc[response.request_id] = response;
  return acc;
}, {});

export function getMockAnalysisResponseByRequestId(requestId) {
  if (!requestId) return null;
  const decodedId = decodeURIComponent(String(requestId));
  const exact = MOCK_REQUEST_LOOKUP[decodedId];
  if (exact) return getMockAnalysisResponse(exact);

  const tickerMatch = decodedId.match(
    /^mock-([a-z0-9-]+?)(?:-(?:buy|sell|hold|repaired|\d+).*)?$/i
  );
  const guessedTicker = tickerMatch?.[1]?.replace(/-/g, '.').toUpperCase();
  if (guessedTicker)
    return getMockAnalysisResponse({ ticker: guessedTicker, request_id: decodedId });

  return null;
}
