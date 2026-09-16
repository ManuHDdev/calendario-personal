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
