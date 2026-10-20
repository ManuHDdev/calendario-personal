import type { PlaceType, Profile } from '../types';

/** "850 m", "3,2 km", "128 km" (Spanish decimal comma). */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '-';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  const text = km >= 100 ? String(Math.round(km)) : km.toFixed(1).replace('.', ',');
  return `${text} km`;
}

/** "<1 min", "25 min", "1 h 05 min". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}

/** Prefixes "~" when a value comes from the straight-line fallback. */
export function approxPrefix(approx: boolean): string {
  return approx ? '~' : '';
}

/** Parses YYYY-MM-DD as a LOCAL date (never `new Date('YYYY-MM-DD')`, which is UTC and can shift a day). */
export function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "mié, 1 jul". */
export function formatDay(date: string): string {
  return parseDate(date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "1 jul 2026". */
export function formatDate(date: string): string {
  return parseDate(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatCost(value: number): string {
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
}

export const PROFILE_LABELS: Record<Profile, string> = {
  driving: 'Coche',
  foot: 'Andando',
  bike: 'Bici',
};

export interface PlaceTypeMeta {
  label: string;
  plural: string;
  color: string;
}

export const PLACE_TYPES: PlaceType[] = ['alojamiento', 'interes', 'comida', 'otro'];

export const PLACE_TYPE_META: Record<PlaceType, PlaceTypeMeta> = {
  alojamiento: { label: 'Alojamiento', plural: 'Alojamientos', color: '#5e5ce6' },
  interes: { label: 'Punto de interés', plural: 'Puntos de interés', color: '#ff9f0a' },
  comida: { label: 'Comida', plural: 'Comida', color: '#ff375f' },
  otro: { label: 'Otro', plural: 'Otros', color: '#8e8e93' },
};

/** Distinct colours for the daily route polylines (cycled). */
export const DAY_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#ac8e68'];

export function dayColor(index: number): string {
  return DAY_COLORS[index % DAY_COLORS.length];
}
