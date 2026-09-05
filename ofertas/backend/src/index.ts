import Fastify from 'fastify';
import cors from '@fastify/cors';
import { searchesRoutes } from './routes/searches';
import { scraperStateRoutes } from './routes/scraperState';
import { healthRoutes } from './routes/health';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd });

async function bootstrap() {
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5178'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(searchesRoutes, { prefix: '/ofertas/api' });
  await app.register(scraperStateRoutes, { prefix: '/ofertas/api' });
  await app.register(healthRoutes, { prefix: '/ofertas/api' });

  const port = Number(process.env.PORT) || 3006;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Ofertas backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
