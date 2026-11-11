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
  url: string;
}

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
