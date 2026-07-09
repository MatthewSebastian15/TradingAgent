export const QUANT_RANGE = '2Y'; // longer window than the 1Y analysis chart for stabler stats
export const ROLLING_WINDOW = 21;
export const ROLLING_RATIO_WINDOW = 63; // ~3 months for rolling Sharpe / beta
export const MC_PATHS = 5000; // perf cap (Section 4.5)
export const MC_DAYS = 126; // ~6 months
export const MC_HORIZONS = [21, 63, 126, 252]; // 1M / 3M / 6M / 1Y
export const TRADING_DAYS = 252;
export const VOL_TARGET = 15; // annual % target for vol-target sizing
// Benchmark is picked per market from the ticker suffix (benchmarkForSymbol).

// Result tabs, in display order. Ids match the `sections` prop from the page sidebar.
export const TABS = [
  { id: 'volatility', label: 'Volatility' },
  { id: 'risk', label: 'Risk' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'stochastic', label: 'Stochastic' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'sizing', label: 'Sizing' },
  { id: 'correlation', label: 'Correlation' },
  { id: 'options', label: 'Options' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'scenario', label: 'Scenario' },
];

export const STRATEGIES = [
  { id: 'sma', label: 'SMA Crossover' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'meanrev', label: 'Mean Reversion' },
];
