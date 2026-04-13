import { z } from 'zod';

export const createZonaSchema = z.object({
  nombre:      z.string().min(3).max(100),
  descripcion: z.string().max(255).optional(),
  latitud:     z.number().min(-90).max(90),
  longitud:    z.number().min(-180).max(180),
  ciudad:      z.string().min(1).default('Cáceres'),
});

export const updateZonaSchema = createZonaSchema.partial();

// Objeto base sin refine para poder aplicar .omit() / .partial() en update
const horarioBaseSchema = z.object({
  tipo_dia:    z.enum(['LMXJV', 'SABADO', 'DOMINGO']),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  hora_fin:    z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
});

export const createHorarioSchema = horarioBaseSchema.refine(
  data => data.hora_fin > data.hora_inicio,
  { message: 'hora_fin debe ser mayor que hora_inicio', path: ['hora_fin'] }
);

export const updateHorarioSchema = horarioBaseSchema
  .omit({ tipo_dia: true })
  .partial()
  .extend({ tipo_dia: z.enum(['LMXJV', 'SABADO', 'DOMINGO']).optional() })
  .refine(
    data => !data.hora_inicio || !data.hora_fin || data.hora_fin > data.hora_inicio,
    { message: 'hora_fin debe ser mayor que hora_inicio', path: ['hora_fin'] }
  );

export type CreateZonaInput    = z.infer<typeof createZonaSchema>;
export type UpdateZonaInput    = z.infer<typeof updateZonaSchema>;
export type CreateHorarioInput = z.infer<typeof createHorarioSchema>;
export type UpdateHorarioInput = z.infer<typeof updateHorarioSchema>;
