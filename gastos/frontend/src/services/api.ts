import keycloak from './keycloak';
import type { Gasto, GastoFormData, GastoUpdateData, Totales, ListFilters } from '../types';

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

export async function getTotales(mes: string): Promise<Totales> {
  const res = await fetch(`${BASE}/totales?mes=${encodeURIComponent(mes)}`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Totales>;
}

export async function getCategorias(): Promise<string[]> {
  const res = await fetch(`${BASE}/categorias`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<string[]>;
}
