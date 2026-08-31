import Fastify from 'fastify';
import cors from '@fastify/cors';
import { busquedasRoutes } from './routes/busquedas';
import { anunciosRoutes } from './routes/anuncios';
import { arrancarPlanificador, pararPlanificador } from './services/planificador';
import { notificacionesActivas } from './telegram/notificador';
import { registrarParserJsonToleranteAVacio } from './jsonBody';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd, trustProxy: true });

// Un `Content-Type: application/json` sin cuerpo (p. ej. el botón "Buscar
// ahora", que hace POST sin body) no debe ser un 400 automático.
registrarParserJsonToleranteAVacio(app);

async function bootstrap() {
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5184'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(busquedasRoutes, { prefix: '/pisos/api' });
  await app.register(anunciosRoutes, { prefix: '/pisos/api' });

  app.get('/pisos/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const port = Number(process.env.PORT) || 3012;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Pisos backend listening on port ${port}`);

  if (!notificacionesActivas()) {
    app.log.warn(
      'TELEGRAM_BOT_TOKEN/TELEGRAM_OWNER_CHAT_ID sin configurar: se rastreará y guardará, pero no habrá avisos al móvil',
    );
  }

  // El rastreador vive dentro de este mismo proceso: mientras el contenedor
  // esté levantado, vigila solo. Ver services/planificador.ts.
  arrancarPlanificador({
    info: (msg) => app.log.info(msg),
    warn: (msg) => app.log.warn(msg),
    error: (msg) => app.log.error(msg),
  });

  for (const senal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(senal, () => {
      pararPlanificador();
      void app.close().then(() => process.exit(0));
    });
  }
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
