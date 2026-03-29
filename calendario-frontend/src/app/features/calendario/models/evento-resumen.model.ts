export interface EventoResumen {
  id: number;
  titulo: string;
  fechaInicio: string; // "YYYY-MM-DD"
  fechaFin: string | null;
  color: string;
}
