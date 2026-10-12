import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadTextFile } from './downloadFile';

describe('downloadTextFile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('clicks a temporary link with the file name and revokes the URL later', () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadTextFile('portfolio-backup-2026-10-09.json', '{"a":1}');

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull(); // removed after the click
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    vi.useRealTimers();
  });
});
