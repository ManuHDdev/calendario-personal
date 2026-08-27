import { z } from 'zod';
import { MAX_DETOUR_KM } from '../services/corridor';

const coordinate = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * The detour ceiling is not cosmetic: `planCorridor` needs a search radius
 * strictly larger than the detour, and Wallapop's usable radius tops out at
 * 100 km. Capping here keeps that invariant enforced at the edge.
 */
const detourKm = z
  .number()
  .positive('El desvio maximo debe ser mayor que 0')
  .max(MAX_DETOUR_KM, `El desvio maximo no puede superar ${MAX_DETOUR_KM} km`);

const priceBounds = {
  min_price: z.number().nonnegative().nullable().optional(),
  max_price: z.number().nonnegative().nullable().optional(),
};

/** A max below the min silently returns nothing, so reject it up front. */
const coherentPrices = <T extends { min_price?: number | null; max_price?: number | null }>(
  schema: z.ZodType<T>,
) =>
  schema.refine(
    (data) =>
      data.min_price === undefined ||
      data.min_price === null ||
      data.max_price === undefined ||
      data.max_price === null ||
      data.min_price <= data.max_price,
    { message: 'El precio minimo no puede ser mayor que el maximo' },
  );

export const routeSearchSchema = coherentPrices(
  z.object({
    origen: coordinate,
    destino: coordinate,
    keyword: z.string().trim().min(2, 'Escribe al menos 2 caracteres de busqueda').max(120),
    desvio_max_km: detourKm,
    ...priceBounds,
    excluir_palabras: z.string().max(500).nullable().optional(),
  }),
);

export const savedSearchCreateSchema = coherentPrices(
  z.object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
    origen_texto: z.string().trim().min(1, 'El origen es obligatorio').max(250),
    origen_lat: z.number().min(-90).max(90),
    origen_lng: z.number().min(-180).max(180),
    destino_texto: z.string().trim().min(1, 'El destino es obligatorio').max(250),
    destino_lat: z.number().min(-90).max(90),
    destino_lng: z.number().min(-180).max(180),
    keyword: z.string().trim().min(2, 'Escribe al menos 2 caracteres de busqueda').max(120),
    desvio_max_km: detourKm,
    ...priceBounds,
    excluir_palabras: z.string().max(500).nullable().optional(),
  }),
);

export const savedSearchUpdateSchema = coherentPrices(
  z
    .object({
      nombre: z.string().trim().min(1).max(120).optional(),
      origen_texto: z.string().trim().min(1).max(250).optional(),
      origen_lat: z.number().min(-90).max(90).optional(),
      origen_lng: z.number().min(-180).max(180).optional(),
      destino_texto: z.string().trim().min(1).max(250).optional(),
      destino_lat: z.number().min(-90).max(90).optional(),
      destino_lng: z.number().min(-180).max(180).optional(),
      keyword: z.string().trim().min(2).max(120).optional(),
      desvio_max_km: detourKm.optional(),
      ...priceBounds,
      excluir_palabras: z.string().max(500).nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Se debe enviar al menos un campo a actualizar',
    }),
);

export type RouteSearchBody = z.infer<typeof routeSearchSchema>;
export type SavedSearchCreateBody = z.infer<typeof savedSearchCreateSchema>;
export type SavedSearchUpdateBody = z.infer<typeof savedSearchUpdateSchema>;
