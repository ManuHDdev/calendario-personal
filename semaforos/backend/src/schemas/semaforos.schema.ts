import { z } from 'zod';
import { NOMBRE_CIUDAD_RE } from '../services/osm';

const segundosManual = z.number().positive('Debe ser mayor que 0').max(300).nullable();

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const ciudadQuerySchema = z.object({
  ciudad: z.string().trim().min(1).max(60).optional(),
});

export const importarSchema = z
  .object({
    ciudad: z
      .string()
      .trim()
      .regex(NOMBRE_CIUDAD_RE, 'Nombre de ciudad no valido'),
  })
  .strict();

export const cruceUpdateSchema = z
  .object({ nombre: z.string().trim().min(1).max(120) })
  .strict();

export const accesoCreateSchema = z
  .object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(160),
    rumbo_grados: z.number().int().min(0).max(359).nullable().optional(),
  })
  .strict();

/** Los *_manual_s aceptan null: es la forma de quitar la correccion y volver a la mediana. */
export const accesoUpdateSchema = z
  .object({
    nombre: z.string().trim().min(1).max(160),
    rumbo_grados: z.number().int().min(0).max(359).nullable(),
    verde_manual_s: segundosManual,
    ambar_manual_s: segundosManual,
    rojo_manual_s: segundosManual,
  })
  .partial()
  .strict();

export const observacionCreateSchema = z
  .object({
    color: z.enum(['verde', 'ambar', 'rojo']),
    /**
     * Corrige el retraso al pulsar: "esto cambio hace 2 s". El tope evita que
     * un valor absurdo meta una observacion en el pasado lejano.
     */
    hace_s: z.number().min(0).max(120).optional(),
  })
  .strict();
