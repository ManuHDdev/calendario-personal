/**
 * Mediana de una lista de números. Función pura, sin dependencias, extraída
 * de `capitalScraper.ts` para que `rentabilidadZona.ts` la reutilice sin
 * duplicar la lógica — el motivo de usar mediana (y no media aritmética) es
 * el mismo en los dos sitios: un único atípico (un local/ático mal
 * etiquetado, un precio disparatado) no debe arrastrar el resultado de toda
 * una muestra pequeña (~30 anuncios). Ver el comentario de
 * `calcularPrecioMedioM2` en `capitalScraper.ts` para el caso real que lo
 * motivó (Jaén, 2026-09).
 *
 * Devuelve `null` ante una lista vacía: cero valores no es una mediana de 0,
 * es "no hay dato".
 */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;

  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);

  return ordenados.length % 2 === 0
    ? (ordenados[mitad - 1] + ordenados[mitad]) / 2
    : ordenados[mitad];
}
