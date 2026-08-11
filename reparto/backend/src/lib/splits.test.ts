import { describe, it, expect } from 'vitest';
import {
  resolveEqualSplit,
  validateExactSplit,
  resolveExactSplit,
  validatePercentageSplit,
  resolvePercentageSplit,
} from './splits';

const A = 'member-a';
const B = 'member-b';
const C = 'member-c';

describe('resolveEqualSplit', () => {
  it('splits evenly when it divides cleanly', () => {
    const result = resolveEqualSplit(10, [{ memberId: A }, { memberId: B }]);
    expect(result).toEqual([
      { memberId: A, shareAmount: 5, sharePercentage: null },
      { memberId: B, shareAmount: 5, sharePercentage: null },
    ]);
  });

  it('assigns the rounding remainder to the first participants, sum matches exactly', () => {
    const result = resolveEqualSplit(10, [{ memberId: A }, { memberId: B }, { memberId: C }]);
    const sum = result.reduce((acc, r) => acc + r.shareAmount, 0);
    expect(Math.round(sum * 100) / 100).toBe(10);
    // 1000 cents / 3 = 333 base, remainder 1 -> first participant gets the extra cent
    expect(result[0].shareAmount).toBe(3.34);
    expect(result[1].shareAmount).toBe(3.33);
    expect(result[2].shareAmount).toBe(3.33);
  });

  it('throws when there are no participants', () => {
    expect(() => resolveEqualSplit(10, [])).toThrow();
  });
});

describe('validateExactSplit / resolveExactSplit', () => {
  it('accepts shares that sum exactly to amount', () => {
    const result = validateExactSplit(30, [
      { memberId: A, shareAmount: 20 },
      { memberId: B, shareAmount: 10 },
    ]);
    expect(result.valid).toBe(true);
  });

  it('rejects shares that do not sum to amount', () => {
    const result = validateExactSplit(30, [
      { memberId: A, shareAmount: 20 },
      { memberId: B, shareAmount: 5 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.message).toBeDefined();
  });

  it('resolveExactSplit passes shareAmount through (rounded to cents)', () => {
    const result = resolveExactSplit([{ memberId: A, shareAmount: 12.345 }]);
    expect(result[0].shareAmount).toBe(12.35);
    expect(result[0].sharePercentage).toBeNull();
  });
});

describe('validatePercentageSplit / resolvePercentageSplit', () => {
  it('accepts percentages summing to exactly 100', () => {
    expect(validatePercentageSplit([{ memberId: A, sharePercentage: 60 }, { memberId: B, sharePercentage: 40 }]).valid).toBe(true);
  });

  it('accepts percentages within the ±0.01 tolerance', () => {
    expect(
      validatePercentageSplit([
        { memberId: A, sharePercentage: 33.34 },
        { memberId: B, sharePercentage: 33.33 },
        { memberId: C, sharePercentage: 33.33 },
      ]).valid,
    ).toBe(true);
  });

  it('rejects percentages summing to something else', () => {
    const result = validatePercentageSplit([{ memberId: A, sharePercentage: 60 }, { memberId: B, sharePercentage: 30 }]);
    expect(result.valid).toBe(false);
  });

  it('resolvePercentageSplit computes share amounts and preserves rounding remainder, sum matches exactly', () => {
    const result = resolvePercentageSplit(10, [
      { memberId: A, sharePercentage: 33.34 },
      { memberId: B, sharePercentage: 33.33 },
      { memberId: C, sharePercentage: 33.33 },
    ]);
    const sum = result.reduce((acc, r) => acc + r.shareAmount, 0);
    expect(Math.round(sum * 100) / 100).toBe(10);
    expect(result[0].sharePercentage).toBe(33.34);
  });
});
