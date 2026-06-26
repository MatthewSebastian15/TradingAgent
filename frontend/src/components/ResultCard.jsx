import PropTypes from 'prop-types';
import React, { useState } from 'react';

import ConfidenceBreakdown from './ConfidenceBreakdown';
import DisclaimerFooter from './DisclaimerFooter';
import RerunPanel from './RerunPanel';
import { ActionableMetrics, HoldMetrics } from './results/ActionPlanMetrics';
import MetricBox from './results/MetricBox';
import NoticeBox from './results/NoticeBox';
import ReportActions from './results/ReportActions';
import SectionHeader from './results/SectionHeader';
import { useResultSections } from '../hooks/useResultSections';
import {
  formatDateTimeLabel,
  formatPrice,
  formatTickerLabel,
  formatTradeDateLabel,
} from '../utils/formatting';
import {
  buildRecommendationRiskParagraph,
  coalesceDisplayValue,
  confidenceTone,
  formatAnalysisHorizon,
  formatConfidenceDisplay,
  formatDataSourcePriceLabel,
  formatDevicePriceTimestamp,
  formatPercent,
  formatPriceAsOf,
  formatRiskReward,
  getCurrentPrice,
  getError,
  getFinalDecision,
  hasDisplayValue,
  normalizeSignal,
  parseBold,
  truncateWords,
  wordCount,
} from '../utils/resultCardFormatters';
import ChartPriceTab from './results/tabs/ChartPriceTab';
import FundamentalTab from './results/tabs/FundamentalTab';
import NewsTab from './results/tabs/NewsTab';
import ProfileTab from './results/tabs/ProfileTab';
import ResultTabs from './results/tabs/ResultTabs';

const ACTIONABLE_DECISIONS = new Set(['BUY', 'SELL', 'Buy', 'Overweight', 'Sell', 'Underweight']);


function DecisionBadge({ decision }) {
  const signal = normalizeSignal(decision);
  const cfg = {
    BUY: {
      classes: 'bg-bloomberg-green-dim border-bloomberg-green text-bloomberg-green',
      label: '▲ BUY',
    },
    SELL: {
      classes: 'bg-bloomberg-red-dim border-bloomberg-red text-bloomberg-red',
      label: '▼ SELL',
    },
    HOLD: {
      classes: 'bg-bloomberg-amber-dim border-bloomberg-amber text-bloomberg-amber',
      label: '◆ HOLD',
    },
    WAIT: {
      classes: 'bg-bloomberg-surface border-bloomberg-border text-bloomberg-muted',
      label: '◇ WAIT',
    },
    REDUCE: {
      classes: 'bg-bloomberg-amber-dim border-bloomberg-amber text-bloomberg-amber',
      label: '◒ REDUCE',
    },
  };
  const c = cfg[signal] || cfg.HOLD;
  return (
    <span
      className={`inline-block border px-3 py-1 font-mono text-xs font-bold tracking-widest ${c.classes}`}
    >
      {c.label}
    </span>
  );
}

DecisionBadge.propTypes = {
  decision: PropTypes.string,
};


function ExpandableTextSection({
  label,
  text,
  expanded,
  onToggle,
  collapsedWords,
  expandedMaxClass,
  expandLabel,
}) {
  if (!hasDisplayValue(text)) return null;

  const needsToggle = wordCount(text) > collapsedWords;
  const visibleText = expanded || !needsToggle ? text : truncateWords(text, collapsedWords);

  return (
    <div className="px-4 py-3 border-b border-bloomberg-border">
      <SectionHeader label={label} />
      <div
        className={`relative ${expanded ? `${expandedMaxClass} overflow-y-auto pr-2` : 'overflow-hidden'}`}
      >
        <p className="ai-summary-paragraph text-justify font-mono text-xs leading-relaxed text-bloomberg-muted">
          {parseBold(visibleText)}
        </p>
        {!expanded && needsToggle && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-bloomberg-card to-transparent" />
        )}
      </div>
      {needsToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-1.5 font-mono text-[11px] tracking-wider text-bloomberg-orange transition-colors hover:text-orange-300"
        >
          {expanded ? 'Collapse' : expandLabel}
        </button>
      )}
    </div>
  );
}

ExpandableTextSection.propTypes = {
  label: PropTypes.string.isRequired,
  text: PropTypes.string,
  expanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  collapsedWords: PropTypes.number.isRequired,
  expandedMaxClass: PropTypes.string.isRequired,
  expandLabel: PropTypes.string.isRequired,
};

function buildResultViewModel(result) {
  const displayTicker = result.normalized_ticker || result.ticker;
  const displayResult = { ...result, ticker: displayTicker };
  const finalDecision = getFinalDecision(result);
  const rawAiSignal = normalizeSignal(
    result.raw_ai_signal || result.llm_decision || result.final_decision || result.decision
  );
  const isActionable = ACTIONABLE_DECISIONS.has(finalDecision);
  const tradePlanValid = Boolean(result.trade_plan_valid);
  const analysisOverview = result.analysis_overview || {};
  const currentPrice = getCurrentPrice(result);
  const currentPriceAsOf = coalesceDisplayValue(
    result.price_timestamp,
    result.current_price_as_of,
    result.last_close_price_as_of
  );
  const catalysts = result.key_catalysts || [];
  const riskSummary = analysisOverview.risk_summary || null;
  const miniRiskSummary = result.mini_risk_summary;
  return {
    displayTicker,
    displayResult,
    finalDecision,
    rawAiSignal,
    isActionable,
    tradePlanValid,
    shouldShowActionPlan: isActionable && tradePlanValid,
    shouldShowHoldMetrics: !(isActionable && tradePlanValid),
    summary: analysisOverview.executive_summary || result.executive_summary,
    thesis: analysisOverview.investment_thesis || result.investment_thesis,
    currentPrice,
    priceAsOfLabel: formatPriceAsOf(result, currentPriceAsOf),
    priceTimestampLabel: formatDevicePriceTimestamp(currentPriceAsOf),
    currentPriceSource: formatDataSourcePriceLabel(result),
    timeHorizon: formatAnalysisHorizon(result.time_horizon_months, result.time_horizon),
    confidenceDisplay: formatConfidenceDisplay(
      result.confidence_score ?? null,
      result.confidence_label
    ),
    allocation: result.suggested_allocation_percent ?? null,
    riskReward: formatRiskReward(result),
    catalysts,
    invalidations: result.invalidation_conditions || [],
    recommendationRiskParagraph: buildRecommendationRiskParagraph({
      paragraph: analysisOverview.key_reasons_paragraph || result.key_reasons_paragraph,
      reasons: analysisOverview.key_reasons || result.key_reasons,
      catalysts,
      miniRiskSummary,
      riskSummary,
      decisionReason: result.decision_adjusted_reason,
    }),
    agents: result.agents_used || [],
    budgetExhausted: Boolean(result.budget_exhausted),
    agentsSkipped: result.agents_skipped || [],
    canShowRaw: result.response_detail === 'debug',
    createdAtLabel: formatDateTimeLabel(result.analysis_created_at || result.saved_at),
    decisionColor:
      {
        BUY: 'text-bloomberg-green',
        SELL: 'text-bloomberg-red',
        HOLD: 'text-bloomberg-amber',
        WAIT: 'text-bloomberg-muted',
        REDUCE: 'text-bloomberg-amber',
      }[finalDecision] || 'text-bloomberg-white',
  };
}

function ResultError({ error }) {
  return (
    <div className="border border-bloomberg-red bg-bloomberg-red-dim animate-fade-up">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bloomberg-red border-opacity-30">
        <span className="font-mono text-xs font-semibold text-bloomberg-red tracking-wider">
          PIPELINE ERROR
        </span>
      </div>
      <div className="px-3 py-3">
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-snug text-bloomberg-red">
          {getError(error)}
        </pre>
      </div>
    </div>
  );
}

ResultError.propTypes = {
  error: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
};

function ResultCardHeader({
  result,
  displayResult,
  timeHorizon,
  createdAtLabel,
  enableReportExport,
  onRerunSubmit,
  rerunRunning,
  onToggleRerun,
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-bloomberg-border bg-black px-4 py-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs tracking-wider text-bloomberg-muted">
          ANALYSIS COMPLETE
        </span>
        <span className="font-mono text-xs text-bloomberg-green">●</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {timeHorizon && (
          <span className="truncate font-mono text-xs text-bloomberg-orange">
            Analysis Horizon: {timeHorizon}
          </span>
        )}
        <span className="flex-shrink-0 font-mono text-xs text-bloomberg-muted">
          Trade Date: {formatTradeDateLabel(result.trade_date)}
        </span>
        {createdAtLabel && (
          <span className="flex-shrink-0 font-mono text-xs text-bloomberg-muted">
            Created: {createdAtLabel}
          </span>
        )}
        <ReportActions
          result={result}
          displayResult={displayResult}
          enableReportExport={enableReportExport}
          onRerunSubmit={onRerunSubmit}
          rerunRunning={rerunRunning}
          onToggleRerun={onToggleRerun}
        />
      </div>
    </div>
  );
}

ResultCardHeader.propTypes = {
  createdAtLabel: PropTypes.string,
  displayResult: PropTypes.object,
  enableReportExport: PropTypes.bool.isRequired,
  onRerunSubmit: PropTypes.func,
  onToggleRerun: PropTypes.func.isRequired,
  rerunRunning: PropTypes.bool.isRequired,
  result: PropTypes.object.isRequired,
  timeHorizon: PropTypes.string,
};

function DecisionHero({ result, vm }) {
  return (
    <div className="flex flex-col gap-4 border-b border-bloomberg-border px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className={`font-display text-4xl font-bold tracking-wider ${vm.decisionColor}`}>
          {formatTickerLabel(vm.displayTicker)}
        </div>
        <div className="mt-2">
          <DecisionBadge decision={vm.finalDecision} />
        </div>
        {vm.currentPriceSource && (
          <div className="mt-0.5 break-all font-mono text-[10px] tracking-wider text-bloomberg-muted">
            <span className="text-bloomberg-white">{vm.currentPriceSource}</span>
          </div>
        )}
        {vm.rawAiSignal && vm.rawAiSignal !== vm.finalDecision && (
          <div className="mt-0.5 font-mono text-[11px] tracking-wider text-bloomberg-muted">
            LLM: {vm.rawAiSignal} → FINAL: {String(vm.finalDecision).toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-w-0 w-full lg:w-[44rem] lg:flex-shrink-0 max-w-full">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {hasDisplayValue(vm.currentPrice) && (
            <MetricBox
              label="LAST PRICE"
              value={formatPrice(
                vm.currentPrice,
                vm.displayTicker,
                result.price_currency || result.currency
              )}
              subValue={
                result.price_is_fallback || !vm.priceTimestampLabel
                  ? null
                  : `as of ${vm.priceTimestampLabel}`
              }
              highlight
            />
          )}
          {vm.priceAsOfLabel && <MetricBox label="PRICE AS OF" value={vm.priceAsOfLabel} />}
          {vm.timeHorizon && <MetricBox label="HORIZON" value={vm.timeHorizon} />}
          {vm.confidenceDisplay && (
            <MetricBox
              label="CONFIDENCE"
              value={vm.confidenceDisplay}
              tone={confidenceTone(result.confidence_tier)}
              tooltip="Score reflects combined signal strength from all 9 agents."
            />
          )}
          {vm.allocation !== null && (
            <MetricBox label="ALLOCATION" value={formatPercent(vm.allocation)} />
          )}
        </div>
        <ConfidenceBreakdown breakdown={result.confidence_breakdown} />
        {result.price_is_fallback && (
          <div className="mt-2 font-mono text-xs leading-relaxed text-bloomberg-amber">
            ⚠ Harga tidak tersedia saat analisis dibuat. Menampilkan harga penutupan terakhir.
          </div>
        )}
      </div>
    </div>
  );
}

DecisionHero.propTypes = {
  result: PropTypes.object.isRequired,
  vm: PropTypes.object.isRequired,
};

function ValidationNotices({ result, vm }) {
  if (!result.decision_adjusted && !(vm.isActionable && !vm.tradePlanValid)) return null;
  return (
    <div className="px-3 py-3 border-b border-bloomberg-border">
      {result.decision_adjusted && (
        <NoticeBox title="DECISION ADJUSTED">
          {result.decision_adjusted_reason || 'Backend validation changed the final decision.'}
        </NoticeBox>
      )}
      {vm.isActionable && !vm.tradePlanValid && (
        <div className={result.decision_adjusted ? 'mt-3' : ''}>
          <NoticeBox title="TRADE PLAN NOT VALID" tone="red">
            Backend validation did not approve a complete actionable trade plan.
          </NoticeBox>
        </div>
      )}
    </div>
  );
}

ValidationNotices.propTypes = {
  result: PropTypes.object.isRequired,
  vm: PropTypes.object.isRequired,
};

function PipelineLimitNotice({ agentsSkipped }) {
  return (
    <div className="border-b border-bloomberg-border bg-bloomberg-amber bg-opacity-5 px-3 py-3">
      <SectionHeader label="PIPELINE LIMIT" />
      <p className="font-mono text-xs leading-relaxed text-bloomberg-amber">
        LLM call budget exhausted before all stages completed. Treat this analysis as incomplete.
      </p>
      {agentsSkipped.length > 0 && (
        <div className="mt-1.5 font-mono text-xs text-bloomberg-muted">
          SKIPPED: {agentsSkipped.join(', ')}
        </div>
      )}
    </div>
  );
}

PipelineLimitNotice.propTypes = {
  agentsSkipped: PropTypes.arrayOf(PropTypes.string).isRequired,
};

function CatalystInvalidationGrid({ catalysts, invalidations }) {
  if (!catalysts.length && !invalidations.length) return null;
  return (
    <div className="grid grid-cols-1 gap-4 border-b border-bloomberg-border px-4 py-3 lg:grid-cols-2">
      {catalysts.length > 0 && (
        <div>
          <SectionHeader label="KEY CATALYSTS" />
          <ul className="flex flex-col gap-1">
            {catalysts.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 font-mono text-[11px] text-bloomberg-green">
                  +
                </span>
                <span className="font-mono text-xs leading-relaxed text-bloomberg-muted">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {invalidations.length > 0 && (
        <div>
          <SectionHeader label="INVALIDATION CONDITIONS" />
          <ul className="flex flex-col gap-1">
            {invalidations.map((inv, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 font-mono text-[11px] text-bloomberg-red">
                  ✕
                </span>
                <span className="font-mono text-xs leading-relaxed text-bloomberg-muted">
                  {inv}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

CatalystInvalidationGrid.propTypes = {
  catalysts: PropTypes.arrayOf(PropTypes.string).isRequired,
  invalidations: PropTypes.arrayOf(PropTypes.string).isRequired,
};

function RecommendationRiskSection({ text }) {
  if (!text) return null;
  return (
    <div className="px-4 py-3 border-b border-bloomberg-border">
      <SectionHeader label="KEY REASONS & RISK SUMMARY" />
      <p className="ai-summary-paragraph text-justify font-mono text-xs leading-relaxed text-bloomberg-muted">
        {text}
      </p>
    </div>
  );
}

RecommendationRiskSection.propTypes = {
  text: PropTypes.string,
};

function RawJsonDebug({ result, showRaw, onToggle }) {
  return (
    <div className="px-3 py-2.5">
      <button
        onClick={onToggle}
        className="font-mono text-[11px] tracking-wider text-bloomberg-muted transition-colors hover:text-bloomberg-white"
      >
        {showRaw ? '▲ HIDE' : '▼ RAW JSON'} (DEBUG)
      </button>
      {showRaw && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap border border-bloomberg-border bg-black p-2.5 font-mono text-[11px] leading-snug text-bloomberg-muted">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

RawJsonDebug.propTypes = {
  onToggle: PropTypes.func.isRequired,
  result: PropTypes.object.isRequired,
  showRaw: PropTypes.bool.isRequired,
};

function AnalysisTab({
  result,
  vm,
  summaryExpanded,
  thesisExpanded,
  showRaw,
  onToggleSummary,
  onToggleThesis,
  onToggleRaw,
}) {
  return (
    <>
      <DecisionHero result={result} vm={vm} />

      {!hasDisplayValue(vm.currentPrice) && (
        <div className="px-3 py-3 border-b border-bloomberg-border">
          <NoticeBox title="PRICE DATA MISSING" tone="red">
            Last price is unavailable, so no synthetic price is shown.
          </NoticeBox>
        </div>
      )}

      <ValidationNotices result={result} vm={vm} />

      {vm.shouldShowActionPlan && (
        <ActionableMetrics
          result={vm.displayResult}
          currentPrice={vm.currentPrice}
          riskReward={vm.riskReward}
        />
      )}

      {vm.shouldShowHoldMetrics && (
        <HoldMetrics result={vm.displayResult} currentPrice={vm.currentPrice} />
      )}

      {vm.budgetExhausted && <PipelineLimitNotice agentsSkipped={vm.agentsSkipped} />}

      <CatalystInvalidationGrid catalysts={vm.catalysts} invalidations={vm.invalidations} />

      <ExpandableTextSection
        label="EXECUTIVE SUMMARY"
        text={vm.summary}
        expanded={summaryExpanded}
        onToggle={onToggleSummary}
        collapsedWords={100}
        expandedMaxClass="max-h-[300px]"
        expandLabel="Read More"
      />

      <RecommendationRiskSection text={vm.recommendationRiskParagraph} />

      <ExpandableTextSection
        label="INVESTMENT THESIS"
        text={vm.thesis}
        expanded={thesisExpanded}
        onToggle={onToggleThesis}
        collapsedWords={150}
        expandedMaxClass="max-h-[500px]"
        expandLabel="Read Full Thesis"
      />

      {vm.canShowRaw && <RawJsonDebug result={result} showRaw={showRaw} onToggle={onToggleRaw} />}
    </>
  );
}

AnalysisTab.propTypes = {
  onToggleRaw: PropTypes.func.isRequired,
  onToggleSummary: PropTypes.func.isRequired,
  onToggleThesis: PropTypes.func.isRequired,
  result: PropTypes.object.isRequired,
  showRaw: PropTypes.bool.isRequired,
  summaryExpanded: PropTypes.bool.isRequired,
  thesisExpanded: PropTypes.bool.isRequired,
  vm: PropTypes.object.isRequired,
};

export default function ResultCard({
  result,
  enableReportExport = true,
  onRerunSubmit = null,
  rerunRunning = false,
}) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [thesisExpanded, setThesisExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [activeTab, setActiveTab] = useState('analisis');
  const [showRerunPanel, setShowRerunPanel] = useState(false);

  const { vm, disabledTabs } = useResultSections(result, buildResultViewModel);

  if (!result) return null;
  if (result.error) return <ResultError error={result.error} />;

  return (
    <div className="border border-bloomberg-border bg-bloomberg-card animate-fade-up">
      <ResultCardHeader
        result={result}
        displayResult={vm.displayResult}
        timeHorizon={vm.timeHorizon}
        createdAtLabel={vm.createdAtLabel}
        enableReportExport={enableReportExport}
        onRerunSubmit={onRerunSubmit}
        rerunRunning={rerunRunning}
        onToggleRerun={() => setShowRerunPanel((value) => !value)}
      />

      {onRerunSubmit && (
        <RerunPanel
          result={result}
          open={showRerunPanel}
          onClose={() => setShowRerunPanel(false)}
          onSubmit={onRerunSubmit}
          running={rerunRunning}
        />
      )}

      <ResultTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        disabledTabs={disabledTabs}
        tabStatus={result.tab_status}
      />

      <div key={activeTab} className="animate-fade-up">
        {activeTab === 'analisis' && (
          <AnalysisTab
            result={result}
            vm={vm}
            summaryExpanded={summaryExpanded}
            thesisExpanded={thesisExpanded}
            showRaw={showRaw}
            onToggleSummary={() => setSummaryExpanded(!summaryExpanded)}
            onToggleThesis={() => setThesisExpanded(!thesisExpanded)}
            onToggleRaw={() => setShowRaw(!showRaw)}
          />
        )}

        {activeTab === 'profile' && <ProfileTab profile={result.company_profile} result={result} />}

        {activeTab === 'fundamental' && (
          <FundamentalTab financialHighlights={result.financial_highlights} result={result} />
        )}

        {activeTab === 'chart_price' && <ChartPriceTab result={result} />}

        {activeTab === 'news' && <NewsTab result={result} />}

        <DisclaimerFooter disclaimer={result?.disclaimer} />
      </div>
    </div>
  );
}

ResultCard.propTypes = {
  result: PropTypes.object,
  enableReportExport: PropTypes.bool,
  onRerunSubmit: PropTypes.func,
  rerunRunning: PropTypes.bool,
};
