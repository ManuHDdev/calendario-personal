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

export interface CreateItemInput {
  tipo: Tipo;
  external_id?: string;
  fuente?: Fuente;
  titulo: string;
  autor?: string;
  poster_url?: string;
  sinopsis?: string;
  estado?: Estado;
  nota?: string;
  rating?: number;
}

export interface UpdateItemInput {
  external_id?: string | null;
  fuente?: Fuente | null;
  titulo?: string;
  autor?: string | null;
  poster_url?: string | null;
  sinopsis?: string | null;
  estado?: Estado;
  nota?: string | null;
  rating?: number | null;
}

export interface SearchResult {
  external_id: string;
  titulo: string;
  autor?: string | null;
  poster_url: string | null;
  sinopsis: string | null;
}

export interface ItemListFilters {
  tipo?: Tipo;
  estado?: Estado;
}
