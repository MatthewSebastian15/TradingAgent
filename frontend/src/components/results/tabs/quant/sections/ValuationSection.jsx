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
import { MetricCard, NumberField } from '../charts';
import { DASH, finite, fmtNum2, fmtPercent, fmtSignedPct, signedTone } from '../format';
import { fmtMoney, fmtMoneyCompact } from '../numberFormat';
import { usePeerOverviews } from '../usePeerOverviews';
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
  const [growthSource, setGrowthSource] = useState('revenue');
  const [fcf, setFcf] = useState('');
  const [growth, setGrowth] = useState(8);
  const [years, setYears] = useState(5);
  const [fadeYears, setFadeYears] = useState(3);
  const [midYear, setMidYear] = useState(true);
  const [terminalGrowth, setTerminalGrowth] = useState(2.5);
  const [shares, setShares] = useState('');
  const [netDebt, setNetDebt] = useState(0);
  const [fxRate, setFxRate] = useState('');
  const [useCapm, setUseCapm] = useState(true);
  const [waccManual, setWaccManual] = useState(
    Number(Math.max(8, defaultRate * 100 + 5).toFixed(1))
  );
  const [erp, setErp] = useState(5);
  const [costOfDebt, setCostOfDebt] = useState(Number((defaultRate * 100 + 2).toFixed(1)));
  const [taxRate, setTaxRate] = useState(22);
  const [showMC, setShowMC] = useState(false);
  const [editedFields, setEditedFields] = useState(() => new Set());

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
  const result = useMemo(() => {
    if (!ready) return null;
    return dcf({
      fcf: Number(fcf),
      growth: Number(growth) / 100,
      years: Number(years),
      fadeYears: Number(fadeYears),
      wacc: waccPct / 100,
      terminalGrowth: Number(terminalGrowth) / 100,
      shares: Number(shares),
      netDebt: Number(netDebt),
      midYear,
    });
  }, [ready, fcf, growth, years, fadeYears, waccPct, terminalGrowth, shares, netDebt, midYear]);

  const implied = useMemo(() => {
    if (!result) return null;
    return impliedGrowth(
      {
        fcf: Number(fcf),
        growth: Number(growth) / 100,
        years: Number(years),
        fadeYears: Number(fadeYears),
        wacc: waccPct / 100,
        terminalGrowth: Number(terminalGrowth) / 100,
        shares: Number(shares),
        netDebt: Number(netDebt),
        midYear,
      },
      spot
    );
  }, [
    result,
    fcf,
    growth,
    years,
    fadeYears,
    waccPct,
    terminalGrowth,
    shares,
    netDebt,
    midYear,
    spot,
  ]);
  const upside = result && spot > 0 ? (result.fairValuePerShare / spot - 1) * 100 : null;

  // CAPM inputs (erp/costOfDebt/taxRate) feed waccPct on every keystroke; debounce before
  // it reaches the 2000-path Monte Carlo below so typing stays instant.
  const [debouncedWaccPct, setDebouncedWaccPct] = useState(waccPct);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedWaccPct(waccPct), 300);
    return () => clearTimeout(timer);
  }, [waccPct]);

  const mc = useMemo(() => {
    if (!showMC || !ready) return null;
    const g = Number(growth) / 100;
    const w = debouncedWaccPct / 100;
    const tg = Number(terminalGrowth) / 100;
    return dcfMonteCarlo(
      {
        fcf: Number(fcf),
        years: Number(years),
        fadeYears: Number(fadeYears),
        shares: Number(shares),
        netDebt: Number(netDebt),
        midYear,
      },
      {
        growth: [g - 0.03, g + 0.03],
        wacc: [w - 0.015, w + 0.015],
        terminalGrowth: [tg - 0.005, tg + 0.005],
      },
      2000,
      42
    );
  }, [
    showMC,
    ready,
    fcf,
    years,
    fadeYears,
    shares,
    netDebt,
    midYear,
    growth,
    debouncedWaccPct,
    terminalGrowth,
  ]);

  const waccAxis = [-2, -1, 0, 1, 2].map((d) => waccPct + d);
  const tgAxis = [-1, -0.5, 0, 0.5, 1].map((d) => Number(terminalGrowth) + d);
  const grid = result
    ? waccAxis.map((w) =>
        tgAxis.map(
          (tg) =>
            dcf({ ...base, wacc: w / 100, terminalGrowth: tg / 100 })?.fairValuePerShare ?? null
        )
      )
    : [];

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
          Auto-fill from fundamentals
        </button>
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
          <div className="flex flex-wrap gap-3">
            <NumberField label="Base FCF" value={fcf} onChange={edit('fcf', setFcf)} suffix="M" />
            <NumberField
              label="FCF growth"
              value={growth}
              onChange={edit('growth', setGrowth)}
              suffix="%"
            />
            <NumberField label="Years" value={years} onChange={edit('years', setYears)} step="1" />
            <NumberField
              label="Fade years"
              value={fadeYears}
              onChange={edit('fadeYears', setFadeYears)}
              step="1"
            />
            <NumberField
              label="Terminal growth"
              value={terminalGrowth}
              onChange={edit('terminalGrowth', setTerminalGrowth)}
              suffix="%"
            />
          </div>
          <label className="flex items-center gap-2 text-[11px] text-bloomberg-white/80">
            <input
              type="checkbox"
              checked={midYear}
              onChange={(e) => setMidYear(e.target.checked)}
              className="accent-bloomberg-orange"
            />
            Mid-year discounting
          </label>
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
          <div className="flex flex-wrap gap-3">
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
              />
            )}
          </div>
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
        </fieldset>

        <fieldset className="space-y-2 border border-bloomberg-border p-3">
          <legend className="px-1 text-[11px] tracking-wider text-bloomberg-orange uppercase">
            Balance sheet
          </legend>
          <div className="flex flex-wrap gap-3">
            <NumberField
              label="Shares out"
              value={shares}
              onChange={edit('shares', setShares)}
              suffix="M"
            />
            <NumberField
              label="Net debt"
              value={netDebt}
              onChange={edit('netDebt', setNetDebt)}
              suffix="M"
            />
          </div>
        </fieldset>
      </div>

      {!ready ? (
        <NoticeBox title="Inputs needed">
          Enter base FCF and shares outstanding, or wait for fundamentals to auto-fill.
        </NoticeBox>
      ) : !result ? (
        <NoticeBox title="Check inputs">
          WACC must exceed terminal growth and shares must be positive.
        </NoticeBox>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              label="Fair Value / Share"
              value={money(result.fairValuePerShare)}
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        </>
      )}

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
