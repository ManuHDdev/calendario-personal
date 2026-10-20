export type Color = 'verde' | 'ambar' | 'rojo';

export const SIGUIENTE: Record<Color, Color> = {
  verde: 'ambar',
  ambar: 'rojo',
  rojo: 'verde',
};

export const ETIQUETA: Record<Color, string> = {
  verde: 'Verde',
  ambar: 'Ámbar',
  rojo: 'Rojo',
};

export type Franja =
  | 'laborable-manana' | 'laborable-tarde' | 'laborable-noche'
  | 'finde-manana' | 'finde-tarde' | 'finde-noche';

export interface EstimacionColor {
  n: number;
  mediana: number | null;
  min: number | null;
  max: number | null;
  mad: number | null;
  manual: number | null;
  efectiva: number | null;
}

export interface ModeloFranja {
  verde: EstimacionColor;
  ambar: EstimacionColor;
  rojo: EstimacionColor;
  fijo: boolean;
}

export interface ModeloAcceso {
  global: ModeloFranja;
  franjas: Partial<Record<Franja, ModeloFranja>>;
  ultima: { color: Color; t: number } | null;
  totalObservaciones: number;
}

export interface Acceso {
  id: number;
  cruce_id: number;
  nombre: string;
  rumbo_grados: number | null;
  manual: { verde: number | null; ambar: number | null; rojo: number | null };
  modelo: ModeloAcceso;
}

export interface Cruce {
  id: number;
  ciudad: string;
  nombre: string;
  lat: number;
  lng: number;
  accesos: Acceso[];
}

export interface Observacion {
  id: number;
  color: Color;
  observado_at: string;
}

export interface AccesoDetalle extends Acceso {
  observaciones: Observacion[];
}

export interface Ciudad {
  ciudad: string;
  cruces: number;
}

export interface ResumenImportacion {
  ciudad: string;
  encontrados: number;
  nuevos: number;
  actualizados: number;
  accesosCreados: number;
  sinAccesos: number;
}
