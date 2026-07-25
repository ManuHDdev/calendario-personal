import { describe, it, expect } from 'vitest';
import { normalizeAmount, findCurrencyNumber } from './amountParser';

describe('normalizeAmount', () => {
  it('parses Spanish-format amounts (comma decimal)', () => {
    expect(normalizeAmount('23,50')).toBe(23.5);
    expect(normalizeAmount('23,50€')).toBe(23.5);
  });

  it('parses thousand separators with dot and decimal comma', () => {
    expect(normalizeAmount('1.234,56')).toBe(1234.56);
  });

  it('parses plain dot-decimal amounts', () => {
    expect(normalizeAmount('45.00')).toBe(45);
  });

  it('parses negative amounts (bank withdrawals)', () => {
    expect(normalizeAmount('-45,00 €')).toBe(-45);
  });

  it('returns null for non-numeric input', () => {
    expect(normalizeAmount('abc')).toBeNull();
    expect(normalizeAmount('')).toBeNull();
  });
});

describe('findCurrencyNumber', () => {
  it('finds a currency number within a longer line', () => {
    expect(findCurrencyNumber('TOTAL 23,50€')).toBe('23,50');
  });

  it('returns null when no number is present', () => {
    expect(findCurrencyNumber('GRACIAS POR SU COMPRA')).toBeNull();
  });
});
