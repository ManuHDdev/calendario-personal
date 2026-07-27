import { z } from 'zod';

export const updateScraperStateSchema = z
  .object({
    running: z.boolean(),
  })
  .strict();

export type UpdateScraperStateInput = z.infer<typeof updateScraperStateSchema>;
