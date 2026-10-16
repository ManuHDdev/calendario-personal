import Fastify from 'fastify';
import cors from '@fastify/cors';
import { descargasRoutes } from './routes/descargas';
import { redactUrl } from './services/redact';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({
  logger: isProd
    ? {
        // Media URLs carry the Keycloak access token in `?token=`: keep it out of the logs.
        serializers: {
          req(req) {
            return { method: req.method, url: redactUrl(req.url), remoteAddress: req.ip };
          },
        },
      }
    : false,
});

async function bootstrap() {
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5190'];

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
    credentials: true,
  });

  await app.register(descargasRoutes, { prefix: '/descargas/api' });

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  const port = Number(process.env.PORT) || 3016;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Descargas backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
