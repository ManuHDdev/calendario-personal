import Fastify from 'fastify';
import cors from '@fastify/cors';
import { usersRoutes } from './routes/users';
import { meRoutes } from './routes/me';
import { usageRoutes } from './routes/usage';

const app = Fastify({ logger: true });

async function bootstrap() {
  await app.register(cors, {
    origin: [
      'https://elbunkerdelingeniero.duckdns.org',
      'http://localhost:5174',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(usersRoutes);
  await app.register(meRoutes);
  await app.register(usageRoutes);

  app.get('/panel/api/health', async () => ({ status: 'ok' }));

  const port = Number(process.env.PORT) || 3002;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Panel backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
