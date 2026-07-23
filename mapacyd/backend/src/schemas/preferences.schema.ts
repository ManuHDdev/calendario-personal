import { z } from 'zod';

export const setPreferenciaSchema = z.object({
  ciudad: z.string().min(1).max(100),
});

export type SetPreferenciaInput = z.infer<typeof setPreferenciaSchema>;
