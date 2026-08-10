import type { RoomState, HombreLoboState, HombreLoboPhase, LoboRole, HombreLoboConfig } from '../rooms/types';
import type { Delivery } from './impostorLive';

// ─────────────────────────────────────────────────────────────────────────
// Hombre Lobo en vivo — la app hace de narradora automática. Ver design.md
// "Hombre Lobo (`gameType: 'hombre-lobo-live'`)" y spec.md "Hombre Lobo
// automated narration and win conditions". Reutiliza el mismo mecanismo de
// `Delivery` (broadcast/toPlayer) que impostorLive.ts usa para ocultar la
// palabra al impostor — aquí cada rol nocturno recibe su propio prompt
// privado vía `toPlayer`, y nadie más ve ni ese prompt ni el hecho de que se
// ha enviado.
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_PLAYERS_PER_LOBO = 4; // ~1 lobo por 3-4 jugadores, configurable (design.md)
export const MIN_PLAYERS = 5;
export const DEFAULT_DEBATE_MS = 90_000;
const HOLDING_MESSAGE = 'Algunos jugadores están actuando…';

export const ROLE_DESCRIPTIONS: Record<LoboRole, string> = {
  lobo: 'Cada noche, junto a los demás lobos, elegís en secreto a una víctima.',
  aldeano: 'No tienes ningún poder especial. Debate y vota de día para encontrar a los lobos.',
  vidente: 'Cada noche puedes ver en secreto el verdadero rol de un jugador.',
  bruja: 'Tienes una poción de curación (salva a la víctima de los lobos) y una de muerte (mata a quien elijas). Cada una se puede usar una sola vez en toda la partida, no una vez por noche.',
  cazador: 'Si te eliminan, de noche o de día, antes de morir eliges a otro jugador que muere contigo.',
};

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Número de lobos para un tamaño de grupo dado, según la ratio configurable (design.md). */
export function computeLoboCount(playerCount: number, playersPerLobo: number = DEFAULT_PLAYERS_PER_LOBO): number {
  const raw = Math.round(playerCount / playersPerLobo);
  return Math.max(1, Math.min(raw, Math.floor((playerCount - 1) / 2)));
}

/**
 * Asigna roles: lobos primero (según la ratio), luego Vidente/Bruja/Cazador
 * en ese orden solo si tras asignarlos siguen quedando más no-lobos que
 * lobos (deja sitio a al menos un Aldeano), y el resto son Aldeanos.
 */
export function assignRoles(playerIds: string[], playersPerLobo: number = DEFAULT_PLAYERS_PER_LOBO): Map<string, LoboRole> {
  if (playerIds.length < MIN_PLAYERS) {
    throw new Error(`assignRoles: se necesitan al menos ${MIN_PLAYERS} jugadores para Hombre Lobo`);
  }
  if (!Number.isFinite(playersPerLobo) || playersPerLobo < 2) {
    throw new Error('assignRoles: playersPerLobo debe ser al menos 2');
  }

  const shuffled = shuffle(playerIds);
  const loboCount = computeLoboCount(playerIds.length, playersPerLobo);

  const roles = new Map<string, LoboRole>();
  let idx = 0;
  for (; idx < loboCount; idx++) roles.set(shuffled[idx], 'lobo');

  const specialOrder: LoboRole[] = ['vidente', 'bruja', 'cazador'];
  for (const role of specialOrder) {
    const remainingAfterAssign = playerIds.length - (idx + 1);
    if (remainingAfterAssign > loboCount) {
      roles.set(shuffled[idx], role);
      idx++;
    }
  }

  for (; idx < playerIds.length; idx++) roles.set(shuffled[idx], 'aldeano');
  return roles;
}

/** aldeanos ganan si no quedan lobos vivos; lobos ganan si son >= que el resto de vivos. */
export function checkWinCondition(roles: Map<string, LoboRole>, alive: Set<string>): 'lobos' | 'aldeanos' | null {
  let lobos = 0;
  let nonLobos = 0;
  for (const id of alive) {
    if (roles.get(id) === 'lobo') lobos++;
    else nonLobos++;
  }
  if (lobos === 0) return 'aldeanos';
  if (lobos >= nonLobos) return 'lobos';
  return null;
}

export function createLobbyState(config?: Partial<HombreLoboConfig>): HombreLoboState {
  return {
    roles: new Map(),
    alive: new Set(),
    phase: 'lobby',
    round: 0,
    config: {
      playersPerLobo: config?.playersPerLobo ?? DEFAULT_PLAYERS_PER_LOBO,
      debateMs: config?.debateMs ?? DEFAULT_DEBATE_MS,
      tieBehavior: config?.tieBehavior ?? 'no-expulsion',
    },
    loboVotes: new Map(),
    lobosTarget: null,
    brujaHealUsed: false,
    brujaKillUsed: false,
    brujaHealTarget: null,
    brujaKillTarget: null,
    dayVotes: new Map(),
    pendingRevenge: null,
    deathLog: [],
    winner: null,
  };
}

function aliveWithRole(hl: HombreLoboState, role: LoboRole): string[] {
  return [...hl.alive].filter((id) => hl.roles.get(id) === role);
}

function canBrujaAct(hl: HombreLoboState): boolean {
  return aliveWithRole(hl, 'bruja').length > 0 && (!hl.brujaHealUsed || !hl.brujaKillUsed);
}

function nocheLoboPrompts(hl: HombreLoboState): Map<string, Record<string, unknown>> {
  const lobos = aliveWithRole(hl, 'lobo');
  const toPlayer = new Map<string, Record<string, unknown>>();
  for (const id of lobos) {
    toPlayer.set(id, { type: 'night-prompt', phase: 'noche-lobos' as HombreLoboPhase, fellowLobos: lobos.filter((x) => x !== id) });
  }
  return toPlayer;
}

function majorityTarget(votes: Map<string, string>, voters: string[]): string {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const voter of voters) {
    const target = votes.get(voter);
    if (!target) continue;
    if (!counts.has(target)) {
      counts.set(target, 0);
      order.push(target);
    }
    counts.set(target, counts.get(target)! + 1);
  }
  let best = order[0];
  let bestCount = counts.get(best) ?? 0;
  for (const t of order) {
    const c = counts.get(t)!;
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  }
  return best;
}

function tallyDayVotes(votes: Map<string, string>): { winnerTarget: string | null; tie: boolean } {
  const counts = new Map<string, number>();
  for (const target of votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);

  let winner: string | null = null;
  let max = 0;
  let tie = false;
  for (const [target, count] of counts) {
    if (count > max) {
      max = count;
      winner = target;
      tie = false;
    } else if (count === max) {
      tie = true;
    }
  }
  return { winnerTarget: tie ? null : winner, tie: tie || winner === null };
}

function mergeDeliveries(...deliveries: Delivery[]): Delivery {
  const result: Delivery = {};
  const toPlayer = new Map<string, Record<string, unknown>>();
  for (const d of deliveries) {
    if (d.error) return d;
    if (d.broadcast) result.broadcast = d.broadcast;
    if (d.toPlayer) for (const [k, v] of d.toPlayer.entries()) toPlayer.set(k, v);
  }
  if (toPlayer.size) result.toPlayer = toPlayer;
  return result;
}

export function handleStartGame(room: RoomState, requesterId: string, playersPerLobo?: number): Delivery {
  const hl = room.hombreLobo;
  if (!hl) return { error: 'Esta sala no es de Hombre Lobo' };
  if (requesterId !== room.hostId) return { error: 'Solo el host puede iniciar la partida' };
  if (hl.phase !== 'lobby') return { error: 'La partida ya ha comenzado' };

  const connectedIds = [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
  if (connectedIds.length < MIN_PLAYERS) {
    return { error: `Se necesitan al menos ${MIN_PLAYERS} jugadores conectados para empezar` };
  }

  const ratio = playersPerLobo !== undefined && Number.isFinite(playersPerLobo) && playersPerLobo >= 2
    ? playersPerLobo
    : hl.config.playersPerLobo;

  let roles: Map<string, LoboRole>;
  try {
    roles = assignRoles(connectedIds, ratio);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'No se pudieron asignar los roles' };
  }

  hl.roles = roles;
  hl.alive = new Set(connectedIds);
  hl.config.playersPerLobo = ratio;
  hl.round = 1;
  hl.phase = 'noche-lobos';

  const lobos = aliveWithRole(hl, 'lobo');
  const toPlayer = new Map<string, Record<string, unknown>>();
  for (const [playerId, role] of roles.entries()) {
    const base = { type: 'role-assigned', role, description: ROLE_DESCRIPTIONS[role] };
    toPlayer.set(
      playerId,
      role === 'lobo'
        ? { ...base, nightPrompt: { phase: 'noche-lobos', fellowLobos: lobos.filter((x) => x !== playerId) } }
        : base,
    );
  }

  return {
    broadcast: { type: 'phase-changed', phase: 'noche-lobos', round: 1, holding: HOLDING_MESSAGE },
    toPlayer,
  };
}

export function handleLoboVote(room: RoomState, playerId: string, targetId: string): Delivery {
  const hl = room.hombreLobo;
  if (!hl) return { error: 'Esta sala no es de Hombre Lobo' };
  if (hl.phase !== 'noche-lobos') return { error: 'No es el turno de los lobos' };
  if (hl.roles.get(playerId) !== 'lobo' || !hl.alive.has(playerId)) {
    return { error: 'Solo los lobos vivos pueden elegir víctima' };
  }
  if (!hl.alive.has(targetId) || hl.roles.get(targetId) === 'lobo') {
    return { error: 'Objetivo inválido: debe ser un jugador vivo que no sea lobo' };
  }

  hl.loboVotes.set(playerId, targetId);

  const livingLobos = aliveWithRole(hl, 'lobo');
  const allVoted = livingLobos.every((id) => hl.loboVotes.has(id));
  if (!allVoted) {
    return { toPlayer: new Map([[playerId, { type: 'vote-registered' }]]) };
  }

  hl.lobosTarget = majorityTarget(hl.loboVotes, livingLobos);
  hl.loboVotes = new Map();
  return enterNightSubPhase(room, 'noche-vidente');
}

export function handleVidenteSee(room: RoomState, playerId: string, targetId: string): Delivery {
  const hl = room.hombreLobo;
  if (!hl) return { error: 'Esta sala no es de Hombre Lobo' };
  if (hl.phase !== 'noche-vidente') return { error: 'No es el turno de la Vidente' };
  if (hl.roles.get(playerId) !== 'vidente' || !hl.alive.has(playerId)) {
    return { error: 'Solo la Vidente viva puede usar su poder' };
  }
  if (!hl.alive.has(targetId)) return { error: 'Objetivo inválido: debe ser un jugador vivo' };

  const reveal: Delivery = {
    toPlayer: new Map([[playerId, { type: 'vidente-reveal', targetId, role: hl.roles.get(targetId) }]]),
  };
  const advance = enterNightSubPhase(room, 'noche-bruja');
  return mergeDeliveries(reveal, advance);
}

export function handleBrujaAction(
  room: RoomState,
  playerId: string,
  action: { heal?: boolean; killTargetId?: string },
): Delivery {
  const hl = room.hombreLobo;
  if (!hl) return { error: 'Esta sala no es de Hombre Lobo' };
  if (hl.phase !== 'noche-bruja') return { error: 'No es el turno de la Bruja' };
  if (hl.roles.get(playerId) !== 'bruja' || !hl.alive.has(playerId)) {
    return { error: 'Solo la Bruja viva puede usar sus pociones' };
  }

  if (action.heal) {
    if (hl.brujaHealUsed) return { error: 'Ya has usado tu poción de curación' };
    if (!hl.lobosTarget) return { error: 'No hay ninguna víctima de los lobos que curar' };
    hl.brujaHealTarget = hl.lobosTarget;
    hl.brujaHealUsed = true;
  }

  if (action.killTargetId) {
    if (hl.brujaKillUsed) return { error: 'Ya has usado tu poción de muerte' };
    if (!hl.alive.has(action.killTargetId)) return { error: 'Objetivo inválido para la poción de muerte' };
    hl.brujaKillTarget = action.killTargetId;
    hl.brujaKillUsed = true;
  }

  return enterNightSubPhase(room, 'resolucion-noche');
}

function enterNightSubPhase(room: RoomState, phase: 'noche-vidente' | 'noche-bruja' | 'resolucion-noche'): Delivery {
  const hl = room.hombreLobo!;

  if (phase === 'noche-vidente') {
    const videntes = aliveWithRole(hl, 'vidente');
    if (videntes.length === 0) return enterNightSubPhase(room, 'noche-bruja');
    hl.phase = 'noche-vidente';
    const toPlayer = new Map<string, Record<string, unknown>>();
    for (const id of videntes) {
      toPlayer.set(id, { type: 'night-prompt', phase: 'noche-vidente', options: [...hl.alive].filter((x) => x !== id) });
    }
    return { broadcast: { type: 'phase-changed', phase: 'noche-vidente', round: hl.round, holding: HOLDING_MESSAGE }, toPlayer };
  }

  if (phase === 'noche-bruja') {
    if (!canBrujaAct(hl)) return enterNightSubPhase(room, 'resolucion-noche');
    hl.phase = 'noche-bruja';
    const brujas = aliveWithRole(hl, 'bruja');
    const toPlayer = new Map<string, Record<string, unknown>>();
    for (const id of brujas) {
      toPlayer.set(id, {
        type: 'night-prompt',
        phase: 'noche-bruja',
        lobosTarget: hl.lobosTarget,
        healAvailable: !hl.brujaHealUsed,
        killAvailable: !hl.brujaKillUsed,
        options: [...hl.alive],
      });
    }
    return { broadcast: { type: 'phase-changed', phase: 'noche-bruja', round: hl.round, holding: HOLDING_MESSAGE }, toPlayer };
  }

  return resolveNight(room);
}

function resolveNight(room: RoomState): Delivery {
  const hl = room.hombreLobo!;
  hl.phase = 'resolucion-noche';

  const deaths: string[] = [];
  if (hl.lobosTarget && hl.lobosTarget !== hl.brujaHealTarget) deaths.push(hl.lobosTarget);
  if (hl.brujaKillTarget && !deaths.includes(hl.brujaKillTarget)) deaths.push(hl.brujaKillTarget);

  hl.lobosTarget = null;
  hl.brujaHealTarget = null;
  hl.brujaKillTarget = null;

  const confirmedDeaths: string[] = [];
  for (const id of deaths) {
    hl.alive.delete(id);
    hl.deathLog.push({ playerId: id, round: hl.round, when: 'noche', role: null });
    confirmedDeaths.push(id);

    const winner = checkWinCondition(hl.roles, hl.alive);
    if (winner) {
      hl.winner = winner;
      hl.phase = 'fin';
      return {
        broadcast: { type: 'game-ended', winner, deaths: confirmedDeaths, roles: Object.fromEntries(hl.roles) },
      };
    }
  }

  const cazadorDied = confirmedDeaths.find((id) => hl.roles.get(id) === 'cazador');
  if (cazadorDied) {
    hl.pendingRevenge = { cazadorId: cazadorDied, resumePhase: 'dia-debate', context: 'noche' };
    return {
      broadcast: { type: 'night-resolved', deaths: confirmedDeaths, round: hl.round },
      toPlayer: new Map([[cazadorDied, { type: 'cazador-revenge-prompt', options: [...hl.alive] }]]),
    };
  }

  hl.phase = 'dia-debate';
  return {
    broadcast: {
      type: 'night-resolved',
      deaths: confirmedDeaths,
      round: hl.round,
      nextPhase: 'dia-debate',
      debateMs: hl.config.debateMs,
    },
  };
}

export function handleAdvancePhase(room: RoomState, requesterId: string): Delivery {
  const hl = room.hombreLobo;
  if (!hl) return { error: 'Esta sala no es de Hombre Lobo' };
  if (requesterId !== room.hostId) return { error: 'Solo el host puede avanzar la fase' };
  if (hl.phase !== 'dia-debate') return { error: 'No se puede avanzar manualmente desde esta fase' };

  hl.phase = 'dia-votacion';
  hl.dayVotes = new Map();
  return { broadcast: { type: 'phase-changed', phase: 'dia-votacion', round: hl.round, options: [...hl.alive] } };
}

export function handleDayVote(room: RoomState, playerId: string, targetId: string): Delivery {
  const hl = room.hombreLobo;
  if (!hl) return { error: 'Esta sala no es de Hombre Lobo' };
  if (hl.phase !== 'dia-votacion') return { error: 'No hay ninguna votación en curso' };
  if (!hl.alive.has(playerId)) return { error: 'Un jugador eliminado no puede votar' };
  if (!hl.alive.has(targetId)) return { error: 'Solo se puede votar a jugadores vivos' };

  hl.dayVotes.set(playerId, targetId);

  const allVoted = [...hl.alive].every((id) => hl.dayVotes.has(id));
  if (!allVoted) {
    return { broadcast: { type: 'day-vote-tally', votesCount: hl.dayVotes.size, aliveCount: hl.alive.size } };
  }

  return resolveDay(room);
}

function resolveDay(room: RoomState): Delivery {
  const hl = room.hombreLobo!;
  hl.phase = 'resolucion-dia';

  const { winnerTarget, tie } = tallyDayVotes(hl.dayVotes);
  hl.dayVotes = new Map();

  if (tie) {
    if (hl.config.tieBehavior === 'revote') {
      hl.phase = 'dia-votacion';
      return { broadcast: { type: 'day-vote-tied', nextPhase: 'dia-votacion', message: 'Empate: se repite la votación' } };
    }

    hl.round += 1;
    hl.phase = 'noche-lobos';
    return {
      broadcast: { type: 'day-resolved', expelledId: null, tie: true, round: hl.round, nextPhase: 'noche-lobos' },
      toPlayer: nocheLoboPrompts(hl),
    };
  }

  const expelledId = winnerTarget!;
  const expelledRole = hl.roles.get(expelledId)!;
  hl.alive.delete(expelledId);
  hl.deathLog.push({ playerId: expelledId, round: hl.round, when: 'dia', role: expelledRole });

  const winner = checkWinCondition(hl.roles, hl.alive);
  if (winner) {
    hl.winner = winner;
    hl.phase = 'fin';
    return {
      broadcast: { type: 'game-ended', winner, expelledId, expelledRole, roles: Object.fromEntries(hl.roles) },
    };
  }

  if (expelledRole === 'cazador') {
    hl.pendingRevenge = { cazadorId: expelledId, resumePhase: 'noche-lobos', context: 'dia' };
    return {
      broadcast: { type: 'day-resolved', expelledId, expelledRole, round: hl.round },
      toPlayer: new Map([[expelledId, { type: 'cazador-revenge-prompt', options: [...hl.alive] }]]),
    };
  }

  hl.round += 1;
  hl.phase = 'noche-lobos';
  return {
    broadcast: { type: 'day-resolved', expelledId, expelledRole, round: hl.round, nextPhase: 'noche-lobos' },
    toPlayer: nocheLoboPrompts(hl),
  };
}

export function handleCazadorRevenge(room: RoomState, playerId: string, targetId: string): Delivery {
  const hl = room.hombreLobo;
  if (!hl) return { error: 'Esta sala no es de Hombre Lobo' };
  if (!hl.pendingRevenge || hl.pendingRevenge.cazadorId !== playerId) {
    return { error: 'No tienes ninguna venganza pendiente' };
  }
  if (!hl.alive.has(targetId)) return { error: 'Objetivo inválido: debe ser un jugador vivo' };

  const { resumePhase, context } = hl.pendingRevenge;
  hl.pendingRevenge = null;

  const targetRole = hl.roles.get(targetId)!;
  hl.alive.delete(targetId);
  hl.deathLog.push({
    playerId: targetId,
    round: hl.round,
    when: context,
    // Misma convención que el resto de muertes: de noche el rol nunca se revela.
    role: context === 'dia' ? targetRole : null,
  });

  const winner = checkWinCondition(hl.roles, hl.alive);
  if (winner) {
    hl.winner = winner;
    hl.phase = 'fin';
    return {
      broadcast: { type: 'game-ended', winner, revengeTargetId: targetId, roles: Object.fromEntries(hl.roles) },
    };
  }

  // El mismo campo `role` que el resto de entradas del log de muertes: null
  // si la venganza se disparó de noche, el rol real si se disparó de día.
  const revealedRole = context === 'dia' ? targetRole : null;

  if (resumePhase === 'dia-debate') {
    hl.phase = 'dia-debate';
    return {
      broadcast: {
        type: 'cazador-revenge-resolved',
        targetId,
        role: revealedRole,
        nextPhase: 'dia-debate',
        round: hl.round,
        debateMs: hl.config.debateMs,
      },
    };
  }

  hl.round += 1;
  hl.phase = 'noche-lobos';
  return {
    broadcast: { type: 'cazador-revenge-resolved', targetId, role: revealedRole, nextPhase: 'noche-lobos', round: hl.round },
    toPlayer: nocheLoboPrompts(hl),
  };
}
