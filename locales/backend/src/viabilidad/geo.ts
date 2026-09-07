/**
 * Geometría pura para el prefiltro de candidatas.
 *
 * Sin dependencias ni efectos: se puede testear sin red ni base de datos.
 * Todas las distancias van en METROS (a diferencia de `ruta`, que trabaja en
 * kilómetros): aquí los umbrales legales son de 150 y 250 m, y arrastrar
 * decimales de kilómetro solo invita a errores de tres órdenes de magnitud.
 */

import type { LatLng } from '../types/locales';

/** Radio medio terrestre en metros (el mismo valor que usa `ruta`, en km). */
const RADIO_TIERRA_M = 6_371_008.8;

const aRad = (grados: number): number => (grados * Math.PI) / 180;

/** Distancia de círculo máximo entre dos puntos, en metros. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = aRad(b.lat - a.lat);
  const dLng = aRad(b.lng - a.lng);
  const lat1 = aRad(a.lat);
  const lat2 = aRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Cuánto puede rodear el camino real respecto a la línea recta.
 *
 * ESTA CONSTANTE ES EL CORAZÓN DEL PREFILTRO Y NO ES UNA HEURÍSTICA.
 *
 * La distancia caminando entre dos puntos es SIEMPRE mayor o igual que la
 * distancia en línea recta. Por tanto, una farmacia que está a más de `D`
 * metros en línea recta no puede estar a menos de `D` metros caminando:
 * descartarla del cálculo no puede producir ningún falso negativo. Es una
 * implicación matemática, no una aproximación.
 *
 * Con eso bastaría un radio de `D`. Se usa `D * 3` por una razón distinta:
 * queremos poder DECIR a cuántos metros está la farmacia más cercana aunque
 * cumpla de sobra. Con radio `D` exacto, cualquier farmacia entre `D` y el
 * infinito quedaría sin medir y el informe diría "cumple" sin un número al
 * lado. El margen es informativo, no correctivo.
 *
 * Mismo espíritu que la cota del corredor en `ruta/services/corridor.ts`: la
 * cota estrecha es la que pierde cosas en silencio.
 */
export const FACTOR_RODEO = 3;

export interface CajaBusqueda {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Caja envolvente para acotar la consulta SQL antes del filtro fino.
 *
 * Se ensancha en longitud según la latitud (los meridianos convergen), y la
 * caja SIEMPRE contiene al círculo, nunca al revés: sobra-estimar aquí solo
 * cuesta unas filas de más que el haversine descartará después; sub-estimar
 * perdería farmacias sin que nadie se entere.
 */
export function cajaEnvolvente(centro: LatLng, radioM: number): CajaBusqueda {
  const gradosLat = (radioM / RADIO_TIERRA_M) * (180 / Math.PI);
  // cos(lat) se acota inferiormente para que la caja no degenere cerca de los
  // polos. En España nunca se acerca, pero un divisor que puede valer 0 no
  // debe quedarse en el código a la espera.
  const cosLat = Math.max(Math.cos(aRad(centro.lat)), 1e-6);
  const gradosLng = gradosLat / cosLat;

  return {
    minLat: centro.lat - gradosLat,
    maxLat: centro.lat + gradosLat,
    minLng: centro.lng - gradosLng,
    maxLng: centro.lng + gradosLng,
  };
}

/**
 * Radio DECISIVO: dentro de él, una candidata sin medir puede cambiar el
 * veredicto, así que no medirla obliga a degradar a ámbar.
 *
 * Es `umbral + margen`, y el margen NO es opcional. La distancia caminando es
 * siempre >= la línea recta, luego una candidata a más de `umbral` en recta no
 * puede incumplir... PERO eso vale para la posición REAL del punto, y la que
 * tenemos puede estar desplazada hasta `margen` metros. Una farmacia a
 * `umbral + margen` en recta del punto reportado puede estar a `umbral` del
 * punto real. Sin sumar el margen, el prefiltro produciría exactamente el
 * falso verde que esta app existe para evitar.
 */
export function radioDecisivoM(umbralM: number, margenM: number): number {
  return umbralM + margenM;
}

/**
 * Radio INFORMATIVO: hasta dónde se mide para poder DECIR a cuántos metros
 * está la más cercana, aunque cumpla de sobra.
 *
 * Más allá del radio decisivo ninguna candidata puede cambiar el veredicto, así
 * que esto es cortesía, no corrección: no medir aquí no degrada nada. El
 * factor de rodeo reconoce que el camino real puede dar vueltas respecto a la
 * recta, así que un radio de `umbral * 3` recoge lo que un peatón percibe como
 * "cerca". Mismo espíritu que la cota del corredor en `ruta`: la cota estrecha
 * es la que pierde cosas en silencio.
 */
export function radioInformativoM(umbralM: number, margenM: number): number {
  return umbralM * FACTOR_RODEO + margenM;
}

/**
 * Filtra por distancia real en línea recta lo que la caja dejó pasar de más,
 * y lo devuelve ordenado de más cerca a más lejos.
 *
 * El orden importa: los motores de matriz limitan el número de destinos por
 * petición, así que si hay que recortar se recorta por el final, que es lo
 * más lejano y lo que menos puede cambiar el veredicto.
 */
export function candidatasEnRadio<T extends LatLng>(
  centro: LatLng,
  candidatas: T[],
  radioM: number,
): T[] {
  return candidatas
    .map((c) => ({ c, d: haversineM(centro, c) }))
    .filter(({ d }) => d <= radioM)
    .sort((a, b) => a.d - b.d)
    .map(({ c }) => c);
}

/** Clave de caché: coordenadas redondeadas a ~10 m (5 decimales ≈ 1,1 m). */
export function claveGeo(p: LatLng): string {
  return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}
