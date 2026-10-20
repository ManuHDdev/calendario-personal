export type Origen = 'dgt' | 'manual';

/** Fila de la tabla `camara` tal y como sale de pg. */
export interface CamaraRow {
  id: number;
  origen: Origen;
  external_id: string | null;
  nombre: string;
  carretera: string | null;
  ciudad: string;
  latitud: number;
  longitud: number;
  distancia_km: number | null;
  url_imagen: string | null;
  url_pagina: string | null;
  fuente: string | null;
  favorita: boolean;
  visto_en: Date | null;
}

/** CamaraResponseDTO: nunca incluye `deleted_at` ni la URL de origen de la imagen (siempre pasa por el proxy). */
export interface CamaraResponseDTO {
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
