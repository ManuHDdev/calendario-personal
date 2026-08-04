import { z } from 'zod';

const categoriaEnum = z.enum(['piscina', 'ruta', 'playa']);

export const spotCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  region: z.string().optional(),
  provincia: z.string().optional(),
  latitud: z.number({ required_error: 'La latitud es obligatoria' }),
  longitud: z.number({ required_error: 'La longitud es obligatoria' }),
  imagen_url: z.string().url().optional(),
  descripcion: z.string().optional(),
  categoria: categoriaEnum,
});

export const spotUpdateSchema = z
  .object({
    nombre: z.string().min(1).optional(),
    region: z.string().optional(),
    provincia: z.string().optional(),
    latitud: z.number().optional(),
    longitud: z.number().optional(),
    imagen_url: z.string().url().nullable().optional(),
    descripcion: z.string().nullable().optional(),
    categoria: categoriaEnum.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Se debe enviar al menos un campo a actualizar',
  });

export const parkingSchema = z.object({
  latitud: z.number({ required_error: 'La latitud es obligatoria' }),
  longitud: z.number({ required_error: 'La longitud es obligatoria' }),
  descripcion: z.string().optional(),
});
