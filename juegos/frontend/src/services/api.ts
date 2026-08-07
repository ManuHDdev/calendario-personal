import keycloak from './keycloak';

const BASE = '/juegos/api';

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (keycloak.token) headers.set('Authorization', `Bearer ${keycloak.token}`);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res;
}

export interface ImpostorWordResponse {
  word: string;
  category: string;
}

export function getImpostorWord(sessionId: string, categoria?: string): Promise<ImpostorWordResponse> {
  const params = new URLSearchParams({ sessionId });
  if (categoria) params.set('categoria', categoria);
  return authFetch(`/impostor/word?${params}`).then((r) => r.json());
}

export function getYoNuncaPrompt(sessionId: string): Promise<{ prompt: string }> {
  return authFetch(`/yo-nunca/prompt?sessionId=${encodeURIComponent(sessionId)}`).then((r) => r.json());
}

export function getVerdadORetoPrompt(
  sessionId: string,
  tipo: 'verdad' | 'reto',
): Promise<{ prompt: string; tipo: string }> {
  const params = new URLSearchParams({ sessionId, tipo });
  return authFetch(`/verdad-o-reto/prompt?${params}`).then((r) => r.json());
}

export type GameType = 'impostor-live' | 'trivia-live';

export function createRoom(gameType: GameType): Promise<{ roomCode: string; gameType: GameType; hostId: string }> {
  return authFetch('/rooms', { method: 'POST', body: JSON.stringify({ gameType }) }).then((r) => r.json());
}

/** Genera un identificador de sesión de pass-and-play, único por sentada de juego. */
export function newSessionId(): string {
  return crypto.randomUUID();
}
