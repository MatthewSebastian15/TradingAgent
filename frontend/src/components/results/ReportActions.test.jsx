import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ReportActions from './ReportActions';

vi.mock('../ExportReportButtons', () => {
  function ExportReportButtonsStub({ resourceId, disabled }) {
    return (
      <div data-testid="export-buttons">
        {resourceId}|{String(disabled)}
      </div>
    );
  }
  ExportReportButtonsStub.propTypes = {
    resourceId: PropTypes.string,
    disabled: PropTypes.bool,
  };
  return { default: ExportReportButtonsStub };
});

const BASE_PROPS = {
  result: { job_id: 'job-1' },
  displayResult: {},
  enableReportExport: true,
  rerunRunning: false,
  onToggleRerun: vi.fn(),
};

describe('ReportActions', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the re-run button only when a submit handler exists', () => {
    render(<ReportActions {...BASE_PROPS} />);
    expect(screen.queryByRole('button', { name: /RE-RUN/ })).toBeNull();

    render(<ReportActions {...BASE_PROPS} onRerunSubmit={vi.fn()} />);
    const button = screen.getByRole('button', { name: /RE-RUN/ });
    fireEvent.click(button);
    expect(BASE_PROPS.onToggleRerun).toHaveBeenCalledTimes(1);
  });

  it('disables the re-run button while running', () => {
    render(<ReportActions {...BASE_PROPS} onRerunSubmit={vi.fn()} rerunRunning />);

    expect(screen.getByRole('button', { name: /RE-RUN/ }).disabled).toBe(true);
  });

  it('renders export buttons only with export enabled and a resource id', () => {
    render(<ReportActions {...BASE_PROPS} result={{ request_id: 'req-9', error: 'boom' }} />);
    expect(screen.getByTestId('export-buttons').textContent).toBe('req-9|true');
    cleanup();

    render(<ReportActions {...BASE_PROPS} enableReportExport={false} />);
    expect(screen.queryByTestId('export-buttons')).toBeNull();
    cleanup();

    render(<ReportActions {...BASE_PROPS} result={{}} />);
    expect(screen.queryByTestId('export-buttons')).toBeNull();
  });
});
