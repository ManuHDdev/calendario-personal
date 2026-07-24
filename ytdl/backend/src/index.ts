import Fastify from 'fastify';
import cors from '@fastify/cors';
import { downloadRoutes } from './routes/download';

const app = Fastify({ logger: true });

async function bootstrap() {
  // CORS — sólo el dominio de producción (y localhost para dev), igual que el resto de subapps.
  // Se recorta cada origen (por si la lista viene como "a, b" con espacios) y se
  // descartan entradas vacías: un CORS_ORIGIN='' no debe producir una lista que
  // no matchee nada silenciosamente, sino caer en el default.
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5176'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
    credentials: true,
  });

  await app.register(downloadRoutes);

  // Health check (sin auth)
  app.get('/ytdl/api/health', async () => ({ status: 'ok' }));

  const port = Number(process.env.PORT) || 3004;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen({ port, host });
  app.log.info(`ytdl backend listening on ${host}:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
