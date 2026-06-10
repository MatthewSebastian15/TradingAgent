export const DEFAULT_DEBATE_ROUNDS = 3;
export const MIN_DEBATE_ROUNDS = 1;
export const MAX_DEBATE_ROUNDS = 5;

// Legacy exports kept for rerun/history panels that still import them.
// The primary StockForm no longer uses market tabs or quick-pick tickers.
export const MARKETS = {
  US: {
    label: 'US',
    flag: '\uD83C\uDDFA\uD83C\uDDF8',
    defaultTicker: 'NVDA',
    tickers: ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'META'],
  },
  ID: {
    label: 'INDONESIA',
    flag: '\uD83C\uDDEE\uD83C\uDDE9',
    defaultTicker: 'BBCA',
    tickers: ['BBCA', 'BBRI', 'TLKM', 'PTRO', 'TPIA', 'BMRI', 'ASII', 'GOTO', 'UNVR'],
  },
};

export const DEPTH_OPTIONS = [
  { value: 'fast', label: 'FAST', runtime: 'LOWER GEMINI COST' },
  { value: 'balanced', label: 'BALANCED', runtime: 'DEFAULT 9-CALL PIPELINE' },
  { value: 'deep', label: 'DEEP', runtime: 'MORE RETRIES / MORE PATIENCE' },
];

export const HORIZON_OPTIONS = [
  { value: 1, label: '1 MONTH' },
  { value: 2, label: '2 MONTHS' },
  { value: 3, label: '3 MONTHS' },
];

export const PIPELINE = [
  { id: 'data_collection', label: 'DATA COLLECTION', short: 'DATA', color: '#525252' },
  { id: 'market_analyst', label: 'MARKET ANALYST', short: 'MKT', color: '#06b6d4' },
  { id: 'news_analyst', label: 'NEWS + SOCIAL', short: 'NEWS', color: '#3b82f6' },
  { id: 'fundamentals', label: 'FUNDAMENTALS ANALYST', short: 'FUND', color: '#8b5cf6' },
  { id: 'bull_researcher', label: 'BULL RESEARCHER', short: 'BULL', color: '#22c55e' },
  { id: 'bear_researcher', label: 'BEAR RESEARCHER', short: 'BEAR', color: '#ef4444' },
  { id: 'research_manager', label: 'RESEARCH MANAGER', short: 'RSRCH', color: '#eab308' },
  { id: 'trader', label: 'TRADER', short: 'TRD', color: '#06b6d4' },
  { id: 'risk_analysts', label: 'RISK ANALYSTS', short: 'RISK', color: '#f97316' },
  { id: 'portfolio_manager', label: 'PORTFOLIO MANAGER', short: 'PORT', color: '#a855f7' },
];

export const PIPELINE_IDS = new Set(PIPELINE.map((step) => step.id));

export const PIPELINE_AGENT_IDS = Object.freeze({
  DATA_COLLECTION: 'data_collection',
  MARKET_ANALYST: 'market_analyst',
  NEWS_ANALYST: 'news_analyst',
  FUNDAMENTALS: 'fundamentals',
  BULL_RESEARCHER: 'bull_researcher',
  BEAR_RESEARCHER: 'bear_researcher',
  RESEARCH_MANAGER: 'research_manager',
  TRADER: 'trader',
  RISK_ANALYSTS: 'risk_analysts',
  PORTFOLIO_MANAGER: 'portfolio_manager',
  CACHE: 'cache',
  PIPELINE: 'pipeline',
});

export const PIPELINE_STATUSES = Object.freeze({
  STARTED: 'started',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ERROR: 'error',
  SKIPPED: 'skipped',
});

export const SSE_EVENTS = Object.freeze({
  PROGRESS: 'progress',
  RESULT: 'result',
  ERROR: 'error',
  HEARTBEAT: 'heartbeat',
});

export const KNOWN_PIPELINE_AGENT_IDS = new Set(Object.values(PIPELINE_AGENT_IDS));
export const KNOWN_PIPELINE_STATUSES = new Set(Object.values(PIPELINE_STATUSES));
export const KNOWN_SSE_EVENTS = new Set(Object.values(SSE_EVENTS));

export const AGENT_ALIASES = {
  data: 'data_collection',
  data_quality: 'data_quality',
  data_fetch: 'data_collection',
  data_collector: 'data_collection',
  market: 'market_analyst',
  market_analysis: 'market_analyst',
  news: 'news_analyst',
  news_researcher: 'news_analyst',
  social_analyst: 'news_analyst',
  fundamentals_analyst: 'fundamentals',
  fundamental_analyst: 'fundamentals',
  bull: 'bull_researcher',
  bear: 'bear_researcher',
  research: 'research_manager',
  risk: 'risk_analysts',
  risk_manager: 'risk_analysts',
  risk_management: 'risk_analysts',
  portfolio: 'portfolio_manager',
};

const ANALYSIS_DEPTHS = new Set(DEPTH_OPTIONS.map((item) => item.value));
const HORIZON_VALUES = new Set(HORIZON_OPTIONS.map((item) => item.value));
const RESPONSE_DETAILS = new Set(['summary', 'full', 'debug']);
const YFINANCE_TICKER_RE = /^[A-Z0-9^][A-Z0-9^._=-]{0,24}$/;

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function normalizeTickerInput(value, marketId) {
  const upperValue = String(value || '').toUpperCase();
  if (marketId === 'ID') {
    return upperValue
      .replace(/\.JK$/, '')
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 10);
  }
  return upperValue.replace(/[^A-Z0-9^._=-]/g, '').slice(0, 25);
}

function normalizeSelectedTicker(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function inferMarketFromTicker(ticker, activeMarket = null) {
  const legacyMarket = String(activeMarket || '').toUpperCase();
  if (legacyMarket === 'ID' || legacyMarket === 'US') return legacyMarket;
  if (ticker.endsWith('.JK')) return 'ID';
  if (/\.[A-Z0-9]{1,5}$/.test(ticker) || ticker.includes('=')) return 'GLOBAL';
  return 'US';
}

export function validateAnalysisInput({
  ticker,
  date,
  timeHorizonMonths,
  rounds,
  analysisDepth,
  responseDetail,
}) {
  const normalizedTicker = normalizeSelectedTicker(ticker);
  if (!normalizedTicker) return 'Select a ticker from the search results.';
  if (!YFINANCE_TICKER_RE.test(normalizedTicker)) {
    return 'Invalid ticker. Select a valid yfinance search result.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Date must be YYYY-MM-DD';
  if (!HORIZON_VALUES.has(Number(timeHorizonMonths))) return 'Invalid analysis horizon.';
  const debateRounds = Number(rounds);
  if (
    !Number.isInteger(debateRounds) ||
    debateRounds < MIN_DEBATE_ROUNDS ||
    debateRounds > MAX_DEBATE_ROUNDS
  ) {
    return `Max debate rounds must be an integer between ${MIN_DEBATE_ROUNDS} and ${MAX_DEBATE_ROUNDS}.`;
  }
  if (!ANALYSIS_DEPTHS.has(analysisDepth)) return 'Invalid analysis depth.';
  if (!RESPONSE_DETAILS.has(responseDetail)) return 'Invalid response detail.';
  return '';
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function buildAnalysisPayload({
  activeMarket = null,
  ticker,
  date,
  timeHorizonMonths,
  rounds,
  analysisDepth,
  responseDetail,
  hasExistingPosition = false,
  positionQuantity = null,
  averageEntryPrice = null,
}) {
  const normalizedTicker = normalizeSelectedTicker(ticker);
  const hasPosition = Boolean(hasExistingPosition);

  return {
    ticker: normalizedTicker,
    market: inferMarketFromTicker(normalizedTicker, activeMarket),
    trade_date: date,
    time_horizon_months: Number(timeHorizonMonths),
    max_debate_rounds: Number(rounds),
    analysis_depth: analysisDepth,
    response_detail: responseDetail,
    has_existing_position: hasPosition,
    position_quantity: hasPosition ? optionalNumber(positionQuantity) : null,
    average_entry_price: hasPosition ? optionalNumber(averageEntryPrice) : null,
  };
}
