import keycloak from './keycloak';

const BASE = '/finanzas/api';

function headers(): Record<string, string> {
  const token = keycloak.token;
  if (!token) throw new Error('No auth token');
  return { Authorization: `Bearer ${token}` };
}

async function handleError(res: Response): Promise<never> {
  let msg = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch {
    /* ignore */
  }
  throw new Error(msg);
}

export interface PrecioViviendaPunto {
  ambito: 'nacional' | 'ccaa' | 'provincia';
  nombre: string;
  comunidad_autonoma: string | null;
  anio: number;
  trimestre: number;
  precio_m2: number | null;
}

export interface ImportacionEstado {
  ultima_ejecucion: string | null;
  ultima_ejecucion_ok: boolean | null;
  filas_importadas: number | null;
  error: string | null;
}

export async function getProvincias(): Promise<string[]> {
  const res = await fetch(`${BASE}/precios-vivienda/provincias`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<string[]>;
}

export async function getPreciosVivienda(nombre: string): Promise<PrecioViviendaPunto[]> {
  const res = await fetch(`${BASE}/precios-vivienda?nombre=${encodeURIComponent(nombre)}`, {
    headers: headers(),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<PrecioViviendaPunto[]>;
}

export async function getEstadoImportacion(): Promise<ImportacionEstado> {
  const res = await fetch(`${BASE}/precios-vivienda/estado`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<ImportacionEstado>;
}

export const TOTAL_NACIONAL = 'TOTAL NACIONAL';

// ───────────────────────────────────────────────────────────────────────────
// Variante "por capital" (anuncios de Fotocasa/pisos.com) — mismo shape de
// cliente que las funciones de arriba, contra las rutas nuevas del backend.
// ───────────────────────────────────────────────────────────────────────────

export interface PrecioViviendaCapitalPunto {
  fecha_captura: string;
  precio_m2: number | null;
  num_anuncios_total: number;
}

export interface CapitalScraperEstado {
  ultima_ejecucion: string | null;
  ultima_ejecucion_ok: boolean | null;
  capitales_ok: number | null;
  capitales_fallidas: number | null;
  error: string | null;
}

export async function getCapitales(): Promise<string[]> {
  const res = await fetch(`${BASE}/precios-vivienda/capitales`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<string[]>;
}

export async function getPreciosViviendaCapital(nombre: string): Promise<PrecioViviendaCapitalPunto[]> {
  const res = await fetch(`${BASE}/precios-vivienda/capital?nombre=${encodeURIComponent(nombre)}`, {
    headers: headers(),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<PrecioViviendaCapitalPunto[]>;
}

export async function getEstadoScraperCapital(): Promise<CapitalScraperEstado> {
  const res = await fetch(`${BASE}/precios-vivienda/capital/estado`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<CapitalScraperEstado>;
}

// ───────────────────────────────────────────────────────────────────────────
// Rentabilidad de alquiler por zona — anuncios en venta con una estimación de
// alquiler mensual a partir de la mediana de €/m²/mes de alquiler de la
// misma zona (ver `services/rentabilidadZona.ts` en el backend).
// ───────────────────────────────────────────────────────────────────────────

export interface RentabilidadZonaListing {
  titulo: string;
  url: string;
  portal: string;
  precio: number;
  metros: number;
  habitaciones: number | null;
  ubicacion: string | null;
  imagenUrl: string | null;
  /** Nullable: el portal no siempre publica coordenadas del anuncio. */
  latitud: number | null;
  longitud: number | null;
  alquilerMensualEstimado: number | null;
  numComparablesAlquiler: number;
  confianza: 'alta' | 'baja';
  /**
   * Desviación del €/m² de este anuncio respecto a `medianaVentaM2` de la
   * zona (negativo = por debajo de la mediana, posible chollo; positivo =
   * por encima, posible sobreprecio). `null` cuando no hay `medianaVentaM2`.
   */
  desviacionVsMedianaVentaPct: number | null;
}

export interface RentabilidadZonaResultado {
  ubicacion: string;
  listings: RentabilidadZonaListing[];
  numComparablesAlquilerTotal: number;
  medianaAlquilerM2: number | null;
  /** Mediana de €/m² de los anuncios EN VENTA de la zona (AVM de referencia). */
  medianaVentaM2: number | null;
  numComparablesVentaTotal: number;
  avisos: string[];
}

export async function getRentabilidadZona(ubicacion: string): Promise<RentabilidadZonaResultado> {
  const res = await fetch(`${BASE}/rentabilidad-zona?ubicacion=${encodeURIComponent(ubicacion)}`, {
    headers: headers(),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<RentabilidadZonaResultado>;
}
