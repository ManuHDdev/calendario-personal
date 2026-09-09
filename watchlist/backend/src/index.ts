import Fastify from 'fastify';
import cors from '@fastify/cors';
import { itemsRoutes } from './routes/items';
import { searchRoutes } from './routes/search';
import { usageRoutes } from './routes/usage';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd });

async function bootstrap() {
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5181'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(itemsRoutes, { prefix: '/watchlist/api' });
  await app.register(searchRoutes, { prefix: '/watchlist/api' });
  await app.register(usageRoutes, { prefix: '/watchlist/api' });

  app.get('/watchlist/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const port = Number(process.env.PORT) || 3009;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Watchlist backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
