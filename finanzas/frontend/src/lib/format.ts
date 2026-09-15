const eurFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export function formatEUR(valor: number): string {
  if (!Number.isFinite(valor)) return '—';
  return eurFormatter.format(valor);
}
