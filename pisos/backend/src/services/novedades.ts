/**
 * ¿Este anuncio merece un aviso, y de qué tipo?
 *
 * Vive aparte y es una función pura por una razón concreta: antes esta
 * decisión estaba embebida dentro del bucle de UPSERT de `rastreo.ts`, donde
 * no se podía testear sin una base de datos — y ahí se coló un bucle de
 * notificaciones que repetía la misma bajada de precio cada 15 minutos.
 *
 * La regla que lo evita: un aviso responde a un EVENTO ("ha bajado desde la
 * última vez que te avisé"), no a un ESTADO ("está por debajo de lo que costó
 * antes"). Un estado sigue siendo cierto indefinidamente; un evento ocurre una
 * vez. Por eso la comparación es siempre contra `precio_notificado`, que solo
 * avanza cuando un aviso se ha entregado de verdad.
 */

export interface DatosNovedad {
  precio: number | null;
  /** Precio en el momento del último aviso entregado. NULL = nunca avisado. */
  precio_notificado: number | null;
}

export type TipoNovedad = 'nuevo' | 'bajada';

/**
 * @param esNuevo `true` si la fila se acaba de INSERTAR (no existía).
 * @returns el tipo de aviso, o `null` si no hay nada que avisar.
 */
export function decidirNovedad(anuncio: DatosNovedad, esNuevo: boolean): TipoNovedad | null {
  if (esNuevo) return 'nuevo';

  // Sin precio actual no hay bajada que anunciar; sin base de comparación
  // tampoco, y en ese caso callar es lo correcto: un anuncio sin
  // `precio_notificado` es uno que nunca se ha avisado (p. ej. el primer
  // rastreo manual de una búsqueda recién creada), y avisar ahora seria
  // desenterrar anuncios viejos como si fueran novedades.
  if (anuncio.precio === null || anuncio.precio_notificado === null) return null;

  return anuncio.precio < anuncio.precio_notificado ? 'bajada' : null;
}
