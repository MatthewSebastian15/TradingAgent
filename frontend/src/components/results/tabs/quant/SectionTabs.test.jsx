import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { SectionBlock } from './charts';
import { SectionTabs } from './SectionTabs';

function Harness() {
  const [active, setActive] = useState('overview');
  return (
    <>
      <SectionTabs activeId={active} onSelect={setActive} idPrefix="t" />
      <SectionBlock
        section="overview"
        tabsId="t"
        hidden={active !== 'overview'}
        actions={<button type="button">Export</button>}
      >
        <p>overview body</p>
      </SectionBlock>
      <SectionBlock section="volatility" tabsId="t" hidden={active !== 'volatility'}>
        <p>vol body</p>
      </SectionBlock>
    </>
  );
}

describe('SectionTabs + SectionBlock', () => {
  afterEach(() => cleanup());

  it('follows the ARIA tabs pattern with arrow, Home and End keys', () => {
    render(<Harness />);
    const overview = screen.getByRole('tab', { name: 'Overview' });
    expect(overview.getAttribute('aria-selected')).toBe('true');
    expect(overview.getAttribute('tabindex')).toBe('0');
    expect(overview.getAttribute('aria-controls')).toBe('t-panel-overview');
    expect(screen.getByRole('tab', { name: 'Risk' }).getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Volatility' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Volatility' }));
    expect(screen.getByRole('tabpanel', { name: 'Volatility' })).toBeTruthy();

    fireEvent.keyDown(document.activeElement, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Valuation' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  it('shows the description instead of repeating the name, plus actions', () => {
    render(<Harness />);
    expect(
      screen.getByText('Key numbers for the loaded window and a plain-language reading of them.')
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Overview' }).className).toContain('sr-only');
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  });
});
