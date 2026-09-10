import { z } from 'zod';
import { PORTALES, TIPOS } from '../types/pisos';

const portalConfigSchema = z.object({ enabled: z.boolean() });

/**
 * `.strict()` para que un portal que ya no existe (o uno mal escrito) sea un
 * 400 explícito y no una clave que se guarda en el JSONB y nadie vuelve a
 * mirar.
 */
export const portalesSchema = z
  .object(
    Object.fromEntries(PORTALES.map((p) => [p, portalConfigSchema])) as Record<
      (typeof PORTALES)[number],
      typeof portalConfigSchema
    >,
  )
  .strict();

const enteroPositivo = z.number().int().positive();

const busquedaBaseSchema = z.object({
  nombre: z.string().min(1, 'nombre es obligatorio').max(200),
  // `vivienda` | `local`, excluyentes. Sin `tipo` en el alta ⇒ `vivienda`, que
  // es como se comportaba todo antes de esta feature.
  tipo: z.enum(TIPOS).default('vivienda'),
  ubicacion: z.string().min(1, 'ubicacion es obligatoria').max(200),

  latitud: z.number().min(-90).max(90).nullable().optional(),
  longitud: z.number().min(-180).max(180).nullable().optional(),
  radio_km: z.number().positive().max(200).nullable().optional(),

  precio_min: z.number().nonnegative().nullable().optional(),
  precio_max: z.number().nonnegative().nullable().optional(),
  metros_min: enteroPositivo.nullable().optional(),
  metros_max: enteroPositivo.nullable().optional(),
  habitaciones_min: z.number().int().nonnegative().max(20).nullable().optional(),
  banos_min: z.number().int().nonnegative().max(10).nullable().optional(),

  exige_ascensor: z.boolean().optional(),
  exige_garaje: z.boolean().optional(),
  exige_terraza: z.boolean().optional(),

  excluir_palabras: z.string().max(500).nullable().optional(),
  portales: portalesSchema,
  habilitada: z.boolean().optional(),
  notificar: z.boolean().optional(),
});

type RangoNumerico = { min?: number | null; max?: number | null };

function rangoValido({ min, max }: RangoNumerico): boolean {
  if (min == null || max == null) return true;
  return min <= max;
}

interface CamposZona {
  latitud?: number | null;
  longitud?: number | null;
  radio_km?: number | null;
}

/**
 * Espeja el CHECK `zona_wallapop_completa` de init.sql: media coordenada no
 * describe ninguna zona. En un PATCH parcial solo se comprueba si se toca
 * alguno de los tres campos.
 */
function zonaCoherente(data: CamposZona): boolean {
  const tocados = ['latitud', 'longitud', 'radio_km'].filter(
    (k) => data[k as keyof CamposZona] !== undefined,
  );
  if (tocados.length === 0) return true;
  if (tocados.length !== 3) return false;
  const conValor = [data.latitud, data.longitud, data.radio_km].filter((v) => v !== null).length;
  return conValor === 0 || conValor === 3;
}

interface CamposComprobables extends CamposZona {
  precio_min?: number | null;
  precio_max?: number | null;
  metros_min?: number | null;
  metros_max?: number | null;
}

const REFINO_PRECIO = {
  check: (d: CamposComprobables) => rangoValido({ min: d.precio_min, max: d.precio_max }),
  opts: { message: 'precio_min no puede ser mayor que precio_max', path: ['precio_min'] },
};
const REFINO_METROS = {
  check: (d: CamposComprobables) => rangoValido({ min: d.metros_min, max: d.metros_max }),
  opts: { message: 'metros_min no puede ser mayor que metros_max', path: ['metros_min'] },
};
const REFINO_ZONA = {
  check: (d: CamposComprobables) => zonaCoherente(d),
  opts: {
    message: 'latitud, longitud y radio_km deben enviarse los tres juntos (o los tres a null)',
    path: ['latitud'],
  },
};

export const createBusquedaSchema = busquedaBaseSchema
  .refine(REFINO_PRECIO.check, REFINO_PRECIO.opts)
  .refine(REFINO_METROS.check, REFINO_METROS.opts)
  .refine(REFINO_ZONA.check, REFINO_ZONA.opts);

/**
 * `.omit({ tipo })` ANTES de `.partial()`: con `.strict()`, mandar `tipo` en un
 * PATCH es un 400 (`Unrecognized key`) en vez de un campo ignorado — el tipo es
 * inmutable porque los anuncios ya vinculados serían del tipo equivocado. Omitir
 * antes de `partial` evita además que el `.default('vivienda')` se cuele en cada
 * actualización parcial.
 */
export const updateBusquedaSchema = busquedaBaseSchema
  .omit({ tipo: true })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Se debe enviar al menos un campo a actualizar',
  })
  .refine(REFINO_PRECIO.check, REFINO_PRECIO.opts)
  .refine(REFINO_METROS.check, REFINO_METROS.opts)
  .refine(REFINO_ZONA.check, REFINO_ZONA.opts);

export const updateAnuncioSchema = z
  .object({
    visto: z.boolean().optional(),
    descartado: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Se debe enviar al menos un campo a actualizar',
  });

export const updateScraperStateSchema = z.object({ running: z.boolean() }).strict();

export type CreateBusquedaInput = z.infer<typeof createBusquedaSchema>;
export type UpdateBusquedaInput = z.infer<typeof updateBusquedaSchema>;
export type UpdateAnuncioInput = z.infer<typeof updateAnuncioSchema>;
