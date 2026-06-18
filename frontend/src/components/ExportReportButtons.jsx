import PropTypes from 'prop-types';
import React, { useState } from 'react';

import { downloadAnalysisPdf, openAnalysisHtmlReport } from '../utils/reportApi';

export default function ExportReportButtons({
  resourceId,
  result = null,
  disabled = false,
  mockReport = false,
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  if (!resourceId) return null;

  async function handlePreviewHtml() {
    if (disabled) return;
    setError('');
    try {
      await openAnalysisHtmlReport({ resourceId, result, mock: mockReport });
    } catch (ex) {
      setError(ex.message || 'Failed to open HTML report.');
    }
  }

  async function handleDownload() {
    if (disabled || downloading) return;
    setError('');
    setDownloading(true);
    try {
      await downloadAnalysisPdf(resourceId, { result, mock: mockReport });
    } catch (ex) {
      setError(ex.message || 'Failed to download PDF report.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={handlePreviewHtml}
          className="font-mono text-xs border border-bloomberg-border px-2.5 py-1 text-bloomberg-muted hover:text-bloomberg-white hover:border-bloomberg-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors tracking-wider"
        >
          PREVIEW HTML
        </button>
        <button
          type="button"
          disabled={disabled || downloading}
          onClick={handleDownload}
          className="font-mono text-xs border border-bloomberg-orange px-2.5 py-1 text-bloomberg-orange bg-bloomberg-orange-dim hover:bg-bloomberg-orange hover:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors tracking-wider"
        >
          {downloading ? 'EXPORTING...' : 'EXPORT PDF'}
        </button>
      </div>
      {error && (
        <div className="max-w-xs text-right font-mono text-[10px] text-bloomberg-red">{error}</div>
      )}
    </div>
  );
}

ExportReportButtons.propTypes = {
  disabled: PropTypes.bool,
  mockReport: PropTypes.bool,
  resourceId: PropTypes.string,
  result: PropTypes.object,
};
