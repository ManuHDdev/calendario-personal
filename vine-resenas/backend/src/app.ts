import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { VIDEO_MAX_BYTES } from './domain/validation';
import { HttpError } from './errors';
import { registrarParserJsonToleranteAVacio } from './jsonBody';
import { apiRoutes } from './routes/api';
import type { AppDeps } from './routes/deps';
import { API_PREFIX } from './routes/presenters';
import { uiRoutes } from './routes/ui';

export interface BuildOptions {
  corsOrigins?: string[];
}

/** Builds the Fastify app. Everything external (DB, disk, bot, auth) comes in through `deps`. */
export async function buildApp(deps: AppDeps, options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    // Never log headers; the request serializer drops the query string because
    // media URLs may carry ?token=<jwt>.
    logger: deps.logger
      ? {
          level: 'info',
          serializers: {
            req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url.split('?')[0] }),
          },
        }
      : false,
    trustProxy: true,
  });

  registrarParserJsonToleranteAVacio(app);

  await app.register(cors, {
    origin: options.corsOrigins ?? false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(multipart, {
    limits: { fileSize: VIDEO_MAX_BYTES + 1, files: 30, fields: 10, parts: 60 },
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      return reply.code(400).send({ error: 'ValidationError', message });
    }
    const code = (err as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT' || code === 'FST_PARTS_LIMIT') {
      return reply.code(413).send({ error: 'PayloadTooLarge', message: 'Upload exceeds the allowed limits' });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'BadRequest', message: err.message });
    }
    request.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'InternalError', message: 'Internal server error' });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: 'NotFound', message: 'Route not found' });
  });

  app.get(`${API_PREFIX}/health`, async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.register(uiRoutes(deps), { prefix: `${API_PREFIX}/ui` });
  await app.register(apiRoutes(deps), { prefix: `${API_PREFIX}/v1` });

  return app;
}
