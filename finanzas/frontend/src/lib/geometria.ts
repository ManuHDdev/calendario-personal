/**
 * Geometría 2D, pura y sin dependencias: solo lo que necesita el filtro de
 * "dibujar zona" de "Rentabilidad de alquiler por zona"
 * (`components/calculators/BuscadorRentabilidadAlquiler.tsx` +
 * `RentabilidadZonaMapa.tsx`). No usa ninguna librería de dibujo (ver
 * `## Finanzas` en el CLAUDE.md raíz: este monorepo dibuja polígonos a mano
 * con Leaflet plano, nunca con `leaflet-draw`), así que el test de "¿este
 * punto cae dentro?" también se hace a mano aquí.
 */

/** Un punto como `[latitud, longitud]` — mismo orden que usa Leaflet. */
export type Punto = [number, number];

/**
 * ¿Está `punto` dentro del polígono cerrado definido por `vertices`?
 *
 * Ray-casting / even-odd: se traza un rayo horizontal desde el punto hacia
 * +∞ en longitud y se cuenta cuántas aristas del polígono cruza; un número
 * impar de cruces significa "dentro". `vertices` no necesita repetir el
 * primer punto al final (se cierra el polígono implícitamente, uniendo el
 * último vértice con el primero).
 *
 * Caso borde (punto justo en un vértice o una arista): el ray-casting
 * clásico es ambiguo ahí por construcción (depende de redondeos de punto
 * flotante en la comparación de igualdad de la coordenada). Aquí se
 * documenta el comportamiento elegido en vez de dejarlo sin especificar:
 * un punto sobre el borde puede evaluarse como dentro O fuera según de qué
 * lado caiga el redondeo — no se garantiza un resultado concreto para ese
 * caso exacto. Para el uso real (filtrar pisos por coordenadas GPS reales)
 * un punto cayendo exactamente sobre una arista es, en la práctica, un
 * suceso de probabilidad cero.
 */
export function puntoDentroDePoligono(punto: Punto, vertices: Punto[]): boolean {
  if (vertices.length < 3) return false;

  const [pLat, pLng] = punto;
  let dentro = false;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [latI, lngI] = vertices[i];
    const [latJ, lngJ] = vertices[j];

    // ¿La arista (i, j) cruza la horizontal que pasa por el punto?
    const cruzaEnLatitud = latI > pLat !== latJ > pLat;
    if (!cruzaEnLatitud) continue;

    // Longitud del cruce de esa arista con la horizontal del punto.
    const lngCruce = lngI + ((pLat - latI) / (latJ - latI)) * (lngJ - lngI);
    if (pLng < lngCruce) dentro = !dentro;
  }

  return dentro;
}
