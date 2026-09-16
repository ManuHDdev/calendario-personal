import { z } from 'zod';

export const emailSendSchema = z.object({
  channel: z.literal('email'),
  to: z.string().email('to debe ser un email válido'),
  from: z.string().optional(),
  subject: z.string().min(1, 'subject es obligatorio'),
  body: z.string().min(1, 'body es obligatorio'),
  html: z.string().optional(),
});

export const smsSendSchema = z.object({
  channel: z.literal('sms'),
  to: z.string().min(3, 'to es obligatorio'),
  from: z.string().optional(),
  body: z.string().min(1, 'body es obligatorio'),
});

export const callSendSchema = z.object({
  channel: z.literal('call'),
  to: z.string().min(3, 'to es obligatorio'),
  from: z.string().optional(),
  body: z.string().min(1, 'body (texto a leer en la llamada) es obligatorio'),
});

export const sendMessageSchema = z.discriminatedUnion('channel', [
  emailSendSchema,
  smsSendSchema,
  callSendSchema,
]);

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
