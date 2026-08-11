import Fastify from 'fastify';
import cors from '@fastify/cors';
import { groupsRoutes } from './routes/groups';
import { expensesRoutes } from './routes/expenses';
import { balancesRoutes } from './routes/balances';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd });

async function bootstrap() {
  if (!process.env.REPARTO_GROUP_TOKEN_SECRET) {
    throw new Error('REPARTO_GROUP_TOKEN_SECRET no está configurado — obligatorio para firmar tokens de sesión de grupo');
  }

  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5182'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(groupsRoutes, { prefix: '/reparto/api' });
  await app.register(expensesRoutes, { prefix: '/reparto/api' });
  await app.register(balancesRoutes, { prefix: '/reparto/api' });

  app.get('/reparto/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const port = Number(process.env.PORT) || 3010;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Reparto backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
