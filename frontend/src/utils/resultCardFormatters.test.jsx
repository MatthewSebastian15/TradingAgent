import { describe, expect, it } from 'vitest';

import {
  buildRecommendationRiskParagraph,
  coalesceDisplayValue,
  confidenceTone,
  formatAnalysisHorizon,
  formatConfidenceDisplay,
  formatDevicePriceTimestamp,
  formatPercent,
  formatRiskReward,
  formatVolatilityValue,
  formatWarningDetail,
  getCurrentPrice,
  getDataQualityTone,
  getError,
  getFinalDecision,
  getStatusClasses,
  getTradePlanStatus,
  hasDisplayValue,
  normalizeConfidencePercent,
  normalizeSignal,
  parseBold,
  truncateWords,
  volatilitySubValue,
  wordCount,
} from './resultCardFormatters';

describe('normalizeSignal / getFinalDecision', () => {
  it('normalizes casing and aliases', () => {
    expect(normalizeSignal(' buy ')).toBe('BUY');
    expect(normalizeSignal('OVERWEIGHT')).toBe('BUY');
    expect(normalizeSignal('UNDERWEIGHT')).toBe('SELL');
    expect(normalizeSignal('AVOID')).toBe('SELL');
    expect(normalizeSignal('WAIT')).toBe('WAIT');
  });

  it('defaults unknown/missing to HOLD', () => {
    expect(normalizeSignal('MOON')).toBe('HOLD');
    expect(normalizeSignal(null)).toBe('HOLD');
  });

  it('getFinalDecision reads display_signal before fallbacks', () => {
    expect(getFinalDecision({ display_signal: 'buy', final_decision: 'sell' })).toBe('BUY');
    expect(getFinalDecision({ decision: 'sell' })).toBe('SELL');
    expect(getFinalDecision({})).toBe('HOLD');
  });
});

describe('trade plan and tone helpers', () => {
  it('getTradePlanStatus covers valid / not valid / not actionable', () => {
    expect(getTradePlanStatus(true, true).status).toBe('valid');
    expect(getTradePlanStatus(true, false)).toMatchObject({ status: 'not valid', tone: 'error' });
    expect(getTradePlanStatus(false, false).status).toBe('not actionable');
  });

  it('getStatusClasses maps tones to bloomberg classes', () => {
    expect(getStatusClasses('ok')).toContain('bloomberg-green');
    expect(getStatusClasses('error')).toContain('bloomberg-red');
    expect(getStatusClasses('neutral')).toContain('bloomberg-muted');
    expect(getStatusClasses('warning')).toContain('bloomberg-amber');
  });

  it('getDataQualityTone maps statuses', () => {
    expect(getDataQualityTone('PRICE', 'ok')).toBe('ok');
    expect(getDataQualityTone('PRICE', 'fallback')).toBe('info');
    expect(getDataQualityTone('PRICE', 'missing')).toBe('error');
    expect(getDataQualityTone('NEWS', 'unavailable')).toBe('warning');
    expect(getDataQualityTone('PRICE', 'partial')).toBe('warning');
    expect(getDataQualityTone('PRICE', 'whatever')).toBe('neutral');
  });

  it('confidenceTone maps tiers', () => {
    expect(confidenceTone('very_high')).toBe('green');
    expect(confidenceTone('very_low')).toBe('red');
    expect(confidenceTone('nope')).toBeUndefined();
  });
});

describe('formatWarningDetail', () => {
  it('formats object warnings', () => {
    expect(formatWarningDetail({ code: 'W1', message: 'stale data', severity: 'error' })).toEqual({
      code: 'W1',
      severity: 'error',
      blocking: false,
      label: 'stale data',
      text: 'W1 - stale data',
    });
  });

  it('formats string warnings and rejects empties', () => {
    expect(formatWarningDetail('SIMPLE').text).toBe('SIMPLE');
    expect(formatWarningDetail('')).toBeNull();
    expect(formatWarningDetail(null)).toBeNull();
  });
});

describe('value helpers', () => {
  it('hasDisplayValue rejects null/undefined/empty/NaN', () => {
    expect(hasDisplayValue(0)).toBe(true);
    expect(hasDisplayValue('x')).toBe(true);
    expect(hasDisplayValue('')).toBe(false);
    expect(hasDisplayValue(null)).toBe(false);
    expect(hasDisplayValue(NaN)).toBe(false);
  });

  it('coalesceDisplayValue picks the first displayable', () => {
    expect(coalesceDisplayValue(null, '', NaN, 5, 6)).toBe(5);
    expect(coalesceDisplayValue(null, undefined)).toBeNull();
  });

  it('formatPercent', () => {
    expect(formatPercent(12)).toBe('12%');
    expect(formatPercent('12-15%')).toBe('12-15%');
    expect(formatPercent(null)).toBeNull();
    expect(formatPercent(NaN)).toBeNull();
  });

  it('formatAnalysisHorizon', () => {
    expect(formatAnalysisHorizon(1)).toBe('1 Month');
    expect(formatAnalysisHorizon(3)).toBe('3 Months');
    expect(formatAnalysisHorizon(12, 'fallback')).toBe('fallback');
    expect(formatAnalysisHorizon('x')).toBeNull();
  });

  it('formatRiskReward prefers display then rounds ratio', () => {
    expect(formatRiskReward({ risk_reward_display: '1:2.5' })).toBe('1:2.5');
    expect(formatRiskReward({ risk_reward_ratio: 2.4 })).toBe('1:2');
    expect(formatRiskReward({ risk_reward_ratio: '1:3' })).toBe('1:3');
    expect(formatRiskReward({})).toBeNull();
  });

  it('getError extracts messages', () => {
    expect(getError(null)).toBe('Analysis failed.');
    expect(getError('boom')).toBe('boom');
    expect(getError(new Error('bad'))).toBe('bad');
    expect(getError({ error: { message: 'nested' } })).toBe('nested');
  });
});

describe('confidence', () => {
  it('normalizeConfidencePercent scales fractions and rounds', () => {
    expect(normalizeConfidencePercent(0.856)).toBe(86);
    expect(normalizeConfidencePercent(85.6)).toBe(86);
    expect(normalizeConfidencePercent(null)).toBeNull();
    expect(normalizeConfidencePercent('high')).toBe('high');
  });

  it('formatConfidenceDisplay combines score and label', () => {
    expect(formatConfidenceDisplay(0.85, 'High')).toBe('85% — High');
    expect(formatConfidenceDisplay(85)).toBe('85%');
    expect(formatConfidenceDisplay(null, 'High')).toBeNull();
  });
});

describe('getCurrentPrice', () => {
  it('prefers last_price then current_price', () => {
    expect(getCurrentPrice({ last_price: 10, current_price: 20 })).toBe(10);
    expect(getCurrentPrice({ current_price: 20 })).toBe(20);
  });

  it('uses company profile price when price data is stale', () => {
    expect(
      getCurrentPrice({
        data_quality: { price_data: 'stale' },
        company_profile: { current_price: 33 },
      })
    ).toBe(33);
  });

  it('falls back to last_close_price and null', () => {
    expect(getCurrentPrice({ last_close_price: 9 })).toBe(9);
    expect(getCurrentPrice({})).toBeNull();
    expect(getCurrentPrice(null)).toBeNull();
  });
});

describe('text helpers', () => {
  it('truncateWords and wordCount', () => {
    expect(truncateWords('one two three four', 2)).toBe('one two…');
    expect(truncateWords('one two', 5)).toBe('one two');
    expect(wordCount('  a  b   c ')).toBe(3);
    expect(wordCount('')).toBe(0);
  });

  it('parseBold splits **bold** into strong elements', () => {
    const parts = parseBold('a **b** c');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('a ');
    expect(parts[1].type).toBe('strong');
    expect(parts[1].props.children).toBe('b');
    expect(parseBold('')).toBeNull();
  });

  it('buildRecommendationRiskParagraph pads to the word floor and dedupes', () => {
    const text = buildRecommendationRiskParagraph({
      reasons: ['Strong earnings', 'Strong earnings'],
      riskSummary: { overall_risk: 'medium', short_reason: 'volatility elevated' },
    });
    const words = text.split(/\s+/).filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(150);
    expect(text).toContain('Strong earnings');
    // Short input gets padded with the standard risk floor text.
    expect(text).toContain('Risiko tetap perlu dikontrol');
    // Duplicate reason appears once.
    expect(text.match(/Strong earnings/g)).toHaveLength(1);
    expect(buildRecommendationRiskParagraph({})).toBe('');
  });
});

describe('timestamps and volatility', () => {
  it('formatDevicePriceTimestamp keeps date-only values date-only', () => {
    expect(formatDevicePriceTimestamp('2026-05-12')).toBe('2026-05-12');
  });

  it('formatDevicePriceTimestamp returns raw text for unparseable values', () => {
    expect(formatDevicePriceTimestamp('not-a-date')).toBe('not-a-date');
    expect(formatDevicePriceTimestamp(null)).toBeNull();
  });

  it('formatVolatilityValue renders score out of 100', () => {
    expect(formatVolatilityValue({ volatility_score: 42.5 })).toBe('42.50 / 100');
    expect(formatVolatilityValue({ volatility_score: 42 })).toBe('42 / 100');
    expect(formatVolatilityValue({})).toBeNull();
  });

  it('volatilitySubValue combines classification and lookback', () => {
    expect(
      volatilitySubValue({ volatility_classification: 'High', volatility_lookback_days: 30 })
    ).toBe('High · 30-day lookback');
    expect(volatilitySubValue({ volatility_classification: 'Low' })).toBe('Low');
    expect(volatilitySubValue({})).toBeNull();
  });
});
