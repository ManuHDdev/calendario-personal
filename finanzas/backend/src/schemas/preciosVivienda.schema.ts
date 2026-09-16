import { z } from 'zod';

export const preciosViviendaQuerySchema = z.object({
  nombre: z.string().min(1, 'nombre es obligatorio'),
});

export type PreciosViviendaQuery = z.infer<typeof preciosViviendaQuerySchema>;
