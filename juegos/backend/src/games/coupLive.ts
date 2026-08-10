import type { RoomState, CoupCharacter, CoupState, CoupPendingAction, CoupActionType } from '../rooms/types';
import type { Delivery } from './impostorLive';

// ─────────────────────────────────────────────────────────────────────────
// Coup en vivo — ver spec.md "Coup action/challenge/block resolution" y
// design.md "Decisions — multi-device rooms" → "Coup". El servidor es
// autoritativo sobre TODO el estado (manos, monedas, mazo); las cartas de
// cada jugador solo se entregan a ese jugador vía `Delivery.toPlayer`
// (mismo mecanismo de whisper que impostorLive.ts usa para ocultar la
// palabra al impostor). `pendingAction` es el único sitio donde vive la
// ventana de respuesta (pasar/desafiar/bloquear) — ver rooms/types.ts.
//
// Este es el juego con las reglas menos perdonables de todo el hub: un
// error en la dirección de la pérdida de influencia en un desafío rompe la
// partida para toda la mesa. Cada combinación acción×respuesta tiene su
// propio test en coupLive.test.ts — no solo un muestreo.
//
// Simplificación deliberada frente al reglamento físico (documentada en el
// resumen de la tarea, no un vacío de reglas): cuando un jugador debe
// perder una influencia, el servidor descarta automáticamente su primera
// carta en mano en vez de preguntarle cuál de las dos prefiere revelar. La
// dirección de la pérdida (quién pierde) es siempre la correcta según las
// reglas; solo se omite la elección de *cuál* carta concreta perder cuando
// hay dos disponibles.
// ─────────────────────────────────────────────────────────────────────────

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;

export const CHARACTERS: CoupCharacter[] = ['duque', 'asesino', 'capitan', 'embajador', 'condesa'];
const COPIES_PER_CHARACTER = 3;
const STARTING_COINS = 2;
const STARTING_INFLUENCE = 2;
const MANDATORY_COUP_COINS = 10;

interface ActionRule {
  claimedCharacter: CoupCharacter | null;
  cost: number;
  requiresTarget: boolean;
  challengeable: boolean;
  blockableBy: CoupCharacter[];
  /** Si es true, solo el objetivo de la acción puede bloquearla (Asesino/Capitán). Si es false y blockableBy no está vacío, cualquiera puede bloquear (Ayuda externa). */
  blockRestrictedToTarget: boolean;
}

export const ACTION_RULES: Record<CoupActionType, ActionRule> = {
  ingresos: { claimedCharacter: null, cost: 0, requiresTarget: false, challengeable: false, blockableBy: [], blockRestrictedToTarget: false },
  'ayuda-externa': { claimedCharacter: null, cost: 0, requiresTarget: false, challengeable: false, blockableBy: ['duque'], blockRestrictedToTarget: false },
  'golpe-estado': { claimedCharacter: null, cost: 7, requiresTarget: true, challengeable: false, blockableBy: [], blockRestrictedToTarget: false },
  duque: { claimedCharacter: 'duque', cost: 0, requiresTarget: false, challengeable: true, blockableBy: [], blockRestrictedToTarget: false },
  asesino: { claimedCharacter: 'asesino', cost: 3, requiresTarget: true, challengeable: true, blockableBy: ['condesa'], blockRestrictedToTarget: true },
  capitan: { claimedCharacter: 'capitan', cost: 0, requiresTarget: true, challengeable: true, blockableBy: ['capitan', 'embajador'], blockRestrictedToTarget: true },
  embajador: { claimedCharacter: 'embajador', cost: 0, requiresTarget: false, challengeable: true, blockableBy: [], blockRestrictedToTarget: false },
};

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck(): CoupCharacter[] {
  const deck: CoupCharacter[] = [];
  for (const character of CHARACTERS) {
    for (let i = 0; i < COPIES_PER_CHARACTER; i++) deck.push(character);
  }
  return shuffle(deck);
}

/** Crea el estado de partida (reparto de manos, mazo, orden de turno) para los jugadores dados. */
export function startCoupGame(playerIds: string[]): CoupState {
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new Error(`startCoupGame: Coup en vivo necesita entre ${MIN_PLAYERS} y ${MAX_PLAYERS} jugadores`);
  }
  const deck = buildDeck();
  const playerState = new Map<string, { coins: number; influence: CoupCharacter[]; revealed: CoupCharacter[] }>();
  for (const id of playerIds) {
    const influence = [deck.pop()!, deck.pop()!];
    playerState.set(id, { coins: STARTING_COINS, influence, revealed: [] });
  }
  return {
    phase: 'in-progress',
    players: [...playerIds],
    playerState,
    eliminated: new Set(),
    deck,
    turnIndex: 0,
    pendingAction: null,
    pendingExchange: null,
    winnerId: null,
  };
}

function loseInfluence(coup: CoupState, playerId: string): CoupCharacter {
  const ps = coup.playerState.get(playerId)!;
  const lost = ps.influence.shift()!;
  ps.revealed.push(lost);
  if (ps.influence.length === 0) coup.eliminated.add(playerId);
  return lost;
}

function reshuffleAndRedraw(coup: CoupState, playerId: string, character: CoupCharacter): void {
  const ps = coup.playerState.get(playerId)!;
  const idx = ps.influence.indexOf(character);
  ps.influence.splice(idx, 1);
  coup.deck.push(character);
  coup.deck = shuffle(coup.deck);
  ps.influence.push(coup.deck.pop()!);
}

function checkWin(coup: CoupState): boolean {
  const living = coup.players.filter((id) => !coup.eliminated.has(id));
  if (living.length <= 1) {
    coup.winnerId = living[0] ?? null;
    coup.phase = 'ended';
    return true;
  }
  return false;
}

function advanceTurn(coup: CoupState): void {
  if (coup.winnerId) return;
  const n = coup.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (coup.turnIndex + i) % n;
    if (!coup.eliminated.has(coup.players[idx])) {
      coup.turnIndex = idx;
      return;
    }
  }
}

/** Aplica el efecto de una acción reclamada (Duque/Asesino/Capitán/Embajador) que sobrevivió sin bloqueo ni desafío exitoso. */
function applyClaimedEffect(coup: CoupState, pa: CoupPendingAction): void {
  const actor = coup.playerState.get(pa.actorId)!;
  switch (pa.type) {
    case 'ayuda-externa':
      actor.coins += 2;
      break;
    case 'duque':
      actor.coins += 3;
      break;
    case 'asesino':
      loseInfluence(coup, pa.targetId!);
      break;
    case 'capitan': {
      const target = coup.playerState.get(pa.targetId!)!;
      const amount = Math.min(2, target.coins);
      target.coins -= amount;
      actor.coins += amount;
      break;
    }
    case 'embajador': {
      const drawn: CoupCharacter[] = [];
      for (let i = 0; i < 2 && coup.deck.length > 0; i++) drawn.push(coup.deck.pop()!);
      coup.pendingExchange = {
        playerId: pa.actorId,
        options: [...actor.influence, ...drawn],
        keepCount: actor.influence.length,
      };
      break;
    }
    default:
      // ingresos / golpe-estado se resuelven directamente en handleDeclareAction, nunca llegan aquí.
      break;
  }
}

/**
 * Punto único de resolución de un `pendingAction`: aplica el efecto si
 * `applied` es true (nadie bloqueó/desafió con éxito), limpia el pendiente,
 * comprueba fin de partida y avanza el turno — salvo que quede un
 * intercambio de Embajador pendiente, en cuyo caso el turno no avanza hasta
 * `handleExchangeSelect`.
 */
function resolveClaimedAction(coup: CoupState, pa: CoupPendingAction, applied: boolean): void {
  coup.pendingAction = null;
  if (applied) applyClaimedEffect(coup, pa);
  if (!checkWin(coup) && !coup.pendingExchange) advanceTurn(coup);
}

function publicState(room: RoomState, coup: CoupState) {
  return {
    phase: coup.phase,
    turnPlayerId: coup.phase === 'in-progress' ? coup.players[coup.turnIndex] : null,
    deckCount: coup.deck.length,
    winnerId: coup.winnerId,
    players: coup.players.map((id) => {
      const ps = coup.playerState.get(id)!;
      return {
        playerId: id,
        username: room.players.get(id)?.username ?? id,
        coins: ps.coins,
        influenceCount: ps.influence.length,
        revealed: [...ps.revealed],
        eliminated: coup.eliminated.has(id),
      };
    }),
  };
}

function connectedEligibleResponders(room: RoomState, coup: CoupState, excludeIds: string[]): string[] {
  return coup.players.filter(
    (id) => !coup.eliminated.has(id) && !excludeIds.includes(id) && room.players.get(id)?.connected,
  );
}

function currentTurnPlayerId(coup: CoupState): string | null {
  return coup.phase === 'in-progress' ? coup.players[coup.turnIndex] : null;
}

/**
 * Si `resolveClaimedAction` acaba de dejar un intercambio de Embajador
 * pendiente, esto entrega en privado (whisper) al jugador afectado las
 * cartas entre las que debe elegir — nunca se incluyen en el `state`
 * público. Devuelve `undefined` si no hay ningún intercambio pendiente.
 */
function exchangeWhisper(coup: CoupState): Map<string, Record<string, unknown>> | undefined {
  if (!coup.pendingExchange) return undefined;
  return new Map([
    [
      coup.pendingExchange.playerId,
      { type: 'exchange-pending', options: [...coup.pendingExchange.options], keepCount: coup.pendingExchange.keepCount },
    ],
  ]);
}

// ─────────────────────────────────────────────────────────────────────────
// Handlers — cada uno recibe el RoomState y devuelve un Delivery
// (broadcast/toPlayer/error), igual que impostorLive.ts / triviaLive.ts.
// ─────────────────────────────────────────────────────────────────────────

export function handleStartGame(room: RoomState, requesterId: string): Delivery {
  if (!room.coup) return { error: 'Esta sala no es de Coup en vivo' };
  if (requesterId !== room.hostId) return { error: 'Solo el host puede iniciar la partida' };
  if (room.coup.phase !== 'lobby') return { error: 'La partida ya ha comenzado' };

  const connectedIds = [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
  if (connectedIds.length < MIN_PLAYERS) {
    return { error: `Se necesitan al menos ${MIN_PLAYERS} jugadores conectados para empezar` };
  }
  if (connectedIds.length > MAX_PLAYERS) {
    return { error: `Coup admite como máximo ${MAX_PLAYERS} jugadores` };
  }

  room.coup = startCoupGame(connectedIds);

  const toPlayer = new Map<string, Record<string, unknown>>();
  for (const id of connectedIds) {
    const ps = room.coup.playerState.get(id)!;
    toPlayer.set(id, { type: 'hand-assigned', influence: [...ps.influence], coins: ps.coins });
  }

  return {
    broadcast: { type: 'game-started', state: publicState(room, room.coup) },
    toPlayer,
  };
}

export interface DeclareActionPayload {
  actionType: CoupActionType;
  targetId?: string;
}

export function handleDeclareAction(room: RoomState, requesterId: string, payload: DeclareActionPayload): Delivery {
  const coup = room.coup;
  if (!coup) return { error: 'Esta sala no es de Coup en vivo' };
  if (coup.phase !== 'in-progress') return { error: 'No hay ninguna partida en curso' };
  if (coup.pendingAction || coup.pendingExchange) {
    return { error: 'Ya hay una acción pendiente de resolución' };
  }
  if (requesterId !== currentTurnPlayerId(coup)) return { error: 'No es tu turno' };

  const rules = ACTION_RULES[payload.actionType];
  if (!rules) return { error: `Acción desconocida: ${payload.actionType}` };

  const actor = coup.playerState.get(requesterId)!;

  if (actor.coins >= MANDATORY_COUP_COINS && payload.actionType !== 'golpe-estado') {
    return { error: `Con ${actor.coins} monedas es obligatorio dar un Golpe de estado` };
  }

  let targetId: string | null = null;
  if (rules.requiresTarget) {
    targetId = payload.targetId ?? null;
    if (!targetId) return { error: 'Esta acción necesita un objetivo' };
    if (targetId === requesterId) return { error: 'No puedes elegirte a ti mismo como objetivo' };
    if (!coup.players.includes(targetId) || coup.eliminated.has(targetId)) {
      return { error: 'Objetivo inválido: no está en juego' };
    }
  }

  if (actor.coins < rules.cost) return { error: 'Monedas insuficientes para esta acción' };

  // Ingresos y Golpe de estado son incondicionales: no se pueden bloquear
  // ni desafiar, se resuelven al instante sin ventana de respuesta.
  if (payload.actionType === 'ingresos') {
    actor.coins += 1;
    advanceTurn(coup);
    return { broadcast: { type: 'action-resolved', actionType: 'ingresos', actorId: requesterId, state: publicState(room, coup) } };
  }

  if (payload.actionType === 'golpe-estado') {
    actor.coins -= rules.cost;
    const revealed = loseInfluence(coup, targetId!);
    const ended = checkWin(coup);
    if (!ended) advanceTurn(coup);
    return {
      broadcast: {
        type: 'action-resolved',
        actionType: 'golpe-estado',
        actorId: requesterId,
        targetId,
        revealedCard: revealed,
        state: publicState(room, coup),
      },
    };
  }

  // Acciones reclamadas (Duque/Asesino/Capitán/Embajador) y Ayuda externa:
  // se paga el coste ahora (sin reembolso, ver reglas oficiales) y se abre
  // la ventana de respuesta.
  actor.coins -= rules.cost;
  coup.pendingAction = {
    type: payload.actionType,
    actorId: requesterId,
    targetId,
    claimedCharacter: rules.claimedCharacter,
    stage: 'action',
    blockerId: null,
    blockClaim: null,
    passedIds: [],
  };

  return {
    broadcast: {
      type: 'action-declared',
      actionType: payload.actionType,
      actorId: requesterId,
      targetId,
      claimedCharacter: rules.claimedCharacter,
      blockableBy: rules.blockableBy,
      challengeable: rules.challengeable,
      state: publicState(room, coup),
    },
  };
}

export function handlePass(room: RoomState, requesterId: string): Delivery {
  const coup = room.coup;
  if (!coup?.pendingAction) return { error: 'No hay ninguna acción pendiente de respuesta' };
  const pa = coup.pendingAction;

  const excluded = pa.stage === 'action' ? [pa.actorId] : [pa.blockerId!];
  if (excluded.includes(requesterId)) return { error: 'No puedes pasar en tu propia acción o bloqueo' };
  if (coup.eliminated.has(requesterId)) return { error: 'Un jugador eliminado no puede responder' };
  if (pa.passedIds.includes(requesterId)) return { error: 'Ya has respondido a esta acción' };

  pa.passedIds = [...pa.passedIds, requesterId];

  const eligible = connectedEligibleResponders(room, coup, excluded);
  const allPassed = eligible.every((id) => pa.passedIds.includes(id));

  if (!allPassed) {
    return {
      broadcast: {
        type: 'response-passed',
        playerId: requesterId,
        stage: pa.stage,
        passedIds: [...pa.passedIds],
        state: publicState(room, coup),
      },
    };
  }

  // Todos los que debían responder han pasado: en la etapa 'action' la
  // acción se aplica sin oposición; en la etapa 'block' el bloqueo triunfa
  // sin desafío y la acción original queda cancelada.
  const applied = pa.stage === 'action';
  resolveClaimedAction(coup, pa, applied);

  return {
    broadcast: {
      type: 'action-resolved',
      actionType: pa.type,
      actorId: pa.actorId,
      targetId: pa.targetId,
      outcome: applied ? 'applied' : 'cancelled-by-block',
      state: publicState(room, coup),
    },
    toPlayer: exchangeWhisper(coup),
  };
}

export function handleChallenge(room: RoomState, requesterId: string): Delivery {
  const coup = room.coup;
  if (!coup?.pendingAction) return { error: 'No hay ninguna acción pendiente de respuesta' };
  const pa = coup.pendingAction;
  if (coup.eliminated.has(requesterId)) return { error: 'Un jugador eliminado no puede responder' };

  if (pa.stage === 'action') {
    if (requesterId === pa.actorId) return { error: 'No puedes desafiar tu propia acción' };
    if (!pa.claimedCharacter) return { error: 'Esta acción no reclama ningún personaje, no se puede desafiar' };

    const claimer = pa.actorId;
    const claim = pa.claimedCharacter;
    const hasCard = coup.playerState.get(claimer)!.influence.includes(claim);

    if (hasCard) {
      reshuffleAndRedraw(coup, claimer, claim);
      const revealedCard = loseInfluence(coup, requesterId);
      resolveClaimedAction(coup, pa, true);
      const toPlayer = new Map<string, Record<string, unknown>>([
        [claimer, { type: 'hand-updated', influence: [...coup.playerState.get(claimer)!.influence] }],
      ]);
      const exchange = exchangeWhisper(coup);
      if (exchange) for (const [pid, msg] of exchange.entries()) toPlayer.set(pid, msg);
      return {
        broadcast: {
          type: 'challenge-resolved',
          stage: 'action',
          challengerId: requesterId,
          claimerId: claimer,
          claimedCharacter: claim,
          claimTruthful: true,
          loserId: requesterId,
          revealedCard,
          state: publicState(room, coup),
        },
        toPlayer,
      };
    }

    const revealedCard = loseInfluence(coup, claimer);
    resolveClaimedAction(coup, pa, false);
    return {
      broadcast: {
        type: 'challenge-resolved',
        stage: 'action',
        challengerId: requesterId,
        claimerId: claimer,
        claimedCharacter: claim,
        claimTruthful: false,
        loserId: claimer,
        revealedCard,
        state: publicState(room, coup),
      },
    };
  }

  // stage === 'block'
  if (requesterId === pa.blockerId) return { error: 'No puedes desafiar tu propio bloqueo' };
  const blocker = pa.blockerId!;
  const claim = pa.blockClaim!;
  const hasCard = coup.playerState.get(blocker)!.influence.includes(claim);

  if (hasCard) {
    reshuffleAndRedraw(coup, blocker, claim);
    const revealedCard = loseInfluence(coup, requesterId);
    resolveClaimedAction(coup, pa, false); // el bloqueo era legítimo: la acción original sigue cancelada
    return {
      broadcast: {
        type: 'challenge-resolved',
        stage: 'block',
        challengerId: requesterId,
        claimerId: blocker,
        claimedCharacter: claim,
        claimTruthful: true,
        loserId: requesterId,
        revealedCard,
        state: publicState(room, coup),
      },
      toPlayer: new Map([[blocker, { type: 'hand-updated', influence: [...coup.playerState.get(blocker)!.influence] }]]),
    };
  }

  const revealedCard = loseInfluence(coup, blocker);
  resolveClaimedAction(coup, pa, true); // el bloqueo era un farol: la acción original se aplica
  return {
    broadcast: {
      type: 'challenge-resolved',
      stage: 'block',
      challengerId: requesterId,
      claimerId: blocker,
      claimedCharacter: claim,
      claimTruthful: false,
      loserId: blocker,
      revealedCard,
      state: publicState(room, coup),
    },
  };
}

export function handleBlock(room: RoomState, requesterId: string, claimedCharacter: CoupCharacter): Delivery {
  const coup = room.coup;
  if (!coup?.pendingAction) return { error: 'No hay ninguna acción pendiente de respuesta' };
  const pa = coup.pendingAction;
  if (pa.stage !== 'action') return { error: 'Ya hay un bloqueo declarado sobre esta acción' };
  if (requesterId === pa.actorId) return { error: 'No puedes bloquear tu propia acción' };
  if (coup.eliminated.has(requesterId)) return { error: 'Un jugador eliminado no puede responder' };

  const rules = ACTION_RULES[pa.type];
  if (rules.blockableBy.length === 0) return { error: 'Esta acción no se puede bloquear' };
  if (rules.blockRestrictedToTarget && requesterId !== pa.targetId) {
    return { error: 'Solo el objetivo de la acción puede bloquearla' };
  }
  if (!rules.blockableBy.includes(claimedCharacter)) {
    return { error: `${claimedCharacter} no bloquea esta acción` };
  }

  pa.stage = 'block';
  pa.blockerId = requesterId;
  pa.blockClaim = claimedCharacter;
  pa.passedIds = [];

  return {
    broadcast: {
      type: 'block-declared',
      actionType: pa.type,
      actorId: pa.actorId,
      blockerId: requesterId,
      blockClaim: claimedCharacter,
      state: publicState(room, coup),
    },
  };
}

export function handleExchangeSelect(room: RoomState, requesterId: string, keep: CoupCharacter[]): Delivery {
  const coup = room.coup;
  if (!coup?.pendingExchange) return { error: 'No hay ningún intercambio pendiente' };
  const exchange = coup.pendingExchange;
  if (exchange.playerId !== requesterId) return { error: 'No es tu intercambio' };
  if (keep.length !== exchange.keepCount) {
    return { error: `Debes conservar exactamente ${exchange.keepCount} carta(s)` };
  }

  const remainingOptions = [...exchange.options];
  for (const card of keep) {
    const idx = remainingOptions.indexOf(card);
    if (idx === -1) return { error: 'Selección inválida: alguna carta no estaba entre las opciones ofrecidas' };
    remainingOptions.splice(idx, 1);
  }

  const ps = coup.playerState.get(requesterId)!;
  ps.influence = [...keep];
  coup.deck.push(...remainingOptions);
  coup.deck = shuffle(coup.deck);
  coup.pendingExchange = null;

  if (!checkWin(coup)) advanceTurn(coup);

  return {
    broadcast: { type: 'exchange-resolved', playerId: requesterId, state: publicState(room, coup) },
    toPlayer: new Map([[requesterId, { type: 'hand-updated', influence: [...ps.influence] }]]),
  };
}
