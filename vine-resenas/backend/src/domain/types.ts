export const ESTADOS = ['pendiente', 'listo', 'resena_generada', 'publicado'] as const;
export type Estado = (typeof ESTADOS)[number];

export type MediaType = 'photo' | 'video';

export interface Product {
  asin: string;
  titulo: string;
  descripcion: string;
  feedback: string;
  estrellas: number | null;
  estado: Estado;
  resena_producto: string;
  resena_resumida: string;
  resena_extendida: string;
  created_at: string;
  updated_at: string;
}

export interface MediaRow {
  id: number;
  asin: string;
  filename: string;
  type: MediaType;
  size: number;
  created_at: string;
}

export interface ProductWithMedia extends Product {
  media: MediaRow[];
}

/** Fields a client can edit on a product (state is handled separately). */
export interface ProductPatch {
  titulo?: string;
  descripcion?: string;
  feedback?: string;
  estrellas?: number | null;
}

export interface NewProduct {
  asin: string;
  titulo?: string;
  descripcion?: string;
  feedback?: string;
  estrellas?: number | null;
  estado?: Estado;
  resena_producto?: string;
  resena_resumida?: string;
  resena_extendida?: string;
}
