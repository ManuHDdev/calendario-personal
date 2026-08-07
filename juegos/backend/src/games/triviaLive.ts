import type { RoomState } from '../rooms/types';
import type { Delivery } from './impostorLive';

// ─────────────────────────────────────────────────────────────────────────
// Trivia en vivo — ver spec.md "Trivia en vivo scoring". Preguntas
// cronometradas, una respuesta por jugador y pregunta, marcador retransmitido
// al cerrar cada pregunta.
// ─────────────────────────────────────────────────────────────────────────

export function handleStartQuestion(room: RoomState, requesterId: string, nowMs: number = Date.now()): Delivery {
  if (!room.trivia) return { error: 'Esta sala no es de Trivia en vivo' };
  if (requesterId !== room.hostId) return { error: 'Solo el host puede lanzar la siguiente pregunta' };

  const question = room.trivia.bag.draw();
  room.trivia.currentQuestion = question;
  room.trivia.questionStartedAt = nowMs;
  room.trivia.answers = new Map();
  room.trivia.questionsAsked += 1;

  return {
    broadcast: {
      type: 'question',
      categoria: question.categoria,
      pregunta: question.pregunta,
      opciones: question.opciones,
      timerMs: room.trivia.timerMs,
      questionNumber: room.trivia.questionsAsked,
    },
  };
}

/**
 * Registra la respuesta de un jugador. Solo cuenta la primera respuesta de
 * cada jugador para la pregunta actual, y ninguna respuesta llegada después
 * de que expire el temporizador (spec.md "Late answer not accepted").
 */
export function handleAnswer(
  room: RoomState,
  playerId: string,
  answer: string,
  nowMs: number = Date.now(),
): Delivery {
  const trivia = room.trivia;
  if (!trivia?.currentQuestion || trivia.questionStartedAt === null) {
    return { error: 'No hay ninguna pregunta activa' };
  }

  const elapsed = nowMs - trivia.questionStartedAt;
  if (elapsed > trivia.timerMs) {
    return { error: 'Tiempo agotado: la respuesta no se ha contabilizado' };
  }

  if (trivia.answers.has(playerId)) {
    return { error: 'Ya has respondido a esta pregunta' };
  }

  trivia.answers.set(playerId, { answer, atMs: nowMs });
  return {
    broadcast: { type: 'answer-received', playerId, answeredCount: trivia.answers.size },
  };
}

export function closeQuestion(room: RoomState): Delivery {
  const trivia = room.trivia;
  if (!trivia?.currentQuestion) return { error: 'No hay ninguna pregunta activa' };

  for (const [playerId, { answer }] of trivia.answers.entries()) {
    if (answer === trivia.currentQuestion.correcta) {
      trivia.scores.set(playerId, (trivia.scores.get(playerId) ?? 0) + 1);
    }
  }

  const scoreboard = [...room.players.values()].map((p) => ({
    playerId: p.id,
    username: p.username,
    score: trivia.scores.get(p.id) ?? 0,
  })).sort((a, b) => b.score - a.score);

  const correcta = trivia.currentQuestion.correcta;
  trivia.currentQuestion = null;
  trivia.questionStartedAt = null;

  return {
    broadcast: { type: 'question-closed', correcta, scoreboard },
  };
}
