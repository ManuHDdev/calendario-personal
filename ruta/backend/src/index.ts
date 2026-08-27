import Fastify from 'fastify';
import cors from '@fastify/cors';
import { searchRoutes } from './routes/search';
import { savedSearchesRoutes } from './routes/searches';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd, trustProxy: true });

async function bootstrap() {
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5183'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(searchRoutes, { prefix: '/ruta/api' });
  await app.register(savedSearchesRoutes, { prefix: '/ruta/api' });

  app.get('/ruta/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const port = Number(process.env.PORT) || 3011;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Ruta backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
