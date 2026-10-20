/**
 * Estimacion de las duraciones de un semaforo a partir de los cambios de color
 * que el propietario ha ido anotando.
 *
 * Una observacion es "en el instante t paso a <color>", no una duracion. La
 * duracion de una fase sale de restar dos observaciones CONSECUTIVAS y
 * VALIDAS: la segunda tiene que ser el color que sigue en el ciclo
 * (verde -> ambar -> rojo -> verde) y no pueden distar mas de MAX_FASE_S.
 * Un par que no cumple eso es un hueco (se te olvido pulsar, o paso otro
 * semaforo por medio), no una fase larga: se descarta en lugar de
 * contaminar la mediana con un numero falso.
 *
 * Este modulo solo estima duraciones. Proyectar "que color tiene AHORA y
 * cuanto le queda" se hace en el navegador (frontend/src/lib/prediccion.ts),
 * porque la cuenta atras tiene que avanzar cada segundo sin ir al servidor.
 */

import {
  COLORES,
  SIGUIENTE,
  FRANJAS,
  type Color,
  type EstimacionColor,
  type Franja,
  type ManualAcceso,
  type ModeloAcceso,
  type ModeloFranja,
} from '../types/semaforos';

/** Mas que esto entre dos cambios es un hueco de observacion, no una fase. */
export const MAX_FASE_S = 300;
/** Menos que esto es un doble pulsado. */
export const MIN_FASE_S = 1;
/** Minimo de fases de un color para fiarse de su mediana. */
export const MIN_OBS_COLOR = 3;
/**
 * Dispersion maxima (MAD, en segundos) para considerar estable un color. El
 * error al pulsar es de ~1 s por pulsacion, asi que una duracion (dos
 * pulsaciones) puede errar ~2 s aunque el semaforo sea perfectamente fijo.
 */
export const TOLERANCIA_MAD_S = 2;

export interface ObservacionLite {
  color: Color;
  /** ms epoch */
  t: number;
}

export interface Duracion {
  color: Color;
  seg: number;
  /** ms epoch del inicio de la fase */
  inicio: number;
}

export function extraerDuraciones(observaciones: ObservacionLite[]): Duracion[] {
  const ord = [...observaciones].sort((a, b) => a.t - b.t);
  const out: Duracion[] = [];
  for (let i = 0; i < ord.length - 1; i++) {
    const a = ord[i];
    const b = ord[i + 1];
    if (b.color !== SIGUIENTE[a.color]) continue;
    const seg = (b.t - a.t) / 1000;
    if (seg < MIN_FASE_S || seg > MAX_FASE_S) continue;
    out.push({ color: a.color, seg, inicio: a.t });
  }
  return out;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const redondear1 = (x: number): number => Math.round(x * 10) / 10;

export function estimarColor(segundos: number[], manual: number | null): EstimacionColor {
  const med = mediana(segundos);
  const mad = med === null ? null : mediana(segundos.map((s) => Math.abs(s - med)));
  const mediaR = med === null ? null : redondear1(med);
  return {
    n: segundos.length,
    mediana: mediaR,
    min: segundos.length ? redondear1(Math.min(...segundos)) : null,
    max: segundos.length ? redondear1(Math.max(...segundos)) : null,
    mad: mad === null ? null : redondear1(mad),
    manual,
    efectiva: manual ?? mediaR,
  };
}

/**
 * Un color esta "resuelto" si lo has fijado a mano o tiene fases suficientes y
 * poco dispersas. El semaforo es fijo si lo estan los tres.
 */
export function colorResuelto(e: EstimacionColor): boolean {
  if (e.manual !== null) return true;
  return e.n >= MIN_OBS_COLOR && e.mad !== null && e.mad <= TOLERANCIA_MAD_S;
}

export function estimarFranja(duraciones: Duracion[], manual: ManualAcceso): ModeloFranja {
  const porColor = (c: Color) => duraciones.filter((d) => d.color === c).map((d) => d.seg);
  const verde = estimarColor(porColor('verde'), manual.verde);
  const ambar = estimarColor(porColor('ambar'), manual.ambar);
  const rojo = estimarColor(porColor('rojo'), manual.rojo);
  return {
    verde,
    ambar,
    rojo,
    fijo: [verde, ambar, rojo].every(colorResuelto),
  };
}

const fmtMadrid = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});

/**
 * Franja de un instante, en hora de Madrid. ESPEJO de `franjaDe` en
 * frontend/src/lib/prediccion.ts: las dos deben dar lo mismo o el navegador
 * pedira al modelo una franja que el servidor nunca relleno. Mismos casos en
 * los dos ficheros de test. No distingue festivos, solo sabado y domingo.
 */
export function franjaDe(ms: number): Franja {
  const partes = fmtMadrid.formatToParts(new Date(ms));
  const dia = partes.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
  const tipo = dia === 'Sat' || dia === 'Sun' ? 'finde' : 'laborable';
  const bloque = hora >= 7 && hora < 14 ? 'manana' : hora >= 14 && hora < 21 ? 'tarde' : 'noche';
  return `${tipo}-${bloque}` as Franja;
}

export function construirModelo(
  observaciones: ObservacionLite[],
  manual: ManualAcceso,
): ModeloAcceso {
  const duraciones = extraerDuraciones(observaciones);
  const ord = [...observaciones].sort((a, b) => a.t - b.t);
  const ultimo = ord[ord.length - 1];

  const franjas: Partial<Record<Franja, ModeloFranja>> = {};
  for (const f of FRANJAS) {
    const delaFranja = duraciones.filter((d) => franjaDe(d.inicio) === f);
    // Una franja sin una sola fase no aporta nada que el global no diga ya.
    if (delaFranja.length > 0) franjas[f] = estimarFranja(delaFranja, manual);
  }

  return {
    global: estimarFranja(duraciones, manual),
    franjas,
    ultima: ultimo ? { color: ultimo.color, t: ultimo.t } : null,
    totalObservaciones: observaciones.length,
  };
}

export { COLORES };
