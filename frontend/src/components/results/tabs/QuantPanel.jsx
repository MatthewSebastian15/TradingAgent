import PropTypes from 'prop-types';
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { getApiStatus, getMarketOhlcv } from '../../../api/market';
import { useStockOverview } from '../../../hooks/useStockOverview';
import NoticeBox from '../NoticeBox';
import { SectionBlock } from './quant/charts';
import {
  DEFAULT_SECTION,
  MC_DAYS,
  MC_HORIZONS,
  MC_PATHS,
  QUANT_RANGE,
  ROLLING_RATIO_WINDOW,
  ROLLING_WINDOW,
  sectionById,
  STRATEGIES,
  VOL_TARGET,
} from './quant/config';
import { regimeLabel } from './quant/format';
import { dataStatus } from './quant/interpret';
import { BacktestSection } from './quant/sections/BacktestSection';
import { ContextBar } from './quant/sections/ContextBar';
import { CorrelationSection } from './quant/sections/CorrelationSection';
import { DistributionSection } from './quant/sections/DistributionSection';
import { HeadlineStrip } from './quant/sections/HeadlineStrip';
import { OptionsSection } from './quant/sections/OptionsSection';
import { OverviewSection } from './quant/sections/OverviewSection';
import { RiskSection } from './quant/sections/RiskSection';
import { ScenarioSection } from './quant/sections/ScenarioSection';
import { SizingSection } from './quant/sections/SizingSection';
import { StochasticSection } from './quant/sections/StochasticSection';
import { ValuationSection } from './quant/sections/ValuationSection';
import { VolatilitySection } from './quant/sections/VolatilitySection';
import { SectionSkeleton } from './quant/SectionSkeleton';
import { SectionTabs } from './quant/SectionTabs';
import { useUrlState } from './quant/urlState';
import { useDebouncedValue } from './quant/useDebouncedValue';
import { useMonteCarlo } from './quant/useMonteCarlo';
import {
  adfTest,
  alignByDate,
  alignManyByDate,
  alpha,
  annualizedVol,
  assessSeries,
  backtest,
  benchmarkBySymbol,
  benchmarkForSymbol,
  benchmarkStats,
  beta,
  calmar,
  correlationMatrix,
  covarianceMatrix,
  cvar,
  downsideDeviation,
  drawdownSeries,
  drawdownStats,
  efficientFrontier,
  ewmaSigmaDaily,
  ewmaVol,
  ewmaVolSeries,
  fitGarch,
  garchTermStructure,
  garmanKlassVol,
  gmvWeights,
  histogramBins,
  historicalVaR,
  horizonSigma,
  hurstExponent,
  jarqueBera,
  kellyEstimate,
  kurtosis,
  ledoitWolf,
  logReturns,
  maxDrawdown,
  maxSharpeLongOnly,
  mean,
  minVarianceLongOnly,
  ouHalfLife,
  parkinsonVol,
  periodsPerYearFromDates,
  pointPrice,
  portfolioStats,
  priceRows,
  qqPoints,
  regimeSegments,
  regimeShifts,
  resampleWeekly,
  resolveRiskFreeRate,
  returnHistogram,
  returnsByMonth,
  returnsByWeekday,
  riskParity,
  rollingBeta,
  rollingCorrelation,
  rollingSharpe,
  rollingVol,
  sharpe,
  sharpeStats,
  simpleReturns,
  simulationDrift,
  skewness,
  sortino,
  stdDev,
  tangencyWeights,
  topDrawdowns,
  volCone,
  worstWindows,
  yangZhangVol,
  zipRollingToDates,
} from './quantUtils';

function QuantPanel({ points, currency, symbol, range, section, onSectionChange, syncUrl = false }) {
  // `range` (Quant page) pins every fetch to the user's window. Without it (AI-agent
  // result tab) the panel extends the 1Y analysis chart to QUANT_RANGE for stabler stats.
  const fetchRange = range || QUANT_RANGE;
  // Controlled by the Quant page sidebar (`section`), uncontrolled inside the AI-agent
  // result tab. Hidden sections stay mounted so their inputs keep state.
  const tabsId = useId();
  const controlled = section !== undefined;
  const [innerSection, setInnerSection] = useState(DEFAULT_SECTION);
  const requested = controlled ? section : innerSection;
  const activeId = sectionById(requested) ? requested : DEFAULT_SECTION;
  const selectSection = (id) => {
    if (controlled) onSectionChange?.(id);
    else setInnerSection(id);
  };
  // Heavy memos compute only for sections opened at least once (`visible.has(id)`).
  const [visited, setVisited] = useState(() => new Set([activeId]));
  if (!visited.has(activeId)) setVisited(new Set(visited).add(activeId));
  const visible = visited;
  const [seed, setSeed] = useState(42);
  const [status, setStatus] = useState(null);
  const [rfOverride, setRfOverride] = useState(null); // { symbol, rate } typed in the headline
  const [benchPoints, setBenchPoints] = useState(null); // null = loading, [] = unavailable
  const [mcHorizon, setMcHorizon] = useUrlState('h', MC_DAYS, {
    enabled: syncUrl,
    parse: Number,
    isValid: (d) => MC_HORIZONS.includes(d),
  });
  const [mcMethod, setMcMethod] = useUrlState('m', 'gbm', {
    enabled: syncUrl,
    isValid: (m) => m === 'gbm' || m === 'bootstrap',
  }); // 'gbm' | 'bootstrap'
  const [mcDrift, setMcDrift] = useState('historical'); // 'historical' | 'riskneutral'
  const [bootDemean, setBootDemean] = useState(false);
  const [mcTarget, setMcTarget] = useState('');
  const [mcStop, setMcStop] = useState('');
  const [strategy, setStrategy] = useUrlState('st', 'sma', {
    enabled: syncUrl,
    isValid: (id) => STRATEGIES.some((s) => s.id === id),
  });
  const [btParams, setBtParams] = useState({
    fast: 20,
    slow: 50,
    lookback: 60,
    costBps: 0,
    oosFrac: 0,
  });
  const [volTarget, setVolTarget] = useState(VOL_TARGET);
  const [peers, setPeers] = useState([]); // [{ symbol, points }]
  const [peerLoading, setPeerLoading] = useState(false);
  const [peerErrors, setPeerErrors] = useState([]);
  const [corrFreq, setCorrFreq] = useState('daily');
  const [corrShrink, setCorrShrink] = useState(true);
  const [corrCap, setCorrCap] = useState(60);
  const [corrPair, setCorrPair] = useState([null, null]);
  // The cap retriggers Ledoit-Wolf + frontier + 3 iterative optimizers on every keystroke;
  // debounce before it reaches the `corr` memo so typing stays instant.
  const [debouncedCorrCap, setDebouncedCorrCap] = useState(corrCap);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCorrCap(corrCap), 300);
    return () => clearTimeout(timer);
  }, [corrCap]);

  // Peers fetched for another window or another base ticker would misalign with (or
  // duplicate) the base series.
  // The controller also lets an in-flight peer fetch see that its window/symbol went stale.
  const peerController = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    peerController.current = controller;
    setPeers([]);
    setPeerLoading(false);
    setPeerErrors([]);
    return () => controller.abort();
  }, [fetchRange, symbol]);

  // Fetch a longer history than the 1Y analysis chart; fall back to the prop on failure.
  // Skipped when `range` is set (Quant page) — the caller already fetched that window.
  const [longPoints, setLongPoints] = useState(null);
  useEffect(() => {
    setLongPoints(null);
    if (!symbol || range) return undefined;
    let alive = true;
    const controller = new AbortController();
    getMarketOhlcv(symbol, { range: QUANT_RANGE, signal: controller.signal })
      .then((res) => {
        if (alive && Array.isArray(res?.points) && res.points.length > 0) {
          setLongPoints(res.points);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      controller.abort();
    };
  }, [symbol, range]);

  const history = longPoints && longPoints.length > points.length ? longPoints : points;
  const quality = useMemo(() => assessSeries(history), [history]);
  // Same rows as assessSeries (shared helper), so dates/closes stay aligned with the report.
  const rows = useMemo(() => priceRows(history), [history]);
  const closes = useMemo(() => rows.map(pointPrice), [rows]);
  const historyDates = useMemo(() => rows.map((p) => String(p.date).slice(0, 10)), [rows]);
  const ppy = useMemo(() => periodsPerYearFromDates(historyDates), [historyDates]);
  const { data: overview, error: overviewError } = useStockOverview(symbol);
  const ccy = currency || overview?.currency || '';
  // Home-market index by default; the context bar can override it per ticker.
  const [benchOverride, setBenchOverride] = useState(null); // { forSymbol, symbol }
  const benchmarkInfo = useMemo(
    () =>
      (benchOverride?.forSymbol === symbol && benchmarkBySymbol(benchOverride.symbol)) ||
      benchmarkForSymbol(symbol),
    [symbol, benchOverride]
  );

  // Pull the risk-free rate config once on mount. Fails soft → status stays null → rf 0.
  useEffect(() => {
    const controller = new AbortController();
    getApiStatus({ signal: controller.signal })
      .then((s) => setStatus(s && typeof s === 'object' ? s : null))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Annual risk-free rate as a fraction: manual override for this symbol, else the
  // market rate from config, else the global rate, else 0.
  const rfInfo = useMemo(() => resolveRiskFreeRate(symbol, status), [symbol, status]);
  const manualRf = rfOverride && rfOverride.symbol === symbol ? rfOverride.rate : null;
  const rf = manualRf ?? rfInfo.rate;
  const rfSource = manualRf != null ? 'manual' : rfInfo.source;
  const rfDaily = rf / ppy;

  // Fetch the market-matched benchmark series; refetch when the ticker's market
  // changes. Fails soft → benchPoints = [] and beta/alpha render as —.
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setBenchPoints(null);
    getMarketOhlcv(benchmarkInfo.symbol, { range: fetchRange, signal: controller.signal })
      .then((p) => {
        if (alive) setBenchPoints(Array.isArray(p?.points) ? p.points : []);
      })
      .catch(() => {
        if (alive) setBenchPoints([]);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [benchmarkInfo.symbol, fetchRange]);

  const returns = useMemo(() => simpleReturns(closes), [closes]);
  const logRet = useMemo(() => logReturns(closes), [closes]);
  const rollingVols = useMemo(() => rollingVol(closes, ROLLING_WINDOW, ppy), [closes, ppy]);

  const rollingPoints = useMemo(
    () => zipRollingToDates(rollingVols, historyDates, ROLLING_WINDOW),
    [rollingVols, historyDates]
  );

  // GARCH is shared with the Stochastic and Sizing tabs, so fit it once for any of them.
  const needsGarch =
    !visible || ['volatility', 'stochastic', 'sizing'].some((id) => visible.has(id));
  const garch = useMemo(() => (needsGarch ? fitGarch(returns) : null), [needsGarch, returns]);
  const garchTerm = useMemo(
    () => (garch ? garchTermStructure(garch, [5, 21, 63, 126, 252], ppy) : []),
    [garch, ppy]
  );
  // Range estimators need the raw OHLC of `rows`; they return null when it is absent.
  const volDetail = useMemo(() => {
    if (visible && !visible.has('volatility')) {
      return { estimators: {}, cone: [], rolling63Points: [], ewmaPoints: [] };
    }
    return {
      estimators: {
        parkinson: parkinsonVol(rows, ppy),
        garmanKlass: garmanKlassVol(rows, ppy),
        yangZhang: yangZhangVol(rows, ppy),
      },
      cone: volCone(closes, [10, 21, 63, 126, 252], ppy),
      rolling63Points: zipRollingToDates(rollingVol(closes, 63, ppy), historyDates, 63),
      ewmaPoints: zipRollingToDates(ewmaVolSeries(returns, 0.94, 20, ppy), historyDates, 20),
    };
  }, [visible, rows, closes, returns, historyDates, ppy]);

  const metrics = useMemo(
    () => ({
      vol: annualizedVol(closes, ppy),
      ewma: ewmaVol(closes, 0.94, ppy),
      dd: maxDrawdown(closes),
      cal: calmar(closes, ppy),
      ewmaSigma: ewmaSigmaDaily(returns),
      downDev: downsideDeviation(returns, 0, ppy),
      shp: sharpe(returns, rfDaily, ppy),
      srt: sortino(returns, rfDaily, ppy),
      skew: skewness(returns),
      kurt: kurtosis(returns),
      var95: historicalVaR(returns, 0.95),
      var99: historicalVaR(returns, 0.99),
      cv: cvar(returns),
    }),
    [closes, returns, rfDaily, ppy]
  );

  // Regime (confirmed vol-percentile bucket) + Hurst (trend vs mean-revert) for the
  // headline + sizing + scenario, so all three always agree.
  const regimeShift = useMemo(() => regimeShifts(rollingVols), [rollingVols]);
  const regime = useMemo(
    () =>
      regimeShift
        ? {
            label: regimeShift.current,
            tone:
              regimeShift.current === 'Stressed'
                ? 'bad'
                : regimeShift.current === 'Calm'
                  ? 'good'
                  : 'neutral',
          }
        : regimeLabel(null),
    [regimeShift]
  );
  const hurstInfo = useMemo(() => hurstExponent(returns), [returns]);
  const adf = useMemo(() => adfTest(closes.filter((c) => c > 0).map(Math.log)), [closes]);
  const kellyInfo = useMemo(() => kellyEstimate(returns, rfDaily), [returns, rfDaily]);
  const forecast21 = garchTerm.find((t) => t.days === 21);
  const ouHL = useMemo(() => ouHalfLife(closes), [closes]);
  const ddStats = useMemo(() => drawdownStats(closes), [closes]);
  const sharpeInfo = useMemo(() => sharpeStats(returns, rfDaily, ppy), [returns, rfDaily, ppy]);
  const topDD = useMemo(() => topDrawdowns(closes, historyDates), [closes, historyDates]);

  // Underwater curve (one value per close), zipped to dates.
  const ddPoints = useMemo(
    () =>
      drawdownSeries(closes)
        .map((value, i) => ({ date: historyDates[i], value }))
        .filter((p) => p.date),
    [closes, historyDates]
  );

  // Rolling Sharpe zipped to dates.
  const rsPoints = useMemo(
    () =>
      zipRollingToDates(
        rollingSharpe(returns, ROLLING_RATIO_WINDOW, rfDaily, ppy),
        historyDates,
        ROLLING_RATIO_WINDOW
      ),
    [returns, historyDates, rfDaily, ppy]
  );

  // Benchmark-relative metrics + rolling beta from the aligned benchmark series.
  const benchmark = useMemo(() => {
    const none = {
      stats: null,
      beta: null,
      alpha: null,
      available: false,
      observations: null,
      rollBetaPoints: [],
      marketVol: null,
      marketMaxDD: null,
    };
    if (!benchPoints || benchPoints.length === 0) return none;
    const { dates, stock, market } = alignByDate(rows, benchPoints);
    if (stock.length < 3) return none;
    const sr = simpleReturns(stock);
    const mr = simpleReturns(market);
    const stats = benchmarkStats(sr, mr, rfDaily, ppy);
    return {
      stats,
      beta: stats ? stats.beta : beta(sr, mr),
      alpha: stats ? stats.alpha : alpha(sr, mr, rfDaily, ppy),
      available: true,
      observations: sr.length,
      rollBetaPoints: zipRollingToDates(
        rollingBeta(sr, mr, ROLLING_RATIO_WINDOW),
        dates,
        ROLLING_RATIO_WINDOW
      ),
      marketVol: stdDev(mr) * Math.sqrt(ppy) * 100,
      marketMaxDD: maxDrawdown(market),
    };
  }, [rows, benchPoints, rfDaily, ppy]);

  const benchStatus =
    benchPoints === null ? 'loading' : benchmark.available ? 'ready' : 'unavailable';
  const contextStatus = dataStatus({ issues: quality.issues, benchStatus, overviewError });

  // Empirical worst windows + regime timeline for the Scenario tab; skipped while the
  // tab is hidden or the benchmark hasn't loaded yet.
  const scenarioDetail = useMemo(() => {
    if (visible && !visible.has('scenario'))
      return { benchWorst: [], stockWorst: [], segments: [], pricePoints: [] };
    const aligned = benchPoints?.length
      ? alignByDate(history, benchPoints)
      : { dates: [], market: [] };
    return {
      benchWorst: [1, 5, 20].flatMap((d) => worstWindows(aligned.market, aligned.dates, d, 1)),
      stockWorst: [1, 5, 20].flatMap((d) => worstWindows(closes, historyDates, d, 1)),
      segments: regimeShift
        ? regimeSegments(regimeShift.labels, historyDates.slice(ROLLING_WINDOW))
        : [],
      pricePoints: closes.map((value, i) => ({ date: historyDates[i], value })),
    };
  }, [visible, benchPoints, history, closes, historyDates, regimeShift]);

  // Only run the simulation when the section is open and there's enough data;
  // keyed so unrelated re-renders (e.g. streaming updates) don't re-roll it.
  const sigmaInfo = useMemo(
    () =>
      horizonSigma({
        garchFit: garch,
        ewmaSigma: ewmaSigmaDaily(logRet),
        longRunSigma: stdDev(logRet),
        days: mcHorizon,
      }),
    [garch, logRet, mcHorizon]
  );

  const mcRequest = useMemo(() => {
    if ((visible && !visible.has('stochastic')) || closes.length < 30) return null;
    const spot = closes.at(-1);
    const options = {
      target: mcTarget === '' ? null : Number(mcTarget),
      stop: mcStop === '' ? null : Number(mcStop),
    };
    if (mcMethod === 'bootstrap') {
      return {
        method: 'bootstrap',
        args: [spot, returns, mcHorizon, MC_PATHS, seed, 5, { ...options, demean: bootDemean }],
      };
    }
    // Risk-neutral drift uses the risk-free rate instead of the historical mean,
    // removing the optimistic bias when the sample window was a bull run.
    const drift = simulationDrift({
      mode: mcDrift,
      logReturns: logRet,
      sigma: sigmaInfo.sigma,
      rfDaily,
    });
    return {
      method: 'gbm',
      args: [spot, drift, sigmaInfo.sigma, mcHorizon, MC_PATHS, seed, options],
    };
  }, [
    visible,
    closes,
    returns,
    logRet,
    mcHorizon,
    mcMethod,
    mcDrift,
    bootDemean,
    mcTarget,
    mcStop,
    seed,
    rfDaily,
    sigmaInfo,
  ]);

  const { result: sim, running: simRunning } = useMonteCarlo(mcRequest);

  const horizonLabel = useMemo(() => {
    const months = Math.round((mcHorizon / ppy) * 12);
    return months >= 12 ? `~${Math.round(months / 12)}y` : `~${months}mo`;
  }, [mcHorizon, ppy]);

  // meanrev SMA window defaults to the OU half-life; the slider (mrLookback) overrides.
  const btEffective = useMemo(() => {
    if (strategy !== 'meanrev') return btParams;
    const auto =
      ouHL && adf?.stationaryAt5 ? Math.min(100, Math.max(5, Math.round(ouHL))) : btParams.lookback;
    return { ...btParams, lookback: btParams.mrLookback ?? auto };
  }, [btParams, strategy, ouHL, adf]);

  const btInput = useDebouncedValue(btEffective);
  const backtestResult = useMemo(() => {
    if (visible && !visible.has('backtest')) return null;
    return backtest(closes, strategy, btInput, rfDaily, ppy);
  }, [visible, closes, strategy, btInput, rfDaily, ppy]);

  const returnBins = useMemo(() => returnHistogram(returns, 30), [returns]);

  const distDetail = useMemo(() => {
    if (visible && !visible.has('distribution')) {
      return {
        histogram: { bins: [], clippedLow: 0, clippedHigh: 0 },
        jb: null,
        qq: [],
        weekday: [],
        month: [],
      };
    }
    return {
      histogram: histogramBins(returns),
      jb: jarqueBera(returns),
      qq: qqPoints(returns),
      weekday: returnsByWeekday(history),
      month: returnsByMonth(history),
    };
  }, [visible, returns, history]);

  // --- correlation + optimizer (Phase 5) ----------------------------------
  const baseSymbol = (symbol || 'BASE').toUpperCase();

  // Plain function: the React Compiler memoizes it; a manual dep list here made
  // the compiler bail (react-hooks/preserve-manual-memoization).
  const addPeers = (list) => {
    const wanted = [...new Set(list.map((s) => s.trim().toUpperCase()))]
      .filter(Boolean)
      .filter((s) => s !== baseSymbol);
    if (wanted.length === 0) return;
    const { signal } = peerController.current;
    setPeerLoading(true);
    Promise.allSettled(
      wanted.map((sym) =>
        getMarketOhlcv(sym, { range: fetchRange, signal }).then((res) => ({
          symbol: sym,
          points: Array.isArray(res?.points) ? res.points : [],
        }))
      )
    )
      .then((results) => {
        if (signal.aborted) return;
        const fetched = [];
        const errors = [];
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value.points.length > 1) fetched.push(r.value);
          else {
            errors.push({
              symbol: wanted[i],
              message:
                r.status === 'rejected'
                  ? r.reason?.message || 'Request failed'
                  : 'No price data for this range',
            });
          }
        });
        setPeers((prev) => {
          const have = new Set(prev.map((p) => p.symbol));
          return [...prev, ...fetched.filter((p) => !have.has(p.symbol))];
        });
        setPeerErrors(errors);
      })
      .finally(() => {
        if (!signal.aborted) setPeerLoading(false);
      });
  };

  const removePeer = useCallback(
    (sym) => setPeers((prev) => prev.filter((p) => p.symbol !== sym)),
    []
  );

  // Align base + peers on common days; compute correlation matrix + optimizer.
  const corr = useMemo(() => {
    const empty = {
      symbols: [],
      matrix: [],
      observations: 0,
      frequency: corrFreq,
      shrinkage: null,
      tooShort: false,
      optimizerStatus: 'ok',
      frontier: [],
      cml: [],
      assets: [],
      portfolios: [],
      rollPoints: [],
      pair: ['', ''],
    };
    if (peers.length === 0 || (visible && !visible.has('correlation'))) return empty;
    const series = [{ symbol: baseSymbol, points: history }, ...peers];
    const symbols = series.map((s) => s.symbol);
    const aligned = alignManyByDate(series);
    const weekly = corrFreq === 'weekly';
    const { dates, closes: closeMap } = weekly
      ? resampleWeekly(aligned.dates, aligned.closes)
      : aligned;
    const rollWindow = weekly ? 26 : ROLLING_RATIO_WINDOW;
    if (dates.length < (weekly ? 27 : 31)) {
      return { ...empty, symbols, observations: Math.max(0, dates.length - 1), tooShort: true };
    }
    const periods = weekly ? 52 : ppy;
    const rfPeriod = rf / periods;
    const retBySym = Object.fromEntries(symbols.map((s) => [s, simpleReturns(closeMap[s])]));
    const retList = symbols.map((s) => retBySym[s]);
    const T = dates.length - 1;
    const lw = corrShrink ? ledoitWolf(retList) : null;
    // ledoitWolf's internal sample covariance is population-scaled (T divisor, matching the
    // paper); rescale to sample covariance (T-1) so it's on the same scale as covarianceMatrix.
    const cov = lw
      ? lw.matrix.map((row) => row.map((v) => v * (T / (T - 1))))
      : covarianceMatrix(retList);
    const mu = retList.map(mean);
    // Only a genuinely empty/invalid cap (NaN) falls back to 100; 0 or a negative value is a
    // real number and is left to Math.max's 1/symbols.length floor below, not silently swapped
    // for 100 the way `Number(corrCap) || 100` treated 0 as falsy.
    const capInput = Number(debouncedCorrCap);
    const cap = Math.max(1 / symbols.length, (Number.isFinite(capInput) ? capInput : 100) / 100);
    const annual = (id, label, w) => {
      if (!w) return null;
      const { ret, vol } = portfolioStats(w, mu, cov);
      const r = ret * periods * 100;
      const v = vol * Math.sqrt(periods) * 100;
      return { id, label, weights: w, ret: r, vol: v, sharpe: v > 0 ? (r - rf * 100) / v : null };
    };
    const gmvW = gmvWeights(cov);
    const tanW = tangencyWeights(cov, mu, rfPeriod);
    const loSharpe = maxSharpeLongOnly(cov, mu, rfPeriod, cap);
    const portfolios = [
      annual('gmv', 'Min-variance', gmvW),
      annual('tangency', 'Max-Sharpe (unconstrained)', tanW),
      annual(
        'lo_minvar',
        `Min-variance (long-only ≤${Math.round(cap * 100)}%)`,
        minVarianceLongOnly(cov, cap)
      ),
      annual('lo_sharpe', `Max-Sharpe (long-only ≤${Math.round(cap * 100)}%)`, loSharpe?.weights),
      annual('riskparity', 'Risk parity', riskParity(cov)),
      annual(
        'equal',
        'Equal weight',
        symbols.map(() => 1 / symbols.length)
      ),
    ].filter(Boolean);
    const gmv = portfolios.find((p) => p.id === 'gmv');
    const tangency = portfolios.find((p) => p.id === 'tangency');
    const frontier = gmv
      ? efficientFrontier(cov, mu, rfPeriod, 40, periods).filter((p) => p.ret >= gmv.ret)
      : [];
    const maxVol = Math.max(
      ...frontier.map((p) => p.vol),
      ...symbols.map((_, i) => Math.sqrt(cov[i][i] * periods) * 100)
    );
    const cmlSlope = tangency && tangency.vol > 0 ? (tangency.ret - rf * 100) / tangency.vol : null;
    const pairA = symbols.includes(corrPair[0]) ? corrPair[0] : symbols[0];
    const pairB =
      symbols.includes(corrPair[1]) && corrPair[1] !== pairA
        ? corrPair[1]
        : symbols.find((s) => s !== pairA);
    return {
      symbols,
      matrix: correlationMatrix(symbols, retBySym),
      observations: dates.length - 1,
      frequency: corrFreq,
      shrinkage: lw ? lw.shrinkage : null,
      tooShort: false,
      optimizerStatus: !gmvW
        ? 'singular'
        : !tanW
          ? 'no_tangency'
          : loSharpe?.negativeExcess
            ? 'lo_negative_excess'
            : 'ok',
      frontier,
      cml:
        cmlSlope > 0
          ? [
              { x: 0, y: rf * 100 },
              { x: maxVol * 1.1, y: rf * 100 + cmlSlope * maxVol * 1.1 },
            ]
          : [],
      assets: symbols.map((s, i) => ({
        label: s,
        ret: mu[i] * periods * 100,
        vol: Math.sqrt(cov[i][i] * periods) * 100,
      })),
      portfolios,
      rollPoints: zipRollingToDates(
        rollingCorrelation(retBySym[pairA], retBySym[pairB], rollWindow),
        dates,
        rollWindow
      ),
      pair: [pairA, pairB],
    };
  }, [
    peers,
    visible,
    baseSymbol,
    history,
    corrFreq,
    corrShrink,
    debouncedCorrCap,
    corrPair,
    rf,
    ppy,
  ]);

  // Loading: result is here but price history hasn't streamed in yet.
  // ponytail: 0 points = still loading; 1–29 = genuinely too short (NoticeBox).
  if (closes.length === 0) return <SectionSkeleton section={activeId} />;

  if (closes.length < 30) {
    return (
      <div className="p-4">
        <NoticeBox title="Not enough data">
          Quant statistics need at least 30 trading days of price history.
        </NoticeBox>
      </div>
    );
  }

  // `closes` already holds only valid (finite, positive) prices — same rows as Last/Window.
  const changePct = closes.length > 1 ? (closes.at(-1) / closes[0] - 1) * 100 : null;

  return (
    <div className="space-y-4 p-4 font-mono">
      <ContextBar
        symbol={baseSymbol}
        ccy={ccy}
        last={closes.at(-1)}
        changePct={changePct}
        startDate={quality.startDate}
        endDate={quality.endDate}
        observations={quality.observations}
        benchSymbol={benchmarkInfo.symbol}
        onBenchChange={(sym) => setBenchOverride({ forSymbol: symbol, symbol: sym })}
        rfPct={rf * 100}
        rfSource={rfSource}
        onRfChange={(rate) => setRfOverride(rate == null ? null : { symbol, rate })}
        status={contextStatus}
        sticky={controlled}
      />
      <HeadlineStrip
        issues={quality.issues}
        vol={metrics.vol}
        shp={metrics.shp}
        dd={metrics.dd}
        var95={metrics.var95}
        regime={regime}
        regimeDays={regimeShift?.daysSince}
        hurstVal={hurstInfo?.hurst}
        hurstSignificant={hurstInfo?.significant}
      />

      {!controlled && (
        <SectionTabs activeId={activeId} onSelect={selectSection} idPrefix={tabsId} />
      )}

      {visited.has('overview') && (
        <SectionBlock
          section="overview"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'overview'}
        >
          <OverviewSection
            symbol={baseSymbol}
            vol={metrics.vol}
            benchVol={benchmark.marketVol}
            regimeLabel={regime.label}
            dd={metrics.dd}
            benchMaxDD={benchmark.marketMaxDD}
            currentDrawdown={ddPoints.at(-1)?.value}
            underwaterDays={ddStats?.currentUnderwaterDays}
            var95={metrics.var95}
            sharpeInfo={sharpeInfo}
            benchStats={benchmark.stats}
            benchLabel={benchmarkInfo.label}
            benchStatus={benchStatus}
            hurstInfo={hurstInfo}
            observations={quality.observations}
            onNavigate={selectSection}
          />
        </SectionBlock>
      )}

      {visited.has('volatility') && (
        <SectionBlock
          section="volatility"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'volatility'}
        >
          <VolatilitySection
            vol={metrics.vol}
            ewma={metrics.ewma}
            ppy={ppy}
            estimators={volDetail.estimators}
            cone={volDetail.cone}
            garch={garch}
            garchTerm={garchTerm}
            rollingPoints={rollingPoints}
            rolling63Points={volDetail.rolling63Points}
            ewmaPoints={volDetail.ewmaPoints}
          />
        </SectionBlock>
      )}

      {visited.has('risk') && (
        <SectionBlock
          section="risk"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'risk'}
        >
          <RiskSection
            ccy={ccy}
            rfPct={rf * 100}
            benchLabel={benchmarkInfo.label}
            benchAvailable={benchmark.available}
            benchStatus={benchStatus}
            returns={returns}
            closes={closes}
            ewmaSigma={metrics.ewmaSigma}
            dd={metrics.dd}
            cal={metrics.cal}
            srt={metrics.srt}
            downDev={metrics.downDev}
            sharpeInfo={sharpeInfo}
            obs={returns.length}
            benchStats={benchmark.stats}
            ddStats={ddStats}
            topDD={topDD}
            ddPoints={ddPoints}
            rsPoints={rsPoints}
            rbPoints={benchmark.rollBetaPoints}
          />
        </SectionBlock>
      )}

      {visited.has('distribution') && (
        <SectionBlock
          section="distribution"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'distribution'}
        >
          <DistributionSection
            skew={metrics.skew}
            kurt={metrics.kurt}
            var95={metrics.var95}
            var99={metrics.var99}
            cvar95={metrics.cv}
            histogram={distDetail.histogram}
            mu={mean(returns)}
            sigma={stdDev(returns)}
            jb={distDetail.jb}
            qq={distDetail.qq}
            weekday={distDetail.weekday}
            month={distDetail.month}
          />
        </SectionBlock>
      )}

      {visited.has('stochastic') && (
        <SectionBlock
          section="stochastic"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'stochastic'}
        >
          <StochasticSection
            sim={sim}
            running={simRunning}
            spot={closes.at(-1)}
            ccy={ccy}
            lastDate={historyDates.at(-1)}
            ppy={ppy}
            seed={seed}
            onReroll={() => setSeed((s) => (s + 1) >>> 0)}
            onSeedChange={(v) => setSeed(Number.isFinite(v) ? v : 0)}
            horizon={mcHorizon}
            onHorizonChange={setMcHorizon}
            horizonLabel={horizonLabel}
            method={mcMethod}
            onMethodChange={setMcMethod}
            drift={mcDrift}
            onDriftChange={setMcDrift}
            bootDemean={bootDemean}
            onBootDemeanChange={setBootDemean}
            target={mcTarget}
            onTargetChange={setMcTarget}
            stop={mcStop}
            onStopChange={setMcStop}
            sigmaInfo={sigmaInfo}
            returnBins={returnBins}
          />
        </SectionBlock>
      )}

      {visited.has('backtest') && (
        <SectionBlock
          section="backtest"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'backtest'}
        >
          <BacktestSection
            strategy={strategy}
            onStrategyChange={setStrategy}
            params={btEffective}
            onParamChange={(k, v) => setBtParams((prev) => ({ ...prev, [k]: v }))}
            onApplyParams={(p) =>
              setBtParams((prev) =>
                strategy === 'meanrev'
                  ? { ...prev, mrLookback: p.lookback }
                  : { ...prev, ...p, oosFrac: prev.oosFrac }
              )
            }
            result={backtestResult}
            dates={historyDates}
            closes={closes}
            rf={rfDaily}
            ppy={ppy}
          />
        </SectionBlock>
      )}

      {visited.has('sizing') && (
        <SectionBlock
          section="sizing"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'sizing'}
        >
          <SizingSection
            key={baseSymbol}
            kelly={kellyInfo}
            forecastVol={forecast21 ? forecast21.annualVol : metrics.ewma}
            forecastSource={forecast21 ? 'GARCH 21d' : 'EWMA'}
            volTarget={volTarget}
            onVolTargetChange={setVolTarget}
            hurstInfo={hurstInfo}
            adf={adf}
            ouHL={ouHL}
            spot={closes.at(-1)}
            ccy={ccy}
            symbol={baseSymbol}
            dailySigma={metrics.ewmaSigma}
          />
        </SectionBlock>
      )}

      {visited.has('correlation') && (
        <SectionBlock
          section="correlation"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'correlation'}
        >
          <CorrelationSection
            onAddPeers={addPeers}
            peers={peers}
            onRemovePeer={removePeer}
            loading={peerLoading}
            peerErrors={peerErrors}
            frequency={corrFreq}
            onFrequencyChange={setCorrFreq}
            shrink={corrShrink}
            onShrinkChange={setCorrShrink}
            cap={corrCap}
            onCapChange={setCorrCap}
            onPairChange={(slot, sym) =>
              setCorrPair((prev) => (slot === 0 ? [sym, prev[1]] : [prev[0], sym]))
            }
            corr={corr}
          />
        </SectionBlock>
      )}

      {visited.has('options') && (
        <SectionBlock
          section="options"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'options'}
        >
          <OptionsSection
            key={baseSymbol}
            spot={closes.at(-1)}
            closes={closes}
            ppy={ppy}
            defaultRate={rf}
            ccy={ccy}
            overview={overview}
            fallbackVol={metrics.vol}
          />
        </SectionBlock>
      )}

      {visited.has('valuation') && (
        <SectionBlock
          section="valuation"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'valuation'}
        >
          <ValuationSection
            key={baseSymbol}
            spot={closes.at(-1)}
            defaultRate={rf}
            ccy={ccy}
            symbol={baseSymbol}
            overview={overview}
            overviewError={overviewError}
            beta={benchmark.beta}
            peerSymbols={peers.map((p) => p.symbol)}
          />
        </SectionBlock>
      )}

      {visited.has('scenario') && (
        <SectionBlock
          section="scenario"
          tabsId={controlled ? undefined : tabsId}
          hidden={activeId !== 'scenario'}
        >
          <ScenarioSection
            spot={closes.at(-1)}
            ccy={ccy}
            symbol={baseSymbol}
            ewmaSigma={metrics.ewmaSigma}
            beta={benchmark.beta}
            benchLabel={benchmarkInfo.label}
            benchIsSp500={benchmarkInfo.symbol === '^GSPC'}
            benchWorst={scenarioDetail.benchWorst}
            stockWorst={scenarioDetail.stockWorst}
            regime={regimeShift}
            pricePoints={scenarioDetail.pricePoints}
            segments={scenarioDetail.segments}
          />
        </SectionBlock>
      )}
    </div>
  );
}

QuantPanel.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
  currency: PropTypes.string,
  symbol: PropTypes.string,
  range: PropTypes.string,
  section: PropTypes.string,
  onSectionChange: PropTypes.func,
  syncUrl: PropTypes.bool,
};

export default memo(QuantPanel);
