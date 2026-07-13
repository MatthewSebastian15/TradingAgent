import PropTypes from 'prop-types';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { getApiStatus, getMarketOhlcv } from '../../../api/market';
import NoticeBox from '../NoticeBox';
import { SectionBlock, SkeletonGrid } from './quant/charts';
import {
  MC_DAYS,
  MC_PATHS,
  QUANT_RANGE,
  ROLLING_RATIO_WINDOW,
  ROLLING_WINDOW,
  TABS,
  TRADING_DAYS,
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
import {
  alignByDate,
  alignManyByDate,
  alpha,
  annualizedVol,
  backtest,
  benchmarkForSymbol,
  beta,
  bootstrapMC,
  calmar,
  cornishFisherVaR,
  correlationMatrix,
  covarianceMatrix,
  cvar,
  downsideDeviation,
  drawdownSeries,
  drawdownStats,
  efficientFrontier,
  ewmaSigmaDaily,
  ewmaVol,
  gmvWeights,
  historicalVaR,
  hurst,
  kellyFraction,
  kurtosis,
  logReturns,
  maxDrawdown,
  mean,
  monteCarloGBM,
  parametricVaR,
  portfolioStats,
  regimeShifts,
  returnHistogram,
  rollingBeta,
  rollingCorrelation,
  rollingSharpe,
  rollingVol,
  sharpe,
  simpleReturns,
  skewness,
  sortino,
  stdDev,
  tangencyWeights,
  volPercentile,
  volTargetWeight,
} from './quantUtils';

function QuantPanel({ points, currency, symbol, sections }) {
  // sections: array of visible tab ids from the page sidebar. Undefined = show all
  // (keeps QuantPanel usable standalone without importing the tab list).
  const visible = useMemo(() => (sections ? new Set(sections) : null), [sections]);
  const show = (id) => !visible || visible.has(id);
  const tabs = TABS.filter((t) => show(t.id));
  const [active, setActive] = useState(TABS[0].id);
  // Fall back to the first available tab when the active one gets deselected.
  const activeId = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;
  const [seed, setSeed] = useState(42);
  const [rf, setRf] = useState(0); // annual risk-free rate as a fraction
  const [benchPoints, setBenchPoints] = useState(null); // null = loading, [] = unavailable
  const [mcHorizon, setMcHorizon] = useState(MC_DAYS);
  const [mcMethod, setMcMethod] = useState('gbm'); // 'gbm' | 'bootstrap'
  const [mcDrift, setMcDrift] = useState('historical'); // 'historical' | 'riskneutral'
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

  // Fetch a longer history than the 1Y analysis chart; fall back to the prop on failure.
  const [longPoints, setLongPoints] = useState(null);
  useEffect(() => {
    if (!symbol) return undefined;
    let alive = true;
    const controller = new AbortController();
    setLongPoints(null);
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
  }, [symbol]);

  const history = longPoints && longPoints.length > points.length ? longPoints : points;
  const closes = useMemo(() => history.map((p) => p.adjusted_close ?? p.close), [history]);
  const ccy = currency || '';
  const rfDaily = rf / TRADING_DAYS;
  const benchmarkInfo = useMemo(() => benchmarkForSymbol(symbol), [symbol]);

  // Pull the risk-free rate (config) once on mount. Fails soft → rf stays 0.
  useEffect(() => {
    const controller = new AbortController();
    getApiStatus({ signal: controller.signal })
      .then((s) => {
        if (Number.isFinite(s?.quant_risk_free_rate)) setRf(s.quant_risk_free_rate);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Fetch the market-matched benchmark series; refetch when the ticker's market
  // changes. Fails soft → benchPoints = [] and beta/alpha render as —.
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setBenchPoints(null);
    getMarketOhlcv(benchmarkInfo.symbol, { range: QUANT_RANGE, signal: controller.signal })
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
  }, [benchmarkInfo.symbol]);

  const returns = useMemo(() => simpleReturns(closes), [closes]);
  const logRet = useMemo(() => logReturns(closes), [closes]);
  const rollingVols = useMemo(() => rollingVol(closes, ROLLING_WINDOW), [closes]);

  const rollingPoints = useMemo(
    () =>
      rollingVols
        .map((value, m) => ({ date: String(history[ROLLING_WINDOW + m]?.date || ''), value }))
        .filter((p) => p.date),
    [rollingVols, history]
  );

  const metrics = useMemo(
    () => ({
      vol: annualizedVol(closes),
      ewma: ewmaVol(closes),
      dd: maxDrawdown(closes),
      cal: calmar(closes),
      histVaR: historicalVaR(returns),
      // ponytail: one card — EWMA VaR replaces the flat-stdev number outright.
      paramVaR: parametricVaR(returns, 0.95, ewmaSigmaDaily(returns)),
      cfVaR: cornishFisherVaR(returns),
      cv: cvar(returns),
      downDev: downsideDeviation(returns),
      shp: sharpe(returns, rfDaily),
      srt: sortino(returns, rfDaily),
      skew: skewness(returns),
      kurt: kurtosis(returns),
      var95: historicalVaR(returns, 0.95),
      var99: historicalVaR(returns, 0.99),
      kelly: kellyFraction(returns),
    }),
    [closes, returns, rfDaily]
  );

  // Regime (vol percentile) + Hurst (trend vs mean-revert) for the headline + sizing.
  const regime = useMemo(() => regimeLabel(volPercentile(rollingVols)), [rollingVols]);
  const hurstVal = useMemo(() => hurst(returns), [returns]);
  const ddStats = useMemo(() => drawdownStats(closes), [closes]);
  const regimeShift = useMemo(() => regimeShifts(rollingVols), [rollingVols]);

  // Underwater curve, zipped to dates (drops the first point — no prior peak).
  const ddPoints = useMemo(
    () =>
      drawdownSeries(closes)
        .map((value, i) => ({ date: String(history[i]?.date || ''), value }))
        .filter((p) => p.date),
    [closes, history]
  );

  // Rolling Sharpe zipped to dates (window offset + 1 for the returns→price shift).
  const rsPoints = useMemo(
    () =>
      rollingSharpe(returns, ROLLING_RATIO_WINDOW, rfDaily)
        .map((value, m) => ({ date: String(history[ROLLING_RATIO_WINDOW + m]?.date || ''), value }))
        .filter((p) => p.date && Number.isFinite(p.value)),
    [returns, history, rfDaily]
  );

  // Benchmark-relative metrics + rolling beta from the aligned benchmark series.
  const benchmark = useMemo(() => {
    if (!benchPoints || benchPoints.length === 0)
      return { beta: null, alpha: null, available: false, rollBeta: [] };
    const { stock, market } = alignByDate(history, benchPoints);
    if (stock.length < 3) return { beta: null, alpha: null, available: false, rollBeta: [] };
    const sr = simpleReturns(stock);
    const mr = simpleReturns(market);
    return {
      beta: beta(sr, mr),
      alpha: alpha(sr, mr, rfDaily),
      available: true,
      rollBeta: rollingBeta(sr, mr, ROLLING_RATIO_WINDOW),
    };
  }, [history, benchPoints, rfDaily]);

  // Rolling beta has no clean date axis (aligned days differ), so index it.
  const rbPoints = useMemo(
    () =>
      benchmark.rollBeta
        .map((value, i) => ({ date: String(i + 1), value }))
        .filter((p) => Number.isFinite(p.value)),
    [benchmark.rollBeta]
  );

  // Only run the simulation when the section is open and there's enough data;
  // keyed so unrelated re-renders (e.g. streaming updates) don't re-roll it.
  const sim = useMemo(() => {
    if ((visible && !visible.has('stochastic')) || closes.length < 30) return null;
    const spot = closes.at(-1);
    if (mcMethod === 'bootstrap') {
      return bootstrapMC(spot, returns, mcHorizon, MC_PATHS, seed);
    }
    // Risk-neutral drift uses the risk-free rate instead of the historical mean,
    // removing the optimistic bias when the sample window was a bull run.
    const drift = mcDrift === 'riskneutral' ? rfDaily : mean(logRet);
    return monteCarloGBM(spot, drift, ewmaSigmaDaily(logRet), mcHorizon, MC_PATHS, seed);
  }, [visible, closes, logRet, returns, seed, mcHorizon, mcMethod, mcDrift, rfDaily]);

  const horizonLabel = useMemo(() => {
    const months = Math.round((mcHorizon / TRADING_DAYS) * 12);
    return months >= 12 ? `~${Math.round(months / 12)}y` : `~${months}mo`;
  }, [mcHorizon]);

  const backtestResult = useMemo(() => {
    if (visible && !visible.has('backtest')) return null;
    return backtest(closes, strategy, btParams, rfDaily);
  }, [visible, closes, strategy, btParams, rfDaily]);

  const returnBins = useMemo(() => returnHistogram(returns, 30), [returns]);
  const volWeight = useMemo(() => volTargetWeight(metrics.vol, VOL_TARGET), [metrics.vol]);

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
    setPeerLoading(true);
    Promise.allSettled(
      wanted.map((sym) =>
        getMarketOhlcv(sym, { range: QUANT_RANGE }).then((res) => ({
          symbol: sym,
          points: Array.isArray(res?.points) ? res.points : [],
        }))
      )
    )
      .then((results) => {
        const fetched = results
          .filter((r) => r.status === 'fulfilled' && r.value.points.length > 0)
          .map((r) => r.value);
        setPeers((prev) => {
          const have = new Set(prev.map((p) => p.symbol));
          return [...prev, ...fetched.filter((p) => !have.has(p.symbol))];
        });
        setPeerInput('');
      })
      .finally(() => setPeerLoading(false));
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
      rollPoints: [],
      rollLabel: '',
    };
    if (peers.length === 0 || (visible && !visible.has('correlation'))) return empty;
    const series = [{ symbol: baseSymbol, points: history }, ...peers];
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
    const frontier = efficientFrontier(cov, mu, rfDaily);
    const annualize = (w) => {
      if (!w) return null;
      const { ret, vol } = portfolioStats(w, mu, cov);
      return { ret: ret * TRADING_DAYS * 100, vol: vol * Math.sqrt(TRADING_DAYS) * 100 };
    };
    // Rolling correlation: base vs the first peer.
    const peerSym = symbols[1];
    const roll = rollingCorrelation(retBySym[baseSymbol], retBySym[peerSym], ROLLING_RATIO_WINDOW);
    const rollPoints = roll
      .map((value, i) => ({ date: String(dates[ROLLING_RATIO_WINDOW + 1 + i] || ''), value }))
      .filter((p) => p.date && Number.isFinite(p.value));
    return {
      symbols,
      matrix,
      frontier,
      gmv: annualize(gmvW),
      tangency: annualize(tanW),
      gmvW,
      tanW,
      rollPoints,
      rollLabel: `${baseSymbol} vs ${peerSym}`,
    };
  }, [peers, visible, baseSymbol, history, rfDaily]);

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

  return (
    <div className="space-y-4 p-4 font-mono">
      <HeadlineStrip
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
            rollingVols={rollingVols}
            rollingPoints={rollingPoints}
          />
        </SectionBlock>
      )}

      {show('risk') && (
        <SectionBlock title="Risk" hidden={activeId !== 'risk'}>
          <RiskSection
            dd={metrics.dd}
            cal={metrics.cal}
            histVaR={metrics.histVaR}
            paramVaR={metrics.paramVaR}
            cfVaR={metrics.cfVaR}
            cv={metrics.cv}
            downDev={metrics.downDev}
            shp={metrics.shp}
            srt={metrics.srt}
            bta={benchmark.beta}
            alf={benchmark.alpha}
            rfPct={rf * 100}
            benchAvailable={benchmark.available}
            benchLabel={benchmarkInfo.label}
            ddPoints={ddPoints}
            rsPoints={rsPoints}
            rbPoints={rbPoints}
            ddStats={ddStats}
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
            bins={returnBins}
            mu={mean(returns)}
            sigma={stdDev(returns)}
          />
        </SectionBlock>
      )}

      {show('stochastic') && (
        <SectionBlock title="Stochastic" hidden={activeId !== 'stochastic'}>
          <StochasticSection
            sim={sim}
            spot={closes.at(-1)}
            ccy={ccy}
            seed={seed}
            onReroll={() => setSeed((s) => (s + 1) >>> 0)}
            onSeedChange={(v) => setSeed(Number.isFinite(v) ? v : 0)}
            returnBins={returnBins}
            horizon={mcHorizon}
            onHorizonChange={setMcHorizon}
            horizonLabel={horizonLabel}
            method={mcMethod}
            onMethodChange={setMcMethod}
            drift={mcDrift}
            onDriftChange={setMcDrift}
          />
        </SectionBlock>
      )}

      {show('backtest') && (
        <SectionBlock title="Backtest" hidden={activeId !== 'backtest'}>
          <BacktestSection
            strategy={strategy}
            onStrategyChange={setStrategy}
            params={btParams}
            onParamChange={(k, v) => setBtParams((prev) => ({ ...prev, [k]: v }))}
            result={backtestResult}
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
          <ValuationSection spot={closes.at(-1)} defaultRate={rf} ccy={ccy} symbol={baseSymbol} />
        </SectionBlock>
      )}

      {show('scenario') && (
        <SectionBlock title="Scenario" hidden={activeId !== 'scenario'}>
          <ScenarioSection spot={closes.at(-1)} vol={metrics.vol} ccy={ccy} regime={regimeShift} />
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
};

export default memo(QuantPanel);
