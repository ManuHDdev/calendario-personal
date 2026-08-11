import { describe, it, expect } from 'vitest';
import { createExpenseSchema, updateExpenseSchema, isFullSplitReplace } from './expense.schema';

const MEMBER_A = '11111111-1111-1111-1111-111111111111';
const MEMBER_B = '22222222-2222-2222-2222-222222222222';

describe('createExpenseSchema — equal split', () => {
  it('accepts a well-formed equal split', () => {
    const result = createExpenseSchema.safeParse({
      payerMemberId: MEMBER_A,
      amount: 30,
      description: 'Cena',
      date: '2026-08-01',
      splitType: 'equal',
      participants: [{ memberId: MEMBER_A }, { memberId: MEMBER_B }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an equal split with no participants', () => {
    const result = createExpenseSchema.safeParse({
      payerMemberId: MEMBER_A,
      amount: 30,
      description: 'Cena',
      date: '2026-08-01',
      splitType: 'equal',
      participants: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('createExpenseSchema — exact split', () => {
  it('accepts well-formed exact shares (sum validated in the handler, not here)', () => {
    const result = createExpenseSchema.safeParse({
      payerMemberId: MEMBER_A,
      amount: 30,
      description: 'Cena',
      date: '2026-08-01',
      splitType: 'exact',
      participants: [
        { memberId: MEMBER_A, shareAmount: 20 },
        { memberId: MEMBER_B, shareAmount: 10 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative shareAmount', () => {
    const result = createExpenseSchema.safeParse({
      payerMemberId: MEMBER_A,
      amount: 30,
      description: 'Cena',
      date: '2026-08-01',
      splitType: 'exact',
      participants: [{ memberId: MEMBER_A, shareAmount: -5 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('createExpenseSchema — percentage split', () => {
  it('accepts well-formed percentages (sum validated in the handler, not here)', () => {
    const result = createExpenseSchema.safeParse({
      payerMemberId: MEMBER_A,
      amount: 30,
      description: 'Cena',
      date: '2026-08-01',
      splitType: 'percentage',
      participants: [
        { memberId: MEMBER_A, sharePercentage: 60 },
        { memberId: MEMBER_B, sharePercentage: 40 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('createExpenseSchema — malformed bodies', () => {
  it.each([
    {},
    { splitType: 'equal' },
    { payerMemberId: 'not-a-uuid', amount: 10, description: 'x', date: '2026-08-01', splitType: 'equal', participants: [{ memberId: MEMBER_A }] },
    { payerMemberId: MEMBER_A, amount: -10, description: 'x', date: '2026-08-01', splitType: 'equal', participants: [{ memberId: MEMBER_A }] },
    { payerMemberId: MEMBER_A, amount: 10, description: '', date: '2026-08-01', splitType: 'equal', participants: [{ memberId: MEMBER_A }] },
    { payerMemberId: MEMBER_A, amount: 10, description: 'x', date: '01-08-2026', splitType: 'equal', participants: [{ memberId: MEMBER_A }] },
    { payerMemberId: MEMBER_A, amount: 10, description: 'x', date: '2026-08-01', splitType: 'unknown', participants: [] },
  ])('rejects malformed body: %j', (body) => {
    expect(createExpenseSchema.safeParse(body).success).toBe(false);
  });
});

describe('updateExpenseSchema', () => {
  it('accepts a partial field-only update', () => {
    const result = updateExpenseSchema.safeParse({ description: 'Cena actualizada' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty partial update', () => {
    expect(updateExpenseSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a full split replace and isFullSplitReplace narrows it correctly', () => {
    const body = {
      payerMemberId: MEMBER_A,
      amount: 30,
      description: 'Cena',
      date: '2026-08-01',
      splitType: 'exact' as const,
      participants: [{ memberId: MEMBER_A, shareAmount: 30 }],
    };
    const result = updateExpenseSchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(isFullSplitReplace(result.data)).toBe(true);
    }
  });

  it('rejects unknown fields in a partial update', () => {
    expect(updateExpenseSchema.safeParse({ foo: 'bar' }).success).toBe(false);
  });
});
