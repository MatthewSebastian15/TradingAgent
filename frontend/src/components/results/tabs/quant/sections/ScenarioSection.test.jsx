import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScenarioSection } from './ScenarioSection';

const base = { spot: 100, vol: 30, ccy: 'USD', regime: null, benchLabel: 'Nikkei 225', ppy: 252 };

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

  it('renders the stress table with readable header text', () => {
    const { container } = render(<ScenarioSection {...base} beta={1} benchIsSp500 />);
    expect(container.querySelector('table caption').textContent).toBe('One-day stress scenarios');
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

  it('treats beta = 0 as available and shows zero crash moves', () => {
    const { container } = render(<ScenarioSection {...base} beta={0} benchIsSp500 />);
    expect(container.textContent).toContain('β = 0.00 vs Nikkei 225');
    expect(container.textContent).not.toContain('β unavailable');
    const cells = screen
      .getByText('GFC — S&P 500, 2008-10-15')
      .closest('tr')
      .querySelectorAll('td');
    expect(cells[2].textContent).toBe('+0.0%');
    expect(cells[2].className).toContain('text-bloomberg-white');
  });

  it('shows a dash in the index-move column for sigma rows only', () => {
    render(<ScenarioSection {...base} beta={1} benchIsSp500 />);
    expect(screen.getByText('−1σ day').closest('tr').querySelectorAll('td')[1].textContent).toBe(
      '—'
    );
    const gfc = screen.getByText('GFC — S&P 500, 2008-10-15').closest('tr');
    expect(gfc.querySelectorAll('td')[1].textContent).not.toBe('—');
  });

  it('hides the beta-unavailable notices while beta is still loading', () => {
    const { rerender, container } = render(
      <ScenarioSection {...base} beta={null} betaLoading benchIsSp500={false} />
    );
    expect(container.textContent).not.toContain('β unavailable');
    expect(container.textContent).not.toContain('β is unavailable');
    rerender(<ScenarioSection {...base} beta={null} benchIsSp500={false} />);
    expect(container.textContent).toContain('β unavailable, using 1');
    expect(container.textContent).toContain('β is unavailable');
  });

  it('says beta is loading (not unavailable) while the benchmark is fetching', () => {
    const { container } = render(
      <ScenarioSection {...base} beta={null} betaLoading benchIsSp500={false} />
    );
    expect(container.textContent).toContain('β loading, using 1');
    expect(container.textContent).not.toContain('β unavailable, using 1');
  });

  it('defaults ppy to 252 when omitted', () => {
    const { container } = render(
      <ScenarioSection {...base} ppy={undefined} beta={1} benchIsSp500 />
    );
    const { container: withPpy } = render(<ScenarioSection {...base} beta={1} benchIsSp500 />);
    expect(container.textContent).toBe(withPpy.textContent);
  });

  it('renders the stress table with a signed, right-aligned shock column', () => {
    render(<ScenarioSection {...base} vol={25} beta={1.2} benchLabel="S&P 500" benchIsSp500 />);
    expect(screen.getByText('One-day stress scenarios')).toBeTruthy();
    expect(screen.getByText('Black Monday — S&P 500, 1987-10-19')).toBeTruthy();
    expect(screen.getByText('-24.6%').className).toContain('text-right');
  });
});
