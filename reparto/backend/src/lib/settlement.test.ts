import { describe, it, expect } from 'vitest';
import { simplifyDebts, type Balance } from './settlement';

function applyTransfers(balances: Balance[], transfers: ReturnType<typeof simplifyDebts>): Map<string, number> {
  const result = new Map(balances.map((b) => [b.memberId, b.amount]));
  for (const t of transfers) {
    result.set(t.fromMemberId, (result.get(t.fromMemberId) ?? 0) + t.amount);
    result.set(t.toMemberId, (result.get(t.toMemberId) ?? 0) - t.amount);
  }
  return result;
}

describe('simplifyDebts', () => {
  it('produces a single transfer for 2 members', () => {
    const balances: Balance[] = [
      { memberId: 'A', amount: 10 },
      { memberId: 'B', amount: -10 },
    ];
    const transfers = simplifyDebts(balances);
    expect(transfers).toEqual([{ fromMemberId: 'B', toMemberId: 'A', amount: 10 }]);
    const result = applyTransfers(balances, transfers);
    for (const v of result.values()) expect(Math.abs(v)).toBeLessThan(0.01);
  });

  it('produces at most n-1 transfers for 3 members', () => {
    const balances: Balance[] = [
      { memberId: 'A', amount: 20 },
      { memberId: 'B', amount: -5 },
      { memberId: 'C', amount: -15 },
    ];
    const transfers = simplifyDebts(balances);
    expect(transfers.length).toBeLessThanOrEqual(2);
    const result = applyTransfers(balances, transfers);
    for (const v of result.values()) expect(Math.abs(v)).toBeLessThan(0.01);
  });

  it('settles a 5-member group correctly', () => {
    const balances: Balance[] = [
      { memberId: 'A', amount: 40 },
      { memberId: 'B', amount: 25 },
      { memberId: 'C', amount: -10 },
      { memberId: 'D', amount: -20 },
      { memberId: 'E', amount: -35 },
    ];
    const transfers = simplifyDebts(balances);
    expect(transfers.length).toBeLessThanOrEqual(4);
    const result = applyTransfers(balances, transfers);
    for (const v of result.values()) expect(Math.abs(v)).toBeLessThan(0.01);
  });

  it('returns no transfers when everyone is already settled', () => {
    const balances: Balance[] = [
      { memberId: 'A', amount: 0 },
      { memberId: 'B', amount: 0 },
    ];
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it('ignores balances within rounding tolerance of zero', () => {
    const balances: Balance[] = [
      { memberId: 'A', amount: 0.001 },
      { memberId: 'B', amount: -0.001 },
    ];
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it('every transfer amount is positive', () => {
    const balances: Balance[] = [
      { memberId: 'A', amount: 15 },
      { memberId: 'B', amount: 5 },
      { memberId: 'C', amount: -12 },
      { memberId: 'D', amount: -8 },
    ];
    const transfers = simplifyDebts(balances);
    for (const t of transfers) expect(t.amount).toBeGreaterThan(0);
  });
});
