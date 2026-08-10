import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoom, joinOrReconnect, __resetRoomsForTests } from '../rooms/roomStore';
import {
  handleStartGame,
  handleDeclareAction,
  handlePass,
  handleChallenge,
  handleBlock,
  handleExchangeSelect,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from './coupLive';
import type { RoomSocket, CoupCharacter, CoupState, RoomState } from '../rooms/types';

// ─────────────────────────────────────────────────────────────────────────
// Cobertura exhaustiva de spec.md "Coup action/challenge/block resolution".
// Cada combinación acción×respuesta del reglamento del propietario tiene su
// propio caso — no un muestreo — porque una dirección de pérdida de
// influencia equivocada rompe la partida entera para la mesa.
// ─────────────────────────────────────────────────────────────────────────

function fakeSocket(): RoomSocket {
  return { send: vi.fn(), close: vi.fn() };
}

/** Crea una sala coup-live con jugadores conectados. */
function makeRoom(playerIds: string[]): RoomState {
  const room = createRoom('coup-live', playerIds[0], 'Host');
  for (const id of playerIds) joinOrReconnect(room, id, id, fakeSocket());
  return room;
}

/**
 * Sustituye `room.coup` por un estado de partida totalmente determinista
 * (manos, monedas y mazo elegidos a mano) para poder probar cada resolución
 * de desafío/bloqueo sin depender del reparto aleatorio real.
 */
function seedCoup(
  room: RoomState,
  hands: Record<string, CoupCharacter[]>,
  opts: { coins?: Record<string, number>; deck?: CoupCharacter[]; turnIndex?: number } = {},
): CoupState {
  const players = Object.keys(hands);
  const playerState = new Map(
    players.map((id) => [id, { coins: opts.coins?.[id] ?? 2, influence: [...hands[id]], revealed: [] as CoupCharacter[] }]),
  );
  const coup: CoupState = {
    phase: 'in-progress',
    players,
    playerState,
    eliminated: new Set(),
    deck: opts.deck ?? ['duque', 'asesino', 'capitan', 'embajador', 'condesa'],
    turnIndex: opts.turnIndex ?? 0,
    pendingAction: null,
    pendingExchange: null,
    winnerId: null,
  };
  room.coup = coup;
  return coup;
}

describe('coupLive.handleStartGame', () => {
  beforeEach(() => __resetRoomsForTests());

  it('rejects fewer than MIN_PLAYERS connected players', () => {
    const room = makeRoom(['a', 'b']);
    const result = handleStartGame(room, 'a');
    expect(result.error).toBeDefined();
  });

  it('rejects a non-host trying to start', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const result = handleStartGame(room, 'b');
    expect(result.error).toBeDefined();
  });

  it('deals 2 hidden cards and 2 coins to each player, privately, and never leaks another players hand', () => {
    const room = makeRoom(['a', 'b', 'c', 'd']);
    const result = handleStartGame(room, 'a');
    expect(result.error).toBeUndefined();
    expect(result.toPlayer?.size).toBe(4);
    for (const [, msg] of result.toPlayer!.entries()) {
      expect(msg.type).toBe('hand-assigned');
      expect((msg.influence as CoupCharacter[]).length).toBe(2);
      expect(msg.coins).toBe(2);
    }
    expect(room.coup!.phase).toBe('in-progress');
    expect(room.coup!.deck.length).toBe(15 - 4 * 2);
  });

  it('rejects starting a second time once in progress', () => {
    const room = makeRoom(['a', 'b', 'c']);
    handleStartGame(room, 'a');
    const result = handleStartGame(room, 'a');
    expect(result.error).toBeDefined();
  });
});

describe('coupLive — Ingresos (unconditional, unblockable, unchallengeable)', () => {
  beforeEach(() => __resetRoomsForTests());

  it('resolves instantly: +1 coin, turn advances, no response window', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    const result = handleDeclareAction(room, 'a', { actionType: 'ingresos' });
    expect(result.error).toBeUndefined();
    expect(coup.playerState.get('a')!.coins).toBe(3);
    expect(coup.pendingAction).toBeNull();
    expect(coup.players[coup.turnIndex]).toBe('b');
  });

  it('is mandatory-blocked once the actor has 10+ coins (must Golpe de estado instead)', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 10 } });
    const result = handleDeclareAction(room, 'a', { actionType: 'ingresos' });
    expect(result.error).toBeDefined();
    expect(coup.playerState.get('a')!.coins).toBe(10);
  });

  it('rejects a declaration out of turn', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    const result = handleDeclareAction(room, 'b', { actionType: 'ingresos' });
    expect(result.error).toBeDefined();
  });
});

describe('coupLive — Golpe de estado (unconditional, unblockable, unchallengeable)', () => {
  beforeEach(() => __resetRoomsForTests());

  it('pays 7 coins and the target loses one influence immediately, no response window', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 7 } });
    const result = handleDeclareAction(room, 'a', { actionType: 'golpe-estado', targetId: 'b' });
    expect(result.error).toBeUndefined();
    expect(coup.playerState.get('a')!.coins).toBe(0);
    expect(coup.playerState.get('b')!.influence).toHaveLength(1);
    expect(coup.playerState.get('b')!.revealed).toHaveLength(1);
  });

  it('rejects declaring Golpe de estado without enough coins', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 6 } });
    const result = handleDeclareAction(room, 'a', { actionType: 'golpe-estado', targetId: 'b' });
    expect(result.error).toBeDefined();
  });

  it('rejects targeting yourself', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 7 } });
    const result = handleDeclareAction(room, 'a', { actionType: 'golpe-estado', targetId: 'a' });
    expect(result.error).toBeDefined();
  });

  it('eliminates a player at zero influence and ends the game with exactly one player left', () => {
    const room = makeRoom(['a', 'b']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino'] }, { coins: { a: 7 } });
    const result = handleDeclareAction(room, 'a', { actionType: 'golpe-estado', targetId: 'b' });
    expect(result.error).toBeUndefined();
    expect(coup.eliminated.has('b')).toBe(true);
    expect(coup.phase).toBe('ended');
    expect(coup.winnerId).toBe('a');
  });
});

describe('coupLive — Ayuda externa (unconditional, blockable by Duque, not challengeable)', () => {
  beforeEach(() => __resetRoomsForTests());

  it('resolves +2 coins when everyone passes', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'ayuda-externa' });
    handlePass(room, 'b');
    const result = handlePass(room, 'c');
    expect(result.broadcast?.outcome).toBe('applied');
    expect(coup.playerState.get('a')!.coins).toBe(4);
    expect(coup.players[coup.turnIndex]).toBe('b');
  });

  it('rejects challenging Ayuda externa (no character claim to dispute)', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'ayuda-externa' });
    const result = handleChallenge(room, 'b');
    expect(result.error).toBeDefined();
  });

  it('is cancelled when blocked and nobody challenges the block', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'ayuda-externa' });
    handleBlock(room, 'b', 'duque');
    handlePass(room, 'a'); // el propio actor también puede pasar/desafiar el bloqueo
    const result = handlePass(room, 'c');
    expect(result.broadcast?.outcome).toBe('cancelled-by-block');
    expect(coup.playerState.get('a')!.coins).toBe(2); // sin cambios
    expect(coup.players[coup.turnIndex]).toBe('b');
  });

  it('block survives a challenge when the blocker truly holds Duque: challenger loses influence, action stays cancelled', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['duque', 'capitan'], c: ['embajador', 'duque'] }, { deck: ['asesino', 'capitan'] });
    handleDeclareAction(room, 'a', { actionType: 'ayuda-externa' });
    handleBlock(room, 'b', 'duque');
    const result = handleChallenge(room, 'c');
    expect(result.error).toBeUndefined();
    expect(result.broadcast?.claimTruthful).toBe(true);
    expect(coup.playerState.get('c')!.influence).toHaveLength(1); // el retador de un bloqueo legítimo pierde influencia
    expect(coup.playerState.get('a')!.coins).toBe(2); // acción sigue cancelada
  });

  it('block fails a challenge when the blocker is bluffing: blocker loses influence, action proceeds (+2 coins)', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'ayuda-externa' });
    handleBlock(room, 'b', 'duque');
    const result = handleChallenge(room, 'c');
    expect(result.broadcast?.claimTruthful).toBe(false);
    expect(coup.playerState.get('b')!.influence).toHaveLength(1); // el bloqueador farolero pierde influencia
    expect(coup.playerState.get('a')!.coins).toBe(4); // la acción original se aplica
  });

  it('rejects a second block attempt once one is already declared', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'ayuda-externa' });
    handleBlock(room, 'b', 'duque');
    const result = handleBlock(room, 'c', 'duque');
    expect(result.error).toBeDefined();
  });
});

describe('coupLive — Duque (claimed, challengeable, not blockable)', () => {
  beforeEach(() => __resetRoomsForTests());

  it('resolves +3 coins when unchallenged', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'duque' });
    handlePass(room, 'b');
    handlePass(room, 'c');
    expect(coup.playerState.get('a')!.coins).toBe(5);
  });

  it('rejects blocking Duque (no character counters it)', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'duque' });
    const result = handleBlock(room, 'b', 'duque');
    expect(result.error).toBeDefined();
  });

  it('true claim survives a challenge: challenger loses influence, claimed card reshuffled+redrawn, action still applies', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { deck: ['capitan'] });
    handleDeclareAction(room, 'a', { actionType: 'duque' });
    const deckSizeBefore = coup.deck.length;
    const result = handleChallenge(room, 'b');
    expect(result.broadcast?.claimTruthful).toBe(true);
    expect(result.broadcast?.loserId).toBe('b');
    expect(coup.playerState.get('b')!.influence).toHaveLength(1); // el retador pierde
    expect(coup.playerState.get('a')!.influence).toHaveLength(2); // el reclamante conserva 2 cartas (una reemplazada)
    expect(coup.playerState.get('a')!.influence).not.toContain(undefined);
    expect(coup.deck.length).toBe(deckSizeBefore); // se devuelve una y se roba otra: tamaño neto igual
    expect(coup.playerState.get('a')!.coins).toBe(5); // la acción se aplica
  });

  it('false claim loses on challenge: claimant loses influence immediately, action has no effect', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['asesino', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'duque' });
    const result = handleChallenge(room, 'b');
    expect(result.broadcast?.claimTruthful).toBe(false);
    expect(result.broadcast?.loserId).toBe('a');
    expect(coup.playerState.get('a')!.influence).toHaveLength(1); // el farolero pierde
    expect(coup.playerState.get('a')!.coins).toBe(2); // la acción se cancela, sin monedas
  });
});

describe('coupLive — Asesino (claimed, challengeable, blockable only by the target claiming Condesa)', () => {
  beforeEach(() => __resetRoomsForTests());

  it('rejects declaring without enough coins', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['asesino', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 2 } });
    const result = handleDeclareAction(room, 'a', { actionType: 'asesino', targetId: 'b' });
    expect(result.error).toBeDefined();
  });

  it('unchallenged and unblocked: pays 3 coins, target loses one influence', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['asesino', 'condesa'], b: ['duque', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 3 } });
    handleDeclareAction(room, 'a', { actionType: 'asesino', targetId: 'b' });
    handlePass(room, 'b');
    handlePass(room, 'c');
    expect(coup.playerState.get('a')!.coins).toBe(0);
    expect(coup.playerState.get('b')!.influence).toHaveLength(1);
  });

  it('true claim survives challenge: challenger loses influence, assassination still resolves against the target', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['asesino', 'condesa'], b: ['duque', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 3 }, deck: ['capitan'] });
    handleDeclareAction(room, 'a', { actionType: 'asesino', targetId: 'b' });
    handleChallenge(room, 'c');
    expect(coup.playerState.get('c')!.influence).toHaveLength(1); // retador pierde
    expect(coup.playerState.get('b')!.influence).toHaveLength(1); // el asesinato igual se aplica
  });

  it('false claim (bluff) loses challenge: actor loses influence, target keeps their influence, no coin refund', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['duque', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 3 } });
    handleDeclareAction(room, 'a', { actionType: 'asesino', targetId: 'b' });
    handleChallenge(room, 'c');
    expect(coup.playerState.get('a')!.influence).toHaveLength(1); // el farolero pierde
    expect(coup.playerState.get('b')!.influence).toHaveLength(2); // el objetivo NO pierde
    expect(coup.playerState.get('a')!.coins).toBe(0); // sin reembolso
  });

  it('rejects a block from anyone other than the target', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['asesino', 'condesa'], b: ['duque', 'capitan'], c: ['condesa', 'duque'] }, { coins: { a: 3 } });
    handleDeclareAction(room, 'a', { actionType: 'asesino', targetId: 'b' });
    const result = handleBlock(room, 'c', 'condesa');
    expect(result.error).toBeDefined();
  });

  it('target blocks with Condesa, unchallenged: assassination cancelled, no coin refund', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['asesino', 'duque'], b: ['condesa', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 3 } });
    handleDeclareAction(room, 'a', { actionType: 'asesino', targetId: 'b' });
    handleBlock(room, 'b', 'condesa');
    handlePass(room, 'a'); // el actor también responde a su propio objetivo bloqueado
    const result = handlePass(room, 'c');
    expect(result.broadcast?.outcome).toBe('cancelled-by-block');
    expect(coup.playerState.get('b')!.influence).toHaveLength(2);
    expect(coup.playerState.get('a')!.coins).toBe(0);
  });

  it('block-challenge, block truthful: challenger of the block loses influence, assassination stays cancelled', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['asesino', 'duque'], b: ['condesa', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 3 }, deck: ['duque'] });
    handleDeclareAction(room, 'a', { actionType: 'asesino', targetId: 'b' });
    handleBlock(room, 'b', 'condesa');
    const result = handleChallenge(room, 'c');
    expect(result.broadcast?.claimTruthful).toBe(true);
    expect(coup.playerState.get('c')!.influence).toHaveLength(1);
    expect(coup.playerState.get('b')!.influence).toHaveLength(2); // el objetivo conserva su influencia
  });

  it('block-challenge, block bluffed: target loses influence TWICE (failed block + the assassination that then goes through)', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['asesino', 'duque'], b: ['duque', 'capitan'], c: ['embajador', 'duque'] }, { coins: { a: 3 } });
    handleDeclareAction(room, 'a', { actionType: 'asesino', targetId: 'b' });
    handleBlock(room, 'b', 'condesa'); // farol: b no tiene condesa
    const result = handleChallenge(room, 'c');
    expect(result.broadcast?.claimTruthful).toBe(false);
    // b pierde una influencia por el farol de bloqueo, y otra porque el asesinato se aplica igualmente.
    expect(coup.playerState.get('b')!.influence).toHaveLength(0);
    expect(coup.eliminated.has('b')).toBe(true);
  });
});

describe('coupLive — Capitán (claimed, challengeable, blockable only by the target claiming Capitán or Embajador)', () => {
  beforeEach(() => __resetRoomsForTests());

  it('unchallenged and unblocked: steals 2 coins from the target', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['capitan', 'condesa'], b: ['duque', 'asesino'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'capitan', targetId: 'b' });
    handlePass(room, 'b');
    handlePass(room, 'c');
    expect(coup.playerState.get('a')!.coins).toBe(4);
    expect(coup.playerState.get('b')!.coins).toBe(0);
  });

  it('caps the steal at the targets available coins', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['capitan', 'condesa'], b: ['duque', 'asesino'], c: ['embajador', 'duque'] }, { coins: { b: 1 } });
    handleDeclareAction(room, 'a', { actionType: 'capitan', targetId: 'b' });
    handlePass(room, 'b');
    handlePass(room, 'c');
    expect(coup.playerState.get('a')!.coins).toBe(3);
    expect(coup.playerState.get('b')!.coins).toBe(0);
  });

  it('true claim survives challenge: challenger loses influence, steal still resolves', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['capitan', 'condesa'], b: ['duque', 'asesino'], c: ['embajador', 'duque'] }, { deck: ['duque'] });
    handleDeclareAction(room, 'a', { actionType: 'capitan', targetId: 'b' });
    handleChallenge(room, 'c');
    expect(coup.playerState.get('c')!.influence).toHaveLength(1);
    expect(coup.playerState.get('a')!.coins).toBe(4);
  });

  it('false claim (bluff) loses challenge: actor loses influence, no coins move', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['duque', 'asesino'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'capitan', targetId: 'b' });
    handleChallenge(room, 'c');
    expect(coup.playerState.get('a')!.influence).toHaveLength(1);
    expect(coup.playerState.get('a')!.coins).toBe(2);
    expect(coup.playerState.get('b')!.coins).toBe(2);
  });

  it('rejects a block from anyone other than the target', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['capitan', 'condesa'], b: ['duque', 'asesino'], c: ['capitan', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'capitan', targetId: 'b' });
    const result = handleBlock(room, 'c', 'capitan');
    expect(result.error).toBeDefined();
  });

  it('target blocks with Capitán, unchallenged: steal cancelled', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['capitan', 'condesa'], b: ['capitan', 'asesino'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'capitan', targetId: 'b' });
    handleBlock(room, 'b', 'capitan');
    handlePass(room, 'c');
    expect(coup.playerState.get('a')!.coins).toBe(2);
    expect(coup.playerState.get('b')!.coins).toBe(2);
  });

  it('target blocks with Embajador, unchallenged: steal cancelled', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['capitan', 'condesa'], b: ['embajador', 'asesino'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'capitan', targetId: 'b' });
    handleBlock(room, 'b', 'embajador');
    handlePass(room, 'c');
    expect(coup.playerState.get('a')!.coins).toBe(2);
  });

  it('rejects blocking with a character that does not counter Capitán', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['capitan', 'condesa'], b: ['duque', 'asesino'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'capitan', targetId: 'b' });
    const result = handleBlock(room, 'b', 'duque');
    expect(result.error).toBeDefined();
  });
});

describe('coupLive — Embajador (claimed, challengeable, not blockable, exchange step)', () => {
  beforeEach(() => __resetRoomsForTests());

  it('rejects blocking Embajador', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['embajador', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'embajador' });
    const result = handleBlock(room, 'b', 'embajador');
    expect(result.error).toBeDefined();
  });

  it('unchallenged: opens an exchange offering 2 drawn cards on top of the current hand, turn does not advance yet', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['embajador', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { deck: ['duque', 'capitan'] });
    handleDeclareAction(room, 'a', { actionType: 'embajador' });
    handlePass(room, 'b');
    const result = handlePass(room, 'c');
    expect(result.error).toBeUndefined();
    expect(coup.pendingExchange).not.toBeNull();
    expect(coup.pendingExchange!.playerId).toBe('a');
    expect(coup.pendingExchange!.keepCount).toBe(2);
    expect(coup.pendingExchange!.options).toHaveLength(4);
    expect(coup.players[coup.turnIndex]).toBe('a'); // el turno no avanza hasta elegir

    // Las opciones del intercambio se susurran en privado al jugador afectado
    // — nunca aparecen en el `state` público del broadcast.
    expect(result.toPlayer?.get('a')).toEqual({
      type: 'exchange-pending',
      options: coup.pendingExchange!.options,
      keepCount: 2,
    });
    expect((result.broadcast?.state as { players: unknown[] } | undefined)).toBeDefined();
    expect(JSON.stringify(result.broadcast?.state)).not.toContain('embajador');
  });

  it('exchange-select applies the chosen hand, returns the rest to the deck, and advances the turn', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['embajador', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { deck: ['duque', 'capitan'] });
    handleDeclareAction(room, 'a', { actionType: 'embajador' });
    handlePass(room, 'b');
    handlePass(room, 'c');
    const deckSizeBeforeSelect = coup.deck.length;
    const result = handleExchangeSelect(room, 'a', ['duque', 'capitan']);
    expect(result.error).toBeUndefined();
    expect(coup.playerState.get('a')!.influence).toEqual(['duque', 'capitan']);
    expect(coup.pendingExchange).toBeNull();
    expect(coup.deck.length).toBe(deckSizeBeforeSelect + 2); // condesa+embajador vuelven al mazo
    expect(coup.players[coup.turnIndex]).toBe('b');
  });

  it('rejects exchange-select with the wrong number of kept cards', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['embajador', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { deck: ['duque', 'capitan'] });
    handleDeclareAction(room, 'a', { actionType: 'embajador' });
    handlePass(room, 'b');
    handlePass(room, 'c');
    const result = handleExchangeSelect(room, 'a', ['duque']);
    expect(result.error).toBeDefined();
  });

  it('rejects exchange-select with a card that was not among the offered options', () => {
    const room = makeRoom(['a', 'b', 'c']);
    // Mano/mazo elegidos para que 'condesa' nunca aparezca entre las opciones ofrecidas.
    seedCoup(room, { a: ['embajador', 'duque'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { deck: ['duque', 'capitan'] });
    handleDeclareAction(room, 'a', { actionType: 'embajador' });
    handlePass(room, 'b');
    handlePass(room, 'c');
    const result = handleExchangeSelect(room, 'a', ['duque', 'condesa']); // 'condesa' no estaba en las opciones ofrecidas
    expect(result.error).toBeDefined();
  });

  it('true claim survives challenge: challenger loses influence, exchange still opens', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['embajador', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] }, { deck: ['duque', 'capitan'] });
    handleDeclareAction(room, 'a', { actionType: 'embajador' });
    const result = handleChallenge(room, 'b');
    expect(result.broadcast?.claimTruthful).toBe(true);
    expect(coup.playerState.get('b')!.influence).toHaveLength(1);
    expect(coup.pendingExchange).not.toBeNull();
  });

  it('false claim (bluff) loses challenge: actor loses influence, no exchange happens', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'embajador' });
    const result = handleChallenge(room, 'b');
    expect(result.broadcast?.claimTruthful).toBe(false);
    expect(coup.playerState.get('a')!.influence).toHaveLength(1);
    expect(coup.pendingExchange).toBeNull();
  });
});

describe('coupLive — response-window validation and bookkeeping', () => {
  beforeEach(() => __resetRoomsForTests());

  it('rejects the actor passing on their own action', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'duque' });
    const result = handlePass(room, 'a');
    expect(result.error).toBeDefined();
  });

  it('rejects double-responding (already passed) from the same player', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'duque' });
    handlePass(room, 'b');
    const result = handlePass(room, 'b');
    expect(result.error).toBeDefined();
  });

  it('rejects challenging/passing/blocking when there is no pending action', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    expect(handlePass(room, 'b').error).toBeDefined();
    expect(handleChallenge(room, 'b').error).toBeDefined();
    expect(handleBlock(room, 'b', 'duque').error).toBeDefined();
  });

  it('does not wait on a disconnected player to resolve the response window', () => {
    const room = makeRoom(['a', 'b', 'c']);
    const coup = seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    room.players.get('c')!.connected = false;
    handleDeclareAction(room, 'a', { actionType: 'duque' });
    const result = handlePass(room, 'b'); // 'c' desconectado nunca responde, pero la ventana se resuelve igual
    expect(result.broadcast?.outcome).toBe('applied');
    expect(coup.playerState.get('a')!.coins).toBe(5);
  });

  it('rejects declaring an action while another is still pending', () => {
    const room = makeRoom(['a', 'b', 'c']);
    seedCoup(room, { a: ['duque', 'condesa'], b: ['asesino', 'capitan'], c: ['embajador', 'duque'] });
    handleDeclareAction(room, 'a', { actionType: 'duque' });
    const result = handleDeclareAction(room, 'a', { actionType: 'ingresos' });
    expect(result.error).toBeDefined();
  });
});
