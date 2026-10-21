// Una sesión de Keycloak solo guarda `lastAccess` (último login o refresco de
// token), no la actividad real en pantalla: las subapps casi nunca refrescan el
// token en segundo plano. Por eso "en línea" significa "actividad reciente en
// una sesión abierta", no "tiene la pestaña abierta ahora mismo".
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export type PresenceStatus = 'online' | 'idle' | 'offline';

export interface Presence {
  status: PresenceStatus;
  /** Epoch ms de la sesión más reciente; null si no hay ninguna sesión abierta. */
  lastActivity: number | null;
}

export interface KcSession {
  lastAccess?: number;
}

export function derivePresence(sessions: KcSession[], now: number = Date.now()): Presence {
  let last: number | null = null;
  for (const s of sessions) {
    if (typeof s.lastAccess !== 'number' || !Number.isFinite(s.lastAccess)) continue;
    if (last === null || s.lastAccess > last) last = s.lastAccess;
  }
  if (last === null) return { status: 'offline', lastActivity: null };
  return { status: now - last <= ONLINE_WINDOW_MS ? 'online' : 'idle', lastActivity: last };
}
