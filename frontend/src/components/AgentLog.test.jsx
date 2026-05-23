import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AgentLog from './AgentLog';

describe('AgentLog', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('does not replay the last progress event when elapsed time ticks', () => {
    vi.useFakeTimers();

    render(
      <AgentLog
        status="Running"
        agentProgress={{
          agent_id: 'market_analyst',
          agent_name: 'Market Analyst',
          status: 'completed',
          status_message: 'Market analysis completed.',
        }}
      />
    );

    expect(screen.getAllByText('Market Analyst')).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getAllByText('Market Analyst')).toHaveLength(1);
    expect(screen.getByText('0:03')).toBeTruthy();
  });

  it('does not duplicate the same progress payload on rerender', () => {
    const progress = {
      agent_id: 'market_analyst',
      agent_name: 'Market Analyst',
      status: 'completed',
      status_message: 'Market analysis completed.',
    };

    const { rerender } = render(<AgentLog status="Running" agentProgress={progress} />);

    rerender(<AgentLog status="Still running" agentProgress={{ ...progress }} />);

    expect(screen.getAllByText('Market Analyst')).toHaveLength(1);
  });
});
