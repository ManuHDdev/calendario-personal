import { describe, it, expect } from 'vitest';
import { esPrimeraVuelta } from './planificador';

describe('esPrimeraVuelta', () => {
  it('es true solo mientras la búsqueda no se haya rastreado nunca', () => {
    expect(esPrimeraVuelta({ ultimo_rastreo_at: null })).toBe(true);
  });

  it('es false en cuanto hay un rastreo previo (aunque fallara)', () => {
    expect(esPrimeraVuelta({ ultimo_rastreo_at: '2026-08-31T18:00:00.000Z' })).toBe(false);
  });
});
