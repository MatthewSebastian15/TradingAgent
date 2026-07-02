import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('resolves conflicting tailwind classes with last one winning', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-bloomberg-red', 'text-bloomberg-green')).toBe('text-bloomberg-green');
  });

  it('supports conditional object and array inputs', () => {
    expect(cn(['a', { b: true, c: false }])).toBe('a b');
  });
});
