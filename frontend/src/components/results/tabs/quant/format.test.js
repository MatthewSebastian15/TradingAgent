import { describe, expect, it } from 'vitest';

import { sampleNote, significanceNote } from './format';

describe('sampleNote', () => {
  it('flags small samples', () => {
    expect(sampleNote(502)).toBe('n=502');
    expect(sampleNote(60)).toBe('n=60 · low confidence');
    expect(sampleNote(null)).toBeNull();
  });
});

describe('significanceNote', () => {
  it('combines sample size and significance', () => {
    expect(significanceNote({ n: 502, tStat: 3.1 })).toBe('n=502');
    expect(significanceNote({ n: 60, tStat: 1.2 })).toBe('n=60 · low confidence · not significant');
    expect(significanceNote({ significant: false })).toBe('not significant');
    expect(significanceNote({})).toBeNull();
  });
});
