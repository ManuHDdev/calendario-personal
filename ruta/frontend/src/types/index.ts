export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodeResult extends LatLng {
  displayName: string;
}

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
  /** Perpendicular distance from the route, in km. */
  desvio_km: number;
  /** Distance from the origin at which the listing is passed, in km. */
  progreso_km: number;
}

export interface RouteSearchResult {
  route: {
    polyline: LatLng[];
    distanceKm: number;
    durationMin: number;
  };
  plan: {
    centers: LatLng[];
    radiusKm: number;
    spacingKm: number;
    fullCoverage: boolean;
  };
  listings: CorridorListing[];
  stats: {
    fetched: number;
    matched: number;
    requests: number;
    failedRequests: number;
  };
}

export interface RouteSearchRequest {
  origen: LatLng;
  destino: LatLng;
  keyword: string;
  desvio_max_km: number;
  min_price?: number | null;
  max_price?: number | null;
  excluir_palabras?: string | null;
}

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

export type SavedRouteSearchCreateData = Omit<
  SavedRouteSearch,
  'id' | 'created_at' | 'updated_at'
>;
