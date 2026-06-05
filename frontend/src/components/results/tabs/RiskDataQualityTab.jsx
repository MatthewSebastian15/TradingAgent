import PropTypes from 'prop-types';

import DataSourceBadge from '../../DataSourceBadge';
import DataStatusBadge from '../../DataStatusBadge';
import MetricBox from '../MetricBox';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';

function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !(typeof value === 'number' && !Number.isFinite(value))
  );
}

function display(value) {
  if (!hasValue(value)) return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'N/A';
  return String(value);
}

function labelize(value) {
  return display(value).replaceAll('_', ' ').toUpperCase();
}

function percent(value) {
  if (!hasValue(value)) return 'N/A';
  const text = String(value);
  return text.endsWith('%') ? text : `${text}%`;
}

function Section({ title, children }) {
  return (
    <section className="px-4 py-4 border-b border-bloomberg-border space-y-3">
      <SectionHeader label={title} />
      {children}
    </section>
  );
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
};

function ListItems({ items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="font-mono text-xs text-bloomberg-muted">N/A</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="font-mono text-xs text-bloomberg-muted">
          + {display(item)}
        </li>
      ))}
    </ul>
  );
}

ListItems.propTypes = {
  items: PropTypes.array,
};

function DataTable({ columns, rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <p className="font-mono text-xs text-bloomberg-muted">N/A</p>;
  }
  return (
    <div className="overflow-x-auto border border-bloomberg-border">
      <table className="min-w-full text-xs font-mono">
        <thead>
          <tr className="text-bloomberg-muted border-b border-bloomberg-border">
            {columns.map(([key, label]) => (
              <th key={key} className="text-left px-3 py-2 whitespace-nowrap">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-bloomberg-border border-opacity-50">
              {columns.map(([key]) => (
                <td key={key} className="px-3 py-2 text-bloomberg-white align-top">
                  {display(row?.[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

DataTable.propTypes = {
  columns: PropTypes.array.isRequired,
  rows: PropTypes.array,
};

function qualityFreshnessLabel(quality) {
  const freshness = quality?.freshness_status || quality?.freshness;
  if (freshness && typeof freshness === 'object') return freshness.status || 'unknown';
  return freshness || 'unknown';
}

function FieldQualityReport({ dataQuality }) {
  const fieldQuality = dataQuality?.field_quality;
  if (!fieldQuality || typeof fieldQuality !== 'object') return null;
  const rows = Object.entries(fieldQuality).map(([field, quality]) => ({
    field: field.replaceAll('_', ' '),
    status: quality?.status || 'unknown',
    source: quality?.source || 'N/A',
    confidence: quality?.confidence_score ?? 'N/A',
    freshness: qualityFreshnessLabel(quality),
    as_of_date: quality?.as_of_date || quality?.freshness_status?.as_of_date || 'N/A',
    warnings: Array.isArray(quality?.warnings) ? quality.warnings.join(' | ') : 'N/A',
    reason: quality?.reason || 'N/A',
    vendor_attempts: Array.isArray(quality?.vendor_attempts)
      ? quality.vendor_attempts.map((item) => `${item.vendor || 'vendor'}:${item.status || 'unknown'}`).join(', ')
      : 'N/A',
  }));
  return (
    <Section title="FIELD QUALITY">
      <DataTable
        columns={[
          ['field', 'Field'],
          ['status', 'Status'],
          ['source', 'Source'],
          ['confidence', 'Confidence'],
          ['freshness', 'Freshness'],
          ['as_of_date', 'As Of'],
          ['warnings', 'Warnings'],
          ['reason', 'Reason'],
          ['vendor_attempts', 'Vendor Attempts'],
        ]}
        rows={rows}
      />
    </Section>
  );
}

FieldQualityReport.propTypes = {
  dataQuality: PropTypes.object,
};

function ConflictFieldsReport({ dataQuality }) {
  const fieldQuality = dataQuality?.field_quality;
  if (!fieldQuality || typeof fieldQuality !== 'object') return null;
  const rows = Object.entries(fieldQuality)
    .filter(([, quality]) => String(quality?.status || '').toLowerCase() === 'conflict')
    .map(([field, quality]) => ({
      field: field.replaceAll('_', ' '),
      source: quality?.source || 'N/A',
      warnings: Array.isArray(quality?.warnings) ? quality.warnings.join(' | ') : 'N/A',
      vendor_values: quality?.vendor_values ? JSON.stringify(quality.vendor_values) : 'N/A',
    }));
  if (!rows.length) return null;
  return (
    <Section title="CONFLICT FIELDS">
      <DataTable
        columns={[
          ['field', 'Field'],
          ['source', 'Source'],
          ['warnings', 'Warnings'],
          ['vendor_values', 'Vendor Values'],
        ]}
        rows={rows}
      />
    </Section>
  );
}

ConflictFieldsReport.propTypes = {
  dataQuality: PropTypes.object,
};

function freshnessBadge(status) {
  const normalized = String(status || 'unknown').toLowerCase();
  if (normalized === 'fresh')
    return 'border-bloomberg-green text-bloomberg-green bg-bloomberg-green-dim';
  if (normalized === 'stale')
    return 'border-bloomberg-amber text-bloomberg-amber bg-bloomberg-amber-dim';
  if (normalized === 'outdated')
    return 'border-bloomberg-red text-bloomberg-red bg-bloomberg-red-dim';
  return 'border-bloomberg-border text-bloomberg-muted bg-bloomberg-surface';
}

function formatDateTimeWib(value, includeTime = true) {
  if (!hasValue(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  if (!includeTime || String(value).length <= 10) return String(value).slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}  ${parts.hour}:${parts.minute} WIB`;
}

function DataFreshness({ freshness }) {
  if (!freshness || typeof freshness !== 'object') return null;

  const price = freshness.price || {};
  const financials = freshness.financials || {};
  const news = freshness.news || {};
  const macro = freshness.macro || {};
  const rows = [
    {
      label: 'Price Data',
      detail:
        [formatDateTimeWib(price.timestamp), price.type].filter(Boolean).join(' · ') ||
        'No timestamp metadata',
      status: price.freshness_status,
    },
    {
      label: 'Financial Reports',
      detail:
        [financials.period, financials.period_end_date ? `(${financials.period_end_date})` : null]
          .filter(Boolean)
          .join(' ') || 'No period metadata',
      status: financials.freshness_status,
    },
    {
      label: 'News Coverage',
      detail:
        [
          hasValue(news.lookback_days) ? `Last ${news.lookback_days} days` : null,
          hasValue(news.articles_count) ? `${news.articles_count} articles` : null,
          news.latest_article_date
            ? `latest ${formatDateTimeWib(news.latest_article_date, false)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'No article metadata',
      status: news.freshness_status,
    },
    {
      label: 'Macro Data',
      detail: macro.description || 'Latest available from provider',
      status: macro.freshness_status,
    },
  ];

  return (
    <Section title="DATA FRESHNESS">
      <div className="border border-bloomberg-border">
        {rows.map((row) => {
          const normalized = String(row.status || 'unknown').toLowerCase();
          const needsWarning = ['stale', 'outdated'].includes(normalized);
          return (
            <div
              key={row.label}
              className="border-b border-bloomberg-border last:border-b-0 px-3 py-2"
            >
              <div className="grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-[12rem_1fr_auto] sm:items-center">
                <div className="text-bloomberg-muted">{row.label}</div>
                <div className="text-bloomberg-white">{row.detail}</div>
                <span
                  className={`inline-flex w-fit items-center rounded-sm border px-2 py-0.5 text-[10px] tracking-wider ${freshnessBadge(normalized)}`}
                >
                  ● {normalized.toUpperCase()}
                </span>
              </div>
              {needsWarning && (
                <div className="mt-1 font-mono text-[11px] text-bloomberg-amber">
                  ⚠ Data may not reflect current conditions.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

DataFreshness.propTypes = {
  freshness: PropTypes.object,
};

function DataCompletenessReport({ completeness }) {
  if (!completeness || typeof completeness !== 'object' || Object.keys(completeness).length === 0) return null;
  const completenessGroups = completeness.groups && typeof completeness.groups === 'object'
    ? completeness.groups
    : completeness;
  const rows = Object.entries(completenessGroups)
    .filter(([group]) => group !== 'groups' && group !== 'overall')
    .map(([group, value]) => {
      const payload = value && typeof value === 'object' ? value : { status: value };
      return {
        group: group.replaceAll('_', ' '),
        status: payload.status || payload.label || 'partial',
        percent: payload.completeness_pct ?? payload.completeness_percent ?? payload.percent ?? payload.score ?? 'N/A',
        missing: Array.isArray(payload.missing_fields) ? payload.missing_fields.join(', ') : payload.missing_fields,
      };
    });
  return (
    <Section title="DATA COMPLETENESS">
      <DataTable
        columns={[
          ['group', 'Group'],
          ['status', 'Status'],
          ['percent', 'Completeness'],
          ['missing', 'Missing'],
        ]}
        rows={rows}
      />
    </Section>
  );
}

DataCompletenessReport.propTypes = {
  completeness: PropTypes.object,
};

function FundamentalGapReport({ gapReport }) {
  if (!gapReport || typeof gapReport !== 'object' || Object.keys(gapReport).length === 0) return null;
  const rawRows = gapReport.missing_fields || gapReport.missing || gapReport.gaps || [];
  const rows = Array.isArray(rawRows)
    ? rawRows.map((item) => {
        if (typeof item === 'string') {
          return { field: item, impact: 'medium', recommended_fallback: 'review source metadata', reason: 'Field is missing.' };
        }
        return {
          field: item?.field || item?.name || 'N/A',
          impact: item?.impact || 'medium',
          recommended_fallback: item?.recommended_fallback || item?.fallback || item?.fallback_available || 'N/A',
          reason: item?.reason || item?.missing_reason || 'N/A',
        };
      })
    : [];
  if (!rows.length) return null;
  return (
    <Section title="FUNDAMENTAL GAP REPORT">
      <DataTable
        columns={[
          ['field', 'Field'],
          ['impact', 'Impact'],
          ['recommended_fallback', 'Recommended Fallback'],
          ['reason', 'Reason'],
        ]}
        rows={rows}
      />
    </Section>
  );
}

FundamentalGapReport.propTypes = {
  gapReport: PropTypes.object,
};

function RecommendedActionsReport({ gapReport }) {
  const actions = Array.isArray(gapReport?.recommended_actions) ? gapReport.recommended_actions : [];
  if (!actions.length) return null;
  return (
    <Section title="RECOMMENDED ACTIONS">
      <ListItems items={actions} />
    </Section>
  );
}

RecommendedActionsReport.propTypes = {
  gapReport: PropTypes.object,
};

function ResponseSourceWarnings({ result }) {
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  const rootQuality = result?.data_quality;
  const sources = result?.data_sources;
  if (!warnings.length && !rootQuality && !sources) return null;
  return (
    <Section title="RESPONSE DATA STATUS">
      <div className="space-y-2">
        {sources && (
          <div className="space-y-1">
            {Object.entries(sources).map(([label, sourcePayload]) => (
              <DataSourceBadge key={label} sources={sourcePayload} label={`${label.replaceAll('_', ' ')} sources`} />
            ))}
          </div>
        )}
        {rootQuality && typeof rootQuality === 'object' && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(rootQuality)
              .filter(([, value]) => typeof value === 'string' || (value && typeof value === 'object' && (value.status || value.confidence_score || value.reason)))
              .slice(0, 12)
              .map(([field, value]) => (
                <DataStatusBadge
                  key={field}
                  compact
                  quality={typeof value === 'object' ? value : undefined}
                  status={typeof value === 'string' ? value : value.status}
                  source={typeof value === 'object' ? value.source : undefined}
                  reason={field.replaceAll('_', ' ')}
                />
              ))}
          </div>
        )}
        {warnings.length > 0 && <ListItems items={warnings} />}
      </div>
    </Section>
  );
}

ResponseSourceWarnings.propTypes = {
  result: PropTypes.object,
};


function VendorAttemptsReport({ attempts }) {
  if (!attempts || typeof attempts !== 'object' || Object.keys(attempts).length === 0) return null;
  const rows = Object.entries(attempts).flatMap(([field, entries]) => {
    const list = Array.isArray(entries) ? entries : [];
    return list.map((entry) => {
      if (entry && typeof entry === 'object') {
        return {
          field: field.replaceAll('_', ' '),
          vendor: entry.vendor || 'N/A',
          status: entry.status || 'unknown',
          reason: entry.reason || 'N/A',
          duration_ms: entry.duration_ms ?? 'N/A',
        };
      }
      const text = String(entry || '');
      const [vendor, rest = 'unknown'] = text.split(':');
      return { field: field.replaceAll('_', ' '), vendor, status: rest, reason: 'N/A', duration_ms: 'N/A' };
    });
  });
  if (!rows.length) return null;
  return (
    <Section title="VENDOR ATTEMPTS">
      <DataTable
        columns={[
          ['field', 'Field'],
          ['vendor', 'Vendor'],
          ['status', 'Status'],
          ['reason', 'Reason'],
          ['duration_ms', 'Duration MS'],
        ]}
        rows={rows}
      />
    </Section>
  );
}

VendorAttemptsReport.propTypes = {
  attempts: PropTypes.object,
};

function RiskSummary({ payload }) {
  const summary = payload?.risk_summary || {};
  return (
    <Section title="RISK SUMMARY">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <MetricBox
          label="Overall Risk"
          value={labelize(summary.overall_risk)}
          compact
          preserveSlot
        />
        <MetricBox label="Risk Score" value={display(summary.risk_score)} compact preserveSlot />
        <MetricBox
          label="Data Confidence"
          value={labelize(payload?.data_quality?.confidence)}
          compact
          preserveSlot
        />
      </div>
      <p className="font-mono text-xs text-bloomberg-muted leading-relaxed">
        {display(summary.risk_explanation)}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-2">
            Main Risks
          </div>
          <ListItems items={summary.main_risks} />
        </div>
        <div>
          <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-2">
            Risk Flags
          </div>
          <ListItems items={summary.risk_flags} />
        </div>
      </div>
    </Section>
  );
}

RiskSummary.propTypes = {
  payload: PropTypes.object,
};

function BalanceSheetRiskSummary({ payload }) {
  const summary = payload?.balance_sheet_risk_summary || {};
  return (
    <Section title="BALANCE SHEET RISK SUMMARY">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <MetricBox label="DER" value={display(summary.der)} compact preserveSlot />
        <MetricBox label="Net Debt" value={display(summary.net_debt)} compact preserveSlot />
        <MetricBox
          label="Debt / EBITDA"
          value={display(summary.debt_to_ebitda)}
          compact
          preserveSlot
        />
        <MetricBox label="Cash Ratio" value={display(summary.cash_ratio)} compact preserveSlot />
        <MetricBox label="Risk Level" value={labelize(summary.risk_level)} compact preserveSlot />
      </div>
      <p className="font-mono text-xs text-bloomberg-muted leading-relaxed">
        {display(summary.interpretation)}
      </p>
    </Section>
  );
}

BalanceSheetRiskSummary.propTypes = {
  payload: PropTypes.object,
};

function MarketRisk({ payload }) {
  const market = payload?.market_risk || {};
  return (
    <Section title="MARKET RISK">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <MetricBox
          label="Volatility"
          value={percent(market.volatility_percent)}
          compact
          preserveSlot
        />
        <MetricBox
          label="Max Drawdown"
          value={percent(market.max_drawdown_percent)}
          compact
          preserveSlot
        />
        <MetricBox label="ATR" value={display(market.atr)} compact preserveSlot />
        <MetricBox
          label="Price Range"
          value={percent(market.price_range_percent)}
          compact
          preserveSlot
        />
        <MetricBox label="Risk Bucket" value={labelize(market.risk_bucket)} compact preserveSlot />
      </div>
      <ListItems items={market.notes} />
    </Section>
  );
}

MarketRisk.propTypes = {
  payload: PropTypes.object,
};

function RiskAdjustedReturn({ payload }) {
  const riskReturn = payload?.risk_adjusted_return || {};
  return (
    <Section title="RISK-ADJUSTED RETURN">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <MetricBox label="Upside" value={percent(riskReturn.upside_percent)} compact preserveSlot />
        <MetricBox
          label="Downside"
          value={percent(riskReturn.downside_percent)}
          compact
          preserveSlot
        />
        <MetricBox
          label="Risk / Reward"
          value={display(riskReturn.risk_reward_ratio)}
          compact
          preserveSlot
        />
        <MetricBox
          label="Expected Return"
          value={labelize(riskReturn.expected_return_label)}
          compact
          preserveSlot
        />
      </div>
      <ListItems items={riskReturn.notes} />
    </Section>
  );
}

RiskAdjustedReturn.propTypes = {
  payload: PropTypes.object,
};

function ThesisMonitor({ payload }) {
  const monitor = payload?.thesis_monitor || {};
  return (
    <Section title="THESIS INVALIDATION CHECKLIST">
      <MetricBox
        label="Overall Thesis Status"
        value={labelize(monitor.overall_thesis_status)}
        compact
        preserveSlot
      />
      <DataTable
        columns={[
          ['category', 'Category'],
          ['condition', 'Condition'],
          ['status', 'Status'],
          ['reason', 'Reason'],
        ]}
        rows={monitor.checklist}
      />
    </Section>
  );
}

ThesisMonitor.propTypes = {
  payload: PropTypes.object,
};

function CatalystRisk({ payload }) {
  return (
    <Section title="CATALYST RISK">
      <DataTable
        columns={[
          ['type', 'Type'],
          ['label', 'Label'],
          ['impact', 'Impact'],
          ['date', 'Date'],
          ['source', 'Source'],
          ['reason', 'Reason'],
        ]}
        rows={payload?.catalyst_risk}
      />
    </Section>
  );
}

CatalystRisk.propTypes = {
  payload: PropTypes.object,
};

function DataQualityScore({ payload }) {
  const quality = payload?.data_quality || {};
  const breakdown = quality.score_breakdown || {};
  return (
    <Section title="DATA QUALITY SCORE">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <MetricBox label="Score" value={display(quality.score)} compact preserveSlot />
        <MetricBox label="Confidence" value={labelize(quality.confidence)} compact preserveSlot />
        <MetricBox label="Summary" value={display(quality.summary)} compact preserveSlot />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        {[
          ['price_data', 'Price'],
          ['financial_data', 'Financial'],
          ['valuation_data', 'Valuation'],
          ['news_data', 'News'],
          ['vendor_success', 'Vendor'],
          ['freshness', 'Freshness'],
        ].map(([key, label]) => (
          <MetricBox key={key} label={label} value={display(breakdown[key])} compact preserveSlot />
        ))}
      </div>
    </Section>
  );
}

DataQualityScore.propTypes = {
  payload: PropTypes.object,
};

function SourceConfidence({ payload }) {
  const vendorRows = Object.entries(payload?.vendor_status || {}).map(([vendor, item]) => ({
    vendor,
    status: item?.status,
    used_for: Array.isArray(item?.used_for) ? item.used_for.join(', ') : item?.used_for,
    missing_fields: Array.isArray(item?.missing_fields)
      ? item.missing_fields.join(', ')
      : item?.missing_fields,
  }));

  return (
    <>
      <Section title="VENDOR STATUS">
        <DataTable
          columns={[
            ['vendor', 'Vendor'],
            ['status', 'Status'],
            ['used_for', 'Used For'],
            ['missing_fields', 'Missing Fields'],
          ]}
          rows={vendorRows}
        />
      </Section>
      <Section title="MISSING FIELDS">
        <DataTable
          columns={[
            ['module', 'Module'],
            ['field', 'Field'],
            ['impact', 'Impact'],
            ['fallback_available', 'Fallback Available'],
          ]}
          rows={payload?.missing_fields}
        />
      </Section>
      <Section title="FALLBACK USED">
        <DataTable
          columns={[
            ['field', 'Field'],
            ['method', 'Method'],
            ['confidence', 'Confidence'],
          ]}
          rows={payload?.fallback_used}
        />
      </Section>
      <Section title="STALE DATA WARNING">
        <DataTable
          columns={[
            ['module', 'Module'],
            ['field', 'Field'],
            ['warning', 'Warning'],
            ['severity', 'Severity'],
          ]}
          rows={payload?.stale_data_warning}
        />
      </Section>
      <Section title="CALCULATION NOTES">
        <ListItems items={payload?.calculation_notes} />
      </Section>
    </>
  );
}

SourceConfidence.propTypes = {
  payload: PropTypes.object,
};

export default function RiskDataQualityTab({ result }) {
  const payload = result?.risk_data_quality;
  if (!payload || Object.keys(payload).length === 0) {
    return (
      <div className="px-4 py-4 border-b border-bloomberg-border">
        <NoticeBox title="RISK DATA QUALITY UNAVAILABLE" tone="amber">
          Risk and source confidence data is not available for this analysis.
        </NoticeBox>
      </div>
    );
  }

  return (
    <>
      <ResponseSourceWarnings result={result} />
      <FieldQualityReport dataQuality={result?.data_quality} />
      <ConflictFieldsReport dataQuality={result?.data_quality} />
      <DataCompletenessReport completeness={result?.data_completeness} />
      <FundamentalGapReport gapReport={result?.fundamental_gap_report} />
      <RecommendedActionsReport gapReport={result?.fundamental_gap_report} />
      <VendorAttemptsReport attempts={result?.vendor_attempts} />
      <DataFreshness freshness={result?.data_freshness} />
      <RiskSummary payload={payload} />
      <BalanceSheetRiskSummary payload={payload} />
      <MarketRisk payload={payload} />
      <RiskAdjustedReturn payload={payload} />
      <ThesisMonitor payload={payload} />
      <CatalystRisk payload={payload} />
      <DataQualityScore payload={payload} />
      <SourceConfidence payload={payload} />
    </>
  );
}

RiskDataQualityTab.propTypes = {
  result: PropTypes.object,
};
