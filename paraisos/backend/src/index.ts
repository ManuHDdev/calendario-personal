import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { spotsRoutes } from './routes/spots';
import { imagesRoutes } from './routes/images';
import { routeDistanceRoutes } from './routes/route';
import { seedLegacyImages } from './services/imageService';

const isProd = process.env.NODE_ENV === 'production';
// trustProxy: necesario para que request.ip refleje al visitante real (dos saltos de
// nginx delante) en vez de la IP interna del contenedor paraisos-frontend — usado por
// el limitador por IP de /route-distance.
const app = Fastify({ logger: isProd, trustProxy: true });

const MB = 1024 * 1024;

async function bootstrap() {
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5179'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Multipart (subida de imágenes) con límite 8 MB
  await app.register(multipart, {
    limits: {
      fileSize: 8 * MB,
    },
  });

  await app.register(spotsRoutes, { prefix: '/paraisos/api' });
  await app.register(imagesRoutes, { prefix: '/paraisos/api' });
  await app.register(routeDistanceRoutes, { prefix: '/paraisos/api' });

  app.get('/paraisos/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // Copia las imágenes legado al volumen persistente en el primer arranque
  seedLegacyImages();

  const port = Number(process.env.PORT) || 3007;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Paraisos backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
