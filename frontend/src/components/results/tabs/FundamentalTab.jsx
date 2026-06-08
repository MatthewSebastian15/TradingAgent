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
