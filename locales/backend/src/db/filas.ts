/**
 * Postgres devuelve NUMERIC como string para no perder precisión. El contrato
 * de esta API dice número, así que la conversión se hace en un único sitio,
 * justo al salir de la base de datos, y no repartida por cada ruta.
 *
 * `portales` (TEXT[]) ya llega como array de strings desde `pg`; no necesita
 * conversión.
 */
const COLUMNAS_NUMERICAS = [
  'latitud',
  'longitud',
  'radio_km',
  'precio',
  'precio_anterior',
  'precio_min',
  'precio_max',
  'superficie_min',
  'superficie_max',
  'superficie_m2',
  'facturacion',
  'facturacion_min',
  'facturacion_max',
  'distancia_farmacia_m',
  'distancia_centro_m',
  'distancia_farmacias_m',
  'distancia_centros_sanitarios_m',
] as const;

export function normalizarFila<T extends object>(fila: T): T {
  const salida = { ...fila } as Record<string, unknown>;
  for (const clave of COLUMNAS_NUMERICAS) {
    const valor = salida[clave];
    if (typeof valor === 'string') salida[clave] = Number(valor);
  }
  return salida as T;
}
