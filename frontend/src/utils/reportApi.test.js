import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: async () => ({}),
  buildHeaders: async () => ({ 'Content-Type': 'application/json' }),
  readHttpError: async (res) => res._errorMessage || `HTTP ${res.status}`,
}));

import {
  downloadAnalysisPdf,
  openAnalysisHtmlReport,
  reportHtmlRequestUrl,
  reportHtmlUrl,
  reportPdfRequestUrl,
  reportPdfUrl,
} from './reportApi';

describe('report URL builders', () => {
  it('build job and legacy request URLs with encoding', () => {
    expect(reportHtmlUrl('job 1')).toBe('/api/analysis/jobs/job%201/report.html');
    expect(reportPdfUrl('j1')).toBe('/api/analysis/jobs/j1/report.pdf');
    expect(reportHtmlRequestUrl('r/1')).toBe('/api/analysis/r%2F1/report.html');
    expect(reportPdfRequestUrl('r1')).toBe('/api/analysis/r1/report.pdf');
  });
});

describe('openAnalysisHtmlReport', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:report');
    globalThis.URL.revokeObjectURL = vi.fn();
    window.open = vi.fn(() => ({}));
  });

  it('opens the report fetched by resource id', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, text: async () => '<html>ok</html>' });

    await openAnalysisHtmlReport({ resourceId: 'job1', result: null });

    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/analysis/jobs/job1/report.html');
    expect(window.open).toHaveBeenCalledWith('blob:report', '_blank', 'noopener,noreferrer');
  });

  it('falls back to request id then payload POST when reports are not found', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({ ok: false, status: 404, _errorMessage: 'report_not_found' })
      .mockResolvedValueOnce({ ok: false, status: 404, _errorMessage: 'Report expired' })
      .mockResolvedValueOnce({ ok: true, text: async () => '<html>payload</html>' });

    await openAnalysisHtmlReport({
      resourceId: 'job1',
      result: { request_id: 'req1', ticker: 'AAPL' },
    });

    expect(globalThis.fetch.mock.calls[1][0]).toBe('/api/analysis/req1/report.html');
    expect(globalThis.fetch.mock.calls[2][0]).toBe('/api/analysis/report.html');
    expect(globalThis.fetch.mock.calls[2][1].method).toBe('POST');
    expect(JSON.parse(globalThis.fetch.mock.calls[2][1].body)).toEqual({
      request_id: 'req1',
      ticker: 'AAPL',
    });
  });

  it('rethrows non-not-found errors without falling back', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500, _errorMessage: 'boom' });
    await expect(
      openAnalysisHtmlReport({ resourceId: 'job1', result: { request_id: 'req1' } })
    ).rejects.toThrow('boom');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws when popup is blocked', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, text: async () => '<html/>' });
    window.open = vi.fn(() => null);
    await expect(openAnalysisHtmlReport({ resourceId: 'job1' })).rejects.toThrow(/Popup blocked/);
  });
});

describe('downloadAnalysisPdf', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:pdf');
    globalThis.URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it('downloads with a ticker_date filename derived from the result', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['pdf']),
      headers: { get: () => null },
    });

    await downloadAnalysisPdf('job1', {
      result: { normalized_ticker: 'AAPL', trade_date: '2026-06-30' },
    });

    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/analysis/jobs/job1/report.pdf');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it('throws when nothing is found and no result payload exists', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      _errorMessage: 'report_not_found',
    });
    await expect(downloadAnalysisPdf('job1')).rejects.toThrow(/payload is unavailable/);
  });
});
