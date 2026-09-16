import Fastify from 'fastify';
import cors from '@fastify/cors';
import { preciosViviendaRoutes } from './routes/preciosVivienda';
import { arrancarImportador } from './services/importador';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd });

async function bootstrap() {
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5187'];

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(preciosViviendaRoutes, { prefix: '/finanzas/api' });

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const port = Number(process.env.PORT) || 3014;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Finanzas backend listening on port ${port}`);

  await arrancarImportador({
    info: (msg) => app.log.info(msg),
    warn: (msg) => app.log.warn(msg),
    error: (msg) => app.log.error(msg),
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
