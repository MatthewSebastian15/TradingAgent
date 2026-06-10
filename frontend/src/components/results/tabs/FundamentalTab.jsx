import PropTypes from 'prop-types';

import FinancialHighlightsTable from '../FinancialHighlightsTable';
import SectionHeader from '../SectionHeader';

const UNAVAILABLE_CELL = { value: null, display: '-', status: 'unavailable' };

const LEGACY_FUNDAMENTAL_SECTIONS = [
  {
    key: 'valuation_multiples',
    title: 'VALUATION MULTIPLES',
    payloadKey: 'valuation_multiples',
    rows: [
      ['market_cap', 'Market Cap', 'currency_scaled'],
      ['enterprise_value', 'Enterprise Value', 'currency_scaled'],
      ['pe', 'P/E', 'ratio'],
      ['pbv', 'P/BV', 'ratio'],
      ['ps', 'P/S', 'ratio'],
      ['ev_ebitda', 'EV/EBITDA', 'ratio'],
    ],
  },
  {
    key: 'quality_of_earnings',
    title: 'QUALITY OF EARNINGS',
    payloadKey: 'quality_of_earnings',
    rows: [
      ['cfo_to_net_income', 'CFO / Net Income', 'ratio'],
      ['free_cash_flow', 'Free Cash Flow', 'currency_scaled'],
      ['capex_intensity_percent', 'Capex Intensity (%)', 'percent'],
    ],
  },
  {
    key: 'balance_sheet_risk',
    title: 'BALANCE SHEET RISK',
    payloadKey: 'balance_sheet_risk',
    rows: [
      ['der', 'DER', 'ratio'],
      ['net_debt', 'Net Debt', 'currency_scaled'],
      ['debt_to_ebitda', 'Debt / EBITDA', 'ratio'],
      ['cash_ratio', 'Cash Ratio', 'ratio'],
      ['equity_ratio', 'Equity Ratio', 'ratio'],
    ],
  },
  {
    key: 'dividend_quality',
    title: 'DIVIDEND QUALITY',
    payloadKey: 'dividend_quality',
    rows: [
      ['dividend_yield_percent', 'Dividend Yield', 'percent'],
      ['payout_ratio_percent', 'Payout Ratio', 'percent'],
      ['fcf_coverage', 'FCF Coverage', 'ratio'],
    ],
  },
];

function unavailableText(value) {
  if (value === null || value === undefined || value === '') return '-';
  const text = String(value).trim();
  return ['n/a', 'na', 'source unavailable', 'none', 'null'].includes(text.toLowerCase()) ? '-' : text;
}

function displayPercent(value) {
  const text = unavailableText(value);
  return text === '-' ? '-' : `${text} %`;
}

function unitForFormat(formatType, financialHighlights) {
  if (formatType === 'currency_scaled') {
    return financialHighlights?.scale_label || financialHighlights?.currency || '';
  }
  if (formatType === 'percent') return '%';
  if (formatType === 'ratio') return 'x';
  if (formatType === 'per_share') return `${financialHighlights?.currency || ''}/share`;
  return '';
}

function legacyCell(payload, key) {
  const details = payload?.metric_details || {};
  const detail = details[key];
  if (detail && typeof detail === 'object') return detail;
  if (payload && Object.prototype.hasOwnProperty.call(payload, key)) {
    const value = payload[key];
    return value === null || value === undefined
      ? UNAVAILABLE_CELL
      : { value, display: String(value), status: 'reported' };
  }
  return UNAVAILABLE_CELL;
}

function appendLegacyFundamentalSections(financialHighlights, result) {
  const periods = Array.isArray(financialHighlights?.periods) ? financialHighlights.periods : [];
  const sections = Array.isArray(financialHighlights?.sections) ? financialHighlights.sections : [];
  if (!periods.length) return financialHighlights;

  const existingKeys = new Set(sections.map((section) => section?.key));
  const latestPeriodKey = periods[periods.length - 1]?.key;
  const extraSections = [];
  const extraRows = [];

  for (const sectionDefinition of LEGACY_FUNDAMENTAL_SECTIONS) {
    if (existingKeys.has(sectionDefinition.key)) continue;
    const payload = result?.[sectionDefinition.payloadKey];
    if (!payload) continue;

    const rows = sectionDefinition.rows.map(([key, label, formatType]) => {
      const row = {
        key,
        label,
        unit: unitForFormat(formatType, financialHighlights),
        format_type: formatType,
        section_key: sectionDefinition.key,
        values: Object.fromEntries(periods.map((period) => [period.key, { ...UNAVAILABLE_CELL }])),
      };
      if (latestPeriodKey) {
        row.values[latestPeriodKey] = legacyCell(payload, key);
      }
      extraRows.push(row);
      return row;
    });

    extraSections.push({
      key: sectionDefinition.key,
      title: sectionDefinition.title,
      rows,
    });
  }

  if (!extraSections.length) return financialHighlights;

  return {
    ...financialHighlights,
    rows: [...(financialHighlights.rows || []), ...extraRows],
    sections: [...sections, ...extraSections],
  };
}

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
                <td className="px-3 py-2">{unavailableText(item.ticker)}</td>
                <td className="px-3 py-2">{unavailableText(item.company_name)}</td>
                <td className="px-3 py-2">{unavailableText(item.pe)}</td>
                <td className="px-3 py-2">{unavailableText(item.pbv)}</td>
                <td className="px-3 py-2">{displayPercent(item.roe_percent)}</td>
                <td className="px-3 py-2">{displayPercent(item.net_profit_margin_percent)}</td>
                <td className="px-3 py-2">{unavailableText(item.der)}</td>
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
  const tablePayload = appendLegacyFundamentalSections(financialHighlights, result);
  return (
    <>
      <FinancialHighlightsTable financialHighlights={tablePayload} />
      <PeerComparison payload={result.peer_comparison} />
    </>
  );
}

FundamentalTab.propTypes = {
  financialHighlights: PropTypes.object,
  result: PropTypes.object,
};
