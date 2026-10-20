import Fastify from 'fastify';
import cors from '@fastify/cors';
import { camarasRoutes } from './routes/camaras';
import { ensureSchema } from './db/ensureSchema';
import { arrancarImportador } from './services/importador';
import { redactUrl } from './services/redact';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({
  logger: isProd
    ? {
        // La imagen de cada cámara se pide con el access token de Keycloak en `?token=`: fuera de los logs.
        serializers: {
          req(req) {
            return { method: req.method, url: redactUrl(req.url), remoteAddress: req.ip };
          },
        },
      }
    : false,
});

async function bootstrap() {
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5191'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Reconcilia una base de datos ya existente con init.sql antes de servir.
  await ensureSchema();

  await app.register(camarasRoutes, { prefix: '/camaras/api' });

  app.get('/camaras/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const port = Number(process.env.PORT) || 3017;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Camaras backend listening on port ${port}`);

  // Sin await: la primera importación puede tardar y no debe retrasar el arranque.
  arrancarImportador(app.log).catch((err) => app.log.error(`No se pudo arrancar el importador: ${String(err)}`));
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
