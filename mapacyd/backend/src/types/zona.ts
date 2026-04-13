export interface ZonaCyd {
  id: string;
  nombre: string;
  descripcion?: string;
  latitud: number;
  longitud: number;
  ciudad: string;
  activo: boolean;
  deleted_at?: Date | null;
  created_at: Date;
  updated_at: Date;
  horarios?: HorarioZona[];
}

export interface HorarioZona {
  id: string;
  zona_id: string;
  tipo_dia: 'LMXJV' | 'SABADO' | 'DOMINGO';
  hora_inicio: string; // "HH:MM"
  hora_fin: string;    // "HH:MM"
  activo: boolean;
  deleted_at?: Date | null;
}
