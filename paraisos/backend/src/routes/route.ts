import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface RouteDistanceQuery {
  fromLat?: string;
  fromLng?: string;
  toLat?: string;
  toLng?: string;
}

interface OrsSummary {
  distance: number;
  duration: number;
}

interface OrsResponse {
  features?: Array<{
    properties?: {
      summary?: OrsSummary;
    };
  }>;
}

interface RouteResult {
  distanceKm: number;
  durationMin: number;
}

/**
 * Limite diario propio, por debajo del limite real del plan gratuito de ORS
 * (2500/dia) para fallar limpio con un 503 antes de que ORS bloquee la key.
 */
const DAILY_CAP = 2000;
let dailyCount = 0;
let dailyResetDate = new Date().toISOString().slice(0, 10);

function underDailyCap(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyResetDate) {
    dailyResetDate = today;
    dailyCount = 0;
  }
  return dailyCount < DAILY_CAP;
}

/** Limite por IP: max 20 peticiones cada 5 minutos, ventana deslizante en memoria. */
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const requestsByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestsByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    requestsByIp.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  requestsByIp.set(ip, timestamps);
  return false;
}

/** Cache de resultados (coords redondeadas a ~100m) 6h, evita repetir llamadas a ORS. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { result: RouteResult; expires: number }>();

function cacheKey(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  const r = (n: number) => n.toFixed(3);
  return `${r(fromLat)},${r(fromLng)}|${r(toLat)},${r(toLng)}`;
}

export async function routeDistanceRoutes(app: FastifyInstance): Promise<void> {
  // GET /route-distance — distancia y duracion por carretera entre dos puntos (publico, sin auth)
  app.get(
    '/route-distance',
    async (request: FastifyRequest<{ Querystring: RouteDistanceQuery }>, reply: FastifyReply) => {
      const { fromLat, fromLng, toLat, toLng } = request.query;

      const fromLatNum = Number(fromLat);
      const fromLngNum = Number(fromLng);
      const toLatNum = Number(toLat);
      const toLngNum = Number(toLng);

      if (
        fromLat === undefined ||
        fromLng === undefined ||
        toLat === undefined ||
        toLng === undefined ||
        Number.isNaN(fromLatNum) ||
        Number.isNaN(fromLngNum) ||
        Number.isNaN(toLatNum) ||
        Number.isNaN(toLngNum)
      ) {
        return reply.code(400).send({ error: 'fromLat, fromLng, toLat y toLng son obligatorios y deben ser numeros', statusCode: 400 });
      }

      if (isRateLimited(request.ip)) {
        return reply.code(429).send({ error: 'Demasiadas peticiones, intentalo en unos minutos', statusCode: 429 });
      }

      const key = cacheKey(fromLatNum, fromLngNum, toLatNum, toLngNum);
      const cached = cache.get(key);
      if (cached && cached.expires > Date.now()) {
        return reply.send(cached.result);
      }

      const apiKey = process.env.ORS_API_KEY;
      if (!apiKey) {
        return reply.code(503).send({ error: 'Servicio de rutas no configurado', statusCode: 503 });
      }

      if (!underDailyCap()) {
        return reply.code(503).send({ error: 'Limite diario de calculo de rutas alcanzado, disponible manana', statusCode: 503 });
      }

      try {
        const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${encodeURIComponent(apiKey)}&start=${fromLngNum},${fromLatNum}&end=${toLngNum},${toLatNum}`;
        const res = await fetch(url);
        dailyCount++;

        if (!res.ok) {
          return reply.code(502).send({ error: 'No se pudo calcular la ruta', statusCode: 502 });
        }

        const body = (await res.json()) as OrsResponse;
        const summary = body?.features?.[0]?.properties?.summary;
        const distanceMeters = summary?.distance;
        const durationSeconds = summary?.duration;

        if (typeof distanceMeters !== 'number' || typeof durationSeconds !== 'number') {
          return reply.code(502).send({ error: 'No se pudo calcular la ruta', statusCode: 502 });
        }

        const result: RouteResult = {
          distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
          durationMin: Math.round(durationSeconds / 60),
        };
        cache.set(key, { result, expires: Date.now() + CACHE_TTL_MS });
        return reply.send(result);
      } catch {
        return reply.code(502).send({ error: 'No se pudo calcular la ruta', statusCode: 502 });
      }
    },
  );
}
