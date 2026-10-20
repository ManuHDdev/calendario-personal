import { describe, it, expect } from 'vitest';
import { approxPrefix, dayColor, DAY_COLORS, formatDistance, formatDuration, parseDate } from './format';
import { haversineMeters } from './geo';

describe('formatDistance', () => {
  it('uses metres below 1 km and a decimal comma above', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(849.6)).toBe('850 m');
    expect(formatDistance(3210)).toBe('3,2 km');
    expect(formatDistance(1000)).toBe('1,0 km');
  });

  it('drops decimals from 100 km and guards bad input', () => {
    expect(formatDistance(128_400)).toBe('128 km');
    expect(formatDistance(-1)).toBe('-');
    expect(formatDistance(NaN)).toBe('-');
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(20)).toBe('<1 min');
    expect(formatDuration(25 * 60)).toBe('25 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(3600 + 5 * 60)).toBe('1 h 05 min');
    expect(formatDuration(2 * 3600 + 30 * 60)).toBe('2 h 30 min');
  });

  it('guards bad input', () => {
    expect(formatDuration(-5)).toBe('-');
  });
});

describe('misc helpers', () => {
  it('prefixes approximate values', () => {
    expect(approxPrefix(true)).toBe('~');
    expect(approxPrefix(false)).toBe('');
  });

  it('parses YYYY-MM-DD as a local date without shifting the day', () => {
    const d = parseDate('2026-07-01');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 1]);
  });

  it('cycles day colours', () => {
    expect(dayColor(0)).toBe(DAY_COLORS[0]);
    expect(dayColor(DAY_COLORS.length)).toBe(DAY_COLORS[0]);
  });
});

describe('haversineMeters (client)', () => {
  it('matches the backend: Madrid-Barcelona is ~505 km', () => {
    const km = haversineMeters({ lat: 40.4168, lng: -3.7038 }, { lat: 41.3874, lng: 2.1686 }) / 1000;
    expect(km).toBeGreaterThan(502);
    expect(km).toBeLessThan(508);
  });
});
