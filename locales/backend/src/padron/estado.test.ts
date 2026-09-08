import { describe, it, expect, vi, beforeEach } from 'vitest';

const importarComunidad = vi.fn();
const recalcularCobertura = vi.fn(async () => ({ evaluados: 0, incompletos: 0 }));

vi.mock('./importar', () => ({
  importarComunidad: (...a: unknown[]) => importarComunidad(...a),
  recalcularCobertura: (...a: unknown[]) => recalcularCobertura(...a),
}));

import {
  _reset,
  getEstadoPadron,
  intentarReservar,
  liberar,
  procesarCola,
} from './estado';

beforeEach(() => {
  _reset();
  importarComunidad.mockReset();
  recalcularCobertura.mockClear();
  recalcularCobertura.mockResolvedValue({ evaluados: 0, incompletos: 0 });
});

describe('intentarReservar', () => {
  it('es exclusivo: la segunda llamada falla mientras hay una importación en curso', () => {
    expect(intentarReservar('manual')).toBe(true);
    expect(getEstadoPadron().estado).toBe('importando');
    expect(getEstadoPadron().origen).toBe('manual');

    // Ni manual ni planificador pueden colarse encima.
    expect(intentarReservar('planificador')).toBe(false);
    expect(intentarReservar('manual')).toBe(false);

    liberar();
    expect(intentarReservar('planificador')).toBe(true);
  });

  it('limpia los resultados de la pasada anterior al reservar de nuevo', async () => {
    importarComunidad.mockResolvedValue({ farmaciasImportadas: 1 });
    intentarReservar('manual');
    await procesarCola(['madrid'], 'manual');
    expect(getEstadoPadron().hechas).toHaveLength(1);

    expect(intentarReservar('manual')).toBe(true);
    expect(getEstadoPadron().hechas).toHaveLength(0);
  });
});

describe('procesarCola', () => {
  it('registra ok y error por comunidad, y recalcula la cobertura al final', async () => {
    importarComunidad.mockImplementation(async (c: string) => {
      if (c === 'madrid') return { farmaciasImportadas: 3 };
      throw new Error('overpass 504');
    });

    intentarReservar('manual');
    await procesarCola(['madrid', 'galicia'], 'manual');

    const e = getEstadoPadron();
    expect(e.estado).toBe('inactivo');
    expect(e.comunidadActual).toBeNull();
    expect(e.cola).toEqual([]);
    expect(e.hechas).toEqual([
      { comunidad: 'madrid', ok: true, resumen: { farmaciasImportadas: 3 } },
      { comunidad: 'galicia', ok: false, error: 'overpass 504' },
    ]);
    expect(importarComunidad).toHaveBeenCalledTimes(2);
    expect(recalcularCobertura).toHaveBeenCalledTimes(1);
  });

  it('siempre libera el candado, aunque recalcularCobertura lance', async () => {
    importarComunidad.mockResolvedValue({});
    recalcularCobertura.mockRejectedValueOnce(new Error('db caída'));

    intentarReservar('planificador');
    await procesarCola(['madrid'], 'planificador');

    expect(getEstadoPadron().estado).toBe('inactivo');
    // El candado quedó libre: se puede reservar otra vez.
    expect(intentarReservar('manual')).toBe(true);
  });

  it('siempre libera el candado, aunque una comunidad lance de forma inesperada', async () => {
    importarComunidad.mockRejectedValue(new Error('boom'));

    intentarReservar('manual');
    await procesarCola(['madrid', 'galicia', 'aragon'], 'manual');

    const e = getEstadoPadron();
    expect(e.estado).toBe('inactivo');
    expect(e.hechas.every((h) => !h.ok)).toBe(true);
    expect(e.hechas).toHaveLength(3);
  });
});
