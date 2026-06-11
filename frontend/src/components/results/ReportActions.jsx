import React from 'react';
import PropTypes from 'prop-types';
import ExportReportButtons from '../ExportReportButtons';

export default function ReportActions({
  result,
  displayResult,
  enableReportExport,
  mockReport,
  onRerunSubmit,
  rerunRunning,
  onToggleRerun,
}) {
  return (
    <>
      {onRerunSubmit && (
        <button
          type="button"
          disabled={rerunRunning}
          onClick={onToggleRerun}
          className="font-mono text-xs border border-bloomberg-border px-2.5 py-1.5 tracking-wider text-bloomberg-muted hover:text-bloomberg-white disabled:opacity-50"
        >
          ↺ RE-RUN
        </button>
      )}
      {enableReportExport && (result.job_id || result.request_id) && (
        <ExportReportButtons
          resourceId={result.job_id || result.request_id}
          result={displayResult}
          disabled={Boolean(result.error)}
          mockReport={mockReport}
        />
      )}
    </>
  );
}

ReportActions.propTypes = {
  result: PropTypes.object.isRequired,
  displayResult: PropTypes.object.isRequired,
  enableReportExport: PropTypes.bool.isRequired,
  mockReport: PropTypes.bool.isRequired,
  onRerunSubmit: PropTypes.func,
  rerunRunning: PropTypes.bool.isRequired,
  onToggleRerun: PropTypes.func.isRequired,
};
