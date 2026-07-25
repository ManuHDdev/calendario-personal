import { describe, it, expect } from 'vitest';
import { parseTicket } from './parseTicket';

describe('parseTicket', () => {
  it('extracts amount and date from a typical thermal-paper receipt', () => {
    const text = [
      'SUPERMERCADO EL AHORRO',
      'CIF B12345678',
      'Leche 1L         1,20',
      'Pan               0,90',
      'TOTAL 23,50€',
      '25/07/2026 18:42',
      'GRACIAS POR SU COMPRA',
    ].join('\n');

    const draft = parseTicket(text);
    expect(draft.importe).toBe(23.5);
    expect(draft.fecha).toBe('2026-07-25');
    expect(draft.comercio).toBe('SUPERMERCADO EL AHORRO');
  });

  it('supports IMPORTE TOTAL and A PAGAR wording', () => {
    expect(parseTicket('BAR LA ESQUINA\nIMPORTE TOTAL: 8,50').importe).toBe(8.5);
    expect(parseTicket('BAR LA ESQUINA\nA PAGAR: 12,00').importe).toBe(12);
  });

  it('reads the amount from the line after TOTAL when not on the same line', () => {
    const text = 'TIENDA X\nTOTAL\n15,75€';
    expect(parseTicket(text).importe).toBe(15.75);
  });

  it('falls back to today when no date is present', () => {
    const draft = parseTicket('TIENDA X\nTOTAL 5,00€');
    const today = new Date().toISOString().slice(0, 10);
    expect(draft.fecha).toBe(today);
  });

  it('falls back to a default merchant name when no usable line is found', () => {
    const draft = parseTicket('12345\n67890\nTOTAL 5,00€');
    expect(draft.comercio).toBe('Comercio no detectado');
  });

  it('leaves importe null when no TOTAL-like line is found', () => {
    const draft = parseTicket('TIENDA X\nGracias por su visita');
    expect(draft.importe).toBeNull();
  });
});
