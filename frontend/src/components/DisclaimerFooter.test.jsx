import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DisclaimerFooter from './DisclaimerFooter';
import { fetchReportDisclaimer } from '../utils/reportDisclaimer';

vi.mock('../utils/reportDisclaimer', () => ({
  fetchReportDisclaimer: vi.fn(async () => 'Backend fallback disclaimer.'),
}));

describe('DisclaimerFooter', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the provided disclaimer without fetching the fallback', () => {
    render(<DisclaimerFooter disclaimer="Research tool only." />);

    expect(screen.getByText('Disclaimer')).toBeTruthy();
    expect(screen.getByText('Research tool only.')).toBeTruthy();
    expect(fetchReportDisclaimer).not.toHaveBeenCalled();
  });

  it('falls back to the backend disclaimer when the prop is empty', async () => {
    render(<DisclaimerFooter disclaimer="  " />);

    expect(await screen.findByText('Backend fallback disclaimer.')).toBeTruthy();
    expect(fetchReportDisclaimer).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while no disclaimer text is available', () => {
    fetchReportDisclaimer.mockResolvedValueOnce('');
    const { container } = render(<DisclaimerFooter />);

    expect(container.firstChild).toBeNull();
  });
});
