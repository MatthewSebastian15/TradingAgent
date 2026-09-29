import { Download } from 'lucide-react';
import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';

import NoticeBox from '../../../NoticeBox';
import {
  capmWacc,
  dcf,
  dcfInputsReady,
  dcfMonteCarlo,
  impliedGrowth,
  overviewToDcfInputs,
  peerMultiples,
  reportingCurrencyMismatch,
  returnHistogram,
} from '../../quantUtils';
import { AdvancedPanel } from '../AdvancedPanel';
import { MetricCard, NumberField } from '../charts';
import { DASH, finite, fmtNum2, fmtPercent, fmtSignedPct, signedTone } from '../format';
import { CARD_GRID, FIELD_GRID } from '../layout';
import { ProOnly } from '../mode';
import { fmtMoney, fmtMoneyCompact } from '../numberFormat';
import { clearPreset, loadPreset, savePreset } from '../presets';
import { useDebouncedValue } from '../useDebouncedValue';
import { usePeerOverviews } from '../usePeerOverviews';
import { validateDcf } from '../validation';
import { CHART_COLORS } from '../viz/chartTheme';
import { DataTable } from '../viz/DataTable';
import { Heatmap } from '../viz/Heatmap';
import { HistogramChart } from '../viz/HistogramChart';

const TERMINAL_WARN = 0.75;

export function ValuationSection({
  spot,
  defaultRate,
  ccy,
  symbol,
  overview,
  overviewError,
  beta,
  peerSymbols,
}) {
  const [preset] = useState(() => loadPreset('dcf', symbol) || {});
  const [growthSource, setGrowthSource] = useState(preset.growthSource ?? 'revenue');
  const [fcf, setFcf] = useState('');
  const [growth, setGrowth] = useState(8);
  const [years, setYears] = useState(preset.years ?? 5);
  const [fadeYears, setFadeYears] = useState(preset.fadeYears ?? 3);
  const [midYear, setMidYear] = useState(preset.midYear ?? true);
  const [terminalGrowth, setTerminalGrowth] = useState(preset.terminalGrowth ?? 2.5);
  const [shares, setShares] = useState('');
  const [netDebt, setNetDebt] = useState(0);
  const [fxRate, setFxRate] = useState('');
  const [useCapm, setUseCapm] = useState(preset.useCapm ?? true);
  const [waccManual, setWaccManual] = useState(
    preset.waccManual ?? Number(Math.max(8, defaultRate * 100 + 5).toFixed(1))
  );
  const [erp, setErp] = useState(preset.erp ?? 5);
  const [costOfDebt, setCostOfDebt] = useState(
    preset.costOfDebt ?? Number((defaultRate * 100 + 2).toFixed(1))
  );
  const [taxRate, setTaxRate] = useState(preset.taxRate ?? 22);
  const [showMC, setShowMC] = useState(false);
  const [editedFields, setEditedFields] = useState(() => new Set());
  const [auto, setAuto] = useState({});

  useEffect(() => {
    savePreset('dcf', symbol, {
      growthSource,
      years,
      fadeYears,
      terminalGrowth,
      midYear,
      useCapm,
      waccManual,
      erp,
      costOfDebt,
      taxRate,
    });
  }, [
    symbol,
    growthSource,
    years,
    fadeYears,
    terminalGrowth,
    midYear,
    useCapm,
    waccManual,
    erp,
    costOfDebt,
    taxRate,
  ]);

  const clearSaved = () => {
    clearPreset('dcf', symbol);
    setGrowthSource('revenue');
    setYears(5);
    setFadeYears(3);
    setMidYear(true);
    setTerminalGrowth(2.5);
    setUseCapm(true);
    setWaccManual(Number(Math.max(8, defaultRate * 100 + 5).toFixed(1)));
    setErp(5);
    setCostOfDebt(Number((defaultRate * 100 + 2).toFixed(1)));
    setTaxRate(22);
  };

  const mismatch = reportingCurrencyMismatch(overview, ccy);
  const edit = (field, setter) => (value) => {
    setEditedFields((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
    setter(value);
  };
  const applyInputs = (next) => {
    if (next.fcf !== undefined) setFcf(next.fcf);
    if (next.shares !== undefined) setShares(next.shares);
    if (next.netDebt !== undefined) setNetDebt(next.netDebt);
    if (next.growth !== undefined) setGrowth(next.growth);
    setAuto(next);
  };
  const setters = { fcf: setFcf, shares: setShares, netDebt: setNetDebt, growth: setGrowth };
  // Badge while the value still equals the fundamentals value; reset once edited.
  const source = (key, value) => {
    if (auto[key] === undefined) return {};
    return value !== '' && Number(value) === auto[key]
      ? { badge: 'Fundamentals' }
      : { onReset: () => setters[key](auto[key]) };
  };
  const autoFill = () => {
    if (overview)
      applyInputs(overviewToDcfInputs(overview, { growthSource, fxRate, tradingCurrency: ccy }));
  };

  useEffect(() => {
    if (!overview) return;
    const next = overviewToDcfInputs(overview, { growthSource, tradingCurrency: ccy });
    if (next.fcf !== undefined && !editedFields.has('fcf')) setFcf(next.fcf);
    if (next.shares !== undefined && !editedFields.has('shares')) setShares(next.shares);
    if (next.netDebt !== undefined && !editedFields.has('netDebt')) setNetDebt(next.netDebt);
    if (next.growth !== undefined && !editedFields.has('growth')) setGrowth(next.growth);
    setAuto(next);
  }, [overview, ccy, growthSource, editedFields]);

  const betaUsed = finite(beta) ? beta : finite(overview?.beta) ? overview.beta : null;
  const fx = mismatch ? Number(fxRate) : 1;
  const capm =
    betaUsed === null
      ? null
      : capmWacc({
          rf: defaultRate,
          beta: betaUsed,
          erp: Number(erp) / 100,
          costOfDebt: Number(costOfDebt) / 100,
          taxRate: Number(taxRate) / 100,
          marketCap: overview?.market_cap,
          totalDebt: fx > 0 && finite(overview?.total_debt) ? overview.total_debt * fx : undefined,
        });
  const waccPct = useCapm && capm ? capm.wacc * 100 : Number(waccManual);
  const manualWacc = !(useCapm && capm);
  const errors = validateDcf({
    fcf,
    growth,
    years,
    fadeYears,
    terminalGrowth,
    shares,
    waccPct,
    manualWacc,
    requireInputs: Boolean(overview || overviewError),
  });
  const hasErrors = Object.keys(errors).length > 0;

  const ready = dcfInputsReady({ fcf, shares });
  const base = {
    fcf: Number(fcf),
    growth: Number(growth) / 100,
    years: Number(years),
    fadeYears: Number(fadeYears),
    wacc: waccPct / 100,
    terminalGrowth: Number(terminalGrowth) / 100,
    shares: Number(shares),
    netDebt: Number(netDebt),
    midYear,
  };
  // Debounce the heavy DCF/Monte Carlo math so typing stays instant; base's fields
  // (incl. CAPM-derived waccPct) settle 150ms after the user stops changing them.
  const baseKey = JSON.stringify(base);
  const settledKey = useDebouncedValue(baseKey);

  const result = useMemo(() => {
    if (!ready) return null;
    return dcf(JSON.parse(settledKey));
  }, [ready, settledKey]);

  const implied = useMemo(() => {
    if (!result) return null;
    return impliedGrowth(JSON.parse(settledKey), spot);
  }, [result, settledKey, spot]);
  const upside = result && spot > 0 ? (result.fairValuePerShare / spot - 1) * 100 : null;

  const mc = useMemo(() => {
    if (!showMC || !ready) return null;
    const settled = JSON.parse(settledKey);
    const g = settled.growth;
    const w = settled.wacc;
    const tg = settled.terminalGrowth;
    return dcfMonteCarlo(
      {
        fcf: settled.fcf,
        years: settled.years,
        fadeYears: settled.fadeYears,
        shares: settled.shares,
        netDebt: settled.netDebt,
        midYear: settled.midYear,
      },
      {
        growth: [g - 0.03, g + 0.03],
        wacc: [w - 0.015, w + 0.015],
        terminalGrowth: [tg - 0.005, tg + 0.005],
      },
      2000,
      42
    );
  }, [showMC, ready, settledKey]);

  const waccAxis = [-2, -1, 0, 1, 2].map((d) => waccPct + d);
  const tgAxis = [-1, -0.5, 0, 0.5, 1].map((d) => Number(terminalGrowth) + d);
  const grid = useMemo(
    () =>
      result
        ? waccAxis.map((w) =>
            tgAxis.map(
              (tg) =>
                dcf({ ...JSON.parse(settledKey), wacc: w / 100, terminalGrowth: tg / 100 })
                  ?.fairValuePerShare ?? null
            )
          )
        : [],
    [result, settledKey, waccAxis, tgAxis]
  );

  const peerOverviews = usePeerOverviews(peerSymbols);
  const multiples = overview ? peerMultiples(overview, peerOverviews) : [];
  const peerCount = peerOverviews.length;
  const money = (v) => fmtMoney(v, ccy);

  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        Discounted cash flow: {years} years at {growth}% growth, {fadeYears} fade years toward{' '}
        {terminalGrowth}%, then a Gordon terminal value. FCF, shares and net debt are in millions.
        Research only — not advice.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={autoFill}
          disabled={!overview}
          className="rounded-none border border-bloomberg-orange bg-bloomberg-orange-dim px-3 py-1 text-[11px] tracking-wide text-bloomberg-orange uppercase hover:bg-bloomberg-orange hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="inline-flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Auto-fill from fundamentals
          </span>
        </button>
        <span className="text-[11px] text-bloomberg-white/80">
          {overviewError
            ? 'Fundamentals unavailable — enter inputs manually.'
            : !overview
              ? 'Loading fundamentals…'
              : `From ${symbol} fundamentals (yfinance). Every field stays editable.`}
        </span>
      </div>

      {mismatch && (
        <NoticeBox title="Reporting currency differs">
          {symbol} reports fundamentals in {overview.financial_currency} but trades in {ccy}. Enter
          how many {ccy} one {overview.financial_currency} buys, then auto-fill; FCF and net debt
          are not filled until then.
          <div className="mt-2">
            <NumberField
              label="FX rate"
              value={fxRate}
              onChange={setFxRate}
              suffix={`${ccy} per ${overview.financial_currency}`}
            />
          </div>
        </NoticeBox>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <fieldset className="space-y-2 border border-bloomberg-border p-3">
          <legend className="px-1 text-[11px] tracking-wider text-bloomberg-orange uppercase">
            Cash flows
          </legend>
          <div className={FIELD_GRID}>
            <NumberField
              label="Base FCF"
              value={fcf}
              onChange={edit('fcf', setFcf)}
              suffix="M"
              error={errors.fcf}
              {...source('fcf', fcf)}
            />
            <NumberField
              label="FCF growth"
              value={growth}
              onChange={edit('growth', setGrowth)}
              suffix="%"
              error={errors.growth}
              {...source('growth', growth)}
            />
            <NumberField
              label="Years"
              value={years}
              onChange={edit('years', setYears)}
              step="1"
              error={errors.years}
            />
            <NumberField
              label="Fade years"
              value={fadeYears}
              onChange={edit('fadeYears', setFadeYears)}
              step="1"
              error={errors.fadeYears}
            />
            <NumberField
              label="Terminal growth"
              value={terminalGrowth}
              onChange={edit('terminalGrowth', setTerminalGrowth)}
              suffix="%"
              error={errors.terminalGrowth}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-2 border border-bloomberg-border p-3">
          <legend className="px-1 text-[11px] tracking-wider text-bloomberg-orange uppercase">
            Discount rate
          </legend>
          <label className="flex items-center gap-2 text-[11px] text-bloomberg-white/80">
            <input
              type="checkbox"
              checked={useCapm && !!capm}
              disabled={!capm}
              onChange={(e) => setUseCapm(e.target.checked)}
              className="accent-bloomberg-orange"
            />
            CAPM WACC {capm ? `(β = ${fmtNum2(betaUsed)})` : '(needs beta)'}
          </label>
          <div className={FIELD_GRID}>
            {useCapm && capm ? (
              <>
                <NumberField label="Equity risk premium" value={erp} onChange={setErp} suffix="%" />
                <NumberField
                  label="Pre-tax cost of debt"
                  value={costOfDebt}
                  onChange={setCostOfDebt}
                  suffix="%"
                />
                <NumberField label="Tax rate" value={taxRate} onChange={setTaxRate} suffix="%" />
              </>
            ) : (
              <NumberField
                label="WACC"
                value={waccManual}
                onChange={edit('waccManual', setWaccManual)}
                suffix="%"
                error={errors.wacc}
              />
            )}
          </div>
          <ProOnly>
            {useCapm && capm && (
              <DataTable
                rowKey={(r) => r.label}
                rows={[
                  { label: 'Cost of equity (CAPM)', value: fmtPercent(capm.costOfEquity * 100) },
                  {
                    label: 'After-tax cost of debt',
                    value: finite(capm.afterTaxCostOfDebt)
                      ? fmtPercent(capm.afterTaxCostOfDebt * 100)
                      : DASH,
                  },
                  {
                    label: 'Equity / debt weight',
                    value: `${fmtPercent(capm.equityWeight * 100)} / ${fmtPercent(capm.debtWeight * 100)}`,
                  },
                  { label: 'WACC', value: fmtPercent(capm.wacc * 100) },
                ]}
                columns={[
                  { key: 'label', label: 'Component' },
                  { key: 'value', label: 'Value', align: 'right' },
                ]}
              />
            )}
          </ProOnly>
        </fieldset>

        <fieldset className="space-y-2 border border-bloomberg-border p-3">
          <legend className="px-1 text-[11px] tracking-wider text-bloomberg-orange uppercase">
            Balance sheet
          </legend>
          <div className={FIELD_GRID}>
            <NumberField
              label="Shares out"
              value={shares}
              onChange={edit('shares', setShares)}
              suffix="M"
              error={errors.shares}
              {...source('shares', shares)}
            />
            <NumberField
              label="Net debt"
              value={netDebt}
              onChange={edit('netDebt', setNetDebt)}
              suffix="M"
              {...source('netDebt', netDebt)}
            />
          </div>
        </fieldset>
      </div>

      <AdvancedPanel>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 font-mono text-[11px] text-bloomberg-white/80">
            Growth source
            <select
              value={growthSource}
              onChange={(e) => setGrowthSource(e.target.value)}
              className="h-7 rounded-none border border-bloomberg-border bg-black px-2 text-xs text-white"
            >
              <option value="revenue">Revenue growth</option>
              <option value="earnings">Earnings growth</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-bloomberg-white/80">
            <input
              type="checkbox"
              checked={midYear}
              onChange={(e) => setMidYear(e.target.checked)}
              className="accent-bloomberg-orange"
            />
            Mid-year discounting
          </label>
          <button
            type="button"
            onClick={clearSaved}
            className="rounded-none border border-bloomberg-border px-2 py-1 text-[11px] text-bloomberg-white/80 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange"
          >
            Clear saved inputs
          </button>
        </div>
      </AdvancedPanel>

      {!ready || hasErrors ? (
        <p role="status" className="text-[11px] text-bloomberg-white/80">
          {overview || overviewError
            ? 'Fix the highlighted fields to see a valuation.'
            : 'Waiting for fundamentals — or enter base FCF and shares outstanding manually.'}
        </p>
      ) : !result ? (
        <NoticeBox title="Check inputs">
          WACC must exceed terminal growth and shares must be positive.
        </NoticeBox>
      ) : (
        <>
          <div className={CARD_GRID}>
            <MetricCard
              label="Fair Value / Share"
              value={money(result.fairValuePerShare)}
              gloss="What the cash-flow model says one share is worth under these assumptions."
              formula="(Σ PV of FCF + PV of terminal value − net debt) ÷ shares."
            />
            <MetricCard
              label="Upside vs Spot"
              value={finite(upside) ? fmtSignedPct(upside) : DASH}
              tone={signedTone(upside)}
              gloss={`Today: ${money(spot)}.`}
            />
            <MetricCard
              label="Equity Value"
              value={fmtMoneyCompact(result.equityValue * 1e6, ccy)}
            />
            <MetricCard
              label="Enterprise Value"
              value={fmtMoneyCompact(result.enterpriseValue * 1e6, ccy)}
            />
            <MetricCard
              label="Terminal value share"
              value={fmtPercent(result.terminalShare * 100)}
              tone={result.terminalShare > TERMINAL_WARN ? 'bad' : 'neutral'}
              gloss="Share of enterprise value from beyond the forecast."
            />
            <MetricCard
              label="Implied growth (reverse DCF)"
              value={finite(implied) ? fmtPercent(implied * 100) : DASH}
              gloss="Stage-1 growth today's price already assumes."
            />
          </div>
          {result.terminalShare > TERMINAL_WARN && (
            <NoticeBox title="Terminal value dominates">
              {fmtPercent(result.terminalShare * 100)} of the value comes after the forecast
              horizon, so the result mostly reflects the terminal growth and WACC guesses. Lengthen
              the forecast or stress those inputs.
            </NoticeBox>
          )}

          <ProOnly>
            <DataTable
              caption="Projected cash flows"
              rowKey={(r) => String(r.year)}
              rows={result.flows}
              maxHeightClass="max-h-72"
              columns={[
                { key: 'year', label: 'Year', align: 'right' },
                {
                  key: 'growth',
                  label: 'Growth',
                  align: 'right',
                  render: (r) => fmtPercent(r.growth * 100),
                },
                {
                  key: 'fcf',
                  label: 'FCF',
                  align: 'right',
                  render: (r) => fmtMoneyCompact(r.fcf * 1e6, ccy),
                },
                {
                  key: 'pv',
                  label: 'Present value',
                  align: 'right',
                  render: (r) => fmtMoneyCompact(r.pv * 1e6, ccy),
                },
              ]}
            />

            <Heatmap
              caption="Sensitivity · fair value per share"
              rowHeader="WACC / g"
              rowLabels={waccAxis.map((w) => `${w.toFixed(1)}%`)}
              colLabels={tgAxis.map((g) => `${g.toFixed(1)}%`)}
              values={grid}
              formatValue={(v) => (v == null ? DASH : `${money(v)} ${v >= spot ? '▲' : '▼'}`)}
              colorFor={(v) =>
                v == null
                  ? 'transparent'
                  : v >= spot
                    ? 'rgba(34,197,94,0.16)'
                    : 'rgba(239,68,68,0.16)'
              }
              textColorFor={() => '#e5e5e5'}
              highlight={{ row: 2, col: 2 }}
            />

            <div className="space-y-2">
              <button
                type="button"
                aria-pressed={showMC}
                onClick={() => setShowMC((v) => !v)}
                className={`rounded-none border px-3 py-1 text-[11px] tracking-wide uppercase ${
                  showMC
                    ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                    : 'border-bloomberg-border text-bloomberg-white/80 hover:text-white'
                }`}
              >
                Monte Carlo (growth ±3% · WACC ±1.5% · terminal ±0.5%)
              </button>
              {showMC && mc && (
                <>
                  <div className={CARD_GRID}>
                    <MetricCard label="Fair Value P10" value={money(mc.p10)} tone="bad" />
                    <MetricCard label="Fair Value P50" value={money(mc.p50)} />
                    <MetricCard label="Fair Value P90" value={money(mc.p90)} tone="good" />
                    <MetricCard
                      label="P(fair value > spot)"
                      value={fmtPercent(
                        (mc.values.filter((v) => v > spot).length / mc.values.length) * 100
                      )}
                    />
                  </div>
                  <HistogramChart
                    title="DCF fair value across sampled assumptions"
                    ariaLabel="Distribution of DCF fair value across sampled assumptions"
                    bins={returnHistogram(mc.values, 30)}
                    formatX={money}
                    barLabel="Draws"
                    markers={[{ x: spot, label: 'Today', color: CHART_COLORS.secondary }]}
                  />
                </>
              )}
              {showMC && !mc && (
                <NoticeBox title="Monte Carlo">
                  No valid draws — keep WACC above terminal growth.
                </NoticeBox>
              )}
            </div>
          </ProOnly>
        </>
      )}

      <ProOnly>
        {overview && (
          <DataTable
            caption={`Market multiples · ${symbol}`}
            rowKey={(r) => r.key}
            rows={multiples}
            emptyMessage="No multiples available."
            columns={[
              { key: 'label', label: 'Multiple' },
              {
                key: 'company',
                label: symbol || 'Company',
                align: 'right',
                render: (r) => fmtNum2(r.company),
              },
              {
                key: 'peerMedian',
                label: 'Peer median',
                align: 'right',
                render: (r) =>
                  `${fmtNum2(r.peerMedian)}${r.peerCount !== peerCount ? ` (n=${r.peerCount})` : ''}`,
              },
              {
                key: 'premiumPct',
                label: 'Premium / discount',
                align: 'right',
                render: (r) => (finite(r.premiumPct) ? fmtSignedPct(r.premiumPct) : DASH),
              },
            ]}
          />
        )}
        {overview && peerSymbols.length === 0 && (
          <p className="text-[11px] text-bloomberg-white/80">
            Add peers in the Correlation tab to compare multiples with peer medians.
          </p>
        )}
      </ProOnly>
    </div>
  );
}

ValuationSection.propTypes = {
  spot: PropTypes.number.isRequired,
  defaultRate: PropTypes.number.isRequired,
  ccy: PropTypes.string,
  symbol: PropTypes.string,
  overview: PropTypes.object,
  overviewError: PropTypes.string,
  beta: PropTypes.number,
  peerSymbols: PropTypes.arrayOf(PropTypes.string).isRequired,
};
