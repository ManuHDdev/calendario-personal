import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { comprobarSchema } from '../schemas/locales.schema';
import { resolverConsulta } from '../services/comprobacion';
import { AVISO_NO_CERTIFICA } from '../viabilidad';
import { estadoPresupuesto } from '../viabilidad/presupuesto';
import { getMotor } from '../viabilidad/motor';
import { GeocodingError } from '../services/geocoding';

export async function rutasViabilidad(app: FastifyInstance): Promise<void> {
  /**
   * Comprobación puntual: la usa el botón de la UI y el bot de Telegram.
   *
   * Es la vía para resolver un ámbar: se le pasa la dirección exacta con
   * número y el margen de incertidumbre del punto baja a cero.
   */
  app.post(
    '/locales/api/viabilidad/comprobar',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply) => {
      const parsed = comprobarSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Bad Request', detalles: parsed.error.issues });
      }

      try {
        const { punto, resultado } = await resolverConsulta(parsed.data);
        return {
          punto,
          veredicto: resultado.veredicto,
          motivo: resultado.motivo,
          farmaciaMasCercana: resultado.farmaciaMasCercana,
          centroMasCercano: resultado.centroMasCercano,
          farmacias: resultado.farmacias,
          centros: resultado.centros,
          umbrales: resultado.umbrales,
          motor: resultado.motor,
          calculadoEn: resultado.calculadoEn,
          aviso: AVISO_NO_CERTIFICA,
        };
      } catch (err) {
        if (err instanceof GeocodingError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  /** Cuánta cuota de motor de rutas queda hoy. */
  app.get(
    '/locales/api/viabilidad/presupuesto',
    { preHandler: authMiddleware(['admin']) },
    async () => estadoPresupuesto(getMotor().nombre),
  );
}
