import keycloak from './keycloak';
import type {
  Acceso,
  AccesoDetalle,
  Ciudad,
  Color,
  Cruce,
  ResumenImportacion,
} from '../types';

const BASE = '/semaforos/api';

function authHeaders(): Record<string, string> {
  const token = keycloak.token;
  if (!token) throw new Error('No hay sesión iniciada');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handleError(res: Response): Promise<never> {
  let msg = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch {
    /* el cuerpo no era JSON: vale el mensaje por código de estado */
  }
  throw new Error(msg);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: authHeaders() });
  if (!res.ok) await handleError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const getCiudades = () => request<Ciudad[]>('/ciudades');

export const importarCiudad = (ciudad: string) =>
  request<ResumenImportacion>('/ciudades/importar', json('POST', { ciudad }));

export const getCruces = (ciudad: string) =>
  request<Cruce[]>(`/cruces?ciudad=${encodeURIComponent(ciudad)}`);

export const renombrarCruce = (id: number, nombre: string) =>
  request<{ id: number; nombre: string }>(`/cruces/${id}`, json('PATCH', { nombre }));

export const getAcceso = (id: number) => request<AccesoDetalle>(`/accesos/${id}`);

export const crearAcceso = (cruceId: number, nombre: string, rumbo: number | null) =>
  request<Acceso>(`/cruces/${cruceId}/accesos`, json('POST', { nombre, rumbo_grados: rumbo }));

export const actualizarAcceso = (
  id: number,
  cambios: Partial<{
    nombre: string;
    rumbo_grados: number | null;
    verde_manual_s: number | null;
    ambar_manual_s: number | null;
    rojo_manual_s: number | null;
  }>,
) => request<Acceso>(`/accesos/${id}`, json('PATCH', cambios));

export const borrarAcceso = (id: number) => request<void>(`/accesos/${id}`, { method: 'DELETE' });

export const crearObservacion = (accesoId: number, color: Color, haceS: number) =>
  request<Acceso>(`/accesos/${accesoId}/observaciones`, json('POST', { color, hace_s: haceS }));

export const borrarObservacion = (id: number) =>
  request<Acceso>(`/observaciones/${id}`, { method: 'DELETE' });
