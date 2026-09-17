import Fastify from 'fastify';
import cors from '@fastify/cors';
import { preciosViviendaRoutes } from './routes/preciosVivienda';
import { arrancarImportador } from './services/importador';
import { arrancarScraperCapitales } from './services/capitalScraper';
import { ensureSchemaCapitales } from './services/ensureSchemaCapitales';

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

  const log = {
    info: (msg: string) => app.log.info(msg),
    warn: (msg: string) => app.log.warn(msg),
    error: (msg: string) => app.log.error(msg),
  };

  await arrancarImportador(log);

  // Asegura las tablas del scraper de capitales ANTES de arrancarlo — ver el
  // comentario de ensureSchemaCapitales.ts sobre por qué init.sql no basta
  // en producción (el volumen de finanzas-db ya existe con datos reales).
  await ensureSchemaCapitales();
  await arrancarScraperCapitales(log);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
