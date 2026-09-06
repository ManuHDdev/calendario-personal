import keycloak from './keycloak';
import type {
  Anuncio,
  PortalId,
  Busqueda,
  BusquedaFormData,
  BusquedaUpdateData,
  ResultadoRastreo,
  ScraperState,
} from '../types';

const BASE = '/pisos/api';

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

export async function updateSearch(id: string, data: BusquedaUpdateData): Promise<Busqueda> {
  const res = await fetch(`${BASE}/searches/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Busqueda>;
}

export async function deleteSearch(id: string): Promise<void> {
  const res = await fetch(`${BASE}/searches/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 204) await handleError(res);
}

/** Rastreo manual: "mira ahora", sin esperar a la siguiente vuelta. */
export async function rastrearAhora(id: string): Promise<ResultadoRastreo> {
  const res = await fetch(`${BASE}/searches/${id}/rastrear`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<ResultadoRastreo>;
}

export interface FiltroAnuncios {
  busqueda?: string;
  portal?: PortalId;
  soloNuevos?: boolean;
  incluirDescartados?: boolean;
}

export async function getListings(filtro: FiltroAnuncios = {}): Promise<Anuncio[]> {
  const params = new URLSearchParams();
  if (filtro.busqueda) params.set('busqueda', filtro.busqueda);
  if (filtro.portal) params.set('portal', filtro.portal);
  if (filtro.soloNuevos) params.set('nuevos', 'true');
  if (filtro.incluirDescartados) params.set('descartados', 'true');

  const res = await fetch(`${BASE}/listings?${params.toString()}`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Anuncio[]>;
}

export async function updateListing(
  id: string,
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

/** Marca como vistos SOLO los anuncios que encajan en el filtro visible. */
export async function marcarTodosVistos(
  filtro: { busqueda?: string; portal?: PortalId } = {},
): Promise<{ marcados: number }> {
  const res = await fetch(`${BASE}/listings/marcar-vistos`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      ...(filtro.busqueda ? { busqueda_id: filtro.busqueda } : {}),
      ...(filtro.portal ? { portal: filtro.portal } : {}),
    }),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<{ marcados: number }>;
}

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
