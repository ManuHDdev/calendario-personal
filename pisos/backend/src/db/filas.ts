/**
 * Postgres devuelve las columnas NUMERIC como string (para no perder
 * precisión en decimales grandes). El contrato de esta API dice número, así
 * que la conversión se hace en un único sitio, justo al salir de la base de
 * datos, en vez de repetirla en cada ruta.
 */
const COLUMNAS_NUMERICAS = [
  'precio',
  'precio_inicial',
  'precio_previo',
  'latitud',
  'longitud',
  'radio_km',
  'precio_min',
  'precio_max',
  'metros_min',
  'metros_max',
] as const;

export function normalizarFila<T extends object>(fila: T): T {
  const salida = { ...fila } as Record<string, unknown>;
  for (const clave of COLUMNAS_NUMERICAS) {
    const valor = salida[clave];
    if (typeof valor === 'string') salida[clave] = Number(valor);
  }
  return salida as T;
}
