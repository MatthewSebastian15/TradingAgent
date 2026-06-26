// Pure formatting/text helpers extracted from ResultCard.jsx to shrink that
// component's surface. No component state or hooks — just value/text shaping
// (and parseBold, which returns inline JSX). Imported back by ResultCard.
import React from 'react';

import { resolveClockConfig } from './clock';

export function formatWarningDetail(warning) {
  if (!hasDisplayValue(warning)) return null;
  if (typeof warning === 'object' && warning !== null) {
    const code = String(warning.code || 'WARNING').trim();
    return {
      code,
      severity: warning.severity || 'warning',
      blocking: Boolean(warning.blocking),
      label: warning.message || code,
      text: warning.message ? `${code} - ${warning.message}` : code,
    };
  }
  const code = String(warning).trim();
  return { code, severity: 'warning', blocking: false, label: code, text: code };
}

export function getTradePlanStatus(isActionable, tradePlanValid) {
  if (tradePlanValid) return { label: 'TRADE PLAN', status: 'valid', tone: 'ok' };
  if (isActionable) return { label: 'TRADE PLAN', status: 'not valid', tone: 'error' };
  return { label: 'TRADE PLAN', status: 'not actionable', tone: 'neutral' };
}

export function getStatusClasses(tone) {
  if (tone === 'ok') return 'border-bloomberg-green bg-bloomberg-green-dim text-bloomberg-green';
  if (tone === 'error') return 'border-bloomberg-red bg-bloomberg-red-dim text-bloomberg-red';
  if (tone === 'info' || tone === 'neutral')
    return 'border-bloomberg-border bg-bloomberg-surface text-bloomberg-muted';
  return 'border-bloomberg-amber bg-bloomberg-amber-dim text-bloomberg-amber';
}

export function getDataQualityTone(label, status) {
  if (status === 'ok') return 'ok';
  if (status === 'hidden' || status === 'fallback') return 'info';
  if (status === 'invalid' || status === 'missing' || status === 'invalid_ticker') return 'error';
  if (label === 'NEWS' && status === 'unavailable') return 'warning';
  if (status === 'partial' || status === 'market_closed' || status === 'unavailable')
    return 'warning';
  return 'neutral';
}

export function parseBold(text) {
  if (!text) return null;
  return text.split(/\*\*(.*?)\*\*/g).map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-bloomberg-white font-semibold">
        {p}
      </strong>
    ) : (
      p
    )
  );
}

export function getError(e) {
  if (!e) return 'Analysis failed.';
  if (typeof e === 'string') return e;
  return e.message || e.error?.message || JSON.stringify(e, null, 2);
}

export function formatAnalysisHorizon(months, fallback) {
  const value = Number(months);
  if ([1, 2, 3].includes(value)) return `${value} Month${value > 1 ? 's' : ''}`;
  return fallback || null;
}

export function formatPercent(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return typeof value === 'number' ? `${value}%` : value;
}

export function hasDisplayValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !(typeof value === 'number' && !Number.isFinite(value))
  );
}

export function coalesceDisplayValue(...values) {
  return values.find((value) => hasDisplayValue(value)) ?? null;
}

export function formatRiskReward(result) {
  if (result.risk_reward_display) return result.risk_reward_display;
  if (!hasDisplayValue(result.risk_reward_ratio)) return null;
  return typeof result.risk_reward_ratio === 'number'
    ? `1:${Math.round(result.risk_reward_ratio)}`
    : result.risk_reward_ratio;
}

export function normalizeSignal(signal) {
  const normalized = String(signal || 'HOLD')
    .trim()
    .toUpperCase();
  if (normalized === 'OVERWEIGHT') return 'BUY';
  if (normalized === 'UNDERWEIGHT' || normalized === 'AVOID') return 'SELL';
  if (['BUY', 'HOLD', 'WAIT', 'REDUCE', 'SELL', 'NEUTRAL'].includes(normalized)) return normalized;
  return 'HOLD';
}

export function getFinalDecision(result) {
  return normalizeSignal(
    result.display_signal ?? result.final_decision ?? result.decision ?? result.rating
  );
}

export function getCurrentPrice(result) {
  if (!result) return null;

  if (Object.prototype.hasOwnProperty.call(result, 'last_price')) {
    if (hasDisplayValue(result.last_price)) return result.last_price;
  }
  if (Object.prototype.hasOwnProperty.call(result, 'current_price')) {
    if (hasDisplayValue(result.current_price)) return result.current_price;
  }
  const stalePriceData =
    result.data_quality?.price_data === 'stale' ||
    result.price_chart?.data_quality?.status === 'stale';
  if (stalePriceData && hasDisplayValue(result.company_profile?.current_price)) {
    return result.company_profile.current_price;
  }

  return coalesceDisplayValue(result.last_close_price);
}

export function normalizeConfidencePercent(value) {
  if (!hasDisplayValue(value)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
}

export function formatConfidenceDisplay(score, label) {
  const percent = normalizeConfidencePercent(score);
  if (!hasDisplayValue(percent)) return null;
  const scoreText = typeof percent === 'number' ? `${percent}%` : percent;
  return label ? `${scoreText} — ${label}` : scoreText;
}

export function confidenceTone(tier) {
  return (
    {
      very_low: 'red',
      low: 'yellow',
      moderate: 'orange',
      high: 'lime',
      very_high: 'green',
    }[tier] || undefined
  );
}

export function formatDevicePriceTimestamp(value, includeTime = true) {
  if (!hasDisplayValue(value)) return null;
  const rawValue = String(value).trim();

  // Backend price rows are daily candles. A date-only value such as
  // 2026-05-12 must stay date-only; parsing it through JavaScript Date treats
  // it as midnight UTC and renders a misleading time-shifted timestamp.
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) return rawValue;

  const clockConfig = resolveClockConfig(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: clockConfig.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});

  const dateText = `${parts.year}-${parts.month}-${parts.day}`;
  return includeTime ? `${dateText}  ${parts.hour}:${parts.minute} ${clockConfig.label}` : dateText;
}

export function formatPriceAsOf(result, fallbackValue) {
  const timestamp = result.price_timestamp || fallbackValue;
  if (!hasDisplayValue(timestamp)) return null;
  if (result.price_is_fallback) {
    return `${formatDevicePriceTimestamp(timestamp, false)}  (Previous Close — Fallback)`;
  }
  const label = formatDevicePriceTimestamp(timestamp, true);
  if (result.market_status === 'open') return `${label}  (Intraday)`;
  if (result.market_status === 'closed') return `${label}  (Closing Price)`;
  return label;
}

export function truncateWords(text, limit) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= limit) return String(text || '').trim();
  return `${words.slice(0, limit).join(' ')}…`;
}

export function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function normalizeInlineText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function truncateReasonRiskWords(text, maxWords = 150) {
  const words = normalizeInlineText(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}.`.replace(/\.\.$/, '.');
}

export function fitRecommendationRiskWords(text, minWords = 100, maxWords = 150) {
  const normalized = normalizeInlineText(text);
  const floorText =
    'Rekomendasi ini harus dibaca bersama kualitas data, harga terakhir, volatilitas, likuiditas, katalis berita, dan validitas trade plan karena perubahan pada salah satu faktor tersebut dapat menurunkan conviction atau mengubah timing entry. Risiko tetap perlu dikontrol dengan ukuran posisi moderat, disiplin stop, dan pembaruan analisis saat data vendor atau kondisi pasar berubah. Jika sinyal utama melemah, alokasi harus ditahan sampai tesis dan level eksekusi kembali terkonfirmasi.';
  const combined =
    wordCount(normalized) >= minWords ? normalized : `${normalized} ${floorText}`.trim();
  return truncateReasonRiskWords(combined, maxWords);
}

export function normalizeReasonItems(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeInlineText(item)).filter(Boolean);
  }

  const text = normalizeInlineText(value);
  return text ? [text] : [];
}

export function normalizeRiskSummaryText(riskSummary) {
  if (!riskSummary || typeof riskSummary !== 'object') return '';

  return normalizeInlineText(
    [
      riskSummary.overall_risk && `Overall risk ${riskSummary.overall_risk}`,
      riskSummary.short_reason || riskSummary.risk_explanation,
      Array.isArray(riskSummary.main_risks) ? riskSummary.main_risks.join(', ') : null,
    ]
      .filter(Boolean)
      .join('. ')
  );
}

export function buildRecommendationRiskParagraph({
  paragraph,
  reasons,
  catalysts,
  miniRiskSummary,
  riskSummary,
  decisionReason,
}) {
  const directParagraph = normalizeInlineText(paragraph);
  const riskText = normalizeInlineText(miniRiskSummary) || normalizeRiskSummaryText(riskSummary);

  const items = [
    ...(directParagraph
      ? [directParagraph]
      : [...normalizeReasonItems(reasons), ...normalizeReasonItems(catalysts)]),
    riskText,
    normalizeInlineText(decisionReason),
  ].filter(Boolean);

  const uniqueItems = Array.from(new Set(items));
  const joined = uniqueItems.join('. ');
  if (!joined) return '';

  const normalized = joined.endsWith('.') ? joined : `${joined}.`;
  return fitRecommendationRiskWords(normalized, 100, 150);
}

export function formatDataSourcePriceLabel(result) {
  const priceSource = result.data_sources?.price;
  if (priceSource?.provider) {
    const timestamp = priceSource.timestamp || result.price_timestamp || result.current_price_as_of;
    const dateLabel = formatDevicePriceTimestamp(timestamp, !priceSource.is_fallback);
    const fallback = priceSource.is_fallback ? '⚠  ' : '';
    const fallbackText = priceSource.is_fallback ? ' (previous close fallback)' : '';
    return `${fallback}Price: ${priceSource.provider}${fallbackText}${dateLabel ? ` · ${dateLabel}` : ''}`;
  }

  const source = coalesceDisplayValue(result.price_source, result.current_price_source);
  if (!source) return null;
  const provider = String(source).toLowerCase().includes('yfinance')
    ? 'Yahoo Finance'
    : String(source);
  const timestamp = result.price_timestamp || result.current_price_as_of;
  const dateLabel = formatDevicePriceTimestamp(timestamp, !result.price_is_fallback);
  const fallback = result.price_is_fallback ? '⚠  ' : '';
  const fallbackText = result.price_is_fallback ? ' (previous close fallback)' : '';
  return `${fallback}Price: ${provider}${fallbackText}${dateLabel ? ` · ${dateLabel}` : ''}`;
}

export function formatVolatilityValue(result) {
  if (!hasDisplayValue(result.volatility_score)) return null;
  const score =
    typeof result.volatility_score === 'number'
      ? result.volatility_score.toFixed(2).replace(/\.00$/, '')
      : result.volatility_score;
  return `${score} / 100`;
}

export function volatilitySubValue(result) {
  const classification = result.volatility_classification;
  const lookback = result.volatility_lookback_days;
  if (classification && lookback) return `${classification} · ${lookback}-day lookback`;
  if (classification) return classification;
  if (lookback) return `${lookback}-day lookback`;
  return null;
}
