import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';

import { getStockOverview } from '../../../../../api/market';
import NoticeBox from '../../../NoticeBox';
import { dcf, dcfMonteCarlo, returnHistogram } from '../../quantUtils';
import { Histogram, MetricCard, NumberField } from '../charts';
import { finite, DASH, fmtNum2, fmtSignedPct, signedTone } from '../format';

export function ValuationSection({ spot, defaultRate, ccy, symbol }) {
  const [fcf, setFcf] = useState(1000); // base free cash flow (millions)
  const [growth, setGrowth] = useState(8); // % near-term FCF growth
  const [years, setYears] = useState(5);
  const [wacc, setWacc] = useState(Number(Math.max(8, defaultRate * 100 + 5).toFixed(1)));
  const [terminalGrowth, setTerminalGrowth] = useState(2.5);
  const [shares, setShares] = useState(100); // millions
  const [netDebt, setNetDebt] = useState(0); // millions
  const [overview, setOverview] = useState(null); // null=idle/loading, {} = fundamentals
  const [ovError, setOvError] = useState(false);
  const [showMC, setShowMC] = useState(false); // DCF Monte Carlo toggle

  // Pull fundamentals once when the section mounts. Powers the comparables table
  // and the one-click DCF auto-fill. Fails soft — manual inputs still work.
  useEffect(() => {
    if (!symbol) return undefined;
    const controller = new AbortController();
    let alive = true;
    getStockOverview(symbol, { signal: controller.signal })
      .then((d) => {
        if (alive) setOverview(d && typeof d === 'object' ? d : {});
      })
      .catch(() => {
        if (alive) setOvError(true);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [symbol]);

  // yfinance reports FCF/debt/cash/shares in absolute currency; DCF inputs are in
  // millions, so scale by 1e6. Net debt = total debt − cash.
  const autoFill = () => {
    if (!overview) return;
    const M = 1e6;
    if (Number.isFinite(overview.free_cashflow))
      setFcf(Number((overview.free_cashflow / M).toFixed(1)));
    if (Number.isFinite(overview.shares_outstanding))
      setShares(Number((overview.shares_outstanding / M).toFixed(1)));
    const debt = Number.isFinite(overview.total_debt) ? overview.total_debt : 0;
    const cash = Number.isFinite(overview.total_cash) ? overview.total_cash : 0;
    setNetDebt(Number(((debt - cash) / M).toFixed(1)));
    if (Number.isFinite(overview.earnings_growth)) {
      // Clamp a noisy single-year growth read to a sane DCF stage-1 range.
      setGrowth(Number(Math.max(0, Math.min(25, overview.earnings_growth * 100)).toFixed(1)));
    }
  };

  const result = useMemo(
    () =>
      dcf({
        fcf: Number(fcf),
        growth: Number(growth) / 100,
        years: Number(years),
        wacc: Number(wacc) / 100,
        terminalGrowth: Number(terminalGrowth) / 100,
        shares: Number(shares),
        netDebt: Number(netDebt),
      }),
    [fcf, growth, years, wacc, terminalGrowth, shares, netDebt]
  );
  const money = (v) => `${ccy ? `${ccy} ` : '$'}${Number(v).toFixed(2)}`;
  const upside = result && spot > 0 ? (result.fairValuePerShare / spot - 1) * 100 : null;

  // #3 Monte Carlo: vary the three soft assumptions ±a spread around the inputs and
  // collect the fair-value distribution. Reuses the seeded MC engine. ponytail:
  // fixed spreads, not per-input range fields — add those only if anyone asks.
  const mc = useMemo(() => {
    if (!showMC) return null;
    return dcfMonteCarlo(
      { fcf: Number(fcf), years: Number(years), shares: Number(shares), netDebt: Number(netDebt) },
      {
        growth: [Number(growth) / 100 - 0.03, Number(growth) / 100 + 0.03],
        wacc: [Number(wacc) / 100 - 0.015, Number(wacc) / 100 + 0.015],
        terminalGrowth: [
          Number(terminalGrowth) / 100 - 0.005,
          Number(terminalGrowth) / 100 + 0.005,
        ],
      },
      2000,
      42
    );
  }, [showMC, fcf, growth, years, wacc, terminalGrowth, shares, netDebt]);

  // Sensitivity grid: WACC (rows, ±2%) × terminal growth (cols, ±1%). DCF is very
  // sensitive to both, so the single point above is misleading on its own.
  // ponytail: 25 trivial dcf() calls per render — no memo needed.
  const waccAxis = [-2, -1, 0, 1, 2].map((d) => Number(wacc) + d);
  const tgAxis = [-1, -0.5, 0, 0.5, 1].map((d) => Number(terminalGrowth) + d);
  const grid = waccAxis.map((w) =>
    tgAxis.map((tg) => {
      const r = dcf({
        fcf: Number(fcf),
        growth: Number(growth) / 100,
        years: Number(years),
        wacc: w / 100,
        terminalGrowth: tg / 100,
        shares: Number(shares),
        netDebt: Number(netDebt),
      });
      return r ? r.fairValuePerShare : null;
    })
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        Two-stage discounted cash flow: {years} years of FCF grown at {growth}%, then a Gordon
        terminal value. FCF, shares, and net debt are in millions. Research only — not advice.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={autoFill}
          disabled={!overview}
          className="rounded-none border border-bloomberg-orange bg-bloomberg-orange-dim px-3 py-1 text-[11px] tracking-wide text-bloomberg-orange uppercase hover:bg-bloomberg-orange hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⤓ Auto-fill from fundamentals
        </button>
        <span className="text-[11px] text-bloomberg-subtle">
          {ovError
            ? 'Fundamentals unavailable — enter inputs manually.'
            : !overview
              ? 'Loading fundamentals…'
              : `From ${symbol} fundamentals (yfinance). Every field stays editable.`}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <NumberField label="Base FCF" value={fcf} onChange={setFcf} suffix="M" />
        <NumberField label="FCF Growth" value={growth} onChange={setGrowth} suffix="%" />
        <NumberField label="Years" value={years} onChange={setYears} step="1" />
        <NumberField label="WACC" value={wacc} onChange={setWacc} suffix="%" />
        <NumberField
          label="Terminal Growth"
          value={terminalGrowth}
          onChange={setTerminalGrowth}
          suffix="%"
        />
        <NumberField label="Shares Out" value={shares} onChange={setShares} suffix="M" />
        <NumberField label="Net Debt" value={netDebt} onChange={setNetDebt} suffix="M" />
      </div>
      {result ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Fair Value / Share"
            value={money(result.fairValuePerShare)}
            tone="neutral"
            formula="(Σ discounted FCF + discounted terminal value − net debt) ÷ shares."
          />
          <MetricCard
            label="Upside vs Spot"
            value={finite(upside) ? fmtSignedPct(upside) : DASH}
            tone={signedTone(upside)}
            gloss={`Fair value vs today's close (${money(spot)}).`}
          />
          <MetricCard label="Equity Value" value={`${money(result.equityValue)}M`} />
          <MetricCard label="Enterprise Value" value={`${money(result.enterpriseValue)}M`} />
        </div>
      ) : (
        <NoticeBox title="Check inputs">
          WACC must exceed terminal growth (else the terminal value diverges) and shares must be
          positive.
        </NoticeBox>
      )}

      {result && (
        <div className="space-y-1">
          <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
            Sensitivity: fair value / share (WACC × terminal growth)
          </div>
          <div className="overflow-x-auto border border-bloomberg-border">
            <table className="terminal-table w-full font-mono text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-bloomberg-muted">WACC ＼ g</th>
                  {tgAxis.map((tg) => (
                    <th key={tg} className="px-2 py-1 text-right text-bloomberg-muted">
                      {tg.toFixed(1)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, ri) => (
                  <tr key={waccAxis[ri]}>
                    <td className="px-2 py-1 text-bloomberg-muted">{waccAxis[ri].toFixed(1)}%</td>
                    {row.map((cell, ci) => {
                      const base =
                        waccAxis[ri] === Number(wacc) && tgAxis[ci] === Number(terminalGrowth);
                      const tone =
                        cell == null || !(spot > 0)
                          ? 'text-bloomberg-muted'
                          : cell >= spot
                            ? 'text-bloomberg-green'
                            : 'text-bloomberg-red';
                      return (
                        <td
                          key={ci}
                          className={`px-2 py-1 text-right ${tone} ${base ? 'bg-bloomberg-orange-dim font-bold' : ''}`}
                        >
                          {cell == null ? DASH : money(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-bloomberg-subtle">
            Green = fair value above today&apos;s close ({money(spot)}); highlighted cell = your
            inputs. Small WACC/growth shifts move the valuation a lot — treat any single number with
            caution.
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowMC((v) => !v)}
            className={`rounded-none border px-3 py-1 text-[11px] tracking-wide uppercase ${
              showMC
                ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
            }`}
          >
            🎲 Monte Carlo (growth ±3% · WACC ±1.5% · terminal ±0.5%)
          </button>
          {showMC &&
            (mc ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard
                    label="Fair Value P10"
                    value={money(mc.p10)}
                    tone="bad"
                    gloss="10th percentile across 2,000 assumption draws."
                  />
                  <MetricCard label="Fair Value P50 (median)" value={money(mc.p50)} />
                  <MetricCard
                    label="Fair Value P90"
                    value={money(mc.p90)}
                    tone="good"
                    gloss="90th percentile — the optimistic tail."
                  />
                </div>
                <Histogram
                  bins={returnHistogram(mc.values, 30)}
                  label="Distribution of DCF fair value across sampled assumptions"
                />
                <p className="text-[11px] text-bloomberg-subtle">
                  A wide P10–P90 band means the valuation is assumption-driven, not robust. Spot
                  today: {money(spot)}.
                </p>
              </>
            ) : (
              <NoticeBox title="Monte Carlo">
                No valid draws — widen WACC above terminal growth.
              </NoticeBox>
            ))}
        </div>
      )}

      {overview && (
        <div className="space-y-1">
          <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
            Market multiples ({symbol})
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard
              label="P/E (TTM)"
              value={fmtNum2(overview.pe_ttm)}
              gloss="Price ÷ trailing earnings."
            />
            <MetricCard
              label="Forward P/E"
              value={fmtNum2(overview.forward_pe)}
              gloss="Price ÷ next-year estimated earnings."
            />
            <MetricCard label="P/B" value={fmtNum2(overview.pb)} gloss="Price ÷ book value." />
            <MetricCard label="P/S (TTM)" value={fmtNum2(overview.ps_ttm)} gloss="Price ÷ sales." />
            <MetricCard
              label="EV/EBITDA"
              value={fmtNum2(overview.ev_ebitda)}
              gloss="Enterprise value ÷ EBITDA. Capital-structure neutral."
            />
            <MetricCard
              label="Market Cap"
              value={finite(overview.market_cap) ? `${money(overview.market_cap / 1e6)}M` : DASH}
            />
          </div>
          <p className="text-[11px] text-bloomberg-subtle">
            Cross-check the DCF fair value above against these multiples — a DCF that disagrees
            wildly with how the market prices peers deserves a second look at the assumptions.
          </p>
        </div>
      )}
    </div>
  );
}

ValuationSection.propTypes = {
  spot: PropTypes.number.isRequired,
  defaultRate: PropTypes.number.isRequired,
  ccy: PropTypes.string,
  symbol: PropTypes.string,
};

// #4 stress test + #6 regime-shift detection. Both are derived from figures the tab
