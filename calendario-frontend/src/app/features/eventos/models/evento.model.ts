import { ImagenEvento } from './imagen-evento.model';

export interface Evento {
  id: number;
  titulo: string;
  descripcion: string | null;
  fechaInicio: string;
  fechaFin: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  color: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  imagenes: ImagenEvento[];
}

export interface EventoRequest {
  titulo: string;
  descripcion?: string | null;
  fechaInicio: string;
  fechaFin?: string | null;
  horaInicio?: string | null;
  horaFin?: string | null;
  color: string;
}
