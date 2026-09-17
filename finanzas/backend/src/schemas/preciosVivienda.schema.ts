import { z } from 'zod';

export const preciosViviendaQuerySchema = z.object({
  nombre: z.string().min(1, 'nombre es obligatorio'),
});

export type PreciosViviendaQuery = z.infer<typeof preciosViviendaQuerySchema>;

// Espejo de preciosViviendaQuerySchema, para la variante de capital: la
// query param se llama igual (`nombre`) pero resuelve contra
// precio_vivienda_capital en vez de precio_vivienda.
export const preciosViviendaCapitalQuerySchema = z.object({
  nombre: z.string().min(1, 'nombre es obligatorio'),
});

export type PreciosViviendaCapitalQuery = z.infer<typeof preciosViviendaCapitalQuerySchema>;
