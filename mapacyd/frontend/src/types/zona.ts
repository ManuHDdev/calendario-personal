export interface HorarioZona {
  id: string;
  zona_id: string;
  tipo_dia: 'LMXJV' | 'SABADO' | 'DOMINGO';
  hora_inicio: string;  // "HH:MM"
  hora_fin: string;     // "HH:MM"
  activo: boolean;
}

export type TipoZona = 'carga_descarga' | 'aparcamiento';

export interface ZonaCyd {
  id: string;
  nombre: string;
  descripcion?: string;
  latitud: number;
  longitud: number;
  ciudad: string;
  tipo: TipoZona;
  activo: boolean;
  created_at: string;
  updated_at: string;
  horarios: HorarioZona[];
}

export type EstadoZona = 'restringida' | 'libre' | 'sin-horario';

export const COLOR_ESTADO: Record<EstadoZona, string> = {
  restringida:   '#ef4444',
  libre:         '#22c55e',
  'sin-horario': '#6b7280',
};

export const COLOR_APARCAMIENTO = '#3b82f6';
