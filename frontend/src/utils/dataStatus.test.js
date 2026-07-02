import { describe, expect, it } from 'vitest';

import {
  formatSourceLabel,
  getDataStatusClasses,
  getDataStatusLabel,
  getDataStatusTone,
  getDisplayValue,
  getFieldQuality,
  normalizeQualityPayload,
  normalizeSources,
  readableSource,
} from './dataStatus';

describe('readableSource / formatSourceLabel', () => {
  it('maps known sources to labels case-insensitively', () => {
    expect(readableSource('yfinance')).toBe('Yahoo Finance');
    expect(readableSource('IDX_OFFICIAL')).toBe('IDX Official');
  });

  it('matches by substring', () => {
    expect(readableSource('cache:finnhub:v2')).toBe('Finnhub');
  });

  it('humanizes unknown sources and handles empties', () => {
    expect(readableSource('my_custom_feed')).toBe('my custom feed');
    expect(readableSource('')).toBe('');
    expect(formatSourceLabel('')).toBe('Unknown source');
  });
});

describe('getDataStatusLabel', () => {
  it('maps statuses to labels', () => {
    expect(getDataStatusLabel('available')).toBe('Available');
    expect(getDataStatusLabel('MISSING')).toBe('Source unavailable');
    expect(getDataStatusLabel(undefined)).toBe('Unknown');
    expect(getDataStatusLabel('bogus')).toBe('Unknown');
  });
});

describe('getDataStatusTone', () => {
  it('classifies ok states, downgraded by low confidence', () => {
    expect(getDataStatusTone('available')).toBe('ok');
    expect(getDataStatusTone('complete', 90)).toBe('ok');
    expect(getDataStatusTone('available', 40)).toBe('warning');
  });

  it('classifies calculated as info, warning on low confidence', () => {
    expect(getDataStatusTone('calculated')).toBe('info');
    expect(getDataStatusTone('calculated', 30)).toBe('warning');
  });

  it('classifies warning, error and neutral groups', () => {
    expect(getDataStatusTone('stale')).toBe('warning');
    expect(getDataStatusTone('conflict')).toBe('warning');
    expect(getDataStatusTone('missing')).toBe('error');
    expect(getDataStatusTone('failed')).toBe('error');
    expect(getDataStatusTone('not_applicable')).toBe('neutral');
    expect(getDataStatusTone('skipped')).toBe('neutral');
    expect(getDataStatusTone('anything-else')).toBe('neutral');
  });
});

describe('getDataStatusClasses', () => {
  it('returns tone-matching bloomberg classes', () => {
    expect(getDataStatusClasses('available')).toContain('bloomberg-green');
    expect(getDataStatusClasses('missing')).toContain('bloomberg-red');
    expect(getDataStatusClasses('stale')).toContain('bloomberg-amber');
    expect(getDataStatusClasses('calculated')).toContain('bloomberg-orange');
    expect(getDataStatusClasses('skipped')).toContain('bloomberg-muted');
  });
});

describe('getFieldQuality', () => {
  it('reads nested field_quality first, then flat key', () => {
    expect(getFieldQuality({ field_quality: { pe: { status: 'ok' } } }, 'pe')).toEqual({
      status: 'ok',
    });
    expect(getFieldQuality({ pe: { status: 'stale' } }, 'pe')).toEqual({ status: 'stale' });
    expect(getFieldQuality(null, 'pe')).toBeNull();
    expect(getFieldQuality({}, 'pe')).toBeNull();
  });
});

describe('normalizeQualityPayload', () => {
  it('returns null for non-objects', () => {
    expect(normalizeQualityPayload(null)).toBeNull();
    expect(normalizeQualityPayload('ok')).toBeNull();
  });

  it('normalizes a plain payload', () => {
    const result = normalizeQualityPayload({
      status: 'stale',
      source: 'yfinance',
      reason: 'old data',
      confidence_score: 42,
      warnings: ['w1', 'w1', 'w2'],
    });
    expect(result.status).toBe('stale');
    expect(result.label).toBe('Stale');
    expect(result.source).toBe('yfinance');
    expect(result.reason).toBe('old data');
    expect(result.confidenceScore).toBe(42);
    expect(result.warnings).toEqual(['w1', 'w2']);
  });

  it('derives status and warnings from freshness_status object', () => {
    const result = normalizeQualityPayload({
      freshness_status: { status: 'stale', warnings: ['late'] },
      warnings: ['base'],
    });
    expect(result.status).toBe('stale');
    expect(result.warnings).toEqual(['base', 'late']);
    expect(result.freshnessStatus).toEqual({ status: 'stale', warnings: ['late'] });
  });

  it('defaults status to unknown', () => {
    expect(normalizeQualityPayload({}).status).toBe('unknown');
  });
});

describe('normalizeSources', () => {
  it('handles arrays, strings and objects', () => {
    expect(normalizeSources(['a', null, 'b'])).toEqual(['a', 'b']);
    expect(normalizeSources('yfinance')).toEqual(['yfinance']);
    expect(normalizeSources({ sources: ['x', 'y'] })).toEqual(['x', 'y']);
    expect(normalizeSources({ primary: 'p', vendor: 'v' })).toEqual(['p', 'v']);
    expect(normalizeSources(null)).toEqual([]);
  });
});

describe('getDisplayValue', () => {
  it('passes through real values', () => {
    expect(getDisplayValue(12.3, null)).toEqual({ text: 12.3, muted: false, reason: null });
    expect(getDisplayValue(0, null).muted).toBe(false);
  });

  it('replaces N/A with quality label when quality present', () => {
    expect(getDisplayValue('N/A', { status: 'no_history' })).toEqual({
      text: 'No history',
      reason: null,
      muted: true,
    });
  });

  it('prefers the quality reason when available', () => {
    expect(getDisplayValue(null, { status: 'stale', reason: 'vendor lag' })).toEqual({
      text: 'Stale',
      reason: 'vendor lag',
      muted: true,
    });
  });

  it('falls back to N/A without quality', () => {
    expect(getDisplayValue('', null)).toEqual({ text: 'N/A', reason: null, muted: true });
  });
});
