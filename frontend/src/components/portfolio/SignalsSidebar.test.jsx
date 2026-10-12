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

    const msg = screen.getByText(/No analyses yet/);
    expect(msg.className).not.toMatch(/text-bloomberg-muted/);
    expect(msg.className).toMatch(/text-bloomberg-white/);
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

  it('shows Load more only when more pages exist and fires the handler', () => {
    const onLoadMore = vi.fn();
    renderSidebar({ hasMore: true, onLoadMore });

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    cleanup();

    renderSidebar({ hasMore: false });
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('disables Load more while a page is loading', () => {
    renderSidebar({ hasMore: true, loadingMore: true, onLoadMore: vi.fn() });
    expect(screen.getByRole('button', { name: 'Loading...' }).disabled).toBe(true);
  });
});
