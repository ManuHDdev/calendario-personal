export type Origen = 'dgt' | 'manual';

export interface Camara {
  id: number;
  origen: Origen;
  nombre: string;
  carretera: string | null;
  ciudad: string;
  latitud: number;
  longitud: number;
  distanciaKm: number | null;
  tieneImagen: boolean;
  urlPagina: string | null;
  fuente: string;
  favorita: boolean;
  vistoEn: string | null;
}

export interface Ciudad {
  slug: string;
  nombre: string;
  latitud: number;
  longitud: number;
  camaras: number;
}

export interface EstadoImportacion {
  ultimaEjecucion: string | null;
  ok: boolean | null;
  totalFeed: number | null;
  totalCercanas: number | null;
  porCiudad: Record<string, number> | null;
  error: string | null;
}

export interface CamaraInput {
  nombre: string;
  ciudad: string;
  latitud: number;
  longitud: number;
  carretera?: string;
  urlImagen?: string;
  urlPagina?: string;
  fuente?: string;
  favorita?: boolean;
}

/** PATCH: `null` borra el campo opcional. */
export type CamaraPatch = Partial<{
  nombre: string;
  ciudad: string;
  latitud: number;
  longitud: number;
  carretera: string | null;
  urlImagen: string | null;
  urlPagina: string | null;
  fuente: string | null;
  favorita: boolean;
}>;
