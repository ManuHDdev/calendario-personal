import type { Presence } from '../types';

export function presenceLabel(p: Presence | undefined, now: number = Date.now()): string {
  if (!p) return '';
  if (p.status === 'online') return 'En línea';
  if (p.status === 'offline' || p.lastActivity === null) return 'Sin sesión';
  return formatAgo(now - p.lastActivity);
}

export function presenceTitle(p: Presence | undefined): string | undefined {
  if (!p) return undefined;
  if (p.status === 'online') return 'Actividad en los últimos 5 minutos';
  if (p.status === 'offline') return 'No tiene ninguna sesión abierta';
  return 'Sesión abierta, última actividad hace más de 5 minutos';
}

function formatAgo(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  return `Hace ${Math.floor(h / 24)} d`;
}
