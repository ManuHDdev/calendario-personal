import type { LatLng } from '../services/geo';

export type { LatLng };

/** A single Wallapop listing, already filtered down to the route corridor. */
export interface CorridorListing {
  site: 'wallapop';
  external_id: string;
  title: string;
  price: number | null;
  currency: string;
  url: string;
  image_url: string | null;
  location: string;
  latitud: number;
  longitud: number;
  /** Perpendicular distance from the route, in km. Never above the requested detour. */
  desvio_km: number;
  /** How far into the trip the listing is passed, in km from the origin. */
  progreso_km: number;
}

/** Everything the frontend needs to draw the map and the result list. */
export interface RouteSearchResult {
  route: {
    /** Simplified driving route, in travel order. */
    polyline: LatLng[];
    distanceKm: number;
    durationMin: number;
  };
  plan: {
    /** Centres of the Wallapop search circles, for showing coverage on the map. */
    centers: LatLng[];
    radiusKm: number;
    spacingKm: number;
    fullCoverage: boolean;
  };
  listings: CorridorListing[];
  stats: {
    /** Distinct listings returned by Wallapop before the corridor filter. */
    fetched: number;
    /** Listings kept after the corridor and price filters. */
    matched: number;
    /** Wallapop requests actually issued. */
    requests: number;
    /** Search circles that failed; their area may be under-represented. */
    failedRequests: number;
  };
}

/** A saved route search, as persisted in the `busqueda_ruta` table. */
export interface SavedRouteSearch {
  id: number;
  nombre: string;
  origen_texto: string;
  origen_lat: number;
  origen_lng: number;
  destino_texto: string;
  destino_lat: number;
  destino_lng: number;
  keyword: string;
  desvio_max_km: number;
  min_price: number | null;
  max_price: number | null;
  excluir_palabras: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedRouteSearchCreateData {
  nombre: string;
  origen_texto: string;
  origen_lat: number;
  origen_lng: number;
  destino_texto: string;
  destino_lat: number;
  destino_lng: number;
  keyword: string;
  desvio_max_km: number;
  min_price?: number | null;
  max_price?: number | null;
  excluir_palabras?: string | null;
}

export type SavedRouteSearchUpdateData = Partial<SavedRouteSearchCreateData>;
