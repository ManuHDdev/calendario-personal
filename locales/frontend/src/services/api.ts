import keycloak from './keycloak';
import type {
  Anuncio,
  Busqueda,
  BusquedaFormData,
  BusquedaUpdateData,
  ComprobarBody,
  CoberturaMunicipio,
  EstadoPresupuesto,
  Normativa,
  NormativaUpdate,
  PadronResumen,
  ResultadoRastreo,
  ResultadoViabilidad,
  ScraperState,
} from '../types';

const BASE = '/locales/api';

/** Solo autenticación: para peticiones sin cuerpo. */
function authHeaders(): Record<string, string> {
  const token = keycloak.token;
  if (!token) throw new Error('No auth token');
  return { Authorization: `Bearer ${token}` };
}

/**
 * Autenticación + JSON: solo para peticiones que envían cuerpo. Declarar
 * `Content-Type: application/json` sin body hace que Fastify responda 400
 * (`FST_ERR_CTP_EMPTY_JSON_BODY`) antes de llegar al handler.
 */
function headers(): Record<string, string> {
  return { ...authHeaders(), 'Content-Type': 'application/json' };
}

async function handleError(res: Response): Promise<never> {
  let msg = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch { /* ignore */ }
  throw new Error(msg);
}

// ── Búsquedas ───────────────────────────────────────────────────────────────

export async function getSearches(): Promise<Busqueda[]> {
  const res = await fetch(`${BASE}/searches`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Busqueda[]>;
}

export async function createSearch(data: BusquedaFormData): Promise<Busqueda> {
  const res = await fetch(`${BASE}/searches`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Busqueda>;
}

export async function updateSearch(id: number, data: BusquedaUpdateData): Promise<Busqueda> {
  const res = await fetch(`${BASE}/searches/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Busqueda>;
}

export async function deleteSearch(id: number): Promise<void> {
  const res = await fetch(`${BASE}/searches/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 204) await handleError(res);
}

/** Rastreo manual: "mira ahora". No notifica a propósito. */
export async function rastrearAhora(id: number): Promise<ResultadoRastreo> {
  const res = await fetch(`${BASE}/searches/${id}/rastrear`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<ResultadoRastreo>;
}

// ── Anuncios ────────────────────────────────────────────────────────────────

export interface FiltroAnuncios {
  busqueda?: number;
  tipo?: 'local' | 'farmacia';
  veredicto?: string;
  soloNuevos?: boolean;
  incluirDescartados?: boolean;
}

export async function getListings(filtro: FiltroAnuncios = {}): Promise<Anuncio[]> {
  const params = new URLSearchParams();
  if (filtro.busqueda !== undefined) params.set('busqueda', String(filtro.busqueda));
  if (filtro.tipo) params.set('tipo', filtro.tipo);
  if (filtro.veredicto) params.set('veredicto', filtro.veredicto);
  if (filtro.soloNuevos) params.set('nuevos', 'true');
  if (filtro.incluirDescartados) params.set('descartados', 'true');

  const res = await fetch(`${BASE}/listings?${params.toString()}`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Anuncio[]>;
}

export async function updateListing(
  id: number,
  data: { visto?: boolean; descartado?: boolean },
): Promise<Anuncio> {
  const res = await fetch(`${BASE}/listings/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Anuncio>;
}

export async function marcarTodosVistos(busquedaId?: number): Promise<{ marcados: number }> {
  const res = await fetch(`${BASE}/listings/marcar-vistos`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(busquedaId !== undefined ? { busqueda_id: busquedaId } : {}),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<{ marcados: number }>;
}

// ── Scraper ─────────────────────────────────────────────────────────────────

export async function getScraperState(): Promise<ScraperState> {
  const res = await fetch(`${BASE}/scraper/state`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<ScraperState>;
}

export async function updateScraperState(running: boolean): Promise<ScraperState> {
  const res = await fetch(`${BASE}/scraper/state`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ running }),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<ScraperState>;
}

// ── Viabilidad ──────────────────────────────────────────────────────────────

export async function comprobarViabilidad(body: ComprobarBody): Promise<ResultadoViabilidad> {
  const res = await fetch(`${BASE}/viabilidad/comprobar`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<ResultadoViabilidad>;
}

export async function getPresupuesto(): Promise<EstadoPresupuesto> {
  const res = await fetch(`${BASE}/viabilidad/presupuesto`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<EstadoPresupuesto>;
}

// ── Normativa ───────────────────────────────────────────────────────────────

export async function getNormativa(): Promise<Normativa[]> {
  const res = await fetch(`${BASE}/normativa`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Normativa[]>;
}

export async function updateNormativa(comunidad: string, body: NormativaUpdate): Promise<void> {
  const res = await fetch(`${BASE}/normativa/${encodeURIComponent(comunidad)}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await handleError(res);
}

// ── Padrón ──────────────────────────────────────────────────────────────────

export async function getCobertura(soloIncompletos = true): Promise<CoberturaMunicipio[]> {
  const params = soloIncompletos ? '?incompletos=true' : '';
  const res = await fetch(`${BASE}/padron/cobertura${params}`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<CoberturaMunicipio[]>;
}

export async function getPadronResumen(): Promise<PadronResumen> {
  const res = await fetch(`${BASE}/padron/resumen`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<PadronResumen>;
}
