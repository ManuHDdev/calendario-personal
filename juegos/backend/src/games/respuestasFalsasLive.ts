import type { RoomState } from '../rooms/types';
import type { Delivery } from './impostorLive';

// ─────────────────────────────────────────────────────────────────────────
// Respuestas falsas (Fibbage-style) — ver design.md "Respuestas falsas" y
// specs/juegos/spec.md "Respuestas falsas scoring". Flujo: host lanza una
// pregunta (solo se retransmite la pregunta, jamás la respuesta real) →
// cada jugador conectado envía una respuesta falsa → cuando todos han
// enviado (o el host lo fuerza) el servidor baraja [falsas + real] con ids
// opacos y abre la votación → cada jugador vota un id, sin poder votar el
// que contiene su propia respuesta (se rastrea server-side, nunca
// confiando en el cliente) → reveal: se desvela cuál id era la real, quién
// escribió cada falsa, y se puntúa.
// ─────────────────────────────────────────────────────────────────────────

function connectedPlayerIds(room: RoomState): string[] {
  return [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
}

function fisherYatesShuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function handleStartQuestion(room: RoomState, requesterId: string): Delivery {
  const state = room.respuestasFalsas;
  if (!state) return { error: 'Esta sala no es de Respuestas falsas' };
  if (requesterId !== room.hostId) return { error: 'Solo el host puede lanzar la siguiente pregunta' };

  const question = state.bag.draw();
  state.currentQuestion = question;
  state.phase = 'submitting';
  state.submissions = new Map();
  state.options = null;
  state.votes = new Map();
  state.questionsAsked += 1;

  return {
    broadcast: {
      type: 'question',
      pregunta: question.pregunta,
      questionNumber: state.questionsAsked,
    },
  };
}

/** Construye la lista barajada de opciones (falsas + la real) con ids opacos
 * y abre la fase de votación. No expone `authorId` en el broadcast: el
 * cliente solo recibe `{ id, text }`. */
function openVoting(room: RoomState): Delivery {
  const state = room.respuestasFalsas!;
  const question = state.currentQuestion!;

  const raw: { text: string; authorId: string | null }[] = [
    ...[...state.submissions.entries()].map(([playerId, text]) => ({ text, authorId: playerId })),
    { text: question.respuestaReal, authorId: null },
  ];

  const shuffled = fisherYatesShuffle(raw);
  state.options = shuffled.map((opt, i) => ({ id: `opt-${i}`, text: opt.text, authorId: opt.authorId }));
  state.phase = 'voting';

  return {
    broadcast: {
      type: 'voting-open',
      options: state.options.map((o) => ({ id: o.id, text: o.text })),
    },
  };
}

export function handleSubmitAnswer(room: RoomState, playerId: string, answer: string): Delivery {
  const state = room.respuestasFalsas;
  if (!state?.currentQuestion || state.phase !== 'submitting') {
    return { error: 'No se están aceptando respuestas ahora mismo' };
  }
  if (state.submissions.has(playerId)) {
    return { error: 'Ya has enviado tu respuesta para esta pregunta' };
  }
  const trimmed = answer.trim();
  if (!trimmed) return { error: 'La respuesta no puede estar vacía' };

  state.submissions.set(playerId, trimmed);

  const connected = connectedPlayerIds(room);
  const allSubmitted = connected.every((id) => state.submissions.has(id));
  if (allSubmitted) {
    return openVoting(room);
  }

  return {
    broadcast: { type: 'answer-submitted', submittedCount: state.submissions.size },
  };
}

/** El host puede forzar la apertura de la votación aunque no todos hayan
 * enviado respuesta (design.md: "once all have submitted (or the host
 * forces it)"). */
export function handleForceVoting(room: RoomState, requesterId: string): Delivery {
  const state = room.respuestasFalsas;
  if (!state?.currentQuestion || state.phase !== 'submitting') {
    return { error: 'No hay ninguna pregunta esperando respuestas' };
  }
  if (requesterId !== room.hostId) return { error: 'Solo el host puede forzar la votación' };
  if (state.submissions.size === 0) return { error: 'Nadie ha enviado ninguna respuesta todavía' };

  return openVoting(room);
}

export function handleVote(room: RoomState, playerId: string, optionId: string): Delivery {
  const state = room.respuestasFalsas;
  if (!state?.options || state.phase !== 'voting') {
    return { error: 'No hay ninguna votación abierta' };
  }
  if (state.votes.has(playerId)) return { error: 'Ya has votado en esta ronda' };

  const option = state.options.find((o) => o.id === optionId);
  if (!option) return { error: 'Opción de voto desconocida' };
  if (option.authorId === playerId) return { error: 'No puedes votar tu propia respuesta' };

  state.votes.set(playerId, optionId);

  const connected = connectedPlayerIds(room);
  const allVoted = connected.every((id) => state.votes.has(id));
  if (allVoted) {
    return reveal(room);
  }

  return {
    broadcast: { type: 'vote-received', votesCount: state.votes.size },
  };
}

/** Revela la respuesta real, autor de cada respuesta falsa, y puntúa:
 * +1 a cada jugador que votó la respuesta real, +1 al autor de cada
 * respuesta falsa por cada voto recibido — ver spec.md "Scoring rewards
 * both correct guesses and successful deception". */
function reveal(room: RoomState): Delivery {
  const state = room.respuestasFalsas!;
  const options = state.options!;
  const realOption = options.find((o) => o.authorId === null)!;

  for (const [voterId, optionId] of state.votes.entries()) {
    if (optionId === realOption.id) {
      state.scores.set(voterId, (state.scores.get(voterId) ?? 0) + 1);
      continue;
    }
    const voted = options.find((o) => o.id === optionId);
    if (voted?.authorId) {
      state.scores.set(voted.authorId, (state.scores.get(voted.authorId) ?? 0) + 1);
    }
  }

  const revealedOptions = options.map((o) => ({
    id: o.id,
    text: o.text,
    authorId: o.authorId,
    isReal: o.authorId === null,
    votes: [...state.votes.entries()].filter(([, optionId]) => optionId === o.id).map(([voterId]) => voterId),
  }));

  const scoreboard = [...room.players.values()]
    .map((p) => ({ playerId: p.id, username: p.username, score: state.scores.get(p.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);

  state.phase = 'reveal';
  state.currentQuestion = null;

  return {
    broadcast: { type: 'reveal', realOptionId: realOption.id, options: revealedOptions, scoreboard },
  };
}

/** El host puede forzar el reveal aunque no todos hayan votado. */
export function handleForceReveal(room: RoomState, requesterId: string): Delivery {
  const state = room.respuestasFalsas;
  if (!state?.options || state.phase !== 'voting') {
    return { error: 'No hay ninguna votación abierta' };
  }
  if (requesterId !== room.hostId) return { error: 'Solo el host puede forzar el reveal' };

  return reveal(room);
}
