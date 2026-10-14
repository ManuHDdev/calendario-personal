export type Origen = 'manual' | 'ticket' | 'banco';
export type Tipo = 'gasto' | 'ganancia';
export type Estado = 'pendiente_revision' | 'confirmado';

export interface Gasto {
  id: string;
  importe: number;
  fecha: string;
  comercio: string;
  concepto: string | null;
  categoria: string | null;
  origen: Origen;
  estado: Estado;
  tipo: Tipo;
  imagen_path: string | null;
  activo: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Resultado best-effort de un parser de OCR — ver openspec design.md. */
export interface DraftGasto {
  importe: number | null;
  fecha: string;
  comercio: string;
  concepto?: string;
}
