export interface Spot {
  id: number;
  nombre: string;
  region: string | null;
  provincia: string | null;
  latitud: number;
  longitud: number;
  imagen_url: string | null;
  descripcion: string | null;
  categoria: 'piscina' | 'ruta' | 'playa';
  created_at: string;
  updated_at: string;
}

export interface SpotCreateData {
  nombre: string;
  region?: string;
  provincia?: string;
  latitud: number;
  longitud: number;
  imagen_url?: string;
  descripcion?: string;
  categoria: 'piscina' | 'ruta' | 'playa';
}

export interface SpotUpdateData {
  nombre?: string;
  region?: string;
  provincia?: string;
  latitud?: number;
  longitud?: number;
  imagen_url?: string | null;
  descripcion?: string | null;
  categoria?: 'piscina' | 'ruta' | 'playa';
}

export interface SpotStats {
  piscinas: number;
  rutas: number;
  playas: number;
}

export interface ParkingSpot {
  id: number;
  spot_id: number;
  latitud: number;
  longitud: number;
  descripcion: string | null;
}

export interface SpotDetail extends Spot {
  parking: ParkingSpot | null;
}
