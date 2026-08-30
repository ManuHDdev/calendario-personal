/** Portales soportados. El id es la clave usada en `busqueda.portales` (JSONB). */
export const PORTALES = ['fotocasa', 'pisos', 'wallapop'] as const;
export type PortalId = (typeof PORTALES)[number];

export interface PortalConfig {
  enabled: boolean;
}

export type PortalesConfig = Record<PortalId, PortalConfig>;

/** Fila de `busqueda` tal y como sale del SELECT (sin activo/deleted_at). */
export interface Busqueda {
  id: string;
  nombre: string;
  ubicacion: string;
  latitud: number | null;
  longitud: number | null;
  radio_km: number | null;
  precio_min: number | null;
  precio_max: number | null;
  metros_min: number | null;
  metros_max: number | null;
  habitaciones_min: number | null;
  banos_min: number | null;
  exige_ascensor: boolean;
  exige_garaje: boolean;
  exige_terraza: boolean;
  excluir_palabras: string | null;
  portales: PortalesConfig;
  habilitada: boolean;
  notificar: boolean;
  ultimo_rastreo_at: string | null;
  ultimo_rastreo_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Fila de `anuncio` tal y como sale del SELECT. */
export interface Anuncio {
  id: string;
  busqueda_id: string;
  portal: PortalId;
  portal_id: string;
  url: string;
  titulo: string;
  precio: number | null;
  precio_inicial: number | null;
  precio_previo: number | null;
  metros: number | null;
  habitaciones: number | null;
  banos: number | null;
  planta: string | null;
  ascensor: boolean | null;
  garaje: boolean | null;
  terraza: boolean | null;
  ubicacion: string | null;
  latitud: number | null;
  longitud: number | null;
  imagen_url: string | null;
  visto: boolean;
  descartado: boolean;
  notificado_at: string | null;
  visto_ultima_vez_at: string;
  created_at: string;
  updated_at: string;
}

export interface ScraperState {
  running: boolean;
  updated_at: string;
}

/**
 * Un anuncio tal y como lo devuelve un portal, antes de tocar la base de
 * datos. Todo lo que un portal puede no informar viaja como `null`, nunca
 * como un valor inventado por defecto: la diferencia entre "no tiene
 * ascensor" y "no lo dice" decide si un piso se filtra o no.
 */
export interface AnuncioCrudo {
  portal: PortalId;
  portalId: string;
  url: string;
  titulo: string;
  precio: number | null;
  metros: number | null;
  habitaciones: number | null;
  banos: number | null;
  planta: string | null;
  ascensor: boolean | null;
  garaje: boolean | null;
  terraza: boolean | null;
  ubicacion: string | null;
  latitud: number | null;
  longitud: number | null;
  imagenUrl: string | null;
}
