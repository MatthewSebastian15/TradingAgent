import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SignalsSidebar from './SignalsSidebar';

const SIGNAL = {
  id: 's1',
  ticker: 'NVDA',
  decision: 'BUY',
  confidence_score: 72,
  time_horizon_months: 1,
  trade_date: '2026-06-01',
};

function renderSidebar(props = {}) {
  const onTrack = vi.fn();
  render(
    <SignalsSidebar
      signals={[SIGNAL]}
      trackedIds={new Set()}
      trackingId={null}
      onTrack={onTrack}
      {...props}
    />
  );
  return { onTrack };
}

describe('SignalsSidebar', () => {
  afterEach(() => cleanup());

  it('shows the empty message without signals', () => {
    renderSidebar({ signals: [] });

    expect(screen.getByText(/No analyses yet/)).toBeTruthy();
  });

  it('renders a signal row and fires onTrack', () => {
    const { onTrack } = renderSidebar();

    expect(screen.getByText('NVDA')).toBeTruthy();
    expect(screen.getByText('BUY')).toBeTruthy();
    expect(screen.getByText(/2026-06-01 · C72/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Track NVDA'));
    expect(onTrack).toHaveBeenCalledWith(SIGNAL);
  });

  it('disables the button for tracked and in-flight signals', () => {
    renderSidebar({ trackedIds: new Set(['s1']) });
    expect(screen.getByLabelText('NVDA tracked').disabled).toBe(true);
    cleanup();

    renderSidebar({ trackingId: 's1' });
    const busyButton = screen.getByLabelText('Track NVDA');
    expect(busyButton.disabled).toBe(true);
    expect(busyButton.textContent).toContain('...');
  });

  it('surfaces the tracking error', () => {
    renderSidebar({ error: 'No live price for NVDA.' });

    expect(screen.getByRole('alert').textContent).toBe('No live price for NVDA.');
  });
});
