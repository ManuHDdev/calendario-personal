import { describe, it, expect } from 'vitest';
import { selectParser } from './pipeline';
import { parseTicket } from './parseTicket';
import { parseBanco } from './parseBanco';

describe('selectParser', () => {
  it('maps "ticket" to parseTicket', () => {
    expect(selectParser('ticket')).toBe(parseTicket);
  });

  it('maps "banco" to parseBanco', () => {
    expect(selectParser('banco')).toBe(parseBanco);
  });
});
