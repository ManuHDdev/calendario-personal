import { z } from 'zod';

const siteConfigSchema = z.object({
  enabled: z.boolean(),
});

export const sitiosSchema = z
  .object({
    wallapop: siteConfigSchema,
    milanuncios: siteConfigSchema,
    vinted: siteConfigSchema,
  })
  .strict();

const busquedaBaseSchema = z.object({
  nombre: z.string().min(1, 'nombre es obligatorio').max(200),
  keyword: z.string().min(1, 'keyword es obligatorio').max(200),
  precio_min: z.number().nonnegative().nullable().optional(),
  precio_max: z.number().nonnegative().nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  distance_km: z.number().positive(),
  milanuncios_province_slug: z.string().max(100).nullable().optional(),
  language_filter: z.string().length(2).nullable().optional(),
  console_only: z.boolean().optional(),
  sitios: sitiosSchema,
});

/** precio_min no puede ser mayor que precio_max cuando ambos están presentes. */
function preciosValidos(data: { precio_min?: number | null; precio_max?: number | null }): boolean {
  if (data.precio_min == null || data.precio_max == null) return true;
  return data.precio_min <= data.precio_max;
}

export const createBusquedaSchema = busquedaBaseSchema.refine(preciosValidos, {
  message: 'precio_min no puede ser mayor que precio_max',
  path: ['precio_min'],
});

export const updateBusquedaSchema = busquedaBaseSchema
  .partial()
  .strict()
  .refine(preciosValidos, {
    message: 'precio_min no puede ser mayor que precio_max',
    path: ['precio_min'],
  });

export type CreateBusquedaInput = z.infer<typeof createBusquedaSchema>;
export type UpdateBusquedaInput = z.infer<typeof updateBusquedaSchema>;
