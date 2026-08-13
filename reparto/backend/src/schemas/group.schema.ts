import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().min(1, 'name es obligatorio').max(200),
});

export const byTokenSchema = z.object({
  token: z.string().min(1, 'token es obligatorio'),
});

export const createMemberSchema = z.object({
  name: z.string().min(1, 'name es obligatorio').max(200),
});

export const updateMemberSchema = z
  .object({
    name: z.string().min(1).max(200),
  })
  .strict();

export const updateGroupSchema = z
  .object({
    name: z.string().min(1, 'name es obligatorio').max(200),
  })
  .strict();

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type ByTokenInput = z.infer<typeof byTokenSchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
