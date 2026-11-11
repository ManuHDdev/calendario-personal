import { z } from 'zod';
import { ESTADOS } from '../domain/types';
import { UI_FILTERS } from '../domain/listFilter';

const estrellas = z.number().int().min(1).max(5).nullable();

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
