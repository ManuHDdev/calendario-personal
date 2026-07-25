import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { gastosRoutes } from './routes/gastos';
import { startBot } from './telegram/bot';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd });

async function bootstrap() {
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5177'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Límite generoso pero acotado para fotos de tickets/capturas bancarias.
  await app.register(multipart, {
    limits: { fileSize: 15 * 1024 * 1024 },
  });

  await app.register(gastosRoutes, { prefix: '/gastos/api' });

  app.get('/gastos/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const port = Number(process.env.PORT) || 3005;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Gastos backend listening on port ${port}`);

  // Bot de Telegram: long polling en el mismo proceso que Fastify (ver
  // design.md). Si no hay token configurado (tests, o mientras el
  // propietario todavía no ha creado el bot vía @BotFather) se omite el
  // arranque sin romper el servidor HTTP.
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      startBot();
      app.log.info('Bot de Telegram iniciado (long polling)');
    } catch (err) {
      app.log.error({ err }, 'No se pudo iniciar el bot de Telegram');
    }
  } else {
    app.log.warn('TELEGRAM_BOT_TOKEN no configurado: bot de Telegram deshabilitado');
  }
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
