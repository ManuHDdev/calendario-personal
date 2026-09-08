import { z } from 'zod';
import { PORTALES_POR_TIPO } from '../portales';

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

// ---------------------------------------------------------------------------
// Búsquedas guardadas
// ---------------------------------------------------------------------------

const geoFields = {
  comunidad: z.string().trim().min(2).max(40).nullish(),
  provincia: z.string().trim().min(2).max(60).nullish(),
  municipio: z.string().trim().min(1).max(80).nullish(),
  zona_texto: z.string().trim().min(1).max(120).nullish(),
  latitud: z.number().min(-90).max(90).nullish(),
  longitud: z.number().min(-180).max(180).nullish(),
  radio_km: z.number().int().positive().max(200).nullish(),
};

const viabFields = {
  comprobar_farmacias: z.boolean().optional(),
  comprobar_centros_sanitarios: z.boolean().optional(),
  distancia_farmacias_m: z.number().int().positive().max(10_000).nullish(),
  distancia_centros_sanitarios_m: z.number().int().positive().max(10_000).nullish(),
  habilitada: z.boolean().optional(),
  notificar: z.boolean().optional(),
};

const nombre = z.string().trim().min(1, 'nombre es obligatorio').max(200);

const portalesDe = (tipo: 'local' | 'farmacia') =>
  z
    .array(z.string())
    .min(1, 'hace falta al menos un portal')
    .refine(
      (ps) => ps.every((p) => PORTALES_POR_TIPO[tipo].includes(p)),
      { message: `portales válidos para "${tipo}": ${PORTALES_POR_TIPO[tipo].join(', ')}` },
    );

const localFields = {
  ...geoFields,
  ...viabFields,
  precio_min: z.number().nonnegative().nullish(),
  precio_max: z.number().nonnegative().nullish(),
  superficie_min: z.number().int().positive().max(100_000).nullish(),
  superficie_max: z.number().int().positive().max(100_000).nullish(),
  pie_calle: z.boolean().nullish(),
};

const farmaciaFields = {
  ...geoFields,
  ...viabFields,
  facturacion_min: z.number().nonnegative().nullish(),
  facturacion_max: z.number().nonnegative().nullish(),
};

const localCrear = z.object({ tipo: z.literal('local'), nombre, portales: portalesDe('local'), ...localFields });
const farmaciaCrear = z.object({
  tipo: z.literal('farmacia'),
  nombre,
  portales: portalesDe('farmacia'),
  ...farmaciaFields,
});

const localActualizar = z
  .object({ tipo: z.literal('local'), portales: portalesDe('local'), nombre, ...localFields })
  .partial()
  .required({ tipo: true });
const farmaciaActualizar = z
  .object({ tipo: z.literal('farmacia'), portales: portalesDe('farmacia'), nombre, ...farmaciaFields })
  .partial()
  .required({ tipo: true });

function rangoOk(min: unknown, max: unknown): boolean {
  if (typeof min !== 'number' || typeof max !== 'number') return true;
  return min <= max;
}

function comprobarRangos(d: Record<string, unknown>, ctx: z.RefinementCtx): void {
  if (!rangoOk(d.precio_min, d.precio_max)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'precio_min no puede ser mayor que precio_max', path: ['precio_min'] });
  }
  if (!rangoOk(d.superficie_min, d.superficie_max)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'superficie_min no puede ser mayor que superficie_max', path: ['superficie_min'] });
  }
  if (!rangoOk(d.facturacion_min, d.facturacion_max)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'facturacion_min no puede ser mayor que facturacion_max', path: ['facturacion_min'] });
  }
}

export const crearBusquedaSchema = z
  .discriminatedUnion('tipo', [localCrear, farmaciaCrear])
  .superRefine(comprobarRangos);

export const actualizarBusquedaSchema = z
  .discriminatedUnion('tipo', [localActualizar, farmaciaActualizar])
  .superRefine((d, ctx) => {
    comprobarRangos(d as Record<string, unknown>, ctx);
    const claves = Object.keys(d).filter((k) => k !== 'tipo');
    if (claves.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Se debe enviar al menos un campo a actualizar' });
    }
  });

export type CrearBusquedaInput = z.infer<typeof crearBusquedaSchema>;
export type ActualizarBusquedaInput = z.infer<typeof actualizarBusquedaSchema>;

export const actualizarAnuncioSchema = z
  .object({ visto: z.boolean().optional(), descartado: z.boolean().optional() })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Se debe enviar al menos un campo a actualizar' });
