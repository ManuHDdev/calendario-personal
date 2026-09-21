import { z } from 'zod';

export const rentabilidadZonaQuerySchema = z.object({
  ubicacion: z.string().min(1, 'ubicacion es obligatoria'),
  // Opcional, default 'alquiler_completo' — un valor fuera de esta unión es
  // 400 (mensaje explícito de Zod), nunca se ignora en silencio. 'flip' es
  // comprar/reformar/vender: no rastrea comparables de alquiler en absoluto.
  modo: z.enum(['alquiler_completo', 'habitaciones', 'flip']).optional().default('alquiler_completo'),
});

export type RentabilidadZonaQuery = z.infer<typeof rentabilidadZonaQuerySchema>;
