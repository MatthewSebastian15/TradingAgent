// frontend/src/mockData.js
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

const COMMON_MOCK_QUALITY = {
  price_data: 'mock',
  trade_levels: 'mock_validated',
  llm_output: 'mock',
  volatility_data: 'mock',
  fundamentals: 'mock',
  news: 'mock',
  warnings: ['Mock data only. No backend, provider, or LLM call was executed.'],
};

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

function createFullDecision({ decision, summary, thesis, timeHorizon }) {
  return `**Rating**: ${decision || 'Hold'}\n\n**Executive Summary**: ${summary || 'N/A'}\n\n**Investment Thesis**: ${thesis || 'N/A'}\n\n**Time Horizon**: ${timeHorizon || 'N/A'}`;
}

function cloneMock(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeDataQuality(overrides = {}) {
  return {
    ...COMMON_MOCK_QUALITY,
    ...overrides,
    warnings: overrides.warnings || COMMON_MOCK_QUALITY.warnings,
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
    position_action: 'Open new position',
    new_entry_action: 'Allowed with staged entry',
    position_size_hint: 'Use smaller size due to High volatility.',
    position_sizing_reason: 'Use staged allocation because volatility is high.',

    confidence_score: 0.84,
    suggested_allocation_percent: 4,
    time_horizon_months: 2,
    time_horizon: '2 Months',

    executive_summary: 'Mock executive summary for precise UI and report debugging.',
    market_report: 'Mock market analyst report.',
    news_report: 'Mock news analyst report.',
    fundamentals_report: 'Mock fundamentals analyst report.',
    risk_report: 'Mock risk manager report.',
    portfolio_report: 'Mock portfolio manager report.',
    investment_thesis: 'Mock investment thesis.',
    debate_summary: 'Mock debate summary.',
    full_decision: null,

    key_catalysts: ['Mock catalyst 1', 'Mock catalyst 2'],
    invalidation_conditions: ['Mock invalidation 1', 'Mock invalidation 2'],

    data_quality: COMMON_MOCK_QUALITY,
    validation_warnings: [],
    agents_used: AGENTS_USED,
    llm_calls_used: 0,
    llm_call_budget: 0,
    analysis_depth: 'mock',
    response_detail: 'full',
    budget_exhausted: false,
    agents_skipped: [],
    raw_agent_state: null,
    source: 'frontend/src/mockData.js',
    mock: true,

    // Legacy compatibility only. These fields must not be rendered by the UI or reports.
    price_target: null,
    risk_per_share: null,
    reward_per_share: null,
  };

  const completed = {
    ...result,
    ...overrides,
    data_quality: normalizeDataQuality(overrides.data_quality || result.data_quality),
  };

  return {
    ...completed,
    full_decision:
      completed.full_decision ||
      createFullDecision({
        decision: completed.final_decision ?? completed.decision,
        summary: completed.executive_summary,
        thesis: completed.investment_thesis,
        timeHorizon: completed.time_horizon,
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
  position_action: 'Open new position',
  new_entry_action: 'Allowed with staged entry',
  position_size_hint: 'Use smaller size due to High volatility.',
  position_sizing_reason:
    'Use a smaller staged allocation because volatility is high. Keep the stop loss disciplined and do not add unless the setup keeps a valid 1:3 risk/reward profile.',
  executive_summary:
    'NVDA remains in a strong position because AI infrastructure spending is still concentrated around its GPU and software ecosystem. Demand for accelerated computing stays above available supply, and the mock trade plan is actionable because current price and risk/reward levels are complete.',
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
  investment_thesis:
    'The core thesis is that NVDA remains a leading supplier for high-end AI training and inference workloads. Its CUDA ecosystem, data center GPU roadmap, and customer lock-in create durable advantages. The upside case depends on sustained cloud capex, Blackwell adoption, and broader enterprise AI demand. The downside case is valuation sensitivity if growth expectations cool. The setup remains valid only while entry, stop loss, and take profit preserve the fixed 1:3 risk/reward ratio.',
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
    warnings: ['Mock data only. No backend, yfinance, Finnhub, provider, or LLM call was executed.'],
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
  new_entry_action: 'Wait for better entry',
  position_size_hint: 'Avoid aggressive sizing. Consider no new entry or very small size only.',
  position_sizing_reason:
    'Existing exposure can be exited because the user already has a position and volatility is very high. New exposure is not suggested.',
  executive_summary:
    'TSLA faces pressure from price competition, margin compression, and uncertainty around the timing of robotaxi and software monetization. The current setup is a valid Sell because mock validation confirms current price, stop loss, take profit, and risk/reward direction.',
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
  investment_thesis:
    'The sell thesis centers on weaker automotive margins and rising EV competition. TSLA still has long-term optionality from energy storage, FSD, and robotics, but those businesses need time before they can offset pressure in the core auto segment. In the short term, the stock needs evidence of margin recovery, stronger delivery growth, or credible software revenue acceleration. Risk/reward is constrained at 1:3, keeping the setup testable.',
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
  rebalancing_action: 'Avoid new entry',
  position_action: null,
  new_entry_action: 'Avoid new entry',
  position_size_hint: 'No new position suggested.',
  position_sizing_reason: null,
  executive_summary:
    'AAPL remains a high-quality company, but the current setup does not offer enough confirmed upside for a new actionable trade. Current price, volatility, and rebalancing context remain visible while entry, stop loss, take profit, and R/R metrics stay hidden for the Hold result.',
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
  investment_thesis:
    'The hold thesis reflects a strong company with limited near-term upside. Services revenue, buybacks, and ecosystem retention support downside stability, while AI-driven device upgrades could become a future catalyst. The decision is intentionally not a new trade plan, so the UI keeps current price, volatility, and rebalancing visible while hiding trade levels.',
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
  rebalancing_action: 'Avoid new entry',
  position_action: null,
  new_entry_action: 'Avoid new entry',
  position_size_hint: 'No new position suggested.',
  position_sizing_reason: null,
  executive_summary:
    'The backend-equivalent mock could not verify a current price, so the LLM Buy recommendation was downgraded to Hold. The UI should show the missing price warning, data quality badges, and no synthetic trade levels.',
  market_report:
    'Mock market report: current price is intentionally unavailable, so price-dependent trade levels are blocked.',
  news_report:
    'Mock news report: the scenario focuses on data availability rather than sentiment.',
  fundamentals_report:
    'Mock fundamentals report: fundamentals are present, but they cannot override missing current price validation.',
  risk_report:
    'Mock risk report: no action should be taken when current price cannot be verified.',
  portfolio_report:
    'Mock portfolio report: avoid new entry and wait for valid market data.',
  investment_thesis:
    'This mock exists to validate the missing-current-price path. Because current price is unavailable, no entry, stop loss, take profit, or risk/reward value should be rendered. The frontend should treat this as a safe non-actionable Hold instead of inventing a price.',
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
  position_action: 'Open new position',
  new_entry_action: 'Allowed with staged entry',
  position_size_hint: 'Use standard risk management and avoid oversized position.',
  position_sizing_reason:
    'Mock validation repaired the original levels by forcing risk/reward to 1:3 and recomputing take profit from the current price anchor.',
  executive_summary:
    'META is a repaired Buy mock. The final decision remains Buy, but the contract marks the trade levels as recomputed because the original LLM-like risk/reward was not acceptable.',
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
  investment_thesis:
    'This scenario tests that repaired-but-valid trade plans still render as actionable. The UI should show the full action plan, data quality status, and validation warning codes in readable form. Take profit is the execution target created from entry, stop, and the 1:3 risk/reward requirement.',
  debate_summary:
    'The mock debate accepts the Buy only after validation repairs the trade levels.',
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
  position_action: 'Open new position',
  new_entry_action: 'Allowed with staged entry',
  position_size_hint: 'Use smaller size due to High volatility.',
  position_sizing_reason:
    'Use staged sizing because the stock is high volatility. IDX prices are rounded using exchange tick-size logic in the backend contract.',
  executive_summary:
    'The IDX mock scenario uses a large-cap bank profile with steady profitability, strong liquidity, and defensive characteristics. It validates IDR formatting, .JK ticker behavior, current price display, and tick-size-rounded trade levels. The Buy decision is valid because risk/reward is exactly 1:3.',
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
  investment_thesis:
    'The buy thesis depends on resilient loan growth, stable asset quality, and strong deposit franchise economics. Upside comes from improving credit demand and consistent profitability. The main risk is macro pressure from rates, weaker consumption, or rising credit costs. This mock uses current price as the anchor and take profit as the execution target based on risk/reward.',
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

export const MOCK_ERROR_RESPONSE = {
  request_id: 'mock-error',
  ticker: 'ERROR',
  market: 'US',
  trade_date: '2026-05-18',
  error: 'Analysis failed: 429 RESOURCE_EXHAUSTED. Quota exceeded. Please retry later.',
};

function withOverrides(base, overrides) {
  return completeMockAnalysis({ ...base, full_decision: null, ...overrides });
}

const MOCK_MAP = {
  NVDA: MOCK_BUY_RESPONSE,
  AAPL: MOCK_HOLD_RESPONSE,
  TSLA: MOCK_SELL_RESPONSE,
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
    entry_price: 5500,
    stop_loss: 5200,
    take_profit: 6400,
  }),
  'TLKM.JK': withOverrides(MOCK_HOLD_RESPONSE, {
    request_id: 'mock-tlkm-hold',
    ticker: 'TLKM.JK',
    market: 'ID',
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
    entry_price: 70,
    stop_loss: 77,
    take_profit: 49,
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
    entry_price: 2420,
    stop_loss: 2240,
    take_profit: 2960,
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
  const positionOnlyActions = new Set(['Exit position', 'Trim position']);

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
  const base =
    MOCK_MAP[normalizedTicker] ||
    (normalizedTicker.endsWith('.JK') ? MOCK_IDX_RESPONSE : MOCK_BUY_RESPONSE);
  const response = cloneMock(base);
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
  response.llm_call_budget = 0;
  response.llm_calls_used = 0;
  response.agents_used = response.agents_used || PIPELINE_AGENTS;
  response.has_existing_position = hasExistingProvided
    ? Boolean(has_existing_position)
    : Boolean(response.has_existing_position);
  response.position_quantity = normalizePositionNumber(position_quantity);
  response.average_entry_price = normalizePositionNumber(average_entry_price);
  response.analysis_created_at = new Date().toISOString();
  response.saved_at = response.analysis_created_at;
  response.data_fetched_at = response.current_price_as_of || response.analysis_created_at;
  response.current_price_source = response.current_price_source || 'mock:yfinance:last_close';
  response.mock = true;
  response.source = 'frontend/src/mockData.js';

  ensureAllowedRebalancing(response);
  applyResponseDetail(response);

  response.full_decision = createFullDecision({
    decision: response.final_decision ?? response.decision,
    summary: response.executive_summary,
    thesis: response.investment_thesis,
    timeHorizon: response.time_horizon,
  });

  return response;
}

export const MOCK_RESPONSES_BY_REQUEST_ID = {
  'mock-nvda-buy': MOCK_BUY_RESPONSE,
  'mock-tsla-sell': MOCK_SELL_RESPONSE,
  'mock-aapl-hold': MOCK_HOLD_RESPONSE,
  'mock-missing-price': MOCK_MISSING_PRICE_RESPONSE,
  'mock-meta-repaired-buy': MOCK_REPAIRED_RESPONSE,
  'mock-bbca-id-buy': MOCK_IDX_RESPONSE,
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
