import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ExportReportButtons from './ExportReportButtons';
import { MOCK_RESPONSE } from '../../dev/mockData';

function mockPdfResponse() {
  return new Response(new Blob(['%PDF-1.4']), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="TradingAgent_NVDA_2026-05-26.pdf"',
    },
  });
}

function mockReportNotFoundResponse() {
  return new Response(
    JSON.stringify({ error: { code: 'report_not_found', message: 'Analysis result was not found or has expired.' } }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

describe('ExportReportButtons', () => {
  beforeEach(() => {
    sessionStorage.setItem('_ta_owner_token', 'test-owner-token');
    sessionStorage.setItem('_ta_owner_token_expires_at', String(Math.floor(Date.now() / 1000) + 3600));
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens backend HTML report from a fetched blob in real mode', async () => {
    const fetchMock = vi.fn(async () => new Response('<html><body>Report</body></html>', { status: 200 }));
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

  it('falls back to payload HTML preview when the request_id report is expired', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockReportNotFoundResponse())
      .mockResolvedValueOnce(new Response('<html><body>Fallback Report</body></html>', { status: 200 }));
    const openMock = vi.fn(() => ({}));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'open').mockImplementation(openMock);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fallback-report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(<ExportReportButtons resourceId="expired-request" result={MOCK_RESPONSE} />);
    fireEvent.click(screen.getByText('PREVIEW HTML'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/analysis/report.html');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).ticker).toBe(MOCK_RESPONSE.ticker);
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

    render(<ExportReportButtons resourceId="rid-report-1" />);
    fireEvent.click(screen.getByText('EXPORT PDF'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analysis/jobs/rid-report-1/report.pdf');
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/pdf');
  });

  it('falls back to payload PDF export when the request_id report is expired', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockReportNotFoundResponse()).mockResolvedValueOnce(mockPdfResponse());
    vi.stubGlobal('fetch', fetchMock);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fallback-pdf');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportReportButtons resourceId="expired-request" result={MOCK_RESPONSE} />);
    fireEvent.click(screen.getByText('EXPORT PDF'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/analysis/report.pdf');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).ticker).toBe(MOCK_RESPONSE.ticker);
  });

  it('opens mock HTML report without backend report URL', () => {
    const fetchMock = vi.fn();
    const openMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'open').mockImplementation(openMock);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(
      <ExportReportButtons
        resourceId="mock-nvda-buy"
        result={MOCK_RESPONSE}
        mockReport
      />
    );
    fireEvent.click(screen.getByText('PREVIEW HTML'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(openMock).toHaveBeenCalledWith('blob:mock-report', '_blank', 'noopener,noreferrer');
  });

  it('exports mock PDF through browser print without fetching backend PDF', async () => {
    const fetchMock = vi.fn();
    const printWindow = {
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
      focus: vi.fn(),
      print: vi.fn(),
    };
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'open').mockImplementation(() => printWindow);

    render(
      <ExportReportButtons
        resourceId="mock-nvda-buy"
        result={MOCK_RESPONSE}
        mockReport
      />
    );
    fireEvent.click(screen.getByText('EXPORT PDF'));

    await waitFor(() => expect(printWindow.print).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(printWindow.document.write.mock.calls[0][0]).toContain(
      'TradingAgent Mock Analysis Report'
    );
    expect(printWindow.document.write.mock.calls[0][0]).not.toContain('Price Target');
    expect(printWindow.document.write.mock.calls[0][0]).not.toContain('Risk Per Share');
    expect(printWindow.document.write.mock.calls[0][0]).not.toContain('Reward Per Share');
  });
});
