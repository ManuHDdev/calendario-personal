import { describe, it, expect } from 'vitest';
import { calcularProximaAccion } from './importador';

const H = 60 * 60_000;

describe('calcularProximaAccion', () => {
  const ahora = new Date('2026-10-20T12:00:00Z');

  it('sin intento previo: importa ya', () => {
    expect(calcularProximaAccion(null, ahora, 24 * H)).toEqual({ ejecutarAhora: true, esperaMs: 0 });
  });

  it('intervalo ya cumplido: importa ya (aunque el proceso acabe de arrancar)', () => {
    const ultima = new Date(ahora.getTime() - 25 * H);
    expect(calcularProximaAccion(ultima, ahora, 24 * H).ejecutarAhora).toBe(true);
  });

  it('intervalo no cumplido: espera solo lo que falta, no un intervalo entero', () => {
    const ultima = new Date(ahora.getTime() - 20 * H);
    expect(calcularProximaAccion(ultima, ahora, 24 * H)).toEqual({ ejecutarAhora: false, esperaMs: 4 * H });
  });
});
