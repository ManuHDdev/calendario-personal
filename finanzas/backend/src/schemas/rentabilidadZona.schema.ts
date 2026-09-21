import { z } from 'zod';

export const rentabilidadZonaQuerySchema = z.object({
  ubicacion: z.string().min(1, 'ubicacion es obligatoria'),
  // Opcional, default 'alquiler_completo' — un valor fuera de esta unión es
  // 400 (mensaje explícito de Zod), nunca se ignora en silencio.
  modo: z.enum(['alquiler_completo', 'habitaciones']).optional().default('alquiler_completo'),
});

export type RentabilidadZonaQuery = z.infer<typeof rentabilidadZonaQuerySchema>;
