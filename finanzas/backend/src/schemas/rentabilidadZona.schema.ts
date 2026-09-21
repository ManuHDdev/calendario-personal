import { z } from 'zod';

export const rentabilidadZonaQuerySchema = z.object({
  ubicacion: z.string().min(1, 'ubicacion es obligatoria'),
});

export type RentabilidadZonaQuery = z.infer<typeof rentabilidadZonaQuerySchema>;
