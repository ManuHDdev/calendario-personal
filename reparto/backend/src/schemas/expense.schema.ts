import { z } from 'zod';

export const splitTypeEnum = z.enum(['equal', 'exact', 'percentage']);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha YYYY-MM-DD requerido');

const baseExpenseFields = {
  payerMemberId: z.string().uuid('payerMemberId debe ser un UUID válido'),
  amount: z.number().positive('amount debe ser mayor que 0'),
  description: z.string().min(1, 'description es obligatoria').max(500),
  date: dateSchema,
  category: z.string().max(100).optional(),
};

// Reparto igual: solo hace falta la lista de participantes (memberId), el
// importe de cada uno se calcula server-side (ver lib/splits.ts).
const equalParticipantSchema = z.object({ memberId: z.string().uuid() });

// Reparto exacto: el cliente manda el importe de cada participante; la suma
// se valida contra `amount` en el handler (spec.md "Expense split — exact
// amounts").
const exactParticipantSchema = z.object({
  memberId: z.string().uuid(),
  shareAmount: z.number().positive('shareAmount debe ser mayor que 0'),
});

// Reparto porcentual: el cliente manda el porcentaje de cada participante;
// la suma se valida contra 100 (±0.01) en el handler.
const percentageParticipantSchema = z.object({
  memberId: z.string().uuid(),
  sharePercentage: z.number().positive('sharePercentage debe ser mayor que 0'),
});

export const createExpenseSchema = z.discriminatedUnion('splitType', [
  z.object({
    ...baseExpenseFields,
    splitType: z.literal('equal'),
    participants: z.array(equalParticipantSchema).min(1, 'Se requiere al menos un participante'),
  }),
  z.object({
    ...baseExpenseFields,
    splitType: z.literal('exact'),
    participants: z.array(exactParticipantSchema).min(1, 'Se requiere al menos un participante'),
  }),
  z.object({
    ...baseExpenseFields,
    splitType: z.literal('percentage'),
    participants: z.array(percentageParticipantSchema).min(1, 'Se requiere al menos un participante'),
  }),
]);

// PATCH acepta o bien un reemplazo completo del reparto (misma forma que el
// alta, se recalculan los splits desde cero — tasks.md 5.3 "recalcula igual
// que en el alta"), o bien una actualización parcial de campos simples sin
// tocar los splits existentes.
const partialFieldsUpdateSchema = z
  .object({
    payerMemberId: z.string().uuid().optional(),
    amount: z.number().positive().optional(),
    description: z.string().min(1).max(500).optional(),
    date: dateSchema.optional(),
    category: z.string().max(100).nullable().optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, 'No se han enviado campos a actualizar');

export const updateExpenseSchema = z.union([createExpenseSchema, partialFieldsUpdateSchema]);

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

/** True si el body de update trae un reemplazo completo de splits. */
export function isFullSplitReplace(
  input: UpdateExpenseInput,
): input is CreateExpenseInput {
  return 'splitType' in input;
}
