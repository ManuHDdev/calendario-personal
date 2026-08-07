import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { contentRoutes } from './routes/content';
import { roomsRoutes } from './rooms/rooms.route';
import { wsRoutes } from './rooms/ws.route';
import { cleanupIdleRooms } from './rooms/roomStore';

const app = Fastify({ logger: true });

async function bootstrap() {
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5180'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(websocket);

  await app.register(contentRoutes);
  await app.register(roomsRoutes);
  await app.register(wsRoutes);

  app.get('/juegos/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Limpieza de salas inactivas (>2h sin jugadores conectados) — ver
  // design.md "Room cleanup" y roomStore.ts.
  setInterval(() => cleanupIdleRooms(), 10 * 60 * 1000).unref();

  const port = Number(process.env.PORT) || 3008;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen({ port, host });
  app.log.info(`juegos backend listening on ${host}:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
