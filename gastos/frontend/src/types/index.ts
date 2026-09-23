export type Origen = 'manual' | 'ticket' | 'banco';
export type Estado = 'pendiente_revision' | 'confirmado' | 'previsto';

export interface Gasto {
  id: string;
  importe: number;
  fecha: string | null;
  comercio: string;
  concepto: string | null;
  categoria: string | null;
  origen: Origen;
  estado: Estado;
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
}

export interface GastoUpdateData {
  importe?: number;
  fecha?: string;
  comercio?: string;
  concepto?: string | null;
  categoria?: string | null;
  estado?: Estado;
}

export interface TotalesPorCategoria {
  categoria: string;
  total: number;
}

export interface Totales {
  mes: string;
  total: number;
  porCategoria: TotalesPorCategoria[];
}

export interface ListFilters {
  mes?: string;
  categoria?: string;
  estado?: Estado;
}
