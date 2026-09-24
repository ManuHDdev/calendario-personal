import { z } from 'zod';

export const alquilerTuristicoResumenQuerySchema = z.object({
  ciudad: z.string().min(1, 'ciudad es obligatoria'),
  barrio: z.string().min(1).optional(),
});

export type AlquilerTuristicoResumenQuery = z.infer<typeof alquilerTuristicoResumenQuerySchema>;

export const alquilerTuristicoBarriosQuerySchema = z.object({
  ciudad: z.string().min(1, 'ciudad es obligatoria'),
});

export type AlquilerTuristicoBarriosQuery = z.infer<typeof alquilerTuristicoBarriosQuerySchema>;
