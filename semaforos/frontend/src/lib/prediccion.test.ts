import { describe, it, expect } from 'vitest';
import { elegirModelo, formatearRestante, franjaDe, posicionAcceso, predecir } from './prediccion';
import type { EstimacionColor, ModeloAcceso, ModeloFranja } from '../types';

function est(efectiva: number | null, n = 10, extra: Partial<EstimacionColor> = {}): EstimacionColor {
  return {
    n,
    mediana: efectiva,
    min: efectiva,
    max: efectiva,
    mad: efectiva === null ? null : 0,
    manual: null,
    efectiva,
    ...extra,
  };
}

const fijo = (v = 30, a = 4, r = 26, n = 10): ModeloFranja => ({
  verde: est(v, n), ambar: est(a, n), rojo: est(r, n), fijo: true,
});

// Lunes 2026-10-19 10:00 Madrid = 08:00Z
const T0 = Date.UTC(2026, 9, 19, 8, 0, 0);

function modeloConUltima(m: ModeloFranja, color: 'verde' | 'ambar' | 'rojo', t = T0): ModeloAcceso {
  return { global: m, franjas: {}, ultima: { color, t }, totalObservaciones: 20 };
}

describe('predecir: semaforo fijo (ciclo 30/4/26 = 60 s)', () => {
  it('justo tras ver verde quedan 30 s de verde', () => {
    const p = predecir(modeloConUltima(fijo(), 'verde'), T0);
    expect(p).toMatchObject({ color: 'verde', restanteS: 30, exacta: true });
  });

  it('10 s despues sigue en verde con 20 s', () => {
    const p = predecir(modeloConUltima(fijo(), 'verde'), T0 + 10_000);
    expect(p.color).toBe('verde');
    expect(p.restanteS).toBeCloseTo(20, 5);
  });

  it('a los 32 s esta en ambar con 2 s', () => {
    const p = predecir(modeloConUltima(fijo(), 'verde'), T0 + 32_000);
    expect(p.color).toBe('ambar');
    expect(p.restanteS).toBeCloseTo(2, 5);
  });

  it('a los 40 s esta en rojo con 20 s', () => {
    const p = predecir(modeloConUltima(fijo(), 'verde'), T0 + 40_000);
    expect(p.color).toBe('rojo');
    expect(p.restanteS).toBeCloseTo(20, 5);
  });

  it('da la vuelta al ciclo: a los 65 s ha vuelto a verde', () => {
    const p = predecir(modeloConUltima(fijo(), 'verde'), T0 + 65_000);
    expect(p.color).toBe('verde');
    expect(p.restanteS).toBeCloseTo(25, 5);
  });

  it('proyecta muchos ciclos despues sin acumular error', () => {
    const p = predecir(modeloConUltima(fijo(), 'verde'), T0 + 60_000 * 1000 + 5_000);
    expect(p.color).toBe('verde');
    expect(p.restanteS).toBeCloseTo(25, 5);
  });

  it('parte del color visto, no siempre del verde: ultima = rojo', () => {
    const p = predecir(modeloConUltima(fijo(), 'rojo'), T0 + 10_000);
    expect(p.color).toBe('rojo');
    expect(p.restanteS).toBeCloseTo(16, 5);
    const q = predecir(modeloConUltima(fijo(), 'rojo'), T0 + 27_000);
    expect(q.color).toBe('verde');
  });

  it('un reloj adelantado (edad negativa) no rompe nada', () => {
    const p = predecir(modeloConUltima(fijo(), 'verde'), T0 - 5_000);
    expect(p.color).toBe('verde');
    expect(p.restanteS).toBe(30);
  });

  it('en el limite exacto de una fase ya cuenta como la siguiente', () => {
    const p = predecir(modeloConUltima(fijo(), 'verde'), T0 + 30_000);
    expect(p.color).toBe('ambar');
  });
});

describe('predecir: confianza', () => {
  it('alta: >=10 observaciones, reciente y misma franja', () => {
    expect(predecir(modeloConUltima(fijo(), 'verde'), T0 + 60_000).confianza).toBe('alta');
  });

  it('media con pocas observaciones', () => {
    expect(predecir(modeloConUltima(fijo(30, 4, 26, 4), 'verde'), T0 + 60_000).confianza).toBe('media');
  });

  it('baja si la observacion tiene mas de una semana', () => {
    const p = predecir(modeloConUltima(fijo(30, 4, 26, 4), 'verde'), T0 + 8 * 86_400_000);
    expect(p.confianza).toBe('baja');
  });

  it('no es alta si la observacion es de otra franja, y avisa', () => {
    // 10:00 -> 15:00: de manana a tarde, mismo dia laborable
    const p = predecir(modeloConUltima(fijo(), 'verde'), T0 + 5 * 3600_000);
    expect(p.confianza).not.toBe('alta');
    expect(p.motivo).toMatch(/franja/);
  });

  it('con los tres colores a mano no es alta (sin verificar)', () => {
    const m: ModeloFranja = {
      verde: est(30, 0, { manual: 30 }), ambar: est(4, 0, { manual: 4 }), rojo: est(26, 0, { manual: 26 }), fijo: true,
    };
    expect(predecir(modeloConUltima(m, 'verde'), T0 + 1000).confianza).toBe('media');
  });
});

describe('predecir: semaforo variable', () => {
  const variable: ModeloFranja = {
    verde: est(30, 6, { min: 15, max: 50, mad: 12 }),
    ambar: est(4), rojo: est(26), fijo: false,
  };

  it('da un rango, no una cuenta atras exacta', () => {
    const p = predecir(modeloConUltima(variable, 'verde'), T0 + 10_000);
    expect(p.exacta).toBe(false);
    expect(p.color).toBe('verde');
    expect(p.rango).toEqual([5, 40]);
    expect(p.restanteS).toBeCloseTo(20, 5);
    expect(p.confianza).toBe('baja');
  });

  it('si ya paso el maximo conocido, no inventa el color', () => {
    const p = predecir(modeloConUltima(variable, 'verde'), T0 + 90_000);
    expect(p.color).toBeNull();
    expect(p.motivo).toMatch(/antigua/);
  });

  it('el limite inferior del rango nunca es negativo', () => {
    const p = predecir(modeloConUltima(variable, 'verde'), T0 + 20_000);
    expect(p.rango![0]).toBe(0);
  });

  it('sin duracion conocida para el color visto, mantiene el color un rato y lo dice', () => {
    const vacio: ModeloFranja = { verde: est(null, 0, { min: null, max: null }), ambar: est(null, 0), rojo: est(null, 0), fijo: false };
    const reciente = predecir(modeloConUltima(vacio, 'verde'), T0 + 5_000);
    expect(reciente.color).toBe('verde');
    expect(reciente.motivo).toMatch(/cuánto dura/);
    expect(predecir(modeloConUltima(vacio, 'verde'), T0 + 600_000).color).toBeNull();
  });
});

describe('predecir: sin datos', () => {
  it('sin ninguna observacion', () => {
    const m: ModeloAcceso = { global: fijo(), franjas: {}, ultima: null, totalObservaciones: 0 };
    expect(predecir(m, T0)).toMatchObject({ color: null, confianza: 'sin_datos' });
  });
});

describe('elegirModelo', () => {
  it('usa la franja de ahora si es estable', () => {
    const deManana = fijo(20, 4, 36);
    const m: ModeloAcceso = {
      global: fijo(), franjas: { 'laborable-manana': deManana }, ultima: { color: 'verde', t: T0 }, totalObservaciones: 9,
    };
    const e = elegirModelo(m, T0);
    expect(e.fuente).toBe('laborable-manana');
    expect(e.modelo.verde.efectiva).toBe(20);
  });

  it('cae al global si la franja existe pero aun no es estable', () => {
    const inestable = { ...fijo(20, 4, 36), fijo: false };
    const m: ModeloAcceso = {
      global: fijo(), franjas: { 'laborable-manana': inestable }, ultima: { color: 'verde', t: T0 }, totalObservaciones: 9,
    };
    expect(elegirModelo(m, T0).fuente).toBe('global');
  });
});

describe('franjaDe (espejo del backend: mismos casos en modelo.test.ts)', () => {
  const casos: Array<[string, number, string]> = [
    ['lunes 10:00 Madrid', Date.UTC(2026, 9, 19, 8, 0), 'laborable-manana'],
    ['lunes 06:59 Madrid', Date.UTC(2026, 9, 19, 4, 59), 'laborable-noche'],
    ['lunes 07:00 Madrid', Date.UTC(2026, 9, 19, 5, 0), 'laborable-manana'],
    ['lunes 14:00 Madrid', Date.UTC(2026, 9, 19, 12, 0), 'laborable-tarde'],
    ['lunes 21:00 Madrid', Date.UTC(2026, 9, 19, 19, 0), 'laborable-noche'],
    ['sabado 12:00 Madrid', Date.UTC(2026, 9, 24, 10, 0), 'finde-manana'],
    ['domingo 16:00 Madrid', Date.UTC(2026, 9, 25, 14, 0), 'finde-tarde'],
    ['domingo 23:30 Madrid', Date.UTC(2026, 9, 25, 21, 30), 'finde-noche'],
    ['lunes 10:00 Madrid invierno', Date.UTC(2026, 10, 2, 9, 0), 'laborable-manana'],
  ];
  for (const [nombre, ms, esperado] of casos) {
    it(nombre, () => expect(franjaDe(ms)).toBe(esperado));
  }
});

describe('formato y posicion', () => {
  it('formatearRestante', () => {
    expect(formatearRestante(0)).toBe('0 s');
    expect(formatearRestante(12.2)).toBe('13 s');
    expect(formatearRestante(59.1)).toBe('1:00');
    expect(formatearRestante(83.4)).toBe('1:24');
    expect(formatearRestante(-5)).toBe('0 s');
  });

  it('el marcador de un acceso se coloca detras del cruce segun su rumbo', () => {
    const [lat0, lng0] = [39.47, -6.37];
    // Circula hacia el norte (0) => el semaforo esta al sur del cruce.
    const [latS, lngS] = posicionAcceso(lat0, lng0, 0);
    expect(latS).toBeLessThan(lat0);
    expect(lngS).toBeCloseTo(lng0, 6);
    // Circula hacia el este (90) => esta al oeste.
    const [, lngO] = posicionAcceso(lat0, lng0, 90);
    expect(lngO).toBeLessThan(lng0);
    // Sin rumbo: en el propio cruce.
    expect(posicionAcceso(lat0, lng0, null)).toEqual([lat0, lng0]);
  });

  it('el desplazamiento son ~12 m', () => {
    const [lat0, lng0] = [39.47, -6.37];
    const [lat1] = posicionAcceso(lat0, lng0, 0);
    expect(Math.abs(lat1 - lat0) * 111_320).toBeCloseTo(12, 0);
  });
});
