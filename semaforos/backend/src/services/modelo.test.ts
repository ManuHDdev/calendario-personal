import { describe, it, expect } from 'vitest';
import {
  construirModelo,
  estimarColor,
  extraerDuraciones,
  franjaDe,
  mediana,
  type ObservacionLite,
} from './modelo';

const SIN_MANUAL = { verde: null, ambar: null, rojo: null };

/** Ciclo perfecto: verde 30 s, ambar 4 s, rojo 26 s, repetido n veces desde t0. */
function ciclo(t0: number, n: number, v = 30, a = 4, r = 26, ruido = 0): ObservacionLite[] {
  const out: ObservacionLite[] = [];
  let t = t0;
  for (let i = 0; i < n; i++) {
    out.push({ color: 'verde', t });
    t += (v + (i % 2 ? ruido : -ruido)) * 1000;
    out.push({ color: 'ambar', t });
    t += a * 1000;
    out.push({ color: 'rojo', t });
    t += r * 1000;
  }
  out.push({ color: 'verde', t });
  return out;
}

// Lunes 2026-10-19 10:00 hora de Madrid (CEST, UTC+2) => 08:00Z
const LUNES_10H = Date.UTC(2026, 9, 19, 8, 0, 0);

describe('extraerDuraciones', () => {
  it('resta observaciones consecutivas que siguen el ciclo', () => {
    const d = extraerDuraciones(ciclo(LUNES_10H, 1));
    expect(d.map((x) => [x.color, x.seg])).toEqual([
      ['verde', 30],
      ['ambar', 4],
      ['rojo', 26],
    ]);
  });

  it('descarta un par que se salta un color (se olvido pulsar)', () => {
    const d = extraerDuraciones([
      { color: 'verde', t: 0 },
      { color: 'rojo', t: 34_000 }, // falta el ambar
    ]);
    expect(d).toEqual([]);
  });

  it('descarta un hueco largo: no es una fase, es que dejaste de mirar', () => {
    const d = extraerDuraciones([
      { color: 'verde', t: 0 },
      { color: 'ambar', t: 20 * 60_000 },
    ]);
    expect(d).toEqual([]);
  });

  it('descarta un doble pulsado', () => {
    const d = extraerDuraciones([
      { color: 'verde', t: 0 },
      { color: 'ambar', t: 300 },
    ]);
    expect(d).toEqual([]);
  });

  it('ordena por tiempo aunque lleguen desordenadas', () => {
    const d = extraerDuraciones([
      { color: 'ambar', t: 30_000 },
      { color: 'verde', t: 0 },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].seg).toBe(30);
  });
});

describe('estimacion', () => {
  it('mediana de pares e impares', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });

  it('un atipico no arrastra la mediana', () => {
    const e = estimarColor([30, 30, 31, 30, 90], null);
    expect(e.mediana).toBe(30);
    expect(e.max).toBe(90);
  });

  it('el valor manual manda sobre la mediana', () => {
    const e = estimarColor([30, 30, 30], 35);
    expect(e.mediana).toBe(30);
    expect(e.efectiva).toBe(35);
  });

  it('sin datos y sin manual no inventa nada', () => {
    const e = estimarColor([], null);
    expect(e.efectiva).toBeNull();
    expect(e.n).toBe(0);
  });
});

describe('construirModelo', () => {
  it('semaforo fijo: ciclos regulares con el error humano de ~1 s', () => {
    const m = construirModelo(ciclo(LUNES_10H, 6, 30, 4, 26, 1), SIN_MANUAL);
    expect(m.global.fijo).toBe(true);
    expect(m.global.verde.efectiva).toBeCloseTo(30, 0);
    expect(m.global.ambar.efectiva).toBe(4);
  });

  it('semaforo variable: duraciones muy dispares NO son fijas', () => {
    const obs: ObservacionLite[] = [];
    let t = LUNES_10H;
    for (const v of [10, 40, 15, 55, 22, 48]) {
      obs.push({ color: 'verde', t }, { color: 'ambar', t: t + v * 1000 });
      t += (v + 4) * 1000;
      obs.push({ color: 'rojo', t });
      t += 26_000;
    }
    obs.push({ color: 'verde', t });
    expect(construirModelo(obs, SIN_MANUAL).global.fijo).toBe(false);
  });

  it('con muy pocas observaciones no se declara fijo', () => {
    const m = construirModelo(ciclo(LUNES_10H, 1), SIN_MANUAL);
    expect(m.global.fijo).toBe(false);
  });

  it('fijar los tres colores a mano lo vuelve fijo aunque no haya datos', () => {
    const m = construirModelo([], { verde: 30, ambar: 4, rojo: 26 });
    expect(m.global.fijo).toBe(true);
    expect(m.ultima).toBeNull();
  });

  it('recuerda la ultima observacion y cuenta todas', () => {
    const obs = ciclo(LUNES_10H, 2);
    const m = construirModelo(obs, SIN_MANUAL);
    expect(m.totalObservaciones).toBe(obs.length);
    expect(m.ultima).toEqual({ color: 'verde', t: obs[obs.length - 1].t });
  });

  it('separa las duraciones por franja', () => {
    const mananaLaborable = ciclo(LUNES_10H, 4, 30, 4, 26);
    // Sabado 2026-10-24 22:00 Madrid => 20:00Z : otra franja, otro plan
    const nocheFinde = ciclo(Date.UTC(2026, 9, 24, 20, 0, 0), 4, 15, 4, 40);
    const m = construirModelo([...mananaLaborable, ...nocheFinde], SIN_MANUAL);
    expect(m.franjas['laborable-manana']?.verde.efectiva).toBe(30);
    expect(m.franjas['finde-noche']?.verde.efectiva).toBe(15);
    expect(m.franjas['laborable-tarde']).toBeUndefined();
  });
});

describe('franjaDe (espejo del frontend: mismos casos en prediccion.test.ts)', () => {
  const casos: Array<[string, number, string]> = [
    ['lunes 10:00 Madrid', Date.UTC(2026, 9, 19, 8, 0), 'laborable-manana'],
    ['lunes 06:59 Madrid', Date.UTC(2026, 9, 19, 4, 59), 'laborable-noche'],
    ['lunes 07:00 Madrid', Date.UTC(2026, 9, 19, 5, 0), 'laborable-manana'],
    ['lunes 14:00 Madrid', Date.UTC(2026, 9, 19, 12, 0), 'laborable-tarde'],
    ['lunes 21:00 Madrid', Date.UTC(2026, 9, 19, 19, 0), 'laborable-noche'],
    ['sabado 12:00 Madrid', Date.UTC(2026, 9, 24, 10, 0), 'finde-manana'],
    ['domingo 16:00 Madrid', Date.UTC(2026, 9, 25, 14, 0), 'finde-tarde'],
    // Medianoche de Madrid de domingo a lunes: 23:30 domingo sigue siendo finde.
    ['domingo 23:30 Madrid', Date.UTC(2026, 9, 25, 21, 30), 'finde-noche'],
    // Horario de invierno (CET, UTC+1): lunes 2026-11-02 10:00 Madrid = 09:00Z
    ['lunes 10:00 Madrid invierno', Date.UTC(2026, 10, 2, 9, 0), 'laborable-manana'],
  ];
  for (const [nombre, ms, esperado] of casos) {
    it(nombre, () => expect(franjaDe(ms)).toBe(esperado));
  }
});
