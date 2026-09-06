export const PORTALES = ['fotocasa', 'pisos', 'wallapop'] as const;
export type PortalId = (typeof PORTALES)[number];

export const NOMBRE_PORTAL: Record<PortalId, string> = {
  fotocasa: 'Fotocasa',
  pisos: 'pisos.com',
  wallapop: 'Wallapop',
};

export interface PortalConfig {
  enabled: boolean;
}

export type PortalesConfig = Record<PortalId, PortalConfig>;

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
  /** Resumen de los portales que fallaron en el último rastreo, o null. */
  ultimo_rastreo_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusquedaFormData {
  nombre: string;
  ubicacion: string;
  latitud?: number | null;
  longitud?: number | null;
  radio_km?: number | null;
  precio_min?: number | null;
  precio_max?: number | null;
  metros_min?: number | null;
  metros_max?: number | null;
  habitaciones_min?: number | null;
  banos_min?: number | null;
  exige_ascensor?: boolean;
  exige_garaje?: boolean;
  exige_terraza?: boolean;
  excluir_palabras?: string | null;
  portales: PortalesConfig;
  habilitada?: boolean;
  notificar?: boolean;
}

export type BusquedaUpdateData = Partial<BusquedaFormData>;

export interface Anuncio {
  id: string;
  busqueda_id: string;
  busqueda_nombre: string;
  portal: PortalId;
  portal_id: string;
  url: string;
  titulo: string;
  precio: number | null;
  precio_inicial: number | null;
  precio_previo: number | null;
  /** Precio del ultimo aviso entregado; referencia contra la que se mide una bajada. */
  precio_notificado: number | null;
  precio_m2: number | null;
  metros: number | null;
  habitaciones: number | null;
  banos: number | null;
  planta: string | null;
  ascensor: boolean | null;
  garaje: boolean | null;
  terraza: boolean | null;
  ubicacion: string | null;
  imagen_url: string | null;
  visto: boolean;
  descartado: boolean;
  created_at: string;
}

export interface ScraperState {
  running: boolean;
  updated_at: string;
}

export interface ResultadoRastreo {
  encontrados: number;
  guardados: number;
  fallos: Array<{ portal: PortalId; motivo: string }>;
  omitidos: Array<{ portal: PortalId; motivo: string }>;
}
