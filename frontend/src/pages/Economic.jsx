import PropTypes from 'prop-types';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import MiniSparkline from '../components/market/MiniSparkline';
import PriceMetricLineChart from '../components/results/tabs/PriceMetricLineChart';
import { useEconomicData } from '../hooks/useEconomicData';

// Phases 0–2 shipped (RATES & MONEY, GROWTH); the rest are placeholders for the
// later phases in docs/ECONOMICS_TAB.md.
const SUB_TABS = [
  { id: 'rates', label: 'RATES & MONEY', enabled: true },
  { id: 'growth', label: 'GROWTH', enabled: true },
  { id: 'inflation', label: 'INFLATION', enabled: true },
  { id: 'fiscal', label: 'FISCAL', enabled: true },
  { id: 'trade', label: 'TRADE', enabled: true },
  { id: 'development', label: 'DEVELOPMENT', enabled: true },
];

const COUNTRY_PRESETS = ['USA', 'CHN', 'IND', 'JPN', 'DEU', 'GBR'];
const CURRENCY_PRESETS = ['USD', 'GBP', 'JPY', 'CHF', 'CNY', 'CAD'];
const CURRENT_YEAR = new Date().getFullYear();

function pill(isActive) {
  return `h-7 rounded-full px-2.5 font-mono text-[10px] font-bold tracking-wider ${
    isActive
      ? 'bg-bloomberg-orange text-black hover:bg-bloomberg-orange/90'
      : 'border-bloomberg-border bg-black/60 text-bloomberg-amber hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange disabled:opacity-40'
  }`;
}

function lastPoint(points) {
  return Array.isArray(points) && points.length ? points.at(-1) : null;
}

function pct(point) {
  return point ? `${point.value.toFixed(2)}%` : '—';
}

function trillions(point) {
  return point ? `$${(point.value / 1e12).toFixed(2)}T` : '—';
}

function billions(point) {
  return point ? `$${(point.value / 1e9).toFixed(1)}B` : '—';
}

function forecastPoint(points) {
  return (points || []).find((point) => Number(point.date) > CURRENT_YEAR) || lastPoint(points);
}

// --- Phase 1: RATES & MONEY -------------------------------------------------

function latest(series) {
  return pct(lastPoint(series?.data));
}

function KpiCard({ label, value, points }) {
  return (
    <Card className="border-bloomberg-border bg-bloomberg-card">
      <CardContent className="p-3">
        <div className="font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
          {label}
        </div>
        <div className="mt-1 font-mono text-lg text-white tabular-nums">{value}</div>
        <div className="mt-2">
          <MiniSparkline values={points} positive={null} />
        </div>
      </CardContent>
    </Card>
  );
}

KpiCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  points: PropTypes.arrayOf(PropTypes.number),
};

function RatesPanel() {
  const effr = useEconomicData('federal_reserve', 'federal_funds_rate', { days: 90 });
  const sofr = useEconomicData('federal_reserve', 'sofr_rate', { days: 90 });
  const curve = useEconomicData('federal_reserve', 'yield_curve');

  const tenY = curve.data?.data?.find((point) => point.date === '10 Yr');
  const failed = effr.error || sofr.error || curve.error;

  return (
    <Card className="border-bloomberg-border bg-bloomberg-card">
      <CardContent className="space-y-4 p-4">
        <div className="font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
          Source: Federal Reserve · NY Fed Markets API + Treasury · US
        </div>

        {failed && (
          <div className="border border-bloomberg-amber/40 bg-bloomberg-amber/10 p-3 font-mono text-[11px] text-bloomberg-amber uppercase">
            Economic data unavailable
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="EFFR (Fed Funds)"
            value={latest(effr.data)}
            points={(effr.data?.data || []).map((point) => point.value)}
          />
          <KpiCard
            label="SOFR"
            value={latest(sofr.data)}
            points={(sofr.data?.data || []).map((point) => point.value)}
          />
          <KpiCard
            label="10Y Treasury"
            value={tenY ? `${tenY.value.toFixed(2)}%` : '—'}
            points={(curve.data?.data || []).map((point) => point.value)}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <PriceMetricLineChart
            title="SOFR — Last 90 Days"
            points={sofr.data?.data}
            valueType="percent"
            emptyMessage={sofr.loading ? 'Loading…' : 'SOFR data unavailable.'}
          />
          <PriceMetricLineChart
            title="Treasury Yield Curve — Latest"
            subtitle="Par yields by maturity"
            points={curve.data?.data}
            valueType="percent"
            emptyMessage={curve.loading ? 'Loading…' : 'Yield curve data unavailable.'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// --- Phase 2: GROWTH --------------------------------------------------------

function CountrySelector({ selected, onToggle, presets = COUNTRY_PRESETS, label = 'Countries' }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
        {label}
      </span>
      {presets.map((code) => {
        const isActive = selected.includes(code);
        return (
          <Button
            key={code}
            type="button"
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => onToggle(code)}
            className={pill(isActive)}
          >
            {code}
          </Button>
        );
      })}
    </div>
  );
}

CountrySelector.propTypes = {
  selected: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired,
  presets: PropTypes.arrayOf(PropTypes.string),
  label: PropTypes.string,
};

function CountryGrowthCard({ code, gdp, growth, forecast }) {
  const growthPoints = (growth || []).map((point) => point.value);
  const last = lastPoint(growth);
  return (
    <Card className="border-bloomberg-border bg-bloomberg-card">
      <CardContent className="space-y-2 p-3">
        <div className="font-mono text-xs font-bold tracking-wider text-bloomberg-orange">
          {code}
        </div>
        <div className="grid grid-cols-3 gap-2 font-mono">
          <Metric label="GDP" value={trillions(lastPoint(gdp))} />
          <Metric label="Growth" value={pct(last)} />
          <Metric label={`${CURRENT_YEAR + 1}f`} value={pct(forecastPoint(forecast))} />
        </div>
        <MiniSparkline values={growthPoints} positive={last ? last.value >= 0 : null} />
      </CardContent>
    </Card>
  );
}

CountryGrowthCard.propTypes = {
  code: PropTypes.string.isRequired,
  gdp: PropTypes.array,
  growth: PropTypes.array,
  forecast: PropTypes.array,
};

function Metric({ label, value }) {
  return (
    <div>
      <div className="text-[9px] tracking-wider text-bloomberg-muted uppercase">{label}</div>
      <div className="text-sm text-white tabular-nums">{value}</div>
    </div>
  );
}

Metric.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
};

function GrowthPanel() {
  const [countries, setCountries] = useState(['USA', 'CHN']);
  const codes = countries.join(',');
  const gdp = useEconomicData('world_bank', 'gdp', { countries: codes, years: 15 });
  const growth = useEconomicData('world_bank', 'gdp_growth', { countries: codes, years: 15 });
  const forecast = useEconomicData('imf', 'gdp_forecast', { countries: codes, years: 12 });

  const toggle = (code) =>
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  const primary = countries[0];
  const failed = gdp.error || growth.error || forecast.error;

  return (
    <Card className="border-bloomberg-border bg-bloomberg-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
            Source: World Bank + IMF WEO
          </div>
          <CountrySelector selected={countries} onToggle={toggle} />
        </div>

        {countries.length === 0 && (
          <div className="border border-bloomberg-amber/40 bg-bloomberg-amber/10 p-3 font-mono text-[11px] text-bloomberg-amber uppercase">
            Select at least one country
          </div>
        )}
        {failed && countries.length > 0 && (
          <div className="border border-bloomberg-amber/40 bg-bloomberg-amber/10 p-3 font-mono text-[11px] text-bloomberg-amber uppercase">
            Growth data unavailable
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((code) => (
            <CountryGrowthCard
              key={code}
              code={code}
              gdp={gdp.data?.series?.[code]}
              growth={growth.data?.series?.[code]}
              forecast={forecast.data?.series?.[code]}
            />
          ))}
        </div>

        {primary && (
          <PriceMetricLineChart
            title={`Real GDP Growth — ${primary}`}
            subtitle="History + IMF WEO forecast (annual %)"
            points={forecast.data?.series?.[primary]}
            valueType="percent"
            emptyMessage={forecast.loading ? 'Loading…' : 'Forecast data unavailable.'}
          />
        )}
      </CardContent>
    </Card>
  );
}

// --- Phase 3: INFLATION -----------------------------------------------------

function InflationPanel() {
  const [countries, setCountries] = useState(['USA', 'DEU']);
  const codes = countries.join(',');
  const cpi = useEconomicData('world_bank', 'cpi', { countries: codes, years: 12 });
  const hicp = useEconomicData('ecb', 'hicp', { years: 8 });

  const toggle = (code) =>
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  const primary = countries[0];
  const failed = cpi.error || hicp.error;

  return (
    <Card className="border-bloomberg-border bg-bloomberg-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
            Source: World Bank CPI + ECB HICP
          </div>
          <CountrySelector selected={countries} onToggle={toggle} />
        </div>

        {failed && (
          <div className="border border-bloomberg-amber/40 bg-bloomberg-amber/10 p-3 font-mono text-[11px] text-bloomberg-amber uppercase">
            Inflation data unavailable
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {countries.map((code) => {
            const series = cpi.data?.series?.[code];
            return (
              <KpiCard
                key={code}
                label={`${code} CPI`}
                value={pct(lastPoint(series))}
                points={(series || []).map((point) => point.value)}
              />
            );
          })}
          <KpiCard
            label="Eurozone HICP · U2"
            value={pct(lastPoint(hicp.data?.data))}
            points={(hicp.data?.data || []).map((point) => point.value)}
          />
        </div>

        {primary && (
          <PriceMetricLineChart
            title={`Inflation (CPI) — ${primary}`}
            subtitle="World Bank, annual %"
            points={cpi.data?.series?.[primary]}
            valueType="percent"
            emptyMessage={cpi.loading ? 'Loading…' : 'CPI data unavailable.'}
          />
        )}
        <PriceMetricLineChart
          title="Eurozone HICP — Monthly (EUR-only · U2)"
          subtitle="ECB, annual rate of change"
          points={hicp.data?.data}
          valueType="percent"
          emptyMessage={hicp.loading ? 'Loading…' : 'HICP data unavailable.'}
        />
      </CardContent>
    </Card>
  );
}

// --- Phase 4: FISCAL --------------------------------------------------------

function FiscalPanel() {
  const [countries, setCountries] = useState(['USA', 'DEU']);
  const codes = countries.join(',');
  const debt = useEconomicData('fiscal_data', 'debt_to_penny', { years: 5 });
  const interest = useEconomicData('fiscal_data', 'interest_expense', { years: 10 });
  const balance = useEconomicData('imf', 'fiscal_balance', { countries: codes, years: 10 });

  const toggle = (code) =>
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  const primary = countries[0];
  const failed = debt.error || interest.error || balance.error;

  return (
    <Card className="border-bloomberg-border bg-bloomberg-card">
      <CardContent className="space-y-4 p-4">
        <div className="font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
          Source: US Treasury Fiscal Data + IMF Fiscal Monitor
        </div>

        {failed && (
          <div className="border border-bloomberg-amber/40 bg-bloomberg-amber/10 p-3 font-mono text-[11px] text-bloomberg-amber uppercase">
            Fiscal data unavailable
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCard
            label="US National Debt"
            value={trillions(lastPoint(debt.data?.data))}
            points={(debt.data?.data || []).map((point) => point.value)}
          />
          <KpiCard
            label="US Interest Expense · Monthly"
            value={billions(lastPoint(interest.data?.data))}
            points={(interest.data?.data || []).map((point) => point.value)}
          />
        </div>

        <PriceMetricLineChart
          title="US National Debt — Daily"
          subtitle="Treasury Debt to the Penny"
          points={debt.data?.data}
          valueType="currency"
          currency="USD"
          emptyMessage={debt.loading ? 'Loading…' : 'Debt data unavailable.'}
        />
        <PriceMetricLineChart
          title="US Interest Expense — Monthly"
          subtitle="Treasury, accrued interest on the public debt"
          points={interest.data?.data}
          valueType="currency"
          currency="USD"
          emptyMessage={interest.loading ? 'Loading…' : 'Interest expense unavailable.'}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bloomberg-border pt-3">
          <div className="font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
            Fiscal balance (IMF, % of GDP)
          </div>
          <CountrySelector selected={countries} onToggle={toggle} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {countries.map((code) => {
            const series = balance.data?.series?.[code];
            const last = lastPoint(series);
            return (
              <KpiCard
                key={code}
                label={`${code} Balance`}
                value={pct(last)}
                points={(series || []).map((point) => point.value)}
              />
            );
          })}
        </div>

        {primary && (
          <PriceMetricLineChart
            title={`Fiscal Balance — ${primary}`}
            subtitle="IMF Fiscal Monitor, % of GDP (incl. forecast)"
            points={balance.data?.series?.[primary]}
            valueType="percent"
            emptyMessage={balance.loading ? 'Loading…' : 'Fiscal balance unavailable.'}
          />
        )}
      </CardContent>
    </Card>
  );
}

// --- Phase 5: TRADE ---------------------------------------------------------

function rate(point) {
  return point ? point.value.toFixed(4) : '—';
}

function TradePanel() {
  const [currencies, setCurrencies] = useState(['USD', 'GBP', 'JPY']);
  const codes = currencies.join(',');
  const fx = useEconomicData('ecb', 'exchange_rates', { currencies: codes, years: 3 });
  const wto = useEconomicData('wto', 'merch_trade', { countries: 'USA', years: 10 });

  const toggle = (code) =>
    setCurrencies((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  const wtoConfigured = wto.data?.configured === true;

  return (
    <Card className="border-bloomberg-border bg-bloomberg-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
            Source: ECB reference rates (EUR base){wtoConfigured ? ' + WTO' : ''}
          </div>
          <CountrySelector
            selected={currencies}
            onToggle={toggle}
            presets={CURRENCY_PRESETS}
            label="EUR vs"
          />
        </div>

        {fx.error && (
          <div className="border border-bloomberg-amber/40 bg-bloomberg-amber/10 p-3 font-mono text-[11px] text-bloomberg-amber uppercase">
            Exchange-rate data unavailable
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {currencies.map((code) => {
            const series = fx.data?.series?.[code];
            const last = lastPoint(series);
            return (
              <KpiCard
                key={code}
                label={`EUR / ${code}`}
                value={rate(last)}
                points={(series || []).map((point) => point.value)}
              />
            );
          })}
        </div>

        {/* WTO panel only renders when ECONOMIC_WTO_API_KEY is set (Phase 5 exit). */}
        {wtoConfigured && (
          <PriceMetricLineChart
            title="Merchandise Trade — WTO"
            subtitle="Annual values (USD)"
            points={wto.data?.data}
            valueType="currency"
            currency="USD"
            emptyMessage={wto.loading ? 'Loading…' : 'WTO data unavailable.'}
          />
        )}
      </CardContent>
    </Card>
  );
}

// --- Phase 6: DEVELOPMENT ----------------------------------------------------

function num(point, digits = 1) {
  return point ? point.value.toFixed(digits) : '—';
}

function DevelopmentCard({ code, life, gini, literacy, rnd }) {
  return (
    <Card className="border-bloomberg-border bg-bloomberg-card">
      <CardContent className="space-y-2 p-3">
        <div className="font-mono text-xs font-bold tracking-wider text-bloomberg-orange">
          {code}
        </div>
        <div className="grid grid-cols-2 gap-2 font-mono">
          <Metric label="Life Exp" value={`${num(lastPoint(life))} yr`} />
          <Metric label="Gini" value={num(lastPoint(gini))} />
          <Metric label="Literacy" value={pct(lastPoint(literacy))} />
          <Metric label="R&D %GDP" value={pct(lastPoint(rnd))} />
        </div>
        <MiniSparkline values={(life || []).map((point) => point.value)} positive={null} />
      </CardContent>
    </Card>
  );
}

DevelopmentCard.propTypes = {
  code: PropTypes.string.isRequired,
  life: PropTypes.array,
  gini: PropTypes.array,
  literacy: PropTypes.array,
  rnd: PropTypes.array,
};

function DevelopmentPanel() {
  const [countries, setCountries] = useState(['USA', 'JPN']);
  const codes = countries.join(',');
  const life = useEconomicData('world_bank', 'life_expectancy', { countries: codes, years: 15 });
  const gini = useEconomicData('world_bank', 'gini', { countries: codes, years: 20 });
  const literacy = useEconomicData('world_bank', 'literacy', { countries: codes, years: 20 });
  const rnd = useEconomicData('unesco', 'rnd', { countries: codes, years: 15 });

  const toggle = (code) =>
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  const primary = countries[0];
  const failed = life.error || gini.error || literacy.error || rnd.error;

  return (
    <Card className="border-bloomberg-border bg-bloomberg-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
            Source: World Bank (health) + UNESCO UIS
          </div>
          <CountrySelector selected={countries} onToggle={toggle} />
        </div>

        {failed && (
          <div className="border border-bloomberg-amber/40 bg-bloomberg-amber/10 p-3 font-mono text-[11px] text-bloomberg-amber uppercase">
            Development data unavailable
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((code) => (
            <DevelopmentCard
              key={code}
              code={code}
              life={life.data?.series?.[code]}
              gini={gini.data?.series?.[code]}
              literacy={literacy.data?.series?.[code]}
              rnd={rnd.data?.series?.[code]}
            />
          ))}
        </div>

        {primary && (
          <PriceMetricLineChart
            title={`R&D Spending — ${primary}`}
            subtitle="UNESCO, gross domestic R&D expenditure (% of GDP)"
            points={rnd.data?.series?.[primary]}
            valueType="percent"
            emptyMessage={rnd.loading ? 'Loading…' : 'R&D data unavailable.'}
          />
        )}
      </CardContent>
    </Card>
  );
}

// --- Market gauges (yfinance) — always-visible macro strip ------------------

const GAUGE_ORDER = ['DXY', 'VIX', 'WTI', 'Brent', 'Gold'];

function GaugesStrip() {
  const gauges = useEconomicData('yfinance', 'gauges');
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {GAUGE_ORDER.map((key) => {
        const series = gauges.data?.series?.[key];
        return (
          <KpiCard
            key={key}
            label={key}
            value={num(lastPoint(series), 2)}
            points={(series || []).map((point) => point.value)}
          />
        );
      })}
    </div>
  );
}

export default function Economic() {
  const [active, setActive] = useState('rates');

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-12">
      <main className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-mono text-sm font-bold tracking-[0.35em] text-bloomberg-orange uppercase">
            Economic
          </h1>
          <div className="flex flex-wrap gap-1">
            {SUB_TABS.map((tab) => (
              <Button
                key={tab.id}
                type="button"
                variant={tab.id === active ? 'default' : 'outline'}
                size="sm"
                disabled={!tab.enabled}
                onClick={() => tab.enabled && setActive(tab.id)}
                className={pill(tab.id === active)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        <GaugesStrip />

        {active === 'rates' && <RatesPanel />}
        {active === 'growth' && <GrowthPanel />}
        {active === 'inflation' && <InflationPanel />}
        {active === 'fiscal' && <FiscalPanel />}
        {active === 'trade' && <TradePanel />}
        {active === 'development' && <DevelopmentPanel />}
      </main>
    </div>
  );
}
