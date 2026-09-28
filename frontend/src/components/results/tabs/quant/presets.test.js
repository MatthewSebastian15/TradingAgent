import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearPreset, loadPreset, savePreset } from './presets';

describe('quant presets', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips JSON per kind and ticker', () => {
    savePreset('peers', 'AAPL', ['MSFT', 'NVDA']);
    expect(window.localStorage.getItem('ta:quant:preset:v1:peers:AAPL')).toBe('["MSFT","NVDA"]');
    expect(loadPreset('peers', 'AAPL')).toEqual(['MSFT', 'NVDA']);
    expect(loadPreset('peers', 'BBCA.JK')).toBeNull();
    clearPreset('peers', 'AAPL');
    expect(loadPreset('peers', 'AAPL')).toBeNull();
  });

  it('survives corrupt data, missing symbols and blocked storage', () => {
    window.localStorage.setItem('ta:quant:preset:v1:dcf:AAPL', '{oops');
    expect(loadPreset('dcf', 'AAPL')).toBeNull();
    savePreset('dcf', '', { years: 5 });
    expect(window.localStorage.length).toBe(1);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => savePreset('dcf', 'AAPL', { years: 5 })).not.toThrow();
  });
});
