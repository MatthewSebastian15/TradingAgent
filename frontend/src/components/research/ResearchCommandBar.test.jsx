import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResearchCommandBar from './ResearchCommandBar';

vi.mock('../TickerSearchBar', () => {
  function TickerSearchBarStub({ value, onSelect, onSubmit }) {
    return (
      <div>
        <span data-testid="search-value">{value}</span>
        <button type="button" onClick={() => onSelect({ symbol: 'NVDA' })}>
          pick
        </button>
        <button type="button" onClick={() => onSubmit('TSLA')}>
          submit
        </button>
      </div>
    );
  }
  TickerSearchBarStub.propTypes = {
    value: PropTypes.string,
    onSelect: PropTypes.func,
    onSubmit: PropTypes.func,
  };
  return { default: TickerSearchBarStub };
});

describe('ResearchCommandBar', () => {
  afterEach(() => cleanup());

  it('hides the asset tag and clear button when empty', () => {
    render(<ResearchCommandBar value="" onSelect={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.queryByText('<EQUITY>')).toBeNull();
    expect(screen.queryByLabelText('Clear search')).toBeNull();
  });

  it('propagates search selection and submit upward', () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn();
    render(<ResearchCommandBar value="" onSelect={onSelect} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText('pick'));
    expect(onSelect).toHaveBeenCalledWith({ symbol: 'NVDA' });
    expect(screen.getByTestId('search-value').textContent).toBe('NVDA');
    expect(screen.getByText('<EQUITY>')).toBeTruthy();

    fireEvent.click(screen.getByText('submit'));
    expect(onSubmit).toHaveBeenCalledWith({ symbol: 'TSLA' });
  });

  it('clears the input via the X button', () => {
    const onClear = vi.fn();
    render(
      <ResearchCommandBar value="AAPL" onSelect={vi.fn()} onSubmit={vi.fn()} onClear={onClear} />
    );

    fireEvent.click(screen.getByLabelText('Clear search'));

    expect(onClear).toHaveBeenCalled();
    expect(screen.getByTestId('search-value').textContent).toBe('');
  });

  it('pulses the status dot while loading', () => {
    const { container } = render(
      <ResearchCommandBar value="AAPL" onSelect={vi.fn()} onSubmit={vi.fn()} loading />
    );

    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });
});
