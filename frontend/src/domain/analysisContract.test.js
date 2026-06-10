import { describe, expect, it } from 'vitest';

import {
  KNOWN_PIPELINE_AGENT_IDS,
  KNOWN_PIPELINE_STATUSES,
  KNOWN_SSE_EVENTS,
  PIPELINE,
  PIPELINE_AGENT_IDS,
  PIPELINE_STATUSES,
  SSE_EVENTS,
  validateAnalysisInput,
} from './analysisContract';

describe('analysisContract validation', () => {
  it.each([0, 6, 100, 'abc'])('rejects invalid max debate rounds: %s', (rounds) => {
    expect(
      validateAnalysisInput({
        activeMarket: 'US',
        ticker: 'NVDA',
        date: '2026-05-14',
        timeHorizonMonths: 1,
        rounds,
        analysisDepth: 'balanced',
        responseDetail: 'full',
      })
    ).toBe('Max debate rounds must be an integer between 1 and 5.');
  });

  it('accepts valid max debate rounds', () => {
    expect(
      validateAnalysisInput({
        activeMarket: 'US',
        ticker: 'NVDA',
        date: '2026-05-14',
        timeHorizonMonths: 1,
        rounds: 3,
        analysisDepth: 'balanced',
        responseDetail: 'full',
      })
    ).toBe('');
  });

  it('keeps backend event and pipeline values known to the UI', () => {
    expect(KNOWN_SSE_EVENTS).toEqual(
      new Set([SSE_EVENTS.PROGRESS, SSE_EVENTS.RESULT, SSE_EVENTS.ERROR, SSE_EVENTS.HEARTBEAT])
    );
    expect(KNOWN_PIPELINE_STATUSES).toEqual(
      new Set([
        PIPELINE_STATUSES.STARTED,
        PIPELINE_STATUSES.RUNNING,
        PIPELINE_STATUSES.COMPLETED,
        PIPELINE_STATUSES.FAILED,
        PIPELINE_STATUSES.ERROR,
        PIPELINE_STATUSES.SKIPPED,
      ])
    );
    PIPELINE.forEach((agent) => {
      expect(KNOWN_PIPELINE_AGENT_IDS.has(agent.id)).toBe(true);
    });
    expect(KNOWN_PIPELINE_AGENT_IDS.has(PIPELINE_AGENT_IDS.CACHE)).toBe(true);
    expect(KNOWN_PIPELINE_AGENT_IDS.has(PIPELINE_AGENT_IDS.PIPELINE)).toBe(true);
  });
});
