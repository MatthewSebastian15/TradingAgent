import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScenarioSection } from './ScenarioSection';

const base = { spot: 100, vol: 30, ccy: 'USD', regime: null, benchLabel: 'Nikkei 225' };

describe('ScenarioSection', () => {
  afterEach(() => cleanup());

  it('colors shock and P&L cells by sign (negative beta yields green gains)', () => {
    render(<ScenarioSection {...base} beta={-0.3} benchIsSp500 />);
    const gainRow = screen.getByText('GFC — S&P 500, 2008-10-15').closest('tr');
    const cells = gainRow.querySelectorAll('td');
    expect(cells[2].textContent).toBe('+2.7%');
    expect(cells[2].className).toContain('text-bloomberg-green');
    expect(cells[4].className).toContain('text-bloomberg-green');
    const lossRow = screen.getByText('−1σ day').closest('tr');
    const lossCells = lossRow.querySelectorAll('td');
    expect(lossCells[2].className).toContain('text-bloomberg-red');
    expect(lossCells[4].className).toContain('text-bloomberg-red');
  });

  it('renders zero shocks in the neutral color', () => {
    render(<ScenarioSection {...base} vol={0} beta={-0.3} benchIsSp500 />);
    const cells = screen.getByText('−1σ day').closest('tr').querySelectorAll('td');
    expect(cells[2].className).toContain('text-bloomberg-white');
    expect(cells[4].className).toContain('text-bloomberg-white');
  });

  it('keeps the terminal-table surface with readable header text', () => {
    const { container } = render(<ScenarioSection {...base} beta={1} benchIsSp500 />);
    expect(container.querySelector('table').className).toContain('terminal-table');
    expect(container.querySelector('th').className).toContain('text-bloomberg-white');
  });

  it('claims the benchmark only when beta is available', () => {
    const { rerender, container } = render(
      <ScenarioSection {...base} beta={0.8} benchIsSp500={false} />
    );
    expect(container.textContent).toContain('β is measured against Nikkei 225');
    rerender(<ScenarioSection {...base} beta={null} benchIsSp500={false} />);
    expect(container.textContent).toContain('β is unavailable, so rows use β = 1');
    expect(container.textContent).not.toContain('β is measured against');
  });
});
