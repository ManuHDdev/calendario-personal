import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { filesRoutes } from './routes/files';
import { permissionsRoutes } from './routes/permissions';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from './services/fileService';

const app = Fastify({ logger: true, bodyLimit: MAX_UPLOAD_BYTES });

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

  // Multipart (subida de archivos). El tope sale de fileService, que es el
  // único sitio donde se define — ver MAX_UPLOAD_BYTES.
  await app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
    },
  });

  // Rutas
  await app.register(filesRoutes);
  await app.register(permissionsRoutes);

  // Health check (sin auth)
  app.get('/storage/api/health', async () => ({ status: 'ok' }));

  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen({ port, host });
  app.log.info(`Storage backend listening on ${host}:${port} (subida máx. ${MAX_UPLOAD_MB} MB)`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
