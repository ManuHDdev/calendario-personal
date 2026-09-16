import Fastify from 'fastify';
import cors from '@fastify/cors';
import { mensajeriaRoutes } from './routes/mensajeria';
import { startFakeSmtpServer } from './services/fakeSmtpServer';

const isProd = process.env.NODE_ENV === 'production';
const app = Fastify({ logger: isProd });

async function bootstrap() {
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5188'];

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(mensajeriaRoutes, { prefix: '/mensajeria/api' });

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: process.env.MENSAJERIA_MODE === 'real' ? 'real' : 'mock',
  }));

  const port = Number(process.env.PORT) || 3015;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Mensajería backend listening on port ${port}`);

  // El SMTP falso siempre está arriba (es infraestructura mock, no algo que
  // se apague en modo real): en real, el email de verdad sale por SendGrid,
  // pero este socket sigue disponible por si algún canal se queda en mock.
  const smtpPort = Number(process.env.MENSAJERIA_SMTP_PORT) || 2525;
  startFakeSmtpServer(smtpPort, {
    info: (msg) => app.log.info(msg),
    error: (msg) => app.log.error(msg),
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
