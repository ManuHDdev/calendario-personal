import { z } from 'zod';
import { SLUGS_CIUDAD } from '../services/ciudades';
import { esUrlHttp } from '../services/urlSeguridad';

const urlHttp = z
  .string()
  .trim()
  .max(2000)
  .refine(esUrlHttp, 'Debe ser una URL http o https');

const texto = (max: number) => z.string().trim().min(1).max(max);

const ciudad = z.enum(SLUGS_CIUDAD);

export const createCamaraSchema = z
  .object({
    nombre: texto(200),
    ciudad,
    latitud: z.number().min(-90).max(90),
    longitud: z.number().min(-180).max(180),
    carretera: texto(50).optional(),
    urlImagen: urlHttp.optional(),
    urlPagina: urlHttp.optional(),
    fuente: texto(100).optional(),
    favorita: z.boolean().optional(),
  })
  .strict()
  .refine((c) => c.urlImagen !== undefined || c.urlPagina !== undefined, {
    message: 'Indica al menos una URL de imagen o una URL de página',
    path: ['urlImagen'],
  });

// Para una cámara manual se puede editar todo; para una de la DGT solo `favorita`
// (el resto lo reescribe la siguiente importación). Esa regla vive en la ruta
// porque depende del `origen` de la fila, no del cuerpo.
export const updateCamaraSchema = z
  .object({
    nombre: texto(200),
    ciudad,
    latitud: z.number().min(-90).max(90),
    longitud: z.number().min(-180).max(180),
    carretera: texto(50).nullable(),
    urlImagen: urlHttp.nullable(),
    urlPagina: urlHttp.nullable(),
    fuente: texto(100).nullable(),
    favorita: z.boolean(),
  })
  .partial()
  .strict();

export const listCamarasQuerySchema = z
  .object({
    ciudad: ciudad.optional(),
    favorita: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type CreateCamaraInput = z.infer<typeof createCamaraSchema>;
export type UpdateCamaraInput = z.infer<typeof updateCamaraSchema>;
