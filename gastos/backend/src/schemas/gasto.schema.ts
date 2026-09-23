import { z } from 'zod';

export const origenEnum = z.enum(['manual', 'ticket', 'banco']);
export const estadoEnum = z.enum(['pendiente_revision', 'confirmado', 'previsto']);

export const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha YYYY-MM-DD requerido');

// estado admite 'confirmado' (default implícito, ver POST /gastos) o
// 'previsto' — nunca 'pendiente_revision', que solo lo crea el pipeline OCR.
export const createGastoSchema = z
  .object({
    importe:   z.number().positive('importe debe ser mayor que 0'),
    fecha:     fechaSchema.optional(),
    comercio:  z.string().min(1, 'comercio es obligatorio').max(200),
    concepto:  z.string().max(500).optional(),
    categoria: z.string().max(100).optional(),
    estado:    z.enum(['confirmado', 'previsto']).optional(),
  })
  // fecha es opcional únicamente para un gasto previsto (importe conocido,
  // fecha aún por confirmar); para cualquier otro estado sigue siendo
  // obligatoria — no se puede aplicar a nivel de columna porque la tabla
  // permite NULL para todos los estados (ver design.md).
  .superRefine((data, ctx) => {
    if (data.estado !== 'previsto' && !data.fecha) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fecha es obligatoria salvo para gastos previstos',
        path: ['fecha'],
      });
    }
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
