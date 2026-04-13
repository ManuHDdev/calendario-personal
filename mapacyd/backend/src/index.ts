import Fastify from 'fastify';
import cors from '@fastify/cors';
import { zonasRoutes } from './routes/zonas';
import { horariosRoutes } from './routes/horarios';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd });

async function bootstrap() {
  const allowedOrigins =
    process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:5174'];

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(zonasRoutes, { prefix: '/api' });
  await app.register(horariosRoutes, { prefix: '/api' });

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
