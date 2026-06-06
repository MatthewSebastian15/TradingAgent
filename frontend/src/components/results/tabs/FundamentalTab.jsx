import PropTypes from 'prop-types';

import FinancialHighlightsTable from '../FinancialHighlightsTable';
import MetricBox from '../MetricBox';
import SectionHeader from '../SectionHeader';

function displayMetric(metric) {
  const status = String(metric?.status || '').toLowerCase();
  if (
    !metric ||
    [
      'unavailable',
      'source_unavailable',
      'no_dividend_history',
      'not_applicable_negative_earnings',
    ].includes(status)
  ) {
    return null;
  }
  const value =
    metric.status === 'estimated'
      ? `${metric.display ?? 'N/A'} EST`
      : (metric.display ?? metric.value ?? null);
  return formatInlineValue(value);
}

function displayPercent(value) {
  return value === null || value === undefined ? 'N/A' : `${value} %`;
}

function formatInlineValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  if (text.toLowerCase() === 'source unavailable') return null;
  return text.replace(/\s*%/g, ' %');
}

function expandYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  if (year < 100) return year < 50 ? 2000 + year : 1900 + year;
  return year;
}

function displayPeriodLabel(period) {
  const raw = String(period?.display_period || period?.label || period?.period || '').trim();
  let match = raw.match(/^FY\s?(\d{2}|\d{4})$/i);
  if (match) {
    const year = expandYear(match[1]);
    return year ? `FY ${year}` : '-';
  }

  match = raw.match(/^FY\s?(\d{2}|\d{4})Q([1-4])$/i) || raw.match(/^Q([1-4])\s?(\d{2}|\d{4})$/i);
  if (match) {
    const isLegacyQuarter = match[0].toUpperCase().startsWith('FY');
    const quarter = isLegacyQuarter ? match[2] : match[1];
    const year = expandYear(isLegacyQuarter ? match[1] : match[2]);
    return year ? `Q${quarter} ${year}` : '-';
  }

  return raw || '-';
}

function periodSortValue(period) {
  if (period?.sort_key) return String(period.sort_key);
  const label = displayPeriodLabel(period);
  const annual = label.match(/^FY\s(\d{4})$/i);
  if (annual) return `${annual[1]}1231`;
  const quarterLabel = label.match(/^Q([1-4])\s(\d{4})$/i);
  if (quarterLabel)
    return `${quarterLabel[2]}${String(Number(quarterLabel[1]) * 3).padStart(2, '0')}31`;
  const year = Number(period?.year || period?.fiscal_year || 0);
  const quarter = Number(period?.quarter || period?.fiscal_quarter || 0);
  return `${String(year).padStart(4, '0')}${String(quarter).padStart(2, '0')}`;
}

function sortPeriodsForDisplay(periods) {
  return [...periods].sort((left, right) =>
    periodSortValue(right).localeCompare(periodSortValue(left))
  );
}

function unitSuffix(unit) {
  const text = String(unit || '');
  if (/\bBn\b/i.test(text)) return 'Bn';
  if (/\bMn\b/i.test(text)) return 'Mn';
  if (text.includes('%')) return '%';
  if (/\/share/i.test(text)) return text;
  if (/\bx\b/i.test(text) || /ratio/i.test(text)) return 'x';
  return '';
}

function appendUnit(value, unit) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const text = String(value);
  if (text === 'N/A' || text.toLowerCase() === 'source unavailable') return 'N/A';
  const suffix = unitSuffix(unit);
  if (!suffix) return formatInlineValue(text) || 'N/A';
  if (suffix === '%') return `${text.replace(/\s*%$/, '')} %`;
  if (suffix === 'x') return /\s*x$/i.test(text) ? text : `${text}x`;
  if (text.toLowerCase().endsWith(suffix.toLowerCase())) return text;
  return `${text} ${suffix}`;
}

function displayTrendMetric(cell, unit) {
  const status = String(cell?.status || '').toLowerCase();
  if (!cell || status === 'unavailable' || status === 'source_unavailable') return 'N/A';
  const value =
    cell.status === 'estimated' ? `${cell.display ?? 'N/A'} EST` : (cell.display ?? cell.value);
  return appendUnit(value, unit);
}

function MetricSection({ title, payload, metrics, summary }) {
  if (!payload) return null;
  return (
    <section className="px-4 py-4 border-b border-bloomberg-border space-y-3">
      <SectionHeader label={title} />
      {summary}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {metrics.map(([key, label]) => (
          <MetricBox
            key={key}
            label={label}
            value={displayMetric(payload.metric_details?.[key])}
            compact
            preserveSlot
          />
        ))}
      </div>
    </section>
  );
}

MetricSection.propTypes = {
  title: PropTypes.string.isRequired,
  payload: PropTypes.object,
  metrics: PropTypes.array.isRequired,
  summary: PropTypes.node,
};

function FinancialTrends({ payload }) {
  if (!payload?.periods?.length || !payload?.metric_details) return null;
  const displayPeriods = sortPeriodsForDisplay(payload.periods);
  const rows = [
    ['revenue', 'Revenue', payload.scale_label || ''],
    ['revenue_growth_percent', 'Revenue Growth', '%'],
    ['ebitda', 'EBITDA', payload.scale_label || ''],
    ['ebitda_margin_percent', 'EBITDA Margin', '%'],
    ['net_profit', 'Net Profit', payload.scale_label || ''],
    ['net_profit_growth_percent', 'Net Profit Growth', '%'],
    ['net_profit_margin_percent', 'Net Profit Margin', '%'],
    ['roe_percent', 'ROE', '%'],
    ['eps', 'EPS', `${payload.currency || ''}/share`],
    ['bvps', 'BVPS', `${payload.currency || ''}/share`],
    ['der', 'DER', 'x'],
  ];
  return (
    <section className="px-4 py-4 border-b border-bloomberg-border space-y-3">
      <SectionHeader label="FINANCIAL TREND ANALYSIS" />
      {payload.unit_note && (
        <p className="font-mono text-[11px] text-bloomberg-muted">{payload.unit_note}</p>
      )}
      <div className="overflow-x-auto border border-bloomberg-border">
        <table className="min-w-[980px] w-full text-xs font-mono border-collapse">
          <thead>
            <tr className="text-bloomberg-muted border-b border-bloomberg-border">
              <th className="sticky left-0 z-20 bg-black text-left px-3 py-2 whitespace-nowrap min-w-[190px]">
                Metric
              </th>
              {displayPeriods.map((period) => (
                <th
                  key={period.key}
                  className="text-right px-3 py-2 whitespace-nowrap min-w-[86px]"
                >
                  {displayPeriodLabel(period)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, label, unit]) => (
              <tr key={key} className="border-b border-bloomberg-border border-opacity-50">
                <td className="sticky left-0 z-10 bg-black px-3 py-2 text-bloomberg-white whitespace-nowrap min-w-[190px]">
                  {label}
                </td>
                {displayPeriods.map((period) => {
                  const sourceIndex = payload.periods.findIndex((item) => item.key === period.key);
                  return (
                    <td
                      key={`${key}-${period.key}`}
                      className="px-3 py-2 text-right text-bloomberg-white whitespace-nowrap min-w-[86px]"
                    >
                      {displayTrendMetric(payload.metric_details[key]?.[sourceIndex], unit)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {Object.entries(payload.summary || {}).map(([key, value]) => (
          <MetricBox
            key={key}
            label={key.replaceAll('_', ' ')}
            value={value}
            compact
            preserveSlot
          />
        ))}
      </div>
    </section>
  );
}

FinancialTrends.propTypes = {
  payload: PropTypes.object,
};

function ScenarioAnalysis({ payload }) {
  if (!payload) return null;
  return (
    <section className="px-4 py-4 border-b border-bloomberg-border space-y-3">
      <SectionHeader label="BULL / BASE / BEAR SCENARIO" />
      <div className="overflow-x-auto border border-bloomberg-border">
        <table className="min-w-full text-xs font-mono">
          <thead>
            <tr className="text-bloomberg-muted border-b border-bloomberg-border">
              <th className="text-left px-3 py-2">Scenario</th>
              <th className="text-right px-3 py-2">Fair Value</th>
              <th className="text-right px-3 py-2">Upside / Downside</th>
              <th className="text-right px-3 py-2">Growth</th>
              <th className="text-right px-3 py-2">Margin</th>
              <th className="text-left px-3 py-2">Multiple</th>
              <th className="text-left px-3 py-2">Assumption</th>
            </tr>
          </thead>
          <tbody>
            {['bear', 'base', 'bull'].map((key) => {
              const scenario = payload[key] || {};
              return (
                <tr key={key} className="border-b border-bloomberg-border border-opacity-50">
                  <td className="px-3 py-2 text-bloomberg-orange uppercase">{key}</td>
                  <td className="px-3 py-2 text-right">{scenario.fair_value_display || 'N/A'}</td>
                  <td className="px-3 py-2 text-right">
                    {scenario.upside_downside_display || 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {displayPercent(scenario.revenue_growth_assumption_percent)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {displayPercent(scenario.margin_assumption_percent)}
                  </td>
                  <td className="px-3 py-2">{scenario.valuation_multiple || 'N/A'}</td>
                  <td className="px-3 py-2">{scenario.assumption || 'N/A'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

ScenarioAnalysis.propTypes = {
  payload: PropTypes.object,
};

function PeerComparison({ payload }) {
  if (!payload?.metrics?.length) return null;
  return (
    <section className="px-4 py-4 border-b border-bloomberg-border space-y-3">
      <SectionHeader label="PEER COMPARISON" />
      <div className="overflow-x-auto border border-bloomberg-border">
        <table className="min-w-full text-xs font-mono">
          <thead>
            <tr className="text-bloomberg-muted border-b border-bloomberg-border">
              {[
                'Ticker',
                'Company',
                'P/E',
                'P/BV',
                'ROE',
                'Net Margin',
                'DER',
                'Dividend Yield',
              ].map((label) => (
                <th key={label} className="text-left px-3 py-2 whitespace-nowrap">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.metrics.map((item) => (
              <tr key={item.ticker} className="border-b border-bloomberg-border border-opacity-50">
                <td className="px-3 py-2">{item.ticker || 'N/A'}</td>
                <td className="px-3 py-2">{item.company_name || 'N/A'}</td>
                <td className="px-3 py-2">{item.pe ?? 'N/A'}</td>
                <td className="px-3 py-2">{item.pbv ?? 'N/A'}</td>
                <td className="px-3 py-2">{displayPercent(item.roe_percent)}</td>
                <td className="px-3 py-2">{displayPercent(item.net_profit_margin_percent)}</td>
                <td className="px-3 py-2">{item.der ?? 'N/A'}</td>
                <td className="px-3 py-2">{displayPercent(item.dividend_yield_percent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

PeerComparison.propTypes = {
  payload: PropTypes.object,
};

export default function FundamentalTab({ financialHighlights, result = {} }) {
  return (
    <>
      <FinancialHighlightsTable financialHighlights={financialHighlights} />
      <FinancialTrends payload={result.financial_trends} />
      <MetricSection
        title="VALUATION MULTIPLES"
        payload={result.valuation_multiples}
        metrics={[
          ['market_cap', 'Market Cap'],
          ['enterprise_value', 'Enterprise Value'],
          ['pe', 'P/E'],
          ['pbv', 'P/BV'],
          ['ps', 'P/S'],
          ['ev_ebitda', 'EV/EBITDA'],
        ]}
        summary={
          result.valuation_multiples?.interpretation && (
            <p className="font-mono text-xs text-bloomberg-muted">
              Label: {result.valuation_multiples.interpretation.valuation_label || 'N/A'}.{' '}
              {result.valuation_multiples.interpretation.main_reason}
            </p>
          )
        }
      />
      <MetricSection
        title="FAIR VALUE RANGE"
        payload={result.fair_value_range}
        metrics={[
          ['current_price', 'Current Price'],
          ['bear', 'Bear Fair Value'],
          ['base', 'Base Fair Value'],
          ['bull', 'Bull Fair Value'],
          ['bear_upside_percent', 'Bear Upside / Downside'],
          ['base_upside_percent', 'Base Upside / Downside'],
          ['bull_upside_percent', 'Bull Upside / Downside'],
        ]}
        summary={
          result.fair_value_range && (
            <p className="font-mono text-xs text-bloomberg-muted">
              Primary method: {result.fair_value_range.primary_method || 'N/A'}
            </p>
          )
        }
      />
      <ScenarioAnalysis payload={result.scenario_analysis} />
      <MetricSection
        title="QUALITY OF EARNINGS"
        payload={result.quality_of_earnings}
        metrics={[
          ['cfo_to_net_income', 'CFO / Net Income'],
          ['free_cash_flow', 'Free Cash Flow'],
          ['capex_intensity_percent', 'Capex Intensity'],
        ]}
        summary={
          result.quality_of_earnings && (
            <p className="font-mono text-xs text-bloomberg-muted">
              Rating: {result.quality_of_earnings.rating || 'N/A'} | Accrual risk:{' '}
              {result.quality_of_earnings.accrual_risk || 'N/A'}
            </p>
          )
        }
      />
      <MetricSection
        title="BALANCE SHEET RISK"
        payload={result.balance_sheet_risk}
        metrics={[
          ['der', 'DER'],
          ['net_debt', 'Net Debt'],
          ['debt_to_ebitda', 'Debt / EBITDA'],
          ['cash_ratio', 'Cash Ratio'],
          ['equity_ratio', 'Equity Ratio'],
        ]}
        summary={
          result.balance_sheet_risk && (
            <p className="font-mono text-xs text-bloomberg-muted">
              Risk level: {result.balance_sheet_risk.risk_level || 'N/A'}
            </p>
          )
        }
      />
      <MetricSection
        title="DIVIDEND QUALITY"
        payload={result.dividend_quality}
        metrics={[
          ['dividend_yield_percent', 'Dividend Yield'],
          ['payout_ratio_percent', 'Payout Ratio'],
          ['fcf_coverage', 'FCF Coverage'],
        ]}
        summary={
          result.dividend_quality && (
            <p className="font-mono text-xs text-bloomberg-muted">
              Sustainability: {result.dividend_quality.sustainability || 'N/A'}
            </p>
          )
        }
      />
      <PeerComparison payload={result.peer_comparison} />
    </>
  );
}

FundamentalTab.propTypes = {
  financialHighlights: PropTypes.object,
  result: PropTypes.object,
};
