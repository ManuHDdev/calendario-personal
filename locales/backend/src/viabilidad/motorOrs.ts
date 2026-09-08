/**
 * Motor de distancia peatonal sobre OpenRouteService.
 *
 * Usa el endpoint de MATRIZ, no el de direcciones: un local contra sus N
 * farmacias candidatas es una única petición, no N. Esa es la diferencia
 * entre gastar 1 y gastar 30 de la cuota diaria por anuncio.
 *
 * CUIDADO CON LA CUOTA: el plan gratuito de ORS tiene límites distintos por
 * endpoint, y el de matriz es MÁS BAJO que el de direcciones que usan
 * `paraisos` y `ruta` (del orden de 500/día frente a 2.000). Por eso el
 * presupuesto diario (`presupuesto.ts`) se cuenta aparte y por defecto se
 * queda por debajo: agotarlo degrada el veredicto a `sin_datos`, nunca
 * descarta un anuncio.
 */

import type { LatLng } from '../types/locales';
import { MotorError, type MotorDistancia } from './motor';

const MATRIX_URL = 'https://api.openrouteservice.org/v2/matrix/foot-walking';

/** Origen + destinos por petición. Conservador frente al límite de ORS. */
const MAX_DESTINOS = 49;

interface RespuestaOrs {
  distances?: unknown;
  error?: unknown;
}

export const motorOrs: MotorDistancia = {
  nombre: 'ors',
  maxDestinos: MAX_DESTINOS,

  async matrizPeatonal(origen: LatLng, destinos: LatLng[]): Promise<(number | null)[]> {
    if (destinos.length === 0) return [];

    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
      throw new MotorError(
        'El motor de distancias no está configurado (falta ORS_API_KEY)',
        503,
      );
    }
    if (destinos.length > MAX_DESTINOS) {
      throw new MotorError(
        `ORS admite ${MAX_DESTINOS} destinos por petición; usa matrizTroceada()`,
        500,
      );
    }

    // ORS habla [lng, lat]; el resto del código usa { lat, lng }.
    const locations = [[origen.lng, origen.lat], ...destinos.map((d) => [d.lng, d.lat])];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(MATRIX_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          locations,
          sources: [0],
          destinations: destinos.map((_, i) => i + 1),
          metrics: ['distance'],
          units: 'm',
        }),
      });

      if (res.status === 429) {
        throw new MotorError('ORS ha limitado la petición (429): cuota o ritmo excedidos', 429);
      }
      if (!res.ok) {
        throw new MotorError(`ORS respondió ${res.status} al calcular la matriz peatonal`);
      }

      const body = (await res.json()) as RespuestaOrs;
      const fila = Array.isArray(body.distances) ? body.distances[0] : undefined;
      if (!Array.isArray(fila)) {
        throw new MotorError('ORS devolvió una matriz sin distancias');
      }

      // ORS emite null cuando no hay ruta peatonal; se propaga tal cual.
      return destinos.map((_, i) => {
        const v = fila[i];
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      });
    } catch (err) {
      if (err instanceof MotorError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new MotorError('ORS no respondió en 30 s');
      }
      throw new MotorError(
        `No se pudo calcular la matriz peatonal: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  },
};
