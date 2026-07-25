import { z } from 'zod';

export const origenEnum = z.enum(['manual', 'ticket', 'banco']);
export const estadoEnum = z.enum(['pendiente_revision', 'confirmado']);

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha YYYY-MM-DD requerido');

export const createGastoSchema = z.object({
  importe:   z.number().positive('importe debe ser mayor que 0'),
  fecha:     fechaSchema,
  comercio:  z.string().min(1, 'comercio es obligatorio').max(200),
  concepto:  z.string().max(500).optional(),
  categoria: z.string().max(100).optional(),
});

export const updateGastoSchema = z
  .object({
    importe:   z.number().positive().optional(),
    fecha:     fechaSchema.optional(),
    comercio:  z.string().min(1).max(200).optional(),
    concepto:  z.string().max(500).nullable().optional(),
    categoria: z.string().max(100).nullable().optional(),
    estado:    estadoEnum.optional(),
  })
  .strict();

export const listGastosQuerySchema = z.object({
  mes:       z.string().regex(/^\d{4}-\d{2}$/, 'Formato YYYY-MM requerido').optional(),
  categoria: z.string().optional(),
  estado:    estadoEnum.optional(),
});

export const totalesQuerySchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/, 'Formato YYYY-MM requerido'),
});

export type CreateGastoInput = z.infer<typeof createGastoSchema>;
export type UpdateGastoInput = z.infer<typeof updateGastoSchema>;
export type ListGastosQuery = z.infer<typeof listGastosQuerySchema>;
export type TotalesQuery = z.infer<typeof totalesQuerySchema>;
