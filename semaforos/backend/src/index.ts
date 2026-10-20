import Fastify from 'fastify';
import cors from '@fastify/cors';
import { semaforosRoutes } from './routes/semaforos';
import { ensureSchema } from './db/ensureSchema';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd, trustProxy: true });

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

  // Un fallo interno (BD caida, bug) no debe filtrar su mensaje al cliente: el
  // detalle va al log y la respuesta es siempre la misma. Los 4xx (validacion,
  // auth) conservan su mensaje, que es nuestro.
  app.setErrorHandler((err, request, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
    }
    return reply.code(status).send({ error: err.message, statusCode: status });
  });

  await ensureSchema();

  await app.register(semaforosRoutes, { prefix: '/semaforos/api' });

  app.get('/semaforos/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const port = Number(process.env.PORT) || 3017;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Semaforos backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

