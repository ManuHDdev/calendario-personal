import { describe, it, expect } from 'vitest';
import { isFromOwner } from './bot';

describe('isFromOwner', () => {
  it('accepts a message from the configured owner chat id', () => {
    expect(isFromOwner(123456789, '123456789')).toBe(true);
  });

  it('rejects a message from any other chat id', () => {
    expect(isFromOwner(999999999, '123456789')).toBe(false);
  });

  it('rejects when the owner chat id is not configured', () => {
    expect(isFromOwner(123456789, undefined)).toBe(false);
  });

  it('rejects when the incoming chat id is missing', () => {
    expect(isFromOwner(undefined, '123456789')).toBe(false);
  });

  it('compares numeric and string chat ids equivalently', () => {
    expect(isFromOwner('123456789', '123456789')).toBe(true);
  });
});
