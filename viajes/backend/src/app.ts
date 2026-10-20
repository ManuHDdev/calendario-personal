import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { tripsRoutes } from './routes/trips';
import { toolsRoutes } from './routes/tools';
import { exportsRoutes } from './routes/exports';
import type { AppDeps } from './routes/context';

export interface BuildAppOptions {
  logger?: boolean;
  corsOrigins?: string[];
}

/** Builds the Fastify instance; dependencies are injected so tests can use fakes. */
export async function buildApp(deps: AppDeps, options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(cors, {
    origin: options.corsOrigins ?? ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5192'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  await app.register(async (api) => {
    await tripsRoutes(api, deps);
    await toolsRoutes(api, deps);
    await exportsRoutes(api);
    api.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  }, { prefix: '/viajes/api' });

  return app;
}
