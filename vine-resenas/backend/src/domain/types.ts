export const ESTADOS = ['pendiente', 'listo', 'en_espera', 'resena_generada', 'publicado'] as const;
export type Estado = (typeof ESTADOS)[number];

export type MediaType = 'photo' | 'video';

export interface Product {
  asin: string;
  titulo: string;
  descripcion: string;
  feedback: string;
  /** Text written by a relative through a guest link. Separate from `feedback`; the owner copies it over by hand. */
  guest_feedback: string;
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
  /** Guest link that uploaded this file; null for the owner's own media. */
  uploaded_via_guest_link_id: number | null;
}

export interface GuestLink {
  id: number;
  asin: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  created_by: string | null;
  last_used_at: string | null;
}

export type GuestLinkStatus = 'active' | 'expired' | 'revoked';

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
