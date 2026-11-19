import { z } from 'zod';
import { ESTADOS } from '../domain/types';
import { UI_FILTERS } from '../domain/listFilter';
import { isValidAsin } from '../domain/validation';
import { DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS, MAX_GUEST_FEEDBACK_CHARS } from '../services/guestLinkService';

const estrellas = z.number().int().min(1).max(5).nullable();

export const MAX_BULK_PRODUCTS = 100;

const createProductItemSchema = z
  .object({
    asin: z
      .string()
      .transform((v) => v.trim().toUpperCase())
      .refine(isValidAsin, 'ASIN must be 10 characters (A-Z, 0-9)'),
    titulo: z.string().trim().min(1).max(1000),
    descripcion: z.string().max(20000).optional(),
  })
  .strict();

/** `POST /v1/products`: one product or `{products: [...]}`, normalised to a list. Any invalid item rejects the whole request. */
export const createProductsSchema = z.union([
  createProductItemSchema.transform((p) => [p]),
  z
    .object({ products: z.array(createProductItemSchema).min(1).max(MAX_BULK_PRODUCTS) })
    .strict()
    .transform((b) => b.products),
]);

/** Editable content fields (autosave). Unknown keys such as `estado` are stripped, never applied. */
export const contentPatchSchema = z.object({
  titulo: z.string().max(1000).optional(),
  descripcion: z.string().max(20000).optional(),
  feedback: z.string().max(20000).optional(),
  estrellas: estrellas.optional(),
});

/** Claude API update: same fields plus an explicit state change. */
export const apiPatchSchema = contentPatchSchema.extend({
  estado: z.enum(ESTADOS).optional(),
});

export const resenaSchema = z.object({
  resena_producto: z.string().max(20000).default(''),
  resena_resumida: z.string().min(1).max(5000),
  resena_extendida: z.string().min(1).max(20000),
});

export const uiListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  filter: z.enum(UI_FILTERS).optional(),
  estado: z.enum(ESTADOS).optional(),
});

export const apiListQuerySchema = z.object({
  estado: z.enum(ESTADOS).optional(),
});

export const createGuestLinkSchema = z.object({
  expiresInDays: z.number().int().min(1).max(MAX_EXPIRY_DAYS).default(DEFAULT_EXPIRY_DAYS),
});

export const guestFeedbackSchema = z.object({
  feedback: z.string().max(MAX_GUEST_FEEDBACK_CHARS),
});
