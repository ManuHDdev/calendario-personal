import { buildApp } from './app';
import { pool } from './db/pool';
import { ensureSchema } from './db/ensureSchema';
import { PgProductRepository } from './db/repository';
import { authMiddleware } from './middleware/auth';
import { apiTokenMiddleware } from './middleware/bearerAuth';
import { FsFileStore } from './services/fileStore';
import { defaultBotFetcher } from './services/syncService';

const READ_ROLES = ['admin', 'vine_admin', 'vine_invitado'];
const WRITE_ROLES = ['admin', 'vine_admin'];

async function bootstrap() {
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5193'];
  const parsed = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  const corsOrigins = parsed && parsed.length > 0 ? parsed : defaultOrigins;

  await ensureSchema();

  const apiToken = process.env.VINE_API_TOKEN;
  const store = new FsFileStore(process.env.DATA_DIR || '/data');

  const app = await buildApp(
    {
      repo: new PgProductRepository(pool),
      store,
      fetcher: defaultBotFetcher,
      syncConfig: () => ({
        botUrl: process.env.VINE_BOT_URL || 'http://vine-bot:8092',
        botToken: process.env.VINE_BOT_TOKEN || undefined,
      }),
      auth: {
        read: authMiddleware(READ_ROLES),
        readMedia: authMiddleware(READ_ROLES, { allowQueryToken: true }),
        write: authMiddleware(WRITE_ROLES),
        api: apiTokenMiddleware(),
      },
      logger: true,
    },
    { corsOrigins },
  );

  if (!apiToken) {
    app.log.warn('VINE_API_TOKEN is not set: every /vine-resenas/api/v1 request will be rejected with 401.');
  } else if (apiToken.length < 24) {
    app.log.warn('VINE_API_TOKEN is shorter than 24 characters; use a long random value.');
  }

  const port = Number(process.env.PORT) || 3018;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`vine-resenas backend listening on ${port}, media in ${store.mediaRoot}`);

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void app.close().then(async () => {
        await pool.end().catch(() => undefined);
        process.exit(0);
      });
    });
  }
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
