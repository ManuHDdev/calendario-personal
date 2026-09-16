import type { PrecioViviendaPunto } from '../services/api';

/** "T1 2024" — etiqueta corta para el eje X de la gráfica. */
export function etiquetaTrimestre(anio: number, trimestre: number): string {
  return `T${trimestre} ${anio}`;
}

export interface PuntoGrafica {
  etiqueta: string;
  precio: number | null;
}

/** Adapta la serie que devuelve la API al formato que consume Recharts. */
export function aDatosGrafica(puntos: PrecioViviendaPunto[]): PuntoGrafica[] {
  return puntos.map((p) => ({
    etiqueta: etiquetaTrimestre(p.anio, p.trimestre),
    precio: p.precio_m2,
  }));
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
