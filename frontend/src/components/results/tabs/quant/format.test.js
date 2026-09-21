import { describe, expect, it } from 'vitest';

import { sampleNote } from './format';

describe('sampleNote', () => {
  it('flags small samples', () => {
    expect(sampleNote(502)).toBe('n=502');
    expect(sampleNote(60)).toBe('n=60 · low confidence');
    expect(sampleNote(null)).toBeNull();
  });
});
