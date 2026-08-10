export type Tipo = 'pelicula' | 'serie' | 'libro';
export type Fuente = 'tmdb' | 'google_books' | 'manual';
export type Estado = 'pendiente' | 'en_curso' | 'completado';

export interface Item {
  id: number;
  tipo: Tipo;
  external_id: string | null;
  fuente: Fuente | null;
  titulo: string;
  autor: string | null;
  poster_url: string | null;
  sinopsis: string | null;
  estado: Estado;
  nota: string | null;
  rating: number | null;
  activo: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
