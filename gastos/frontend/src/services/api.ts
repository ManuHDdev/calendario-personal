import keycloak from './keycloak';
import type {
  Gasto, GastoFormData, GastoUpdateData, ListFilters, Tipo, TotalesFilters, TotalesPeriodo,
} from '../types';

const BASE = '/gastos/api';

function headers(): Record<string, string> {
  const token = keycloak.token;
  if (!token) throw new Error('No auth token');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handleError(res: Response): Promise<never> {
  let msg = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch { /* ignore */ }
  throw new Error(msg);
}

export async function getGastos(filters: ListFilters = {}): Promise<Gasto[]> {
  const params = new URLSearchParams();
  if (filters.mes) params.set('mes', filters.mes);
  if (filters.anio) params.set('anio', filters.anio);
  if (filters.tipo) params.set('tipo', filters.tipo);
  if (filters.categoria) params.set('categoria', filters.categoria);
  if (filters.estado) params.set('estado', filters.estado);
  const qs = params.toString();

  const res = await fetch(`${BASE}/gastos${qs ? `?${qs}` : ''}`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Gasto[]>;
}

export async function createGasto(data: GastoFormData): Promise<Gasto> {
  const res = await fetch(`${BASE}/gastos`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Gasto>;
}

export async function updateGasto(id: string, data: GastoUpdateData): Promise<Gasto> {
  const res = await fetch(`${BASE}/gastos/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Gasto>;
}

export async function deleteGasto(id: string): Promise<void> {
  const res = await fetch(`${BASE}/gastos/${id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 204) await handleError(res);
}

/** Totals for exactly one of `mes` (YYYY-MM) or `anio` (YYYY); confirmed rows only. */
export async function getTotales(filters: TotalesFilters): Promise<TotalesPeriodo> {
  const params = new URLSearchParams();
  if (filters.mes) params.set('mes', filters.mes);
  if (filters.anio) params.set('anio', filters.anio);
  if (filters.categoria) params.set('categoria', filters.categoria);
  const res = await fetch(`${BASE}/totales?${params.toString()}`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<TotalesPeriodo>;
}

async function getSugerencias(path: 'categorias' | 'comercios', tipo?: Tipo): Promise<string[]> {
  const qs = tipo ? `?tipo=${tipo}` : '';
  const res = await fetch(`${BASE}/${path}${qs}`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<string[]>;
}

/** Previously used values, most used first. */
export const getCategorias = (tipo?: Tipo) => getSugerencias('categorias', tipo);
export const getComercios = (tipo?: Tipo) => getSugerencias('comercios', tipo);
