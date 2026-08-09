import { z } from 'zod';

export const createZonaSchema = z.object({
  nombre:      z.string().min(3).max(100),
  descripcion: z.string().max(255).optional(),
  latitud:     z.number().min(-90).max(90),
  longitud:    z.number().min(-180).max(180),
  ciudad:      z.string().min(1).default('Cáceres'),
  tipo:        z.enum(['carga_descarga', 'aparcamiento']).default('carga_descarga'),
});

export const updateZonaSchema = createZonaSchema.partial();

// Objeto base sin refine para poder aplicar .omit() / .partial() en update
const horarioBaseSchema = z.object({
  tipo_dia:        z.enum(['LMXJV', 'SABADO', 'DOMINGO']),
  hora_inicio:     z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido').optional(),
  hora_fin:        z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido').optional(),
  sin_restriccion: z.boolean().default(false),
});

export const createHorarioSchema = horarioBaseSchema.refine(
  data => {
    if (data.sin_restriccion) return data.hora_inicio === undefined && data.hora_fin === undefined;
    return data.hora_inicio !== undefined && data.hora_fin !== undefined && data.hora_fin > data.hora_inicio;
  },
  data => data.sin_restriccion
    ? { message: 'No se pueden indicar hora_inicio/hora_fin cuando sin_restriccion es true', path: ['sin_restriccion'] }
    : { message: 'hora_inicio y hora_fin son obligatorios y hora_fin debe ser mayor que hora_inicio', path: ['hora_fin'] }
);

export const updateHorarioSchema = horarioBaseSchema
  .omit({ tipo_dia: true })
  .partial()
  .extend({ tipo_dia: z.enum(['LMXJV', 'SABADO', 'DOMINGO']).optional() })
  .refine(
    data => {
      // sin_restriccion === true en el body: no deben venir horas
      if (data.sin_restriccion === true) return data.hora_inicio === undefined && data.hora_fin === undefined;
      return true;
    },
    { message: 'No se pueden indicar hora_inicio/hora_fin cuando sin_restriccion es true', path: ['sin_restriccion'] }
  )
  .refine(
    data => {
      // Si se está pasando a franja normal (explícita o implícitamente vía horas)
      // sin dar ambas horas, no hay suficiente información — se valida contra el
      // registro existente más abajo en la ruta; aquí solo se valida el par que
      // llega junto en el mismo body.
      if (data.hora_inicio !== undefined && data.hora_fin !== undefined) {
        return data.hora_fin > data.hora_inicio;
      }
      return true;
    },
    { message: 'hora_fin debe ser mayor que hora_inicio', path: ['hora_fin'] }
  );

export type CreateZonaInput    = z.infer<typeof createZonaSchema>;
export type UpdateZonaInput    = z.infer<typeof updateZonaSchema>;
export type CreateHorarioInput = z.infer<typeof createHorarioSchema>;
export type UpdateHorarioInput = z.infer<typeof updateHorarioSchema>;
