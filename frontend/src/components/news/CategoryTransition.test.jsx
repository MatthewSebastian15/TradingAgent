import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CategoryTransition from './CategoryTransition';

describe('CategoryTransition', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children', () => {
    const { getByText } = render(
      <CategoryTransition categoryKey="markets">
        <span>test content</span>
      </CategoryTransition>
    );
    expect(getByText('test content')).toBeInTheDocument();
  });

  it('calls window.scrollTo with top:0 on initial mount', () => {
    render(
      <CategoryTransition categoryKey="markets">
        <span />
      </CategoryTransition>
    );
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  });

  it('calls window.scrollTo again when categoryKey changes', () => {
    const { rerender } = render(
      <CategoryTransition categoryKey="markets">
        <span />
      </CategoryTransition>
    );
    vi.clearAllMocks();
    rerender(
      <CategoryTransition categoryKey="crypto">
        <span />
      </CategoryTransition>
    );
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  });

  it('does not call scrollTo again when categoryKey is unchanged', () => {
    const { rerender } = render(
      <CategoryTransition categoryKey="markets">
        <span />
      </CategoryTransition>
    );
    vi.clearAllMocks();
    rerender(
      <CategoryTransition categoryKey="markets">
        <span>updated children</span>
      </CategoryTransition>
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
