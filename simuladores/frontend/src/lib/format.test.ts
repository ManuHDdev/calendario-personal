import { describe, expect, it } from 'vitest';
import { downsample, harmonicRange } from './math';
import { formatDecimal, formatInt, formatPercent, formatScientific } from './format';

describe('format', () => {
  it('uses Spanish separators', () => {
    expect(formatDecimal(3.14159, 3)).toBe('3,142');
    expect(formatInt(12345)).toMatch(/^12.345$/);
    expect(formatPercent(0.31183)).toBe('31,18 %');
  });

  it('switches to scientific notation for tiny probabilities', () => {
    expect(formatScientific(7.888609e-31)).toBe('7,89·10⁻³¹');
    expect(formatPercent(Math.pow(0.5, 100))).toContain('·10⁻²⁹');
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

describe('math helpers', () => {
  it('harmonicRange sums 1/k over (m, n]', () => {
    expect(harmonicRange(0, 3)).toBeCloseTo(1 + 1 / 2 + 1 / 3, 12);
    expect(harmonicRange(5, 5)).toBe(0);
  });

  it('downsample keeps first and last and caps the length', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const d = downsample(items, 50);
    expect(d.length).toBe(50);
    expect(d[0]).toBe(0);
    expect(d[49]).toBe(999);
    expect(downsample([1, 2], 50)).toEqual([1, 2]);
  });
});
