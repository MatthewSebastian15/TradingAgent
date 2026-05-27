export const DEFAULT_DEBATE_ROUNDS = 3;

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
    tickers: ['BBCA', 'BBRI', 'TLKM', 'BMRI', 'ASII', 'GOTO', 'UNVR'],
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
const IDX_TICKER_RE = /^[A-Z0-9]{1,10}$/;
const TICKER_RE = /^[A-Z0-9]{1,10}([.-][A-Z0-9]{1,5})?$/;

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function normalizeTickerInput(value, marketId) {
  const upperValue = value.toUpperCase();
  if (marketId === 'ID') {
    return upperValue
      .replace(/\.JK$/, '')
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 10);
  }
  return upperValue.replace(/[^A-Z0-9.-]/g, '').slice(0, 12);
}

export function validateAnalysisInput({
  activeMarket,
  ticker,
  date,
  timeHorizonMonths,
  analysisDepth,
  responseDetail,
}) {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (activeMarket === 'ID' && !IDX_TICKER_RE.test(normalizedTicker)) {
    return 'Invalid IDX ticker. Enter code only, for example BBCA or UNVR.';
  }
  if (!TICKER_RE.test(normalizedTicker)) {
    return 'Invalid ticker. Examples: BBCA, NVDA, AAPL, MSFT';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Date must be YYYY-MM-DD';
  if (!HORIZON_VALUES.has(Number(timeHorizonMonths))) return 'Invalid analysis horizon.';
  if (!ANALYSIS_DEPTHS.has(analysisDepth)) return 'Invalid analysis depth.';
  if (!RESPONSE_DETAILS.has(responseDetail)) return 'Invalid response detail.';
  return '';
}

export function buildAnalysisPayload({
  activeMarket,
  ticker,
  date,
  timeHorizonMonths,
  rounds,
  analysisDepth,
  responseDetail,
}) {
  return {
    ticker: ticker.trim().toUpperCase(),
    market: activeMarket,
    trade_date: date,
    time_horizon_months: Number(timeHorizonMonths),
    max_debate_rounds: Number(rounds),
    analysis_depth: analysisDepth,
    response_detail: responseDetail,
  };
}
