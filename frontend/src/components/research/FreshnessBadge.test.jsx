import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FreshnessBadge from './FreshnessBadge';

describe('FreshnessBadge', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('says LIVE right after an update', () => {
    render(<FreshnessBadge updatedAt={Date.now()} />);
    expect(screen.getByText(/live/i)).toBeTruthy();
    expect(screen.getByText(/just now/i)).toBeTruthy();
  });

  it('switches to UPDATED once past the live window', () => {
    render(<FreshnessBadge updatedAt={Date.now() - 20_000} />);
    expect(screen.getByText(/updated 20s ago/i)).toBeTruthy();
  });

  it('renders nothing without a timestamp', () => {
    const { container } = render(<FreshnessBadge updatedAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('ticks the age every second without a prop change', () => {
    vi.useFakeTimers();
    const start = Date.now();
    render(<FreshnessBadge updatedAt={start} />);
    expect(screen.getByText(/just now/i)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText(/updated 30s ago/i)).toBeTruthy();
  });

  it('formats minutes and hours', () => {
    render(<FreshnessBadge updatedAt={Date.now() - 125_000} />);
    expect(screen.getByText(/2m ago/)).toBeTruthy();
  });
});
