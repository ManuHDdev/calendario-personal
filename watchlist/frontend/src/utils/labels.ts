import type { Tipo, Estado } from '../types';

export function tipoLabel(tipo: Tipo): string {
  if (tipo === 'pelicula') return 'Película';
  if (tipo === 'serie') return 'Serie';
  return 'Libro';
}

export function estadoLabel(tipo: Tipo, estado: Estado): string {
  if (estado === 'pendiente') return 'Pendiente';
  if (estado === 'en_curso') return tipo === 'libro' ? 'Leyendo' : 'Viendo';
  return tipo === 'libro' ? 'Leído' : 'Vista';
}

export const ESTADOS: Estado[] = ['pendiente', 'en_curso', 'completado'];

export function nextEstado(estado: Estado): Estado | null {
  if (estado === 'pendiente') return 'en_curso';
  if (estado === 'en_curso') return 'completado';
  return null;
}
