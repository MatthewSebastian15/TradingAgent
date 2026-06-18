import PropTypes from 'prop-types';
import React, { useState } from 'react';

const ROWS = [
  ['price_momentum', 'Price Momentum'],
  ['fundamental_quality', 'Fundamental Quality'],
  ['news_sentiment', 'News Sentiment'],
  ['risk_level_score', 'Risk Level'],
  ['data_quality', 'Data Quality'],
];

function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !(typeof value === 'number' && !Number.isFinite(value))
  );
}

function normalizeScore(value) {
  if (!hasValue(value)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function barClass(score) {
  if (score <= 39) return 'bg-bloomberg-red';
  if (score <= 64) return 'bg-bloomberg-amber';
  return 'bg-bloomberg-green';
}

function renderBar(score) {
  return (
    <div className="h-1.5 w-28 overflow-hidden rounded-sm bg-bloomberg-border bg-opacity-40">
      <div className={`h-full ${barClass(score)}`} style={{ width: `${score}%` }} />
    </div>
  );
}

export default function ConfidenceBreakdown({ breakdown }) {
  const [expanded, setExpanded] = useState(false);
  if (!breakdown || typeof breakdown !== 'object') return null;

  const overall = normalizeScore(breakdown.overall);
  const rows = ROWS.map(([key, label]) => [key, label, normalizeScore(breakdown[key])]).filter(
    ([, , score]) => score !== null
  );
  if (!rows.length && overall === null) return null;

  return (
    <div className="mt-2 border border-bloomberg-border bg-black bg-opacity-20">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-mono text-[11px] tracking-wider text-bloomberg-muted hover:text-bloomberg-white"
      >
        <span>Confidence Score Breakdown</span>
        <span>{expanded ? '▲ Hide' : '▾ Details'}</span>
      </button>
      {expanded && (
        <div className="border-t border-bloomberg-border px-3 py-2 font-mono text-[11px]">
          <div className="space-y-2">
            {rows.map(([key, label, score]) => (
              <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                <span className="text-bloomberg-muted">{label}</span>
                {renderBar(score)}
                <span className="w-14 text-right text-bloomberg-white">{score} / 100</span>
              </div>
            ))}
          </div>
          {overall !== null && (
            <div className="mt-2 grid grid-cols-[1fr_auto] border-t border-bloomberg-border pt-2 text-bloomberg-white">
              <span>Overall</span>
              <span>{overall} / 100 · weighted average</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

ConfidenceBreakdown.propTypes = {
  breakdown: PropTypes.object,
};
