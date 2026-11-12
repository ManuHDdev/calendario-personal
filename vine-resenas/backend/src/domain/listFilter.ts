import type { ProductWithMedia } from './types';

export const UI_FILTERS = ['todos', 'faltan_fotos', 'falta_feedback', 'listos', 'resena_generada', 'en_espera'] as const;
export type UiFilter = (typeof UI_FILTERS)[number];

export interface ListQuery {
  q?: string;
  filter?: UiFilter;
  /**
   * When 'publicado' only published products are returned. Otherwise published and en_espera
   * products are excluded, except under filter 'en_espera' (its own section).
   */
  estado?: string;
}

function photoCount(p: ProductWithMedia): number {
  return p.media.filter((m) => m.type === 'photo').length;
}

/** Pure list filtering so it can be tested without a database. */
export function filterProducts(products: ProductWithMedia[], query: ListQuery): ProductWithMedia[] {
  const q = query.q?.trim().toLowerCase();
  const wantPublished = query.estado === 'publicado';
  const wantEspera = !wantPublished && query.filter === 'en_espera';
  return products.filter((p) => {
    if (wantPublished) {
      if (p.estado !== 'publicado') return false;
    } else if (wantEspera) {
      if (p.estado !== 'en_espera') return false;
    } else if (p.estado === 'publicado' || p.estado === 'en_espera') {
      return false;
    }
    if (q && !p.asin.toLowerCase().includes(q) && !p.titulo.toLowerCase().includes(q)) return false;
    switch (query.filter ?? 'todos') {
      case 'faltan_fotos':
        return photoCount(p) === 0;
      case 'falta_feedback':
        return p.feedback.trim() === '' || p.estrellas === null;
      case 'listos':
        return p.estado === 'listo';
      case 'resena_generada':
        return p.estado === 'resena_generada';
      default:
        return true;
    }
  });
}
