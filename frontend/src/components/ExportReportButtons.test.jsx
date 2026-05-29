import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ExportReportButtons from './ExportReportButtons';
import { MOCK_RESPONSE } from '../mockData';

function mockPdfResponse() {
  return new Response(new Blob(['%PDF-1.4']), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="TradingAgent_NVDA_2026-05-26.pdf"',
    },
  });
}

describe('ExportReportButtons', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens backend HTML report URL in real mode', () => {
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<ExportReportButtons requestId="rid/export 1" />);
    fireEvent.click(screen.getByText('PREVIEW HTML'));

    expect(openMock).toHaveBeenCalledWith(
      '/api/analysis/jobs/rid%2Fexport%201/report.html',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('downloads PDF through the report endpoint in real mode', async () => {
    const fetchMock = vi.fn(async () => mockPdfResponse());
    vi.stubGlobal('fetch', fetchMock);
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportReportButtons requestId="rid-report-1" />);
    fireEvent.click(screen.getByText('EXPORT PDF'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analysis/jobs/rid-report-1/report.pdf');
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/pdf');
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
        requestId="mock-nvda-buy"
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
        requestId="mock-nvda-buy"
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
