import type { Estado, ProductSummary, UiFilter } from '../types';

export const FILTER_CHIPS: { value: UiFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'faltan_fotos', label: 'Faltan fotos' },
  { value: 'falta_feedback', label: 'Falta feedback' },
  { value: 'listos', label: 'Listos' },
  { value: 'resena_generada', label: 'Reseña generada' },
  { value: 'en_espera', label: 'En espera' },
];

export const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: 'Pendiente',
  listo: 'Listo',
  en_espera: 'En espera',
  resena_generada: 'Reseña generada',
  publicado: 'Publicado',
};

/** Builds the query string for GET /ui/products. */
export function buildListQuery(opts: { filter: UiFilter; q: string; archive?: boolean }): string {
  const params = new URLSearchParams();
  if (opts.archive) {
    params.set('estado', 'publicado');
  } else if (opts.filter !== 'todos') {
    params.set('filter', opts.filter);
  }
  const q = opts.q.trim();
  if (q) params.set('q', q);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function pendientesLabel(n: number): string {
  return n === 1 ? '1 pendiente' : `${n} pendientes`;
}

export interface Badge {
  key: 'photos' | 'video' | 'feedback' | 'stars' | 'estado';
  label: string;
  /** ok = complete, warn = missing, neutral = informational */
  tone: 'ok' | 'warn' | 'neutral';
}

export function badgesFor(p: ProductSummary): Badge[] {
  return [
    {
      key: 'photos',
      label: p.photo_count === 1 ? '1 foto' : `${p.photo_count} fotos`,
      tone: p.photo_count > 0 ? 'ok' : 'warn',
    },
    { key: 'video', label: p.has_video ? 'Vídeo' : 'Sin vídeo', tone: p.has_video ? 'ok' : 'neutral' },
    { key: 'feedback', label: p.has_feedback ? 'Feedback' : 'Sin feedback', tone: p.has_feedback ? 'ok' : 'warn' },
    {
      key: 'stars',
      label: p.estrellas === null ? 'Sin estrellas' : `${p.estrellas} ★`,
      tone: p.estrellas === null ? 'warn' : 'ok',
    },
    { key: 'estado', label: ESTADO_LABEL[p.estado], tone: 'neutral' },
  ];
}
