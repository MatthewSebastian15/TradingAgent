import { ChevronDown, ChevronRight } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useState } from 'react';

import { useEconomicData } from '../../hooks/useEconomicData';

function lastValue(points) {
  return Array.isArray(points) && points.length ? points.at(-1).value : null;
}

function pct(value) {
  return value == null ? '—' : `${value.toFixed(2)}%`;
}

function num(value) {
  return value == null ? '—' : value.toFixed(2);
}

function curveRows(data) {
  const points = data?.data || [];
  return ['3 Mo', '2 Yr', '10 Yr', '30 Yr'].map((label) => ({
    label,
    value: pct(points.find((point) => point.date === label)?.value ?? null),
  }));
}

function gaugeRows(data) {
  return ['DXY', 'VIX', 'WTI', 'Gold'].map((label) => ({
    label,
    value: num(lastValue(data?.series?.[label])),
  }));
}

function annualRows(data) {
  const points = data?.series?.USA || [];
  return points
    .slice(-4)
    .reverse()
    .map((point) => ({ label: point.date, value: pct(point.value) }));
}

function CardSkeleton() {
  return (
    <div aria-label="Loading economic data" role="status">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex justify-between py-1 first:pt-0 last:pb-0">
          <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-10 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function MetricCard({ title, source, rows, loading, error }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide leading-none">{title}</h3>
        <span className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          {source}
        </span>
      </div>

      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <div role="alert" className="py-1 text-[11px] text-destructive">
          Unavailable.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-2 py-1 first:pt-0 last:pb-0"
            >
              <span className="truncate text-[11px] text-muted-foreground">{row.label}</span>
              <span className="text-[12px] font-semibold tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

MetricCard.propTypes = {
  title: PropTypes.string.isRequired,
  source: PropTypes.string.isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
  error: PropTypes.bool,
};

export default function HomeEconomicSummary() {
  const [collapsed, setCollapsed] = useState(false);
  const curve = useEconomicData('federal_reserve', 'yield_curve');
  const gauges = useEconomicData('yfinance', 'gauges');
  const growth = useEconomicData('world_bank', 'gdp_growth', { countries: 'USA', years: 6 });
  const cpi = useEconomicData('world_bank', 'cpi', { countries: 'USA', years: 6 });

  return (
    <section
      aria-labelledby="home-econ-title"
      className="rounded-lg border border-border bg-card/80 p-2 font-mono text-card-foreground shadow-sm sm:p-2.5"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className={`flex w-full items-center justify-between gap-2 ${collapsed ? '' : 'mb-2'}`}
      >
        <h2
          id="home-econ-title"
          className="flex items-center gap-1 text-sm font-semibold leading-none"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          Economics
        </h2>
      </button>

      {collapsed ? null : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Treasury Curve"
            source="US Treasury"
            rows={curveRows(curve.data)}
            loading={curve.loading}
            error={Boolean(curve.error)}
          />
          <MetricCard
            title="Macro Gauges"
            source="yfinance"
            rows={gaugeRows(gauges.data)}
            loading={gauges.loading}
            error={Boolean(gauges.error)}
          />
          <MetricCard
            title="US Growth"
            source="World Bank · GDP %"
            rows={annualRows(growth.data)}
            loading={growth.loading}
            error={Boolean(growth.error)}
          />
          <MetricCard
            title="US Inflation"
            source="World Bank · CPI %"
            rows={annualRows(cpi.data)}
            loading={cpi.loading}
            error={Boolean(cpi.error)}
          />
        </div>
      )}
    </section>
  );
}
