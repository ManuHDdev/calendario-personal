/**
 * El origen es trimestral (año + trimestre), no una fecha exacta — se
 * representa cada punto como el primer día de ese trimestre, en segundos
 * UTC (formato que espera `lightweight-charts` para el eje de tiempo).
 */
export function trimestreATimestamp(anio: number, trimestre: number): number {
  return Date.UTC(anio, (trimestre - 1) * 3, 1) / 1000;
}

/** "hace 3 días" / "hace 2 meses" — para mostrar cuándo se actualizó por última vez. */
export function formatearHace(fechaIso: string | null): string {
  if (!fechaIso) return 'nunca';
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return 'nunca';

  const diffMs = Date.now() - fecha.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHoras = Math.floor(diffMin / 60);
  const diffDias = Math.floor(diffHoras / 24);

  if (diffMin < 1) return 'hace un momento';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHoras < 24) return `hace ${diffHoras} h`;
  if (diffDias < 30) return `hace ${diffDias} día${diffDias === 1 ? '' : 's'}`;
  const diffMeses = Math.floor(diffDias / 30);
  return `hace ${diffMeses} mes${diffMeses === 1 ? '' : 'es'}`;
}
