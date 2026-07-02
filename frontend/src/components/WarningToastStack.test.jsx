import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import WarningToastStack from './WarningToastStack';

describe('WarningToastStack', () => {
  afterEach(() => cleanup());

  it('renders nothing for empty or message-less warnings', () => {
    expect(render(<WarningToastStack warnings={[]} />).container.firstChild).toBeNull();
    expect(
      render(<WarningToastStack warnings={[{ title: 'X' }, null]} />).container.firstChild
    ).toBeNull();
  });

  it('stacks string and object warnings as alerts', () => {
    render(
      <WarningToastStack
        warnings={['plain string warning', { title: 'VENDOR DOWN', message: 'Finnhub timeout.' }]}
      />
    );

    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByText('plain string warning')).toBeTruthy();
    expect(screen.getByText('VENDOR DOWN')).toBeTruthy();
    expect(screen.getByText('Finnhub timeout.')).toBeTruthy();
  });

  it('dismisses a warning via its close button', () => {
    render(<WarningToastStack warnings={[{ id: 'w1', title: 'WARN', message: 'gone soon' }]} />);

    fireEvent.click(screen.getByLabelText('Dismiss warning'));

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
