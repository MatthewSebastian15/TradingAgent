import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ExportReportButtons from './ExportReportButtons';
import { TEST_RESPONSE } from '../../test/analysisResultFixtures';

function mockPdfResponse() {
  return new Response(new Blob(['%PDF-1.4']), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="TradingAgent_NVDA_2026-05-26.pdf"',
    },
  });
}

function reportNotFoundResponse() {
  return new Response(
    JSON.stringify({
      error: { code: 'report_not_found', message: 'Analysis result was not found or has expired.' },
    }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

describe('ExportReportButtons', () => {
  beforeEach(() => {
    sessionStorage.setItem(
      '_ta_owner_session_expires_at',
      String(Math.floor(Date.now() / 1000) + 3600)
    );
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens backend HTML report from a fetched blob in real mode', async () => {
    const fetchMock = vi.fn(
      async () => new Response('<html><body>Report</body></html>', { status: 200 })
    );
    const openMock = vi.fn(() => ({}));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'open').mockImplementation(openMock);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backend-report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(<ExportReportButtons resourceId="rid/export 1" />);
    fireEvent.click(screen.getByText('PREVIEW HTML'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analysis/jobs/rid%2Fexport%201/report.html');
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('text/html');
    await waitFor(() =>
      expect(openMock).toHaveBeenCalledWith('blob:backend-report', '_blank', 'noopener,noreferrer')
    );
  });

  it('opens request_id HTML report when the job_id report is expired', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reportNotFoundResponse())
      .mockResolvedValueOnce(
        new Response('<html><body>Request Report</body></html>', { status: 200 })
      );
    const openMock = vi.fn(() => ({}));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'open').mockImplementation(openMock);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:request-report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(<ExportReportButtons resourceId="expired-job" result={TEST_RESPONSE} />);
    fireEvent.click(screen.getByText('PREVIEW HTML'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/analysis/test-nvda-buy/report.html');
    expect(fetchMock.mock.calls[1][1].method).toBe('GET');
    expect(openMock).toHaveBeenCalledWith('blob:request-report', '_blank', 'noopener,noreferrer');
  });

  it('falls back to payload HTML preview when stored reports are expired', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reportNotFoundResponse())
      .mockResolvedValueOnce(reportNotFoundResponse())
      .mockResolvedValueOnce(
        new Response('<html><body>Fallback Report</body></html>', { status: 200 })
      );
    const openMock = vi.fn(() => ({}));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'open').mockImplementation(openMock);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fallback-report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(<ExportReportButtons resourceId="expired-request" result={TEST_RESPONSE} />);
    fireEvent.click(screen.getByText('PREVIEW HTML'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toBe('/api/analysis/report.html');
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).ticker).toBe(TEST_RESPONSE.ticker);
    expect(openMock).toHaveBeenCalledWith('blob:fallback-report', '_blank', 'noopener,noreferrer');
  });

  it('downloads PDF through the report endpoint in real mode', async () => {
    const fetchMock = vi.fn(async () => mockPdfResponse());
    vi.stubGlobal('fetch', fetchMock);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const originalCreateElement = document.createElement.bind(document);
    const anchor = originalCreateElement('a');
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) =>
      tagName === 'a' ? anchor : originalCreateElement(tagName, options)
    );

    render(<ExportReportButtons resourceId="rid-report-1" />);
    fireEvent.click(screen.getByText('EXPORT PDF'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analysis/jobs/rid-report-1/report.pdf');
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/pdf');
    expect(anchor.download).toBe('NVDA_2026-05-26.pdf');
  });

  it('downloads request_id PDF when the job_id report is expired', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reportNotFoundResponse())
      .mockResolvedValueOnce(mockPdfResponse());
    vi.stubGlobal('fetch', fetchMock);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:request-pdf');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const originalCreateElement = document.createElement.bind(document);
    const anchor = originalCreateElement('a');
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) =>
      tagName === 'a' ? anchor : originalCreateElement(tagName, options)
    );

    render(<ExportReportButtons resourceId="expired-job" result={TEST_RESPONSE} />);
    fireEvent.click(screen.getByText('EXPORT PDF'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/analysis/test-nvda-buy/report.pdf');
    expect(fetchMock.mock.calls[1][1].method).toBe('GET');
    expect(anchor.download).toBe('NVDA_2026-05-18.pdf');
  });

  it('falls back to payload PDF export when stored reports are expired', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reportNotFoundResponse())
      .mockResolvedValueOnce(reportNotFoundResponse())
      .mockResolvedValueOnce(mockPdfResponse());
    vi.stubGlobal('fetch', fetchMock);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fallback-pdf');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportReportButtons resourceId="expired-request" result={TEST_RESPONSE} />);
    fireEvent.click(screen.getByText('EXPORT PDF'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toBe('/api/analysis/report.pdf');
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).ticker).toBe(TEST_RESPONSE.ticker);
  });


});
