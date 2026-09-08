import Fastify from 'fastify';
import cors from '@fastify/cors';
import { rutasViabilidad } from './routes/viabilidad';
import { rutasNormativa } from './routes/normativa';
import { rutasPadron } from './routes/padron';
import { rutasBusquedas } from './routes/searches';
import { rutasAnuncios } from './routes/listings';
import { rutasScraper } from './routes/scraper';
import { arrancarPlanificador, pararPlanificador } from './services/planificador';
import { iniciarBot, pararBot } from './telegram/bot';
import { registrarParserJsonToleranteAVacio } from './jsonBody';
import { padronVacio } from './padron/importar';
import { getMotor } from './viabilidad/motor';
import { topeDiario } from './viabilidad/presupuesto';
import { pool } from './db/pool';

const isProd = process.env.NODE_ENV === 'production';
// En producción se loguea todo, como en `pisos`. En desarrollo se baja a
// `warn` en vez de apagarlo del todo: los dos avisos de arranque de esta app
// (padrón vacío, motor mal configurado) son justo los que no puedes no ver.
const app = Fastify({ logger: isProd ? true : { level: 'warn' }, trustProxy: true });

registrarParserJsonToleranteAVacio(app);

async function bootstrap() {
  const defaultOrigins = ['https://elbunkerdelingeniero.duckdns.org', 'http://localhost:5185'];
  const parsedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  const allowedOrigins = parsedOrigins && parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.register(rutasViabilidad);
  await app.register(rutasNormativa);
  await app.register(rutasPadron);
  await app.register(rutasBusquedas);
  await app.register(rutasAnuncios);
  await app.register(rutasScraper);

  app.get('/locales/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const port = Number(process.env.PORT) || 3013;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Locales backend listening on port ${port}`);

  // Qué motor de distancias se va a usar, dicho en voz alta: es la diferencia
  // entre depender de una cuota externa y no depender de nadie, y conviene
  // verlo en el log en vez de deducirlo.
  try {
    const motor = getMotor();
    const tope = topeDiario(motor.nombre);
    app.log.info(
      `Motor de distancias: ${motor.nombre}` +
        (tope === null ? ' (sin cuota diaria)' : ` (tope diario ${tope} peticiones)`),
    );
  } catch (err) {
    app.log.error(
      `Motor de distancias mal configurado: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Un padrón vacío no es un detalle: sin farmacias cargadas NINGÚN veredicto
  // vale, y la app lo dice en vez de contestar verdes vacíos.
  try {
    if (await padronVacio()) {
      app.log.warn(
        'El padrón de farmacias está VACÍO. Hasta importarlo (`npm run padron -- <comunidad>`) ' +
          'toda comprobación devolverá "sin datos", que es lo correcto: un padrón vacío no ' +
          'demuestra que no haya farmacias cerca.',
      );
    }
  } catch (err) {
    app.log.error(`No se pudo consultar el padrón: ${err instanceof Error ? err.message : String(err)}`);
  }

  iniciarBot({ info: (m) => app.log.info(m), warn: (m) => app.log.warn(m) });

  arrancarPlanificador({
    info: (m) => app.log.info(m),
    warn: (m) => app.log.warn(m),
    error: (m) => app.log.error(m),
  });

  for (const senal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(senal, () => {
      pararBot();
      pararPlanificador();
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
