export type Estado = 'pendiente' | 'listo' | 'resena_generada' | 'publicado';
export type MediaType = 'photo' | 'video';
export type UiFilter = 'todos' | 'faltan_fotos' | 'falta_feedback' | 'listos' | 'resena_generada';

export interface ProductSummary {
  asin: string;
  titulo: string;
  estado: Estado;
  estrellas: number | null;
  has_feedback: boolean;
  photo_count: number;
  has_video: boolean;
  thumbnail_url: string | null;
  updated_at: string;
}

export interface Media {
  id: number;
  filename: string;
  type: MediaType;
  size: number;
  created_at: string;
  uploaded_by_guest?: boolean;
  url: string;
}

export interface Product {
  asin: string;
  titulo: string;
  descripcion: string;
  feedback: string;
  guest_feedback?: string;
  estrellas: number | null;
  estado: Estado;
  resena_producto: string;
  resena_resumida: string;
  resena_extendida: string;
  created_at: string;
  updated_at: string;
  media: Media[];
}

export interface Counts {
  pendiente: number;
  listo: number;
  resena_generada: number;
  publicado: number;
  pendientes: number;
  total: number;
}

export interface UploadResult {
  uploaded: Media[];
  replaced: string[];
  rejected: { filename: string; error: string; message: string; status: number }[];
}

export type GuestLinkStatus = 'active' | 'expired' | 'revoked';

export interface GuestLinkInfo {
  id: number;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: GuestLinkStatus;
}

export interface CreatedGuestLink {
  id: number;
  /** Path of the public page (no origin). Shown once, together with the token. */
  url: string;
  token: string;
  expiresAt: string;
}

/** What the public guest page may see. */
export interface GuestView {
  titulo: string;
  thumbnail_url: string | null;
  feedback: string;
  media: { filename: string; type: MediaType; size: number; url: string }[];
  limits: { maxFiles: number; used: number };
  expiresAt: string;
}
