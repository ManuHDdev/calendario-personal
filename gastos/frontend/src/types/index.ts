export type Origen = 'manual' | 'ticket' | 'banco';
export type Estado = 'pendiente_revision' | 'confirmado' | 'previsto';
export type Tipo = 'gasto' | 'ganancia';

export interface Gasto {
  id: string;
  importe: number;
  fecha: string | null;
  comercio: string;
  concepto: string | null;
  categoria: string | null;
  origen: Origen;
  estado: Estado;
  tipo: Tipo;
  imagen_path: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface GastoFormData {
  importe: number;
  fecha?: string;
  comercio: string;
  concepto?: string;
  categoria?: string;
  estado?: 'confirmado' | 'previsto';
  tipo?: Tipo;
}

export interface GastoUpdateData {
  importe?: number;
  fecha?: string;
  comercio?: string;
  concepto?: string | null;
  categoria?: string | null;
  estado?: Estado;
  tipo?: Tipo;
}

export interface TotalesPorCategoria {
  categoria: string;
  tipo: Tipo;
  total: number;
}

export interface TotalesPorMes {
  mes: string; // YYYY-MM
  gastos: number;
  ganancias: number;
}

export interface TotalesPeriodo {
  periodo: 'mes' | 'anio';
  mes?: string;
  anio?: string;
  gastos: number;
  ganancias: number;
  balance: number;
  total: number;
  porCategoria: TotalesPorCategoria[];
  porMes?: TotalesPorMes[]; // only for periodo 'anio', always 12 entries
}

export interface ListFilters {
  mes?: string;
  anio?: string;
  categoria?: string;
  estado?: Estado;
  tipo?: Tipo;
}

export interface TotalesFilters {
  mes?: string;
  anio?: string;
  categoria?: string;
}

/** Normalised values the add/edit dialog hands back to the page. */
export interface MovimientoValores {
  tipo: Tipo;
  importe: number;
  fecha: string | null;
  comercio: string;
  categoria: string;
  concepto: string;
  previsto: boolean;
}
