import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MarginBar, RangeDot, SectionCard, Skeleton } from './primitives';

describe('research primitives', () => {
  afterEach(cleanup);

  it('marks a busy SectionCard aria-busy', () => {
    render(
      <SectionCard title="TEST" busy>
        content
      </SectionCard>
    );
    expect(screen.getByText('content').closest('[aria-busy]').getAttribute('aria-busy')).toBe(
      'true'
    );
  });

  it('adds no aria-busy by default', () => {
    const { container } = render(<SectionCard title="TEST">content</SectionCard>);
    expect(container.querySelector('[aria-busy]')).toBeNull();
  });

  it('renders a hidden pulsing Skeleton with a caller-supplied size', () => {
    const { container } = render(<Skeleton className="h-8 w-24" />);
    const el = container.firstChild;
    expect(el.className).toMatch(/animate-pulse/);
    expect(el.className).toMatch(/h-8 w-24/);
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives RangeDot a screen-reader label and hides the dot itself', () => {
    const { container } = render(<RangeDot pct={40} label="40% of the way" />);
    expect(screen.getByText('40% of the way').className).toMatch(/sr-only/);
    expect(container.querySelector('[style]').getAttribute('aria-hidden')).toBe('true');
  });

  it('hides the decorative MarginBar from assistive tech', () => {
    const { container } = render(<MarginBar pct={20} />);
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
  });
});
