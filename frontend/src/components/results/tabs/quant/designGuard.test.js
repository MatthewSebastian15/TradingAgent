import { describe, expect, it } from 'vitest';

// Raw source of every Quant UI file (tests excluded). Paths are relative to this file.
const files = import.meta.glob(
  [
    './**/*.{js,jsx}',
    '../QuantPanel.jsx',
    '../QuantTab.jsx',
    '../../../../pages/Quant.jsx',
    '!./**/*.test.{js,jsx}',
  ],
  { query: '?raw', import: 'default', eager: true }
);

// Each rule names a design-system violation from CLAUDE.md "Design Standards".
const RULES = [
  {
    name: 'low-contrast text color (use text-bloomberg-white or /80)',
    pattern: /text-bloomberg-(subtle|muted)\b/,
  },
  { name: 'rounded shape (terminal surfaces are rounded-none)', pattern: /\brounded-(full|sm|md|lg|xl)\b/ },
];

function offenders(pattern) {
  return Object.entries(files).flatMap(([path, source]) =>
    source
      .split('\n')
      .map((line, i) => (pattern.test(line) ? `${path}:${i + 1}: ${line.trim()}` : null))
      .filter(Boolean)
  );
}

describe('quant design guard', () => {
  it('scans the quant sources', () => {
    expect(Object.keys(files).length).toBeGreaterThan(20);
  });

  for (const rule of RULES) {
    it(`has no ${rule.name}`, () => {
      expect(offenders(rule.pattern)).toEqual([]);
    });
  }
});
