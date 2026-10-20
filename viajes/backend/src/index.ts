import { buildApp } from './app';
import { ensureSchema } from './db/ensureSchema';
import { pgGeocodeCache, pgRouteCache } from './db/queries';
import { createGeocoder } from './lib/geocoding';
import { defaultRoutingConfig } from './lib/routing';

async function bootstrap() {
  await ensureSchema();

  const parsedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);

  const app = await buildApp(
    {
      routing: defaultRoutingConfig(pgRouteCache),
      geocoder: createGeocoder({
        fetchFn: fetch,
        cache: pgGeocodeCache,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
      }),
    },
    {
      logger: process.env.NODE_ENV === 'production',
      corsOrigins: parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : undefined,
    },
  );

  const port = Number(process.env.PORT) || 3017;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Viajes backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
