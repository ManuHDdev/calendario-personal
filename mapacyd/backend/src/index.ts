import Fastify from 'fastify';
import cors from '@fastify/cors';
import { zonasRoutes } from './routes/zonas';
import { horariosRoutes } from './routes/horarios';
import { preferencesRoutes } from './routes/preferences';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd });

async function bootstrap() {
  // Puerto local documentado en CLAUDE.md para el frontend de mapacyd es
  // 5175 (5174 es el de panel/) — sin CORS_ALLOWED_ORIGINS en el entorno,
  // el fallback debe apuntar al propio frontend de esta app.
  const allowedOrigins =
    process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:5175'];

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(zonasRoutes, { prefix: '/api' });
  await app.register(horariosRoutes, { prefix: '/api' });
  await app.register(preferencesRoutes, { prefix: '/api' });

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const port = Number(process.env.PORT) || 3003;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Mapacyd backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
