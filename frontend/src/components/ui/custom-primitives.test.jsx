import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentStatusPill } from './agent-status-pill';
import { MetricCard } from './metric-card';
import { SignalBadge } from './signal-badge';

describe('custom shadcn primitives', () => {
  afterEach(() => cleanup());

  it('renders signal badge variants with normalized confidence', () => {
    render(<SignalBadge signal="buy" confidence={0.82} />);

    expect(screen.getByText('BUY')).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
  });

  it('renders metric value in a metric card', () => {
    render(<MetricCard label="Entry Price" value="$920" unit="USD" />);

    expect(screen.getByText('Entry Price')).toBeInTheDocument();
    expect(screen.getByText('$920')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('renders agent status pill state and elapsed time', () => {
    render(<AgentStatusPill agentName="Market Analyst" status="running" elapsedTime="0:03" />);

    expect(screen.getByText('Market Analyst')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('0:03')).toBeInTheDocument();
  });
});
