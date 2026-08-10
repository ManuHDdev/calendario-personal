import { z } from 'zod';

export const tipoEnum = z.enum(['pelicula', 'serie', 'libro']);
export const estadoEnum = z.enum(['pendiente', 'en_curso', 'completado']);
export const fuenteEnum = z.enum(['tmdb', 'google_books', 'manual']);

export const createItemSchema = z.object({
  tipo:        tipoEnum,
  external_id: z.string().max(200).optional(),
  fuente:      fuenteEnum.optional(),
  titulo:      z.string().min(1, 'titulo es obligatorio').max(300),
  autor:       z.string().max(300).optional(),
  poster_url:  z.string().url('poster_url debe ser una URL válida').optional(),
  sinopsis:    z.string().max(3000).optional(),
  estado:      estadoEnum.optional(),
  nota:        z.string().max(2000).optional(),
  rating:      z.number().int().min(1).max(5).optional(),
});

// tipo es inmutable tras la creación: no se incluye en el schema de update.
export const updateItemSchema = z
  .object({
    external_id: z.string().max(200).nullable().optional(),
    fuente:      fuenteEnum.nullable().optional(),
    titulo:      z.string().min(1).max(300).optional(),
    autor:       z.string().max(300).nullable().optional(),
    poster_url:  z.string().url('poster_url debe ser una URL válida').nullable().optional(),
    sinopsis:    z.string().max(3000).nullable().optional(),
    estado:      estadoEnum.optional(),
    nota:        z.string().max(2000).nullable().optional(),
    rating:      z.number().int().min(1).max(5).nullable().optional(),
  })
  .strict();

export const listItemsQuerySchema = z.object({
  tipo:   tipoEnum.optional(),
  estado: estadoEnum.optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'q es obligatorio').max(200),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
