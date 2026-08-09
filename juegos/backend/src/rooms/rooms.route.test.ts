import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { roomsRoutes } from './rooms.route';
import { __resetRoomsForTests } from './roomStore';

// Ver specs/juegos/spec.md "Live room creation and join" — estas pruebas
// cubren la validación de `categoria` al crear una sala de trivia-live, sin
// pasar por la verificación real de firma JWT (que ya tiene su propio test
// suite en middleware/auth.test.ts).
vi.mock('../middleware/auth', async () => {
  const actual = await vi.importActual<typeof import('../middleware/auth')>('../middleware/auth');
  return {
    ...actual,
    requireAuthenticated: async (request: any, reply: any) => {
      const testUser = request.headers['x-test-user'];
      if (!testUser) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }
      const [sub, preferred_username] = String(testUser).split('::');
      request.user = { sub, preferred_username: preferred_username ?? 'Host' };
    },
  };
});

describe('POST /juegos/api/rooms', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    __resetRoomsForTests();
    app = Fastify();
    await app.register(roomsRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a trivia-live room with a known categoria', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/juegos/api/rooms',
      headers: { 'x-test-user': 'host1::Host' },
      payload: { gameType: 'trivia-live', categoria: 'curiosidades' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.roomCode).toHaveLength(4);
    expect(body.gameType).toBe('trivia-live');
  });

  it('creates a trivia-live room without a categoria (full pool)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/juegos/api/rooms',
      headers: { 'x-test-user': 'host1::Host' },
      payload: { gameType: 'trivia-live' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('creates a trivia-live room with categoria "todas" (full pool)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/juegos/api/rooms',
      headers: { 'x-test-user': 'host1::Host' },
      payload: { gameType: 'trivia-live', categoria: 'todas' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects an unknown categoria and creates no room', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/juegos/api/rooms',
      headers: { 'x-test-user': 'host1::Host' },
      payload: { gameType: 'trivia-live', categoria: 'no-existe' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('ignores categoria for impostor-live rooms', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/juegos/api/rooms',
      headers: { 'x-test-user': 'host1::Host' },
      payload: { gameType: 'impostor-live', categoria: 'no-existe' },
    });
    expect(res.statusCode).toBe(201);
  });
});
