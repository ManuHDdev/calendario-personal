import type { AlquilerTuristicoPunto } from '../services/api';

/**
 * Inside Airbnb solo republica cada ciudad ~1 vez por trimestre (ver
 * design.md del change `add-finanzas-airbnb-tracker`), así que justo
 * después de desplegar esta funcionalidad lo normal es tener 1 único punto
 * almacenado. Una línea con 1-2 puntos no debe leerse como una tendencia —
 * este umbral decide cuándo la gráfica se sustituye por un aviso explícito
 * en vez de una línea casi plana que sugiere más significado del que tiene.
 */
export const MIN_PUNTOS_PARA_TENDENCIA = 2;

export function tieneSuficienteHistorico(puntos: AlquilerTuristicoPunto[]): boolean {
  return puntos.length >= MIN_PUNTOS_PARA_TENDENCIA;
}

/**
 * `ocupacionEstimadaPct` viene de `(365 - disponibilidad_365) / 365` — un
 * día bloqueado por el propietario (vacaciones, mantenimiento, hueco de
 * estancia mínima) cuenta igual que uno reservado. Por eso el texto NUNCA
 * dice solo "ocupación": siempre "ocupación estimada", y `null` se muestra
 * como falta de dato, nunca como 0%.
 */
export function formatearOcupacionEstimada(pct: number | null): string {
  if (pct === null) return 'sin datos suficientes';
  return `≈${pct.toFixed(0)}% (estimada)`;
}

export function formatearPrecioNoche(precio: number | null): string {
  if (precio === null) return 'sin datos';
  return `${precio.toFixed(0)} €/noche`;
}
