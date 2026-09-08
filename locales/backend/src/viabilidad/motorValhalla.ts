/**
 * Motor de distancia peatonal sobre una instancia propia de Valhalla.
 *
 * Es el destino a largo plazo: sin cuota, sin depender de un tercero y con
 * respuestas en milisegundos.
 *
 * Se eligió Valhalla y no OSRM para el caso self-hosted por una razón de
 * recursos: OSRM carga el grafo entero en RAM (el perfil peatonal de España
 * son varios GB residentes), mientras que Valhalla mapea sus teselas bajo
 * demanda y convive con las demás subapps del mismo VPS. Además trae
 * `sources_to_targets`, que es literalmente la matriz que hace falta.
 */

import type { LatLng } from '../types/locales';
import { MotorError, type MotorDistancia } from './motor';

/** Al ser local no hay cuota; el tope solo evita respuestas gigantes. */
const MAX_DESTINOS = 200;

interface CeldaValhalla {
  distance?: unknown;
  to_index?: unknown;
}

interface RespuestaValhalla {
  sources_to_targets?: unknown;
  error?: unknown;
}

export const motorValhalla: MotorDistancia = {
  nombre: 'valhalla',
  maxDestinos: MAX_DESTINOS,

  async matrizPeatonal(origen: LatLng, destinos: LatLng[]): Promise<(number | null)[]> {
    if (destinos.length === 0) return [];

    const base = process.env.VALHALLA_URL;
    if (!base) {
      throw new MotorError(
        'El motor Valhalla está seleccionado pero falta VALHALLA_URL',
        503,
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/sources_to_targets`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sources: [{ lat: origen.lat, lon: origen.lng }],
          targets: destinos.map((d) => ({ lat: d.lat, lon: d.lng })),
          costing: 'pedestrian',
          units: 'kilometers',
        }),
      });

      if (!res.ok) {
        throw new MotorError(`Valhalla respondió ${res.status} al calcular la matriz peatonal`);
      }

      const body = (await res.json()) as RespuestaValhalla;
      const matriz = body.sources_to_targets;
      const fila = Array.isArray(matriz) ? matriz[0] : undefined;
      if (!Array.isArray(fila)) {
        throw new MotorError('Valhalla devolvió una matriz sin distancias');
      }

      // Valhalla puede devolver las celdas desordenadas: se indexan por
      // `to_index` en vez de fiarse de la posición.
      const porIndice = new Map<number, number | null>();
      for (const celda of fila as CeldaValhalla[]) {
        const idx = typeof celda?.to_index === 'number' ? celda.to_index : null;
        if (idx === null) continue;
        const km = celda.distance;
        porIndice.set(
          idx,
          typeof km === 'number' && Number.isFinite(km) ? Math.round(km * 1000) : null,
        );
      }

      return destinos.map((_, i) => (porIndice.has(i) ? (porIndice.get(i) as number | null) : null));
    } catch (err) {
      if (err instanceof MotorError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new MotorError('Valhalla no respondió en 30 s');
      }
      throw new MotorError(
        `No se pudo calcular la matriz peatonal: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  },
};
