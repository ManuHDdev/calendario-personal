const RADIO_TIERRA_KM = 6371.0088;

const aRadianes = (grados: number): number => (grados * Math.PI) / 180;

/** Distancia en línea recta (haversine) entre dos puntos, en km. */
export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = aRadianes(lat2 - lat1);
  const dLng = aRadianes(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(lat1)) * Math.cos(aRadianes(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
