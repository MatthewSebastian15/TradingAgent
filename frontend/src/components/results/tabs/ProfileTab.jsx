import { useState } from 'react';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { SignalBadge } from '@/components/ui/signal-badge';
import { safeExternalUrl } from '../../../utils/url';
import { formatPrice } from '../../../utils/formatting';

const TERMINAL_GHOST_BUTTON_CLASS =
  'rounded-none border border-bloomberg-border bg-black font-mono text-xs uppercase tracking-wider text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-orange-dim hover:text-bloomberg-orange focus-visible:ring-1 focus-visible:ring-bloomberg-orange focus-visible:ring-offset-0';

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
  if (typeof value === 'number') return value.toLocaleString('en-US');
  return String(value);
}

function displayDash(value) {
  return hasValue(value) ? display(value) : '-';
}

function numberOrNull(value) {
  if (!hasValue(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPercent(value) {
  const number = numberOrNull(value);
  if (number === null) return displayDash(value);
  return `${number <= 1 ? Math.round(number * 100) : number}%`;
}

function formatRiskReward(result = {}) {
  if (hasValue(result.risk_reward_display)) return result.risk_reward_display;
  if (!hasValue(result.risk_reward_ratio)) return 'N/A';
  return typeof result.risk_reward_ratio === 'number'
    ? `1:${Math.round(result.risk_reward_ratio)}`
    : result.risk_reward_ratio;
}

function currentPriceValue(result = {}, profile = {}) {
  return (
    result.last_price ??
    result.current_price ??
    result.last_close_price ??
    profile.current_price ??
    profile.regularMarketPrice
  );
}

function formattedPrice(value, result = {}, profile = {}) {
  if (!hasValue(value)) return 'N/A';
  return (
    formatPrice(
      value,
      result.ticker || profile.ticker,
      result.price_currency || profile.currency
    ) || 'N/A'
  );
}

function signalValue(result = {}) {
  return (
    result.display_signal || result.final_decision || result.decision || result.rating || 'HOLD'
  );
}

function firstText(...values) {
  for (const value of values) {
    if (hasValue(value)) return String(value);
  }
  return '';
}

function splitThesis(thesis) {
  const text = String(thesis || '');
  const bullMatch = text.match(/(The bull case[^.]*\.[\s\S]*?)(?=The bear case|$)/i);
  const bearMatch = text.match(
    /(The bear case[^.]*\.[\s\S]*?)(?=That bear case|The action plan|$)/i
  );
  return {
    bull: bullMatch?.[1]?.trim() || text,
    bear: bearMatch?.[1]?.trim() || text,
  };
}

function riskSummaryText(result = {}) {
  const risk =
    result.analysis_overview?.risk_summary ||
    result.risk_summary ||
    result.risk_data_quality?.risk_summary;
  if (typeof risk === 'string') return risk;
  if (risk && typeof risk === 'object') {
    return [
      risk.overall_risk && `Overall risk: ${risk.overall_risk}`,
      risk.short_reason || risk.risk_explanation,
      Array.isArray(risk.main_risks) ? `Main risks: ${risk.main_risks.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('. ');
  }
  return result.mini_risk_summary || 'N/A';
}

function scenarioRows(scenarioAnalysis) {
  if (!scenarioAnalysis || typeof scenarioAnalysis !== 'object') return [];
  return Object.entries(scenarioAnalysis)
    .filter(([, value]) => value && typeof value === 'object')
    .map(([key, value]) => ({
      key,
      title: key.replace(/_/g, ' ').toUpperCase(),
      value:
        value.summary ||
        value.thesis ||
        value.description ||
        value.fair_value_display ||
        JSON.stringify(value),
    }));
}

function dataQualityWarnings(dataQuality) {
  if (!dataQuality || typeof dataQuality !== 'object') return [];
  const okValues = new Set(['ok', 'valid', 'success', 'complete', 'available']);
  const rows = [];

  Object.entries(dataQuality).forEach(([key, value]) => {
    if (typeof value !== 'string') return;
    const status = value.trim().toLowerCase();
    if (!status || okValues.has(status)) return;
    rows.push({ key, status });
  });

  if (Array.isArray(dataQuality.warning_details)) {
    dataQuality.warning_details.forEach((warning, index) => {
      const code = warning?.code || `warning_${index + 1}`;
      const status = warning?.severity || warning?.status || 'partial';
      rows.push({ key: code, status, message: warning?.message });
    });
  }

  return rows;
}

function warningTone(status) {
  const normalized = String(status || '').toLowerCase();
  if (['missing', 'error', 'invalid', 'unavailable', 'failed'].includes(normalized)) {
    return 'border-red-500/70 bg-red-500/15 text-red-300';
  }
  return 'border-yellow-500/70 bg-yellow-500/15 text-yellow-300';
}

function formatOwnershipPercent(value) {
  const number = numberOrNull(value);
  if (number === null) return '-';
  const ratio = Math.abs(number) > 1 ? number : number * 100;
  return `${ratio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function firstProfileValue(profile, keys) {
  const sources = [profile, profile?.shares_ownership, profile?.ownership].filter(Boolean);
  for (const source of sources) {
    for (const key of keys) {
      if (hasValue(source[key])) return source[key];
    }
  }
  return null;
}

function DataQualityWarnings({ dataQuality }) {
  const [dismissed, setDismissed] = useState(false);
  const warnings = dataQualityWarnings(dataQuality);
  if (dismissed || warnings.length === 0) return null;

  return (
    <Card className="rounded-md border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4">
        <CardTitle className="text-sm uppercase tracking-widest">Data quality warnings</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Dismiss data quality warnings"
          onClick={() => setDismissed(true)}
          className={TERMINAL_GHOST_BUTTON_CLASS}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 p-4 pt-0">
        {warnings.map((warning) => (
          <Badge
            key={`${warning.key}-${warning.status}`}
            className={`border font-mono uppercase tracking-wide ${warningTone(warning.status)}`}
          >
            {warning.key.replace(/_/g, ' ')}: {warning.status}
          </Badge>
        ))}
      </CardContent>
    </Card>
  );
}

DataQualityWarnings.propTypes = {
  dataQuality: PropTypes.object,
};

export default function ProfileTab({ profile, result = {} }) {
  const [thesisOpen, setThesisOpen] = useState(true);

  if (!profile || !profile.available) {
    return (
      <div className="border-b border-border p-4">
        <Card className="rounded-md border-yellow-500/70 bg-yellow-500/10">
          <CardContent className="p-4 text-sm text-yellow-300">
            <div className="mb-2 font-semibold uppercase tracking-widest">PROFILE UNAVAILABLE</div>
            <div>
              {profile?.warning || 'Company profile data is not available for this ticker.'}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const companyName = profile.company_name || profile.name || 'N/A';
  const ticker = result.normalized_ticker || result.ticker || profile.ticker || 'N/A';
  const currentPrice = currentPriceValue(result, profile);
  const thesis = firstText(result.analysis_overview?.investment_thesis, result.investment_thesis);
  const thesisParts = {
    bull: firstText(
      result.bull_thesis,
      result.bull_case,
      result.bull_report,
      splitThesis(thesis).bull
    ),
    bear: firstText(
      result.bear_thesis,
      result.bear_case,
      result.bear_report,
      splitThesis(thesis).bear
    ),
  };
  const websiteUrl = safeExternalUrl(profile.website);
  const scenarios = scenarioRows(result.scenario_analysis);

  const metrics = [
    ['Entry price', formattedPrice(result.entry_price, result, profile)],
    ['Stop loss', formattedPrice(result.stop_loss, result, profile)],
    ['Take profit', formattedPrice(result.take_profit, result, profile)],
    ['Risk/reward ratio', formatRiskReward(result)],
    [
      'Position sizing',
      result.position_sizing?.position_size ||
        result.position_size_hint ||
        result.position_sizing_reason ||
        'N/A',
    ],
    ['Suggested allocation percent', formatPercent(result.suggested_allocation_percent)],
  ];

  const ownershipRows = [
    [
      'Shares out',
      displayDash(
        firstProfileValue(profile, ['shares_out', 'shares_outstanding', 'sharesOutstanding'])
      ),
    ],
    [
      'Insider',
      formatOwnershipPercent(
        firstProfileValue(profile, ['insider_pct', 'insider_percent', 'heldPercentInsiders'])
      ),
    ],
    [
      'Institution',
      formatOwnershipPercent(
        firstProfileValue(profile, [
          'institution_pct',
          'institution_percent',
          'heldPercentInstitutions',
        ])
      ),
    ],
    ['Short ratio', displayDash(firstProfileValue(profile, ['short_ratio', 'shortRatio']))],
  ];

  return (
    <div className="space-y-4 border-b border-border p-4">
      <Card className="rounded-md border-border bg-card">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              COMPANY PROFILE
            </div>
            <div className="font-mono text-2xl font-semibold tracking-wide text-primary">
              {ticker}
            </div>
            <div className="mt-1 font-sans text-lg text-foreground">{companyName}</div>
            {websiteUrl ? (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex font-mono text-sm text-bloomberg-orange underline-offset-4 hover:text-orange-300 hover:underline"
              >
                {profile.website}
              </a>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">{display(profile.website)}</div>
            )}
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="font-mono text-2xl font-semibold text-foreground">
              {formattedPrice(currentPrice, result, profile)}
            </div>
            <SignalBadge signal={signalValue(result)} confidence={result.confidence_score} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} />
        ))}
      </div>

      <Card className="rounded-md border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4">
          <CardTitle className="text-sm uppercase tracking-widest">Investment thesis</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setThesisOpen((open) => !open)}
            className={TERMINAL_GHOST_BUTTON_CLASS}
          >
            {thesisOpen ? 'Hide' : 'Show'}
          </Button>
        </CardHeader>
        {thesisOpen && (
          <CardContent className="grid grid-cols-1 gap-4 p-4 pt-0 lg:grid-cols-2">
            <div className="rounded-md border border-green-500/40 bg-green-500/10 p-4">
              <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-green-300">
                Bull thesis
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {display(thesisParts.bull)}
              </p>
            </div>
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4">
              <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-red-300">
                Bear thesis
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {display(thesisParts.bear)}
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="rounded-md border-border bg-card">
        <CardHeader className="p-4">
          <CardTitle className="text-sm uppercase tracking-widest">Risk summary</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <p className="text-sm leading-relaxed text-muted-foreground">{riskSummaryText(result)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-md border-border bg-card">
        <CardHeader className="p-4">
          <CardTitle className="text-sm uppercase tracking-widest">Scenario analysis</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 p-4 pt-0 md:grid-cols-3">
          {scenarios.length > 0 ? (
            scenarios.map((scenario) => (
              <div key={scenario.key} className="rounded-md border border-border bg-black p-3">
                <div className="mb-2 font-mono text-xs text-primary">{scenario.title}</div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {display(scenario.value)}
                </p>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">N/A</div>
          )}
        </CardContent>
      </Card>

      <DataQualityWarnings dataQuality={result.data_quality} />

      <Card className="rounded-md border-border bg-card">
        <CardHeader className="p-4">
          <CardTitle className="text-sm uppercase tracking-widest">Company details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 p-4 pt-0 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Country" value={display(profile.country)} />
          <MetricCard label="Sector" value={display(profile.sector)} />
          <MetricCard label="Industry" value={display(profile.industry)} />
          <MetricCard label="Market cap" value={display(profile.market_cap)} />
          <MetricCard
            label="Employees"
            value={display(profile.employee_count ?? profile.full_time_employees)}
          />
          {ownershipRows.map(([label, value]) => (
            <MetricCard key={label} label={label} value={value} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

ProfileTab.propTypes = {
  profile: PropTypes.object,
  result: PropTypes.object,
};
