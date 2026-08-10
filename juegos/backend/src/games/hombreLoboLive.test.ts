import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoom, joinOrReconnect, __resetRoomsForTests } from '../rooms/roomStore';
import {
  assignRoles,
  computeLoboCount,
  checkWinCondition,
  handleStartGame,
  handleLoboVote,
  handleVidenteSee,
  handleBrujaAction,
  handleAdvancePhase,
  handleDayVote,
  handleCazadorRevenge,
} from './hombreLoboLive';
import type { RoomSocket, LoboRole } from '../rooms/types';

function fakeSocket(): RoomSocket {
  return { send: vi.fn(), close: vi.fn() };
}

function makeIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

function joinPlayers(room: ReturnType<typeof createRoom>, ids: string[]) {
  for (const id of ids) joinOrReconnect(room, id, `Jugador ${id}`, fakeSocket());
}

function countRoles(roles: Map<string, LoboRole>): Record<LoboRole, number> {
  const counts: Record<LoboRole, number> = { lobo: 0, aldeano: 0, vidente: 0, bruja: 0, cazador: 0 };
  for (const role of roles.values()) counts[role]++;
  return counts;
}

function idWithRole(roles: Map<string, LoboRole>, role: LoboRole): string | undefined {
  for (const [id, r] of roles.entries()) if (r === role) return id;
  return undefined;
}

/**
 * Avanza la sub-fase Vidente/Bruja de una noche sin condicionar el resultado
 * del test: la Vidente (si existe) mira a cualquier otro jugador vivo, y la
 * Bruja (si existe) no usa ninguna poción. Deja la sala en
 * 'resolucion-noche' resuelta automáticamente, o en la fase que corresponda
 * si se disparó una venganza del Cazador.
 */
function passThroughVidenteAndBruja(room: ReturnType<typeof createRoom>) {
  const hl = room.hombreLobo!;
  if (hl.phase === 'noche-vidente') {
    const videnteId = idWithRole(hl.roles, 'vidente');
    if (videenteExists(videnteId)) {
      const target = [...hl.alive].find((id) => id !== videnteId);
      if (target) handleVidenteSee(room, videnteId, target);
    }
  }
  if (hl.phase === 'noche-bruja') {
    const brujaId = idWithRole(hl.roles, 'bruja');
    if (videenteExists(brujaId)) handleBrujaAction(room, brujaId, {});
  }
}

function videenteExists(id: string | undefined): id is string {
  return typeof id === 'string';
}

// ─────────────────────────────────────────────────────────────────────────
// Role assignment scaling
// ─────────────────────────────────────────────────────────────────────────

describe('hombreLoboLive.assignRoles / computeLoboCount', () => {
  it('scales the lobo count roughly with the configured ratio across several player counts', () => {
    expect(computeLoboCount(5, 4)).toBe(1);
    expect(computeLoboCount(6, 4)).toBe(2);
    expect(computeLoboCount(8, 4)).toBe(2);
    expect(computeLoboCount(12, 4)).toBe(3);
    expect(computeLoboCount(16, 4)).toBe(4);
  });

  it('never assigns lobos as half or more of the group', () => {
    for (const n of [5, 6, 7, 8, 9, 10, 12, 16, 20]) {
      const loboCount = computeLoboCount(n, 4);
      expect(loboCount).toBeLessThan(n / 2 + 0.001);
      expect(loboCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('assigns every player exactly one role and totals match the player count', () => {
    for (const n of [5, 6, 7, 8, 12, 16]) {
      const ids = makeIds(n);
      const roles = assignRoles(ids, 4);
      expect(roles.size).toBe(n);
      const counts = countRoles(roles);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(total).toBe(n);
      expect(counts.lobo).toBe(computeLoboCount(n, 4));
    }
  });

  it('includes special roles only when enough players remain to keep at least one aldeano', () => {
    // 5 jugadores, 1 lobo -> hay sitio para vidente y bruja, pero no para
    // los tres roles especiales a la vez sin dejar 0 aldeanos.
    const roles5 = assignRoles(makeIds(5), 4);
    const counts5 = countRoles(roles5);
    expect(counts5.aldeano).toBeGreaterThanOrEqual(1);

    // Con más jugadores, caben los tres roles especiales.
    const roles12 = assignRoles(makeIds(12), 4);
    const counts12 = countRoles(roles12);
    expect(counts12.vidente).toBe(1);
    expect(counts12.bruja).toBe(1);
    expect(counts12.cazador).toBe(1);
    expect(counts12.aldeano).toBeGreaterThanOrEqual(1);
  });

  it('throws when there are fewer than the minimum required players', () => {
    expect(() => assignRoles(makeIds(4), 4)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Win conditions
// ─────────────────────────────────────────────────────────────────────────

describe('hombreLoboLive.checkWinCondition', () => {
  it('aldeanos win the instant zero lobos remain alive', () => {
    const roles = new Map<string, LoboRole>([
      ['p1', 'lobo'],
      ['p2', 'aldeano'],
      ['p3', 'aldeano'],
    ]);
    const alive = new Set(['p2', 'p3']); // p1 (lobo) already dead
    expect(checkWinCondition(roles, alive)).toBe('aldeanos');
  });

  it('lobos win the instant living lobos >= living non-lobos', () => {
    const roles = new Map<string, LoboRole>([
      ['p1', 'lobo'],
      ['p2', 'lobo'],
      ['p3', 'aldeano'],
      ['p4', 'aldeano'],
    ]);
    // 2 lobos vivos vs 2 no-lobos vivos -> lobos ganan (>=)
    const alive = new Set(['p1', 'p2', 'p3', 'p4']);
    expect(checkWinCondition(roles, alive)).toBe('lobos');
  });

  it('no winner while lobos are strictly outnumbered and at least one lobo remains', () => {
    const roles = new Map<string, LoboRole>([
      ['p1', 'lobo'],
      ['p2', 'aldeano'],
      ['p3', 'aldeano'],
      ['p4', 'aldeano'],
    ]);
    const alive = new Set(['p1', 'p2', 'p3', 'p4']);
    expect(checkWinCondition(roles, alive)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Private prompts never leak
// ─────────────────────────────────────────────────────────────────────────

describe('hombreLoboLive private prompts', () => {
  beforeEach(() => __resetRoomsForTests());

  function setupRoom(n: number) {
    const room = createRoom('hombre-lobo-live', 'p1', 'Host');
    const ids = makeIds(n);
    joinPlayers(room, ids);
    return room;
  }

  it('only living lobos receive the night-lobos prompt, embedded in role-assigned', () => {
    const room = setupRoom(8);
    const result = handleStartGame(room, 'p1', 4);
    expect(result.error).toBeUndefined();
    expect(result.toPlayer).toBeDefined();

    const hl = room.hombreLobo!;
    for (const [playerId, msg] of result.toPlayer!.entries()) {
      const role = hl.roles.get(playerId);
      if (role === 'lobo') {
        expect(msg).toHaveProperty('nightPrompt');
      } else {
        expect(msg).not.toHaveProperty('nightPrompt');
      }
    }
    // El broadcast general nunca incluye quién está actuando.
    expect(result.broadcast).not.toHaveProperty('fellowLobos');
    expect(result.broadcast).not.toHaveProperty('nightPrompt');
  });

  it('the vidente prompt and reveal are delivered only to the vidente, never broadcast', () => {
    const room = setupRoom(8);
    handleStartGame(room, 'p1', 4);
    const hl = room.hombreLobo!;
    const lobos = [...hl.alive].filter((id) => hl.roles.get(id) === 'lobo');
    const nonLobo = [...hl.alive].find((id) => hl.roles.get(id) !== 'lobo')!;

    for (const lobo of lobos) handleLoboVote(room, lobo, nonLobo);
    expect(hl.phase).toBe('noche-vidente');

    const videnteId = idWithRole(hl.roles, 'vidente');
    if (!videenteExists(videnteId)) return; // este tamaño de grupo podría no incluir Vidente

    const targetId = [...hl.alive].find((id) => id !== videnteId)!;
    const result = handleVidenteSee(room, videnteId, targetId);
    expect(result.error).toBeUndefined();
    expect(result.toPlayer?.get(videnteId)).toBeDefined();
    expect(result.toPlayer!.size).toBeLessThanOrEqual(2); // vidente + siguiente actor, nunca todos
    for (const playerId of result.toPlayer!.keys()) {
      if (playerId !== videnteId) {
        // cualquier otro destinatario debe ser el siguiente actor (bruja), no un espectador cualquiera
        expect(hl.roles.get(playerId)).not.toBe('aldeano');
      }
    }
  });

  it('a non-lobo attempting a lobo vote is rejected', () => {
    const room = setupRoom(8);
    handleStartGame(room, 'p1', 4);
    const hl = room.hombreLobo!;
    const nonLobo = [...hl.alive].find((id) => hl.roles.get(id) !== 'lobo')!;
    const result = handleLoboVote(room, nonLobo, [...hl.alive].find((id) => id !== nonLobo)!);
    expect(result.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Cazador revenge interrupt (night + day)
// ─────────────────────────────────────────────────────────────────────────

describe('hombreLoboLive Cazador revenge interrupt', () => {
  beforeEach(() => __resetRoomsForTests());

  it('fires when the Cazador dies at night, pausing resolution until the revenge target is chosen', () => {
    const room = createRoom('hombre-lobo-live', 'p1', 'Host');
    const ids = makeIds(12);
    joinPlayers(room, ids);
    handleStartGame(room, 'p1', 4);
    const hl = room.hombreLobo!;

    const cazadorId = idWithRole(hl.roles, 'cazador')!;
    const lobos = [...hl.alive].filter((id) => hl.roles.get(id) === 'lobo');

    // Los lobos atacan al Cazador esta noche.
    let last;
    for (const lobo of lobos) last = handleLoboVote(room, lobo, cazadorId);
    expect(last).toBeDefined();

    // Vidente/Bruja avanzan sin intervenir de forma relevante.
    passThroughVidenteAndBruja(room);

    expect(hl.phase).toBe('resolucion-noche');
    expect(hl.pendingRevenge).not.toBeNull();
    expect(hl.pendingRevenge!.cazadorId).toBe(cazadorId);
    expect(hl.alive.has(cazadorId)).toBe(false);

    const revengeTarget = [...hl.alive][0];
    const revengeResult = handleCazadorRevenge(room, cazadorId, revengeTarget);
    expect(revengeResult.error).toBeUndefined();
    expect(hl.alive.has(revengeTarget)).toBe(false);
    expect(hl.pendingRevenge).toBeNull();
    // Muerte nocturna (incluida la venganza disparada de noche) nunca revela el rol.
    const entry = hl.deathLog.find((e) => e.playerId === revengeTarget);
    expect(entry?.role).toBeNull();
  });

  it('fires when the Cazador is voted out by day, revealing the day-elimination role as usual', () => {
    const room = createRoom('hombre-lobo-live', 'p1', 'Host');
    const ids = makeIds(12);
    joinPlayers(room, ids);
    handleStartGame(room, 'p1', 4);
    const hl = room.hombreLobo!;
    const cazadorId = idWithRole(hl.roles, 'cazador')!;

    // Pasar la noche sin ninguna muerte de por medio: los lobos atacan a otro
    // jugador cualquiera (no al cazador) para no interferir con este test.
    const lobos = [...hl.alive].filter((id) => hl.roles.get(id) === 'lobo');
    const victim = [...hl.alive].find((id) => hl.roles.get(id) === 'aldeano' && !lobos.includes(id))!;
    for (const lobo of lobos) handleLoboVote(room, lobo, victim);
    passThroughVidenteAndBruja(room);
    expect(hl.phase).toBe('dia-debate');

    handleAdvancePhase(room, 'p1');
    expect(hl.phase).toBe('dia-votacion');

    for (const id of hl.alive) handleDayVote(room, id, cazadorId);

    expect(hl.phase).toBe('resolucion-dia');
    expect(hl.pendingRevenge).not.toBeNull();
    expect(hl.pendingRevenge!.cazadorId).toBe(cazadorId);

    const dayLogEntry = hl.deathLog.find((e) => e.playerId === cazadorId);
    expect(dayLogEntry?.role).toBe('cazador');

    const revengeTarget = [...hl.alive][0];
    const revengeTargetRole = hl.roles.get(revengeTarget);
    const revengeResult = handleCazadorRevenge(room, cazadorId, revengeTarget);
    expect(revengeResult.error).toBeUndefined();
    expect(hl.alive.has(revengeTarget)).toBe(false);
    // La venganza disparada de día SÍ revela el rol del objetivo.
    const entry = hl.deathLog.find((e) => e.playerId === revengeTarget);
    expect(entry?.role).toBe(revengeTargetRole);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Win condition thresholds through the full room flow
// ─────────────────────────────────────────────────────────────────────────

describe('hombreLoboLive win condition thresholds via full flow', () => {
  beforeEach(() => __resetRoomsForTests());

  it('ends the game for aldeanos the moment the last lobo dies at night', () => {
    const room = createRoom('hombre-lobo-live', 'p1', 'Host');
    const ids = makeIds(5); // ratio 4 -> exactly 1 lobo
    joinPlayers(room, ids);
    handleStartGame(room, 'p1', 4);
    const hl = room.hombreLobo!;
    expect(countRoles(hl.roles).lobo).toBe(1);
    const loboId = idWithRole(hl.roles, 'lobo')!;

    // Los lobos primero deben elegir una víctima cualquiera para poder pasar de fase.
    const victim = [...hl.alive].find((id) => id !== loboId)!;
    const loboResult = handleLoboVote(room, loboId, victim);
    expect(loboResult.error).toBeUndefined();

    if (hl.phase === 'noche-vidente') {
      const videnteId = idWithRole(hl.roles, 'vidente');
      if (videenteExists(videnteId)) {
        const target = [...hl.alive].find((id) => id !== videnteId)!;
        handleVidenteSee(room, videnteId, target);
      }
    }

    if (hl.phase === 'noche-bruja') {
      // La Bruja mata al único lobo con su poción, forzando el desenlace
      // aldeano en resolucion-noche.
      const brujaId = idWithRole(hl.roles, 'bruja')!;
      const killResult = handleBrujaAction(room, brujaId, { killTargetId: loboId });
      expect(killResult.broadcast?.type).toBe('game-ended');
      expect(killResult.broadcast?.winner).toBe('aldeanos');
      expect(hl.winner).toBe('aldeanos');
      expect(hl.phase).toBe('fin');
    }
  });

  it('ends the game for lobos the instant living lobos reach parity with living non-lobos', () => {
    const room = createRoom('hombre-lobo-live', 'p1', 'Host');
    // ratio 4 con 6 jugadores -> 2 lobos, 1 vidente, 3 aldeanos (sin Bruja:
    // no hay hueco para las 3 roles especiales a la vez con solo 4 no-lobos).
    const ids = makeIds(6);
    joinPlayers(room, ids);
    handleStartGame(room, 'p1', 4);
    const hl = room.hombreLobo!;
    expect(countRoles(hl.roles).lobo).toBe(2);
    expect(countRoles(hl.roles).bruja).toBe(0);

    const lobos = [...hl.alive].filter((id) => hl.roles.get(id) === 'lobo');
    const nightVictim = [...hl.alive].find((id) => hl.roles.get(id) === 'aldeano')!;

    // Sin Bruja que pueda curar, la víctima de los lobos muere esta noche:
    // no-lobos vivos pasan de 4 a 3 (2 lobos vs 3 no-lobos, todavía sin ganador).
    for (const lobo of lobos) handleLoboVote(room, lobo, nightVictim);
    if (hl.phase === 'noche-vidente') {
      const videnteId = idWithRole(hl.roles, 'vidente');
      if (videenteExists(videnteId)) {
        const target = [...hl.alive].find((id) => id !== videnteId)!;
        handleVidenteSee(room, videnteId, target);
      }
    }
    expect(hl.phase).toBe('dia-debate');
    expect(hl.alive.has(nightVictim)).toBe(false);

    handleAdvancePhase(room, 'p1');
    expect(hl.phase).toBe('dia-votacion');

    // 3 no-lobos vivos, 2 lobos vivos: expulsar a un no-lobo más deja 2 vs 2 -> lobos ganan.
    const targetAldeano = [...hl.alive].find((id) => hl.roles.get(id) !== 'lobo')!;
    let finalResult;
    for (const id of hl.alive) finalResult = handleDayVote(room, id, targetAldeano);

    expect(finalResult?.broadcast?.type).toBe('game-ended');
    expect(finalResult?.broadcast?.winner).toBe('lobos');
    expect(hl.winner).toBe('lobos');
    expect(hl.phase).toBe('fin');
  });
});
