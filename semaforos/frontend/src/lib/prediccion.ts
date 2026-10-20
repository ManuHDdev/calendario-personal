/**
 * Proyecta el estado ACTUAL de un semaforo a partir de su modelo y de la
 * ultima observacion. Vive en el navegador porque la cuenta atras avanza cada
 * segundo sin ir al servidor; el servidor (services/modelo.ts) solo estima
 * duraciones.
 *
 * Dos regimenes, y la diferencia importa:
 *  - FIJO (los tres colores estables o fijados a mano): el semaforo es ciclico,
 *    asi que se puede avanzar cualquier cantidad de tiempo desde la ultima
 *    observacion y dar una cuenta atras exacta.
 *  - VARIABLE (actuado por sensores, adaptativo...): solo se sabe cuanto suele
 *    durar el color en el que se vio, asi que se da un RANGO, y si la
 *    observacion es demasiado vieja no se inventa nada: color desconocido.
 */

import { SIGUIENTE, type Color, type Franja, type ModeloAcceso, type ModeloFranja } from '../types';

export type Confianza = 'alta' | 'media' | 'baja' | 'sin_datos';

export interface Prediccion {
  /** Color estimado ahora; null si no hay base para decirlo. */
  color: Color | null;
  /** Segundos hasta el proximo cambio (valor central). */
  restanteS: number | null;
  /** [min, max] de segundos hasta el cambio cuando no es exacto. */
  rango: [number, number] | null;
  exacta: boolean;
  confianza: Confianza;
  /** Por que no hay prediccion o por que es poco fiable. */
  motivo: string | null;
  /** Franja que se uso, o 'global' si no habia una franja estable. */
  fuente: Franja | 'global' | null;
  /** Segundos desde la ultima observacion. */
  edadS: number | null;
}

const MIN_OBS_ALTA = 10;
const MIN_OBS_MEDIA = 3;
const EDAD_ALTA_S = 24 * 3600;
const EDAD_MEDIA_S = 7 * 24 * 3600;
/** Un color variable no se proyecta mas alla de lo que dura una fase razonable. */
const EDAD_MAX_VARIABLE_S = 300;

const fmtMadrid = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});

/**
 * Franja de un instante, en hora de Madrid. ESPEJO de `franjaDe` en
 * backend/src/services/modelo.ts: el servidor rellena las franjas con la suya y
 * aqui se pide con esta, asi que deben coincidir. Mismos casos en los tests de
 * los dos lados.
 */
export function franjaDe(ms: number): Franja {
  const partes = fmtMadrid.formatToParts(new Date(ms));
  const dia = partes.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
  const tipo = dia === 'Sat' || dia === 'Sun' ? 'finde' : 'laborable';
  const bloque = hora >= 7 && hora < 14 ? 'manana' : hora >= 14 && hora < 21 ? 'tarde' : 'noche';
  return `${tipo}-${bloque}` as Franja;
}

/** Usa la franja de "ahora" si ya es estable; si no, el modelo global. */
export function elegirModelo(
  modelo: ModeloAcceso,
  ahoraMs: number,
): { modelo: ModeloFranja; fuente: Franja | 'global' } {
  const franja = franjaDe(ahoraMs);
  const deFranja = modelo.franjas[franja];
  if (deFranja?.fijo) return { modelo: deFranja, fuente: franja };
  return { modelo: modelo.global, fuente: 'global' };
}

function confianzaFija(m: ModeloFranja, edadS: number, mismaFranja: boolean): Confianza {
  const sinManual = [m.verde, m.ambar, m.rojo].filter((e) => e.manual === null);
  // Con los tres a mano no hay muestras que contar: se fia lo que tu dijiste, pero sin verificar.
  const minN = sinManual.length ? Math.min(...sinManual.map((e) => e.n)) : MIN_OBS_MEDIA;
  if (minN >= MIN_OBS_ALTA && edadS <= EDAD_ALTA_S && mismaFranja) return 'alta';
  if (minN >= MIN_OBS_MEDIA && edadS <= EDAD_MEDIA_S) return 'media';
  return 'baja';
}

const SIN_PREDICCION: Prediccion = {
  color: null,
  restanteS: null,
  rango: null,
  exacta: false,
  confianza: 'sin_datos',
  motivo: 'Todavía no hay observaciones de este semáforo.',
  fuente: null,
  edadS: null,
};

export function predecir(modelo: ModeloAcceso, ahoraMs: number): Prediccion {
  if (!modelo.ultima) return SIN_PREDICCION;

  const edadS = Math.max(0, (ahoraMs - modelo.ultima.t) / 1000);
  const { modelo: m, fuente } = elegirModelo(modelo, ahoraMs);
  const d = { verde: m.verde.efectiva, ambar: m.ambar.efectiva, rojo: m.rojo.efectiva };
  const base = { fuente, edadS };

  // ── Fijo: se proyecta el ciclo entero ───────────────────────────────────
  if (m.fijo && d.verde !== null && d.ambar !== null && d.rojo !== null) {
    const ciclo = d.verde + d.ambar + d.rojo;
    let t = edadS % ciclo;
    let color: Color = modelo.ultima.color;
    // Tras el modulo, t < ciclo: como mucho se cruzan los tres colores.
    for (let i = 0; i < 3 && t >= d[color]!; i++) {
      t -= d[color]!;
      color = SIGUIENTE[color];
    }
    const mismaFranja = franjaDe(modelo.ultima.t) === franjaDe(ahoraMs);
    const confianza = confianzaFija(m, edadS, mismaFranja);
    return {
      color,
      restanteS: d[color]! - t,
      rango: null,
      exacta: true,
      confianza,
      motivo: mismaFranja ? null : 'La última observación es de otra franja horaria; el plan puede ser distinto.',
      ...base,
    };
  }

  // ── Variable o incompleto: solo se sabe cuanto suele durar el color visto ──
  const visto = m[modelo.ultima.color];
  const [lo, hi] =
    visto.manual !== null
      ? [visto.manual, visto.manual]
      : [visto.min, visto.max];

  if (lo === null || hi === null) {
    return {
      color: edadS <= EDAD_MAX_VARIABLE_S ? modelo.ultima.color : null,
      restanteS: null,
      rango: null,
      exacta: false,
      confianza: 'baja',
      motivo: 'Aún no se conoce cuánto dura este color.',
      ...base,
    };
  }

  if (edadS > hi) {
    return {
      color: null,
      restanteS: null,
      rango: null,
      exacta: false,
      confianza: 'baja',
      motivo: 'La última observación es demasiado antigua para estimar el color actual.',
      ...base,
    };
  }

  return {
    color: modelo.ultima.color,
    restanteS: Math.max(0, (visto.mediana ?? hi) - edadS),
    rango: [Math.max(0, lo - edadS), hi - edadS],
    exacta: false,
    confianza: 'baja',
    motivo: 'Semáforo variable: solo se puede dar un rango.',
    ...base,
  };
}

/** 83.4 -> "1:23"; por debajo del minuto, "34 s". */
export function formatearRestante(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Posicion del marcador de un acceso: detras del cruce respecto a su rumbo de marcha. */
export function posicionAcceso(
  lat: number,
  lng: number,
  rumboGrados: number | null,
  metros = 12,
): [number, number] {
  if (rumboGrados === null) return [lat, lng];
  const theta = ((rumboGrados + 180) * Math.PI) / 180;
  const dLat = (metros * Math.cos(theta)) / 111_320;
  const dLng = (metros * Math.sin(theta)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}
