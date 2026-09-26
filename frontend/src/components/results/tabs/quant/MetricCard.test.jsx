import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { MetricCard } from './charts';
import { CARD_GRID, FIELD_GRID } from './layout';

describe('MetricCard v2', () => {
  afterEach(() => cleanup());

  it('moves the explanation into a tooltip trigger and keeps it for screen readers', () => {
    const { container } = render(
      <MetricCard
        label="Sharpe"
        value="1.20"
        gloss="Return per unit of risk."
        formula="(mean − rf) / σ"
      />
    );
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByRole('button', { name: 'About Sharpe' })).toBeTruthy();
    expect(screen.getByText('Return per unit of risk.').className).toContain('sr-only');
  });

  it('truncates long values, exposes the full text and separates the category', () => {
    render(<MetricCard label="Hurst" value="0.53" category="Random walk" />);
    const value = screen.getByText('0.53');
    expect(value.className).toContain('truncate');
    expect(value.getAttribute('title')).toBe('0.53');
    expect(screen.getByText('Random walk')).toBeTruthy();
  });

  it('shows comparison and flags low-confidence samples in amber', () => {
    render(
      <MetricCard
        label="Beta"
        value="1.30"
        compare={{ label: 'vs 1Y ago', value: '+0.20', tone: 'bad' }}
        sample="n=60 · low confidence"
      />
    );
    expect(screen.getByText('vs 1Y ago')).toBeTruthy();
    expect(screen.getByText('+0.20').className).toContain('text-bloomberg-red');
    expect(screen.getByText('n=60 · low confidence').className).toContain('text-bloomberg-amber');
  });

  it('distinguishes loading from unavailable', () => {
    const { rerender } = render(<MetricCard label="Beta" value="—" status="loading" />);
    expect(screen.getByText('Loading Beta')).toBeTruthy();
    expect(screen.queryByText('Unavailable')).toBeNull();

    rerender(<MetricCard label="Beta" value="—" status="unavailable" />);
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.queryByText('Loading Beta')).toBeNull();
  });

  it('exports auto-fit grids capped at four card columns', () => {
    expect(CARD_GRID).toContain('auto-fill');
    expect(CARD_GRID).toContain('/4');
    expect(FIELD_GRID).toContain('auto-fill');
  });
});
