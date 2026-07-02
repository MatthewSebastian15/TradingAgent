import { describe, expect, it } from 'vitest';

import { parseSseBlock } from './sse';

describe('parseSseBlock', () => {
  it('parses event and data fields', () => {
    expect(parseSseBlock('event: progress\ndata: {"pct":50}')).toEqual({
      type: 'progress',
      payload: { pct: 50 },
    });
  });

  it('defaults type to message when no event line', () => {
    expect(parseSseBlock('data: {"a":1}')).toEqual({ type: 'message', payload: { a: 1 } });
  });

  it('joins multi-line data with newlines before parsing', () => {
    expect(parseSseBlock('data: {"a":\ndata: 1}')).toEqual({ type: 'message', payload: { a: 1 } });
  });

  it('handles CRLF line endings', () => {
    expect(parseSseBlock('event: result\r\ndata: {"ok":true}')).toEqual({
      type: 'result',
      payload: { ok: true },
    });
  });

  it('ignores comment lines and blank lines', () => {
    expect(parseSseBlock(': heartbeat\n\ndata: {"b":2}')).toEqual({
      type: 'message',
      payload: { b: 2 },
    });
  });

  it('returns null when there is no data (pure heartbeat)', () => {
    expect(parseSseBlock(': keep-alive')).toBeNull();
    expect(parseSseBlock('event: heartbeat')).toBeNull();
    expect(parseSseBlock('')).toBeNull();
  });

  it('returns null on malformed JSON payloads', () => {
    expect(parseSseBlock('data: {not json')).toBeNull();
  });

  it('strips only a single leading space from the value', () => {
    expect(parseSseBlock('data: " padded"')).toEqual({ type: 'message', payload: ' padded' });
  });
});
