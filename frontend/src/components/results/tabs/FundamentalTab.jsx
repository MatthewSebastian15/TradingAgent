import PropTypes from 'prop-types';

import FinancialHighlightsTable from '../FinancialHighlightsTable';
import MetricBox from '../MetricBox';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';

function displayMetric(metric) {
  if (!metric || metric.status === 'unavailable') return 'N/A';
  return metric.status === 'estimated'
    ? `${metric.display ?? 'N/A'} EST`
    : (metric.display ?? 'N/A');
}

function displayPercent(value) {
  return value === null || value === undefined ? 'N/A' : `${value}%`;
}

function FundamentalDataSourceBadge({ dataSources }) {
  const fundamentals = dataSources?.fundamentals;
  if (!fundamentals || fundamentals.completeness !== 'partial') return null;

  return (
    <div className="px-4 pt-4">
      <div className="inline-flex items-center gap-2 border border-bloomberg-amber bg-bloomberg-amber-dim px-2.5 py-1 font-mono text-xs text-bloomberg-amber">
        ⚠ Partial data · {fundamentals.last_period || 'Latest period'}
      </div>
    </div>
  );
}

FundamentalDataSourceBadge.propTypes = {
  dataSources: PropTypes.object,
};

function QualityNotice({ payload }) {
  const quality = payload?.data_quality;
  if (!quality || quality.status === 'complete') return null;
  const notes = [...(quality.fallback_used || []), ...(quality.warnings || [])];
  return (
    <NoticeBox title={`DATA QUALITY: ${quality.status}`}>
      {notes.length
        ? notes.join(' | ')
        : 'Some values are unavailable. Missing values are shown as N/A.'}
    </NoticeBox>
  );
}

QualityNotice.propTypes = {
  payload: PropTypes.object,
};

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
      <QualityNotice payload={payload} />
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
              <th className="sticky left-[190px] z-20 bg-black text-left px-3 py-2 whitespace-nowrap min-w-[90px] border-r border-bloomberg-border">
                Unit
              </th>
              {payload.periods.map((period) => (
                <th
                  key={period.key}
                  className="text-right px-3 py-2 whitespace-nowrap min-w-[86px]"
                >
                  {period.label}
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
                <td className="sticky left-[190px] z-10 bg-black px-3 py-2 text-bloomberg-muted whitespace-nowrap min-w-[90px] border-r border-bloomberg-border">
                  {unit || '-'}
                </td>
                {payload.periods.map((period, index) => {
                  const cell = payload.metric_details[key]?.[index];
                  return (
                    <td
                      key={`${key}-${period.key}`}
                      className="px-3 py-2 text-right text-bloomberg-white whitespace-nowrap min-w-[86px]"
                    >
                      {displayMetric(cell)}
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
      <QualityNotice payload={payload} />
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
      <QualityNotice payload={payload} />
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
      <QualityNotice payload={payload} />
    </section>
  );
}

PeerComparison.propTypes = {
  payload: PropTypes.object,
};

export default function FundamentalTab({ financialHighlights, result = {} }) {
  return (
    <>
      <FundamentalDataSourceBadge dataSources={result.data_sources} />
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
