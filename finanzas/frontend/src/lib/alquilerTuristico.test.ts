import { describe, it, expect } from 'vitest';
import {
  tieneSuficienteHistorico,
  formatearOcupacionEstimada,
  formatearPrecioNoche,
} from './alquilerTuristico';
import type { AlquilerTuristicoPunto } from '../services/api';

function punto(overrides: Partial<AlquilerTuristicoPunto> = {}): AlquilerTuristicoPunto {
  return {
    snapshotDate: '2026-06-20',
    medianaPrecioNoche: 100,
    numAnuncios: 500,
    ocupacionEstimadaPct: 60,
    porTipoHabitacion: [],
    ...overrides,
  };
}

describe('tieneSuficienteHistorico', () => {
  it('con 0 o 1 punto no hay suficiente histórico para una tendencia', () => {
    expect(tieneSuficienteHistorico([])).toBe(false);
    expect(tieneSuficienteHistorico([punto()])).toBe(false);
  });

  it('con 2 o más puntos sí lo hay', () => {
    expect(tieneSuficienteHistorico([punto(), punto({ snapshotDate: '2026-09-20' })])).toBe(true);
  });
});

describe('formatearOcupacionEstimada', () => {
  it('nunca dice solo "ocupación": siempre marca que es una estimación', () => {
    expect(formatearOcupacionEstimada(62.3)).toBe('≈62% (estimada)');
  });

  it('null se muestra como falta de dato, nunca como 0%', () => {
    expect(formatearOcupacionEstimada(null)).toBe('sin datos suficientes');
  });
});

describe('formatearPrecioNoche', () => {
  it('formatea un precio con el sufijo €/noche', () => {
    expect(formatearPrecioNoche(85)).toBe('85 €/noche');
  });

  it('null se muestra como "sin datos"', () => {
    expect(formatearPrecioNoche(null)).toBe('sin datos');
  });
});
