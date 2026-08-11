import type { ByTokenResponse } from '../types';

// Sesión de grupo (flujo sin cuenta, `/reparto/g/:token`) persistida en
// sessionStorage, con clave por access_token de la URL — así, si el enlace se
// rota y el visitante vuelve a abrir el mismo `accessToken` viejo, no
// reutiliza por accidente una sesión de otro enlace (design.md "Autorización
// por grupo: token opaco de grupo, no de miembro"). No usa localStorage a
// propósito: la sesión de grupo es de corta vida (1h en backend) y no debe
// sobrevivir más allá de la pestaña/sesión del navegador.
function storageKey(accessToken: string): string {
  return `reparto:group-session:${accessToken}`;
}

export function storeGroupSession(accessToken: string, session: ByTokenResponse): void {
  sessionStorage.setItem(storageKey(accessToken), JSON.stringify(session));
}

export function loadGroupSession(accessToken: string): ByTokenResponse | null {
  const raw = sessionStorage.getItem(storageKey(accessToken));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ByTokenResponse;
  } catch {
    return null;
  }
}

export function clearGroupSession(accessToken: string): void {
  sessionStorage.removeItem(storageKey(accessToken));
}
