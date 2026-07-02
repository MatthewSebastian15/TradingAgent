import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RerunPanel from './RerunPanel';

const RESULT = {
  ticker: 'AAPL',
  trade_date: '2026-01-02',
};

function renderPanel(props = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn(async () => {});
  render(<RerunPanel result={RESULT} open onClose={onClose} onSubmit={onSubmit} {...props} />);
  return { onClose, onSubmit };
}

describe('RerunPanel', () => {
  afterEach(() => cleanup());

  it('renders nothing when closed', () => {
    const { container } = render(
      <RerunPanel result={RESULT} open={false} onClose={vi.fn()} onSubmit={vi.fn()} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('prefills the form from the previous result', () => {
    renderPanel();

    expect(screen.getByText('Re-run Analysis Parameters')).toBeTruthy();
    expect(screen.getByLabelText('Ticker').value).toBe('AAPL');
    expect(screen.getByLabelText('Trade Date').value).toBe('2026-01-02');
    expect(screen.getByLabelText('Depth').value).toBe('balanced');
  });

  it('submits the built payload and closes', async () => {
    const { onClose, onSubmit } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Execute Analysis' }));
    await screen.findByText('Re-run Analysis Parameters');

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL', market: 'US', trade_date: '2026-01-02' })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a validation error instead of submitting', () => {
    const { onSubmit } = renderPanel();

    // Empty ticker passes browser constraint validation but fails the domain check.
    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Execute Analysis' }));

    expect(screen.getByText(/Select a ticker/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reveals position fields and disables submit while running', () => {
    renderPanel({ running: true });

    expect(screen.queryByLabelText('Quantity')).toBeNull();
    fireEvent.change(screen.getByLabelText('Existing Position'), { target: { value: 'yes' } });
    expect(screen.getByLabelText('Quantity')).toBeTruthy();
    expect(screen.getByLabelText('Avg Entry')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'RUNNING...' }).disabled).toBe(true);
  });
});
