export interface ZonaCyd {
  id: string;
  nombre: string;
  descripcion?: string;
  latitud: number;
  longitud: number;
  ciudad: string;
  tipo: 'carga_descarga' | 'aparcamiento';
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
  hora_inicio: string | null; // "HH:MM", null cuando sin_restriccion = true
  hora_fin: string | null;    // "HH:MM", null cuando sin_restriccion = true
  sin_restriccion: boolean;
  activo: boolean;
  deleted_at?: Date | null;
}
