export const QUANT_RANGE = '2Y'; // longer window than the 1Y analysis chart for stabler stats
export const ROLLING_WINDOW = 21;
export const ROLLING_RATIO_WINDOW = 63; // ~3 months for rolling Sharpe / beta
export const MC_PATHS = 5000; // perf cap (Section 4.5)
export const MC_DAYS = 126; // ~6 months
export const MC_HORIZONS = [21, 63, 126, 252]; // 1M / 3M / 6M / 1Y
export const TRADING_DAYS = 252;
export const VOL_TARGET = 15; // annual % target for vol-target sizing
// Benchmark is picked per market from the ticker suffix (benchmarkForSymbol).

// Sidebar groups, in display order.
export const SECTION_GROUPS = [
  { id: 'summary', label: 'Summary' },
  { id: 'risk', label: 'Risk Analytics' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'pricing', label: 'Pricing' },
];

// Every Quant section. `description` is the section header line (the sidebar already
// shows the name, so the header explains the section instead of repeating it).
export const SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    group: 'summary',
    description: 'Key numbers for the loaded window and a plain-language reading of them.',
  },
  {
    id: 'volatility',
    label: 'Volatility',
    group: 'risk',
    description: 'How much the price moves: realized, range-based and forecast volatility.',
  },
  {
    id: 'risk',
    label: 'Risk',
    group: 'risk',
    description: 'Losses to expect: value at risk, drawdowns and behaviour versus the benchmark.',
  },
  {
    id: 'distribution',
    label: 'Distribution',
    group: 'risk',
    description: 'Shape of returns: fat tails, skew, normality tests and seasonality.',
  },
  {
    id: 'scenario',
    label: 'Scenario',
    group: 'risk',
    description: 'Stress tests, worst historical windows and the volatility regime timeline.',
  },
  {
    id: 'stochastic',
    label: 'Stochastic',
    group: 'forecast',
    description: 'Monte Carlo price paths and the odds of touching a target or a stop.',
  },
  {
    id: 'backtest',
    label: 'Backtest',
    group: 'strategy',
    description: 'Simple long/flat rules against buy and hold, with robustness checks.',
  },
  {
    id: 'sizing',
    label: 'Sizing',
    group: 'strategy',
    description: 'Position size from Kelly, volatility targeting and a stop-based calculator.',
  },
  {
    id: 'correlation',
    label: 'Correlation',
    group: 'portfolio',
    description: 'Co-movement with peers and long-only portfolio constructions.',
  },
  {
    id: 'options',
    label: 'Options',
    group: 'pricing',
    description: 'Black-Scholes-Merton value, Greeks, payoff and implied volatility.',
  },
  {
    id: 'valuation',
    label: 'Valuation',
    group: 'pricing',
    description: 'Discounted cash flow, reverse DCF and market multiples versus peers.',
  },
];

export const DEFAULT_SECTION = 'overview';

export function sectionById(id) {
  return SECTIONS.find((s) => s.id === id) || null;
}

export const STRATEGIES = [
  { id: 'sma', label: 'SMA Crossover' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'meanrev', label: 'Mean Reversion' },
];

export const QUICK_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'BBRI.JK', 'TLKM.JK', 'ASII.JK'];

// Block order per section, matching the real section top-to-bottom so nothing jumps
// when data arrives. Heights match MetricCard (~5.5rem), ChartFrame (240px + frame) and
// a short DataTable.
export const SKELETON_LAYOUTS = {
  overview: ['text', 'cards8', 'chips'],
  volatility: ['text', 'cards4', 'chart', 'table'],
  risk: ['text', 'cards5', 'fields', 'table', 'chart'],
  distribution: ['cards4', 'chart', 'chart'],
  scenario: ['text', 'fields', 'table', 'chart'],
  stochastic: ['fields', 'text', 'chart', 'table'],
  backtest: ['text', 'fields', 'chart', 'table'],
  sizing: ['text', 'table', 'fields'],
  correlation: ['text', 'fields', 'table', 'chart'],
  options: ['text', 'fields', 'table', 'chart'],
  valuation: ['text', 'fields', 'cards6', 'table'],
};
