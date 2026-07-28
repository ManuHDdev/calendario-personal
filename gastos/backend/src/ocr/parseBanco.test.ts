import { describe, it, expect } from 'vitest';
import { parseBanco } from './parseBanco';

describe('parseBanco', () => {
  it('extracts the amount from a bank-app screenshot as a positive value', () => {
    const text = [
      'Movimiento',
      'MERCADONA MADRID',
      '-45,00 €',
      '25/07/2026',
      'Saldo disponible: 1.230,00 €',
    ].join('\n');

    const draft = parseBanco(text);
    expect(draft.importe).toBe(45);
    expect(draft.fecha).toBe('2026-07-25');
  });

  it('picks the largest currency-formatted amount, ignoring the smaller one', () => {
    const text = 'Comision: -1,50 €\nTransferencia recibida\n+2.500,00 €\nDESTINO SA';
    expect(parseBanco(text).importe).toBe(2500);
  });

  it('does not treat "Saldo"/"Disponible" lines as the concept', () => {
    const text = 'RESTAURANTE EL PATIO\n-30,00 €\nSaldo disponible';
    expect(parseBanco(text).comercio).toBe('RESTAURANTE EL PATIO');
  });

  it('falls back to today when no date is present', () => {
    const draft = parseBanco('COMERCIO\n-10,00 €');
    const today = new Date().toISOString().slice(0, 10);
    expect(draft.fecha).toBe(today);
  });

  it('falls back to a default concept when no usable line is found', () => {
    const draft = parseBanco('-10,00 €');
    expect(draft.comercio).toBe('Movimiento bancario');
  });

  it('leaves importe null when no currency-formatted number is found', () => {
    expect(parseBanco('Sin movimientos este mes').importe).toBeNull();
  });

  it('recovers the amount when OCR drops the decimal separator (99,50 -> 9950)', () => {
    // Bug real: el preprocesado de imagen a veces hace que Tesseract pierda
    // la ',' de "99,50 €" y lea "9950 €" — antes esto se detectaba como 995€.
    const text = ['MERCADONA MADRID', '9950€', '25/07/2026'].join('\n');
    const draft = parseBanco(text);
    expect(draft.importe).toBe(99.5);
  });

  it('prefers a properly-separated amount over the no-separator fallback', () => {
    const text = '-45,00 €\nCOMERCIO';
    expect(parseBanco(text).importe).toBe(45);
  });
});
