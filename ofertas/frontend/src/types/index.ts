export interface SiteConfig {
  enabled: boolean;
}

export interface Sitios {
  wallapop: SiteConfig;
  milanuncios: SiteConfig;
  vinted: SiteConfig;
}

export interface Busqueda {
  id: string;
  nombre: string;
  keyword: string;
  precio_min: number | null;
  precio_max: number | null;
  latitude: number;
  longitude: number;
  distance_km: number;
  milanuncios_province_slug: string | null;
  sitios: Sitios;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusquedaFormData {
  nombre: string;
  keyword: string;
  precio_min?: number | null;
  precio_max?: number | null;
  latitude: number;
  longitude: number;
  distance_km: number;
  milanuncios_province_slug?: string | null;
  sitios: Sitios;
}

export type BusquedaUpdateData = Partial<BusquedaFormData>;
