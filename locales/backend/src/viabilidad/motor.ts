/**
 * Interfaz única de los motores de distancia peatonal.
 *
 * Existe para que cambiar de proveedor no toque la lógica de veredicto. Hoy
 * hay dos implementaciones:
 *
 *   - `ors`      OpenRouteService, la misma clave que ya usan `paraisos` y
 *                `ruta`. Cero infraestructura, pero con cuota diaria.
 *   - `valhalla` Instancia propia en Docker con teselas de España. Sin cuota,
 *                latencia de milisegundos y sin depender de terceros.
 *
 * Cada veredicto guarda con QUÉ motor se calculó (`anuncio.viabilidad_motor`).
 * Sin eso, al cambiar de motor la tabla quedaría con dos criterios mezclados y
 * ninguna forma de saber qué filas recalcular.
 */

import type { LatLng, NombreMotor } from '../types/locales';

export class MotorError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = 'MotorError';
  }
}

export interface MotorDistancia {
  readonly nombre: NombreMotor;
  /** Cuántos destinos admite una sola petición. */
  readonly maxDestinos: number;
  /**
   * Metros caminando del origen a cada destino, en el mismo orden.
   *
   * Un `null` significa "no hay camino peatonal", que es un hecho sobre el
   * mapa, no un fallo: se propaga en vez de convertirse en excepción.
   */
  matrizPeatonal(origen: LatLng, destinos: LatLng[]): Promise<(number | null)[]>;
}

let motorCacheado: MotorDistancia | null = null;

/**
 * Devuelve el motor configurado en `LOCALES_MOTOR_DISTANCIA` (default `ors`).
 *
 * Se resuelve una vez y se memoriza: cambiar de motor exige reiniciar, que es
 * lo correcto — un cambio en caliente dejaría veredictos de dos motores
 * distintos calculados en el mismo rastreo.
 */
export function getMotor(): MotorDistancia {
  if (motorCacheado) return motorCacheado;

  const elegido = (process.env.LOCALES_MOTOR_DISTANCIA || 'ors').trim().toLowerCase();

  // Import perezoso para no exigir configuración del motor que no se usa.
  if (elegido === 'valhalla') {
    const { motorValhalla } = require('./motorValhalla') as typeof import('./motorValhalla');
    motorCacheado = motorValhalla;
  } else if (elegido === 'ors') {
    const { motorOrs } = require('./motorOrs') as typeof import('./motorOrs');
    motorCacheado = motorOrs;
  } else {
    throw new MotorError(
      `LOCALES_MOTOR_DISTANCIA="${elegido}" no es un motor conocido (ors | valhalla)`,
      500,
    );
  }

  return motorCacheado;
}

/** Solo para tests: olvida el motor memorizado. */
export function _resetMotor(): void {
  motorCacheado = null;
}

/**
 * Trocea los destinos según el límite del motor y concatena los resultados.
 *
 * Los destinos llegan ordenados de más cerca a más lejos (ver `geo.ts`), así
 * que el primer trozo es el que decide el veredicto en la práctica.
 */
export async function matrizTroceada(
  motor: MotorDistancia,
  origen: LatLng,
  destinos: LatLng[],
): Promise<(number | null)[]> {
  if (destinos.length === 0) return [];

  const salida: (number | null)[] = [];
  for (let i = 0; i < destinos.length; i += motor.maxDestinos) {
    const trozo = destinos.slice(i, i + motor.maxDestinos);
    salida.push(...(await motor.matrizPeatonal(origen, trozo)));
  }
  return salida;
}
