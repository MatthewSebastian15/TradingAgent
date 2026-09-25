import PropTypes from 'prop-types';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getApiStatus, getMarketOhlcv } from '../../../api/market';
import { useStockOverview } from '../../../hooks/useStockOverview';
import NoticeBox from '../NoticeBox';
import { SectionBlock, SkeletonGrid } from './quant/charts';
import {
  MC_DAYS,
  MC_PATHS,
  QUANT_RANGE,
  ROLLING_RATIO_WINDOW,
  ROLLING_WINDOW,
  TABS,
  VOL_TARGET,
} from './quant/config';
import { regimeLabel } from './quant/format';
import { BacktestSection } from './quant/sections/BacktestSection';
import { CorrelationSection } from './quant/sections/CorrelationSection';
import { DistributionSection } from './quant/sections/DistributionSection';
import { HeadlineStrip } from './quant/sections/HeadlineStrip';
import { OptionsSection } from './quant/sections/OptionsSection';
import { RiskSection } from './quant/sections/RiskSection';
import { ScenarioSection } from './quant/sections/ScenarioSection';
import { SizingSection } from './quant/sections/SizingSection';
import { StochasticSection } from './quant/sections/StochasticSection';
import { ValuationSection } from './quant/sections/ValuationSection';
import { VolatilitySection } from './quant/sections/VolatilitySection';
import { useMonteCarlo } from './quant/useMonteCarlo';
import {
  alignByDate,
  alignManyByDate,
  alpha,
  annualizedVol,
  assessSeries,
  backtest,
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
  hurst,
  jarqueBera,
  kellyFraction,
  kurtosis,
  logReturns,
  maxDrawdown,
  mean,
  ouHalfLife,
  parkinsonVol,
  periodsPerYearFromDates,
  pointPrice,
  portfolioStats,
  priceRows,
  qqPoints,
  regimeSegments,
  regimeShifts,
  resolveRiskFreeRate,
  returnHistogram,
  returnsByMonth,
  returnsByWeekday,
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
  volTargetWeight,
  worstWindows,
  yangZhangVol,
  zipRollingToDates,
} from './quantUtils';

function QuantPanel({ points, currency, symbol, sections, range }) {
  // `range` (Quant page) pins every fetch to the user's window. Without it (AI-agent
  // result tab) the panel extends the 1Y analysis chart to QUANT_RANGE for stabler stats.
  const fetchRange = range || QUANT_RANGE;
  // sections: array of visible tab ids from the page sidebar. Undefined = show all
  // (keeps QuantPanel usable standalone without importing the tab list).
  const visible = useMemo(() => (sections ? new Set(sections) : null), [sections]);
  const show = (id) => !visible || visible.has(id);
  const tabs = TABS.filter((t) => show(t.id));
  const [active, setActive] = useState(TABS[0].id);
  // Fall back to the first available tab when the active one gets deselected.
  const activeId = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;
  const [seed, setSeed] = useState(42);
  const [status, setStatus] = useState(null);
  const [rfOverride, setRfOverride] = useState(null); // { symbol, rate } typed in the headline
  const [benchPoints, setBenchPoints] = useState(null); // null = loading, [] = unavailable
  const [mcHorizon, setMcHorizon] = useState(MC_DAYS);
  const [mcMethod, setMcMethod] = useState('gbm'); // 'gbm' | 'bootstrap'
  const [mcDrift, setMcDrift] = useState('historical'); // 'historical' | 'riskneutral'
  const [bootDemean, setBootDemean] = useState(false);
  const [mcTarget, setMcTarget] = useState('');
  const [mcStop, setMcStop] = useState('');
  const [strategy, setStrategy] = useState('sma');
  const [btParams, setBtParams] = useState({
    fast: 20,
    slow: 50,
    lookback: 60,
    costBps: 0,
    oosFrac: 0,
  });
  const [peerInput, setPeerInput] = useState('');
  const [peers, setPeers] = useState([]); // [{ symbol, points }]
  const [peerLoading, setPeerLoading] = useState(false);

  // Peers fetched for another window or another base ticker would misalign with (or
  // duplicate) the base series.
  // The controller also lets an in-flight peer fetch see that its window/symbol went stale.
  const peerController = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    peerController.current = controller;
    setPeers([]);
    setPeerInput('');
    setPeerLoading(false);
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
  const benchmarkInfo = useMemo(() => benchmarkForSymbol(symbol), [symbol]);

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
      kelly: kellyFraction(returns),
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
  const hurstVal = useMemo(() => hurst(returns), [returns]);
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
    };
  }, [rows, benchPoints, rfDaily, ppy]);

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
    const auto = ouHL ? Math.min(100, Math.max(5, Math.round(ouHL))) : btParams.lookback;
    return { ...btParams, lookback: btParams.mrLookback ?? auto };
  }, [btParams, strategy, ouHL]);

  const backtestResult = useMemo(() => {
    if (visible && !visible.has('backtest')) return null;
    return backtest(closes, strategy, btEffective, rfDaily, ppy);
  }, [visible, closes, strategy, btEffective, rfDaily, ppy]);

  const returnBins = useMemo(() => returnHistogram(returns, 30), [returns]);
  const volWeight = useMemo(() => volTargetWeight(metrics.vol, VOL_TARGET), [metrics.vol]);

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
  const addPeers = () => {
    const wanted = peerInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
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
        const fetched = results
          .filter((r) => r.status === 'fulfilled' && r.value.points.length > 0)
          .map((r) => r.value);
        setPeers((prev) => {
          const have = new Set(prev.map((p) => p.symbol));
          return [...prev, ...fetched.filter((p) => !have.has(p.symbol))];
        });
        setPeerInput('');
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
      frontier: [],
      gmv: null,
      tangency: null,
      gmvW: null,
      tanW: null,
      optimizerStatus: 'ok',
      rollPoints: [],
      rollLabel: '',
    };
    if (peers.length === 0 || (visible && !visible.has('correlation'))) return empty;
    const series = [{ symbol: baseSymbol, points: rows }, ...peers];
    const { dates, closes } = alignManyByDate(series);
    if (dates.length < 30) return empty;
    const symbols = series.map((s) => s.symbol);
    const retBySym = {};
    symbols.forEach((s) => {
      retBySym[s] = simpleReturns(closes[s]);
    });
    const matrix = correlationMatrix(symbols, retBySym);
    const retList = symbols.map((s) => retBySym[s]);
    const cov = covarianceMatrix(retList);
    const mu = retList.map(mean);
    const gmvW = gmvWeights(cov);
    const tanW = tangencyWeights(cov, mu, rfDaily);
    const frontier = efficientFrontier(cov, mu, rfDaily, 25, ppy);
    const annualize = (w) => {
      if (!w) return null;
      const { ret, vol } = portfolioStats(w, mu, cov);
      return { ret: ret * ppy * 100, vol: vol * Math.sqrt(ppy) * 100 };
    };
    // Rolling correlation: base vs the first peer.
    const peerSym = symbols[1];
    const rollPoints = zipRollingToDates(
      rollingCorrelation(retBySym[baseSymbol], retBySym[peerSym], ROLLING_RATIO_WINDOW),
      dates,
      ROLLING_RATIO_WINDOW
    );
    return {
      symbols,
      matrix,
      frontier,
      gmv: annualize(gmvW),
      tangency: annualize(tanW),
      gmvW,
      tanW,
      optimizerStatus: !gmvW ? 'singular' : !tanW ? 'no_tangency' : 'ok',
      rollPoints,
      rollLabel: `${baseSymbol} vs ${peerSym}`,
    };
  }, [peers, visible, baseSymbol, rows, rfDaily, ppy]);

  // Loading: result is here but price history hasn't streamed in yet.
  // ponytail: 0 points = still loading; 1–29 = genuinely too short (NoticeBox).
  if (closes.length === 0) return <SkeletonGrid />;

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
      <HeadlineStrip
        symbol={baseSymbol}
        ccy={ccy}
        last={closes.at(-1)}
        changePct={changePct}
        startDate={quality.startDate}
        endDate={quality.endDate}
        observations={quality.observations}
        benchLabel={benchmarkInfo.label}
        rfPct={rf * 100}
        rfSource={rfSource}
        onRfChange={(rate) => setRfOverride(rate == null ? null : { symbol, rate })}
        issues={quality.issues}
        vol={metrics.vol}
        shp={metrics.shp}
        dd={metrics.dd}
        var95={metrics.var95}
        regime={regime}
        hurstVal={hurstVal}
      />

      {visible && visible.size === 0 && (
        <NoticeBox title="No tabs selected">
          Pick one or more tabs in the sidebar to display.
        </NoticeBox>
      )}

      {tabs.length > 0 && (
        <div
          role="tablist"
          aria-label="Quant sections"
          className="flex flex-wrap border-b border-bloomberg-border"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === activeId}
              onClick={() => setActive(t.id)}
              className={`px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase ${
                t.id === activeId
                  ? 'bg-bloomberg-orange text-black'
                  : 'text-bloomberg-muted hover:bg-bloomberg-surface hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {show('volatility') && (
        <SectionBlock title="Volatility" hidden={activeId !== 'volatility'}>
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

      {show('risk') && (
        <SectionBlock title="Risk" hidden={activeId !== 'risk'}>
          <RiskSection
            ccy={ccy}
            rfPct={rf * 100}
            benchLabel={benchmarkInfo.label}
            benchAvailable={benchmark.available}
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

      {show('distribution') && (
        <SectionBlock title="Distribution" hidden={activeId !== 'distribution'}>
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

      {show('stochastic') && (
        <SectionBlock title="Stochastic" hidden={activeId !== 'stochastic'}>
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

      {show('backtest') && (
        <SectionBlock title="Backtest" hidden={activeId !== 'backtest'}>
          <BacktestSection
            strategy={strategy}
            onStrategyChange={setStrategy}
            params={btEffective}
            onParamChange={(k, v) => setBtParams((prev) => ({ ...prev, [k]: v }))}
            result={backtestResult}
            dates={historyDates}
          />
        </SectionBlock>
      )}

      {show('sizing') && (
        <SectionBlock title="Sizing" hidden={activeId !== 'sizing'}>
          <SizingSection
            kelly={metrics.kelly}
            volWeight={volWeight}
            vol={metrics.vol}
            regime={regime}
            hurstVal={hurstVal}
            ouHL={ouHL}
          />
        </SectionBlock>
      )}

      {show('correlation') && (
        <SectionBlock title="Correlation" hidden={activeId !== 'correlation'}>
          <CorrelationSection
            peerInput={peerInput}
            onPeerInputChange={setPeerInput}
            onAddPeers={addPeers}
            peers={peers}
            onRemovePeer={removePeer}
            loading={peerLoading}
            symbols={corr.symbols}
            matrix={corr.matrix}
            rollPoints={corr.rollPoints}
            rollLabel={corr.rollLabel}
            frontier={corr.frontier}
            gmv={corr.gmv}
            tangency={corr.tangency}
            gmvWeights={corr.gmvW}
            tangencyWeights={corr.tanW}
            optimizerStatus={corr.optimizerStatus}
          />
        </SectionBlock>
      )}

      {show('options') && (
        <SectionBlock title="Options" hidden={activeId !== 'options'}>
          <OptionsSection
            spot={closes.at(-1)}
            defaultVol={metrics.vol}
            defaultRate={rf}
            ccy={ccy}
          />
        </SectionBlock>
      )}

      {show('valuation') && (
        <SectionBlock title="Valuation" hidden={activeId !== 'valuation'}>
          <ValuationSection
            key={baseSymbol}
            spot={closes.at(-1)}
            defaultRate={rf}
            ccy={ccy}
            symbol={baseSymbol}
            overview={overview}
            overviewError={overviewError}
          />
        </SectionBlock>
      )}

      {show('scenario') && (
        <SectionBlock title="Scenario" hidden={activeId !== 'scenario'}>
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
  sections: PropTypes.arrayOf(PropTypes.string),
  range: PropTypes.string,
};

export default memo(QuantPanel);
