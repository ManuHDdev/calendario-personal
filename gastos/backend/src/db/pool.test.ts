import { describe, it, expect } from 'vitest';
import { types } from 'pg';

// El repo no tiene infraestructura de tests de integración contra Postgres
// real (ver deuda técnica en CLAUDE.md), así que este test no abre una
// conexión: verifica directamente que './pool' registra, al cargarse, un
// parser para el OID de NUMERIC (1700) que convierte el string devuelto por
// pg a un number de JS. Es la regresión concreta que causaba la pantalla en
// blanco (ver ExpenseList.tsx `g.importe.toFixed(2)`, que rompía porque
// `importe` llegaba como string desde `GET /gastos`).
describe('pool NUMERIC type parser', () => {
  it('registers a parser for OID 1700 that returns numbers, not strings', async () => {
    await import('./pool');

    const NUMERIC_OID = 1700;
    const parser = types.getTypeParser(NUMERIC_OID);

    const parsed = parser('12.50');
    expect(parsed).toBe(12.5);
    expect(typeof parsed).toBe('number');
  });

  it('handles values with more than two decimals and negative numbers', async () => {
    await import('./pool');

    const NUMERIC_OID = 1700;
    const parser = types.getTypeParser(NUMERIC_OID);

    expect(parser('0.10')).toBeCloseTo(0.1);
    expect(parser('-42.99')).toBeCloseTo(-42.99);
  });
});
