import { describe, expect, it } from 'vitest';

import { safeExternalUrl } from './url';

describe('safeExternalUrl', () => {
  it('returns href for http and https URLs', () => {
    expect(safeExternalUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects non-http protocols', () => {
    expect(safeExternalUrl('javascript' + ':alert(1)')).toBeNull();
    expect(safeExternalUrl('ftp://example.com')).toBeNull();
    expect(safeExternalUrl('data:text/html,x')).toBeNull();
  });

  it('rejects relative and malformed input', () => {
    expect(safeExternalUrl('/relative/path')).toBeNull();
    expect(safeExternalUrl('not a url')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});
