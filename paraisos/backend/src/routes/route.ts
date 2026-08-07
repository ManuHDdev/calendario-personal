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

      const apiKey = process.env.ORS_API_KEY;
      if (!apiKey) {
        return reply.code(503).send({ error: 'Servicio de rutas no configurado', statusCode: 503 });
      }

      try {
        const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${encodeURIComponent(apiKey)}&start=${fromLngNum},${fromLatNum}&end=${toLngNum},${toLatNum}`;
        const res = await fetch(url);

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

        return reply.send({
          distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
          durationMin: Math.round(durationSeconds / 60),
        });
      } catch {
        return reply.code(502).send({ error: 'No se pudo calcular la ruta', statusCode: 502 });
      }
    },
  );
}
