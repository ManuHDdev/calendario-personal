import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { filesRoutes } from './routes/files';

const MB = 1024 * 1024;
const BODY_LIMIT = 500 * MB;

const app = Fastify({ logger: true, bodyLimit: BODY_LIMIT });

async function bootstrap() {
  // CORS — sólo el dominio de producción (y localhost para dev)
  await app.register(cors, {
    origin: [
      'https://elbunkerdelingeniero.duckdns.org',
      'http://localhost:5173',
    ],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition'],
    credentials: true,
  });

  // Multipart (subida de archivos) con límite 500 MB
  await app.register(multipart, {
    limits: {
      fileSize: BODY_LIMIT,
    },
  });

  // Rutas
  await app.register(filesRoutes);

  // Health check (sin auth)
  app.get('/storage/api/health', async () => ({ status: 'ok' }));

  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen({ port, host });
  app.log.info(`Storage backend listening on ${host}:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
