import type { RoomState, StopLiveState } from '../rooms/types';
import type { Delivery } from './impostorLive';

// ─────────────────────────────────────────────────────────────────────────
// Stop / Basta / Tutti Frutti — ver design.md "Stop / Basta" y
// specs/juegos/spec.md "Stop round resolution and scoring". Flujo: host
// inicia una ronda → el servidor elige una letra al azar (excluyendo letras
// difíciles configuradas) y retransmite letra + categorías fijas → cada
// jugador envía respuestas por categoría en cualquier momento (envíos
// parciales/incrementales permitidos) → el primer "¡Stop!" recibido cierra
// la ronda de inmediato para todos (envíos posteriores se ignoran) → el
// servidor puntúa automáticamente: respuesta única no vacía = 10, respuesta
// no vacía compartida con al menos otro jugador (comparación
// case/acento-insensible) = 5 cada uno, vacía = 0. No hay validación de
// palabras reales (explícitamente fuera de alcance, ver design.md "Risks").
// ─────────────────────────────────────────────────────────────────────────

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Puntúa cada categoría para todos los jugadores de la sala usando el
 * último valor enviado antes del corte. `playerIds` determina el conjunto
 * de jugadores incluidos en la rejilla (todos los presentes en la sala,
 * conectados o no, para que el grupo pueda ver quién no llegó a rellenar).
 */
function computeScores(
  state: StopLiveState,
  playerIds: string[],
): {
  grid: Record<string, Record<string, { value: string; points: number }>>;
  roundScores: Record<string, number>;
} {
  const grid: Record<string, Record<string, { value: string; points: number }>> = {};
  const roundScores: Record<string, number> = {};
  for (const id of playerIds) {
    grid[id] = {};
    roundScores[id] = 0;
  }

  for (const category of state.categories) {
    const rawByPlayer = new Map<string, string>();
    for (const id of playerIds) {
      rawByPlayer.set(id, (state.submissions.get(id)?.[category] ?? '').trim());
    }

    const normalizedCounts = new Map<string, number>();
    for (const id of playerIds) {
      const raw = rawByPlayer.get(id)!;
      if (!raw) continue;
      const norm = normalize(raw);
      normalizedCounts.set(norm, (normalizedCounts.get(norm) ?? 0) + 1);
    }

    for (const id of playerIds) {
      const raw = rawByPlayer.get(id)!;
      let points = 0;
      if (raw) {
        const norm = normalize(raw);
        points = (normalizedCounts.get(norm) ?? 0) === 1 ? 10 : 5;
      }
      grid[id][category] = { value: raw, points };
      roundScores[id] += points;
    }
  }

  return { grid, roundScores };
}

export function handleStartRound(room: RoomState, requesterId: string, forcedLetter?: string): Delivery {
  const state = room.stop;
  if (!state) return { error: 'Esta sala no es de Stop' };
  if (requesterId !== room.hostId) return { error: 'Solo el host puede iniciar la ronda' };
  if (state.phase === 'active') return { error: 'Ya hay una ronda en curso' };

  const pool = LETTERS.filter((l) => !state.excludedLetters.includes(l));
  const letterPool = pool.length > 0 ? pool : LETTERS;
  const letter = forcedLetter ?? letterPool[Math.floor(Math.random() * letterPool.length)];

  state.letter = letter;
  state.phase = 'active';
  state.stoppedBy = null;
  state.submissions = new Map();

  return {
    broadcast: { type: 'round-started', letter, categories: state.categories },
  };
}

/** Guarda/actualiza el valor de una categoría para un jugador. Envíos
 * parciales/incrementales están permitidos en cualquier momento mientras la
 * ronda esté activa; una vez detenida, envíos posteriores se ignoran (spec.md
 * "Stop cuts off the round for everyone"). */
export function handleSubmit(room: RoomState, playerId: string, category: string, value: string): Delivery {
  const state = room.stop;
  if (!state) return { error: 'Esta sala no es de Stop' };
  if (state.phase !== 'active') {
    return { error: 'La ronda ya ha terminado: no se aceptan más respuestas' };
  }
  if (!state.categories.includes(category)) {
    return { error: `Categoría desconocida: ${category}` };
  }

  const current = state.submissions.get(playerId) ?? {};
  current[category] = value;
  state.submissions.set(playerId, current);

  return {};
}

/** El primer "¡Stop!" recibido gana: cierra la ronda para todos y puntúa
 * automáticamente. Cualquier "¡Stop!" posterior a la ronda ya cerrada se
 * rechaza. */
export function handleStop(room: RoomState, playerId: string): Delivery {
  const state = room.stop;
  if (!state) return { error: 'Esta sala no es de Stop' };
  if (state.phase !== 'active') {
    return { error: 'La ronda ya ha terminado' };
  }

  state.phase = 'stopped';
  state.stoppedBy = playerId;
  state.roundsPlayed += 1;

  const playerIds = [...room.players.keys()];
  const { grid, roundScores } = computeScores(state, playerIds);
  for (const id of playerIds) {
    state.scores.set(id, (state.scores.get(id) ?? 0) + roundScores[id]);
  }

  const scoreboard = [...room.players.values()]
    .map((p) => ({ playerId: p.id, username: p.username, score: state.scores.get(p.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);

  return {
    broadcast: {
      type: 'round-stopped',
      stoppedBy: playerId,
      letter: state.letter,
      grid,
      roundScores,
      scoreboard,
    },
  };
}
