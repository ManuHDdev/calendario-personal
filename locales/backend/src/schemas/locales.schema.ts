import { z } from 'zod';

/** Un punto puede llegar como coordenadas o como dirección de texto. */
export const comprobarSchema = z
  .object({
    latitud: z.number().min(-90).max(90).optional(),
    longitud: z.number().min(-180).max(180).optional(),
    direccion: z.string().trim().min(3).max(300).optional(),
    comunidad: z.string().trim().min(2).max(40).optional(),
    provincia: z.string().trim().min(2).max(60).optional(),
    municipio: z.string().trim().min(1).max(80).optional(),
    comprobarFarmacias: z.boolean().optional(),
    comprobarCentrosSanitarios: z.boolean().optional(),
    distanciaFarmaciasM: z.number().int().positive().max(10_000).nullable().optional(),
    distanciaCentrosSanitariosM: z.number().int().positive().max(10_000).nullable().optional(),
  })
  .refine(
    (v) => (v.latitud !== undefined && v.longitud !== undefined) || v.direccion !== undefined,
    { message: 'Hacen falta latitud y longitud, o bien una dirección' },
  );

export type ComprobarInput = z.infer<typeof comprobarSchema>;

export const normativaPatchSchema = z.object({
  distanciaFarmaciasM: z.number().int().positive().max(10_000).optional(),
  distanciaCentrosSanitariosM: z.number().int().positive().max(10_000).nullable().optional(),
  verificado: z.boolean().optional(),
  fuenteUrl: z.string().url().max(500).nullable().optional(),
  notas: z.string().max(2000).nullable().optional(),
});

export const scraperStateSchema = z.object({ running: z.boolean() });
