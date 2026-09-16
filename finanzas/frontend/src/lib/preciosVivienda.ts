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
    // Postgres devuelve NUMERIC como string en el JSON (p.ej. "670.80"), no
    // como number, aunque el tipo `PrecioViviendaPunto.precio_m2: number |
    // null` diga lo contrario — hay que convertirlo explícitamente. Antes
    // pasaba desapercibido porque Recharts renderiza la línea igual con un
    // string (coerción implícita), pero cualquier cálculo propio que use
    // Number.isFinite(...) sobre ese valor falla siempre con un string.
    precio: p.precio_m2 === null ? null : Number(p.precio_m2),
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
