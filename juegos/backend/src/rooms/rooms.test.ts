import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { wsRoutes } from './ws.route';
import { createRoom, __resetRoomsForTests } from './roomStore';

// Se mockea la verificación JWT: estas pruebas son de integración de la capa
// de salas/WebSocket (join, broadcast, código de sala desconocido), no de la
// verificación de firma JWT (que ya tiene su propio test suite).
vi.mock('../middleware/auth', async () => {
  const actual = await vi.importActual<typeof import('../middleware/auth')>('../middleware/auth');
  return {
    ...actual,
    verifyToken: async (token: string) => {
      // Los tests codifican el userId y username directamente en el "token" simulado.
      const [sub, preferred_username] = token.split('::');
      if (!sub) throw new Error('token de prueba inválido');
      return { sub, preferred_username: preferred_username ?? 'Jugador' };
    },
  };
});

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
}

function waitForClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    ws.once('close', (code) => resolve(code));
  });
}

describe('WebSocket room layer (integration)', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    __resetRoomsForTests();
    app = Fastify();
    await app.register(websocket);
    await app.register(wsRoutes);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `ws://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects a connection with an unknown room code and adds no player anywhere', async () => {
    const ws = new WebSocket(`${baseUrl}/juegos/api/ws?token=user1::Ana&room=ZZZZ`);
    const closeCode = await waitForClose(ws);
    expect(closeCode).toBe(4404);
  });

  it('adds the joining player and broadcasts the updated player list', async () => {
    const room = createRoom('trivia-live', 'host1', 'Host');

    const hostWs = new WebSocket(`${baseUrl}/juegos/api/ws?token=host1::Host&room=${room.code}`);
    await waitForMessage(hostWs); // player list tras el propio host uniéndose

    const guestWs = new WebSocket(`${baseUrl}/juegos/api/ws?token=user2::Ana&room=${room.code}`);
    const [hostUpdate, guestUpdate] = await Promise.all([waitForMessage(hostWs), waitForMessage(guestWs)]);

    expect(hostUpdate.type).toBe('players-updated');
    expect((hostUpdate.players as unknown[]).length).toBe(2);
    expect(guestUpdate.type).toBe('players-updated');

    hostWs.close();
    guestWs.close();
  });

  it('starting an Impostor en vivo round privately delivers a role-assigned message to every connected player', async () => {
    const room = createRoom('impostor-live', 'host1', 'Host');

    function collectMessages(ws: WebSocket): Record<string, unknown>[] {
      const messages: Record<string, unknown>[] = [];
      ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
      return messages;
    }

    const hostWs = new WebSocket(`${baseUrl}/juegos/api/ws?token=host1::Host&room=${room.code}`);
    const hostMessages = collectMessages(hostWs);
    await waitForMessage(hostWs);

    const p2Ws = new WebSocket(`${baseUrl}/juegos/api/ws?token=p2::Ana&room=${room.code}`);
    const p2Messages = collectMessages(p2Ws);
    await new Promise((r) => p2Ws.once('open', r));

    const p3Ws = new WebSocket(`${baseUrl}/juegos/api/ws?token=p3::Luis&room=${room.code}`);
    const p3Messages = collectMessages(p3Ws);
    await new Promise((r) => p3Ws.once('open', r));

    // Da tiempo a que los mensajes de "players-updated" lleguen a todos.
    await new Promise((r) => setTimeout(r, 100));

    hostWs.send(JSON.stringify({ type: 'start-round' }));
    await new Promise((r) => setTimeout(r, 150));

    for (const messages of [hostMessages, p2Messages, p3Messages]) {
      const roleMsg = messages.find((m) => m.type === 'role-assigned');
      expect(roleMsg).toBeDefined();
      expect(typeof roleMsg!.isImpostor).toBe('boolean');
    }

    const impostorCount = [hostMessages, p2Messages, p3Messages].filter(
      (messages) => messages.find((m) => m.type === 'role-assigned')?.isImpostor === true,
    ).length;
    expect(impostorCount).toBe(1);

    hostWs.close();
    p2Ws.close();
    p3Ws.close();
  });
});
