// Lógica de dominio de El Impostor, compartida entre el modo pass-and-play
// (llamada desde el frontend, sin estado en el servidor) y el modo en vivo
// (llamada desde rooms/impostorLive.ts dentro de un RoomState). Ver
// design.md, "El Impostor: elimination loop, not single-round reveal".
//
// El juego es una eliminación multi-ronda: discusión → votación → se elimina
// al más votado (empate = nadie eliminado) → se comprueba fin de partida →
// vuelta a discusión, hasta que ganan los tripulantes (todos los impostores
// eliminados) o ganan los impostores (quedan exactamente 3 jugadores con al
// menos un impostor entre ellos). Ninguna eliminación individual revela si el
// eliminado era o no impostor — esa información solo aparece en la
// revelación final (spec.md "El Impostor elimination loop").

export const MIN_PLAYERS = 4;

export interface ImpostorRole {
  playerId: string;
  isImpostor: boolean;
  /** El impostor NUNCA recibe la palabra — ver spec.md "Impostor en vivo role assignment". */
  word: string | null;
}

export interface ImpostorGameState {
  word: string;
  categoria: string;
  /** Nunca se serializa/envía completo mientras la partida está en curso — solo en la revelación final. */
  impostorIds: Set<string>;
  roles: ImpostorRole[];
  /** Jugadores todavía en juego. */
  alive: string[];
  /** Jugadores eliminados, en orden de eliminación (solo el id, nunca su rol). */
  eliminated: string[];
  votes: Record<string, string>;
  ended: boolean;
  winner: 'crew' | 'impostors' | null;
}

/** Máximo de impostores permitido para un tamaño de grupo dado: floor((n-1)/2), ver spec.md. */
export function maxImpostors(playerCount: number): number {
  return Math.floor((playerCount - 1) / 2);
}

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function assignRoles(
  playerIds: string[],
  impostorCount: number,
  word: string,
): { impostorIds: string[]; roles: ImpostorRole[] } {
  if (playerIds.length < MIN_PLAYERS) {
    throw new Error(`assignRoles: se necesitan al menos ${MIN_PLAYERS} jugadores para El Impostor`);
  }
  const max = maxImpostors(playerIds.length);
  if (!Number.isInteger(impostorCount) || impostorCount < 1 || impostorCount > max) {
    throw new Error(`assignRoles: impostorCount debe ser un entero entre 1 y ${max}`);
  }

  const impostorIds = new Set(shuffle(playerIds).slice(0, impostorCount));

  // Los impostores no conocen la identidad de los demás impostores — cada
  // rol solo lleva su propia condición, nunca la lista completa de
  // impostores (design.md "Impostors don't learn each other's identity").
  const roles: ImpostorRole[] = playerIds.map((playerId) => ({
    playerId,
    isImpostor: impostorIds.has(playerId),
    word: impostorIds.has(playerId) ? null : word,
  }));

  return { impostorIds: [...impostorIds], roles };
}

export function startGame(
  playerIds: string[],
  impostorCount: number,
  word: string,
  categoria: string,
): ImpostorGameState {
  const { impostorIds, roles } = assignRoles(playerIds, impostorCount, word);
  return {
    word,
    categoria,
    impostorIds: new Set(impostorIds),
    roles,
    alive: [...playerIds],
    eliminated: [],
    votes: {},
    ended: false,
    winner: null,
  };
}

/** Devuelve el rol correspondiente a cada jugador (para entrega privada por socket). */
export function revealRoles(state: ImpostorGameState): ImpostorRole[] {
  return state.roles;
}

export function recordVote(
  state: ImpostorGameState,
  playerId: string,
  votedForId: string,
): ImpostorGameState {
  return { ...state, votes: { ...state.votes, [playerId]: votedForId } };
}

export interface VoteTally {
  counts: Record<string, number>;
}

export function tallyVotes(votes: Record<string, string>): VoteTally {
  const counts: Record<string, number> = {};
  for (const votedForId of Object.values(votes)) {
    counts[votedForId] = (counts[votedForId] ?? 0) + 1;
  }
  return { counts };
}

/** Devuelve el id del jugador más votado, o null si hay empate (nadie es eliminado). */
export function resolveElimination(votes: Record<string, string>): string | null {
  const { counts } = tallyVotes(votes);

  let mostVotedId: string | null = null;
  let maxVotes = 0;
  let tie = false;
  for (const [playerId, count] of Object.entries(counts)) {
    if (count > maxVotes) {
      maxVotes = count;
      mostVotedId = playerId;
      tie = false;
    } else if (count === maxVotes && maxVotes > 0) {
      tie = true;
    }
  }
  return tie ? null : mostVotedId;
}

export interface GameEndResult {
  ended: boolean;
  winner: 'crew' | 'impostors' | null;
}

export function checkGameEnd(state: ImpostorGameState): GameEndResult {
  const aliveImpostors = state.alive.filter((id) => state.impostorIds.has(id));
  if (aliveImpostors.length === 0) {
    return { ended: true, winner: 'crew' };
  }
  if (state.alive.length === 3) {
    return { ended: true, winner: 'impostors' };
  }
  return { ended: false, winner: null };
}

export interface EliminationResult {
  state: ImpostorGameState;
  /** null = empate, nadie fue eliminado esta ronda. */
  eliminatedId: string | null;
  gameEnd: GameEndResult;
}

/**
 * Aplica el resultado de la votación de la ronda actual: elimina al más
 * votado (si no hay empate), comprueba las condiciones de fin de partida y
 * limpia los votos para la siguiente ronda. No revela el rol del eliminado
 * — ver design.md "No per-elimination reveal".
 */
export function applyElimination(state: ImpostorGameState): EliminationResult {
  const eliminatedId = resolveElimination(state.votes);
  if (!eliminatedId) {
    return {
      state: { ...state, votes: {} },
      eliminatedId: null,
      gameEnd: { ended: false, winner: null },
    };
  }

  const alive = state.alive.filter((id) => id !== eliminatedId);
  const eliminated = [...state.eliminated, eliminatedId];
  let nextState: ImpostorGameState = { ...state, alive, eliminated, votes: {} };
  const gameEnd = checkGameEnd(nextState);
  if (gameEnd.ended) {
    nextState = { ...nextState, ended: true, winner: gameEnd.winner };
  }
  return { state: nextState, eliminatedId, gameEnd };
}
