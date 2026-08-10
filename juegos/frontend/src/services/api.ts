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

export function getYoNuncaPrompt(
  sessionId: string,
  dureza?: string,
  sinPareja?: boolean,
): Promise<{ prompt: string }> {
  const params = new URLSearchParams({ sessionId });
  if (dureza) params.set('dureza', dureza);
  if (sinPareja) params.set('sinPareja', 'true');
  return authFetch(`/yo-nunca/prompt?${params}`).then((r) => r.json());
}

export function getVerdadORetoPrompt(
  sessionId: string,
  tipo: 'verdad' | 'reto',
  dureza?: string,
  sinPareja?: boolean,
): Promise<{ prompt: string; tipo: string }> {
  const params = new URLSearchParams({ sessionId, tipo });
  if (dureza) params.set('dureza', dureza);
  if (sinPareja) params.set('sinPareja', 'true');
  return authFetch(`/verdad-o-reto/prompt?${params}`).then((r) => r.json());
}

// ── Batch A (add-nine-party-games): Bomb Party, ¿Quién es más probable?, 10/10 ──

export function getBombPartyTerm(
  sessionId: string,
  modo: 'silaba' | 'categoria' = 'silaba',
): Promise<{ texto: string; modo: string }> {
  const params = new URLSearchParams({ sessionId, modo });
  return authFetch(`/bomb-party/silaba?${params}`).then((r) => r.json());
}

export function getQuienEsMasProbablePrompt(
  sessionId: string,
  dureza?: string,
): Promise<{ prompt: string }> {
  const params = new URLSearchParams({ sessionId });
  if (dureza) params.set('dureza', dureza);
  return authFetch(`/quien-es-mas-probable/prompt?${params}`).then((r) => r.json());
}

export function getDiezDeDiezRonda(
  sessionId: string,
  intensidad: 'suave' | 'picante',
): Promise<{ cualidad: string; pero: string; intensidad: string }> {
  const params = new URLSearchParams({ sessionId, intensidad });
  return authFetch(`/diez-de-diez/ronda?${params}`).then((r) => r.json());
}

export type GameType = 'impostor-live' | 'trivia-live';

export function createRoom(
  gameType: GameType,
  categoria?: string,
): Promise<{ roomCode: string; gameType: GameType; hostId: string }> {
  const body: { gameType: GameType; categoria?: string } = { gameType };
  // `categoria` solo tiene sentido para trivia-live — ver rooms.route.ts,
  // que la ignora/no-op para impostor-live.
  if (gameType === 'trivia-live' && categoria) body.categoria = categoria;
  return authFetch('/rooms', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
}

/** Genera un identificador de sesión de pass-and-play, único por sentada de juego. */
export function newSessionId(): string {
  return crypto.randomUUID();
}
