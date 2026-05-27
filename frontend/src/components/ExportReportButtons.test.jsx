import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ExportReportButtons from './ExportReportButtons';

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

  it('renders preview link with encoded report URL', () => {
    render(<ExportReportButtons requestId="rid/export 1" />);

    const link = screen.getByText('PREVIEW HTML');
    expect(link.getAttribute('href')).toBe('/api/analysis/jobs/rid%2Fexport%201/report.html');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('downloads PDF through the report endpoint', async () => {
    const fetchMock = vi.fn(async () => mockPdfResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportReportButtons requestId="rid-report-1" />);
    fireEvent.click(screen.getByText('EXPORT PDF'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analysis/jobs/rid-report-1/report.pdf');
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/pdf');
  });
});
