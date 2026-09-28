import { afterEach, describe, expect, it, vi } from 'vitest';

import { csvCell, downloadText, exportFilename, serializeSvg, toCsv } from './exporters';

describe('exporters', () => {
  afterEach(() => vi.restoreAllMocks());

  it('quotes CSV cells and neutralises spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-2.1%')).toBe('-2.1%');
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
  });

  it('builds CSV from table columns', () => {
    const csv = toCsv(
      [
        { key: 'name', label: 'Scenario' },
        { key: 'shock', label: 'Shock', render: (r) => `${r.shock}%` },
        { key: 'node', label: 'Node', render: () => ({ not: 'text' }), csv: (r) => r.name.length },
      ],
      [{ name: 'Crash, 1987', shock: -20 }]
    );
    expect(csv).toBe('Scenario,Shock,Node\r\n"Crash, 1987",-20%,11');
  });

  it('makes safe filenames', () => {
    expect(exportFilename('BBCA.JK', 'Equity curve / 5Y')).toBe('BBCA.JK_Equity-curve-5Y');
  });

  it('downloads text through a temporary link', () => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadText('a.csv', 'x,y');
    expect(click).toHaveBeenCalled();
    expect(globalThis.URL.createObjectURL.mock.calls[0][0].type).toBe('text/csv;charset=utf-8');
  });

  it('serializes an SVG with namespace, font and background', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '50');
    svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'circle'));
    const text = serializeSvg(svg);
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(text).toContain('font-family=');
    expect(text.indexOf('<rect')).toBeLessThan(text.indexOf('<circle'));
    expect(svg.querySelector('rect')).toBeNull();
  });
});
