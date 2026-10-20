/** "hace 5 min", "hace 3 h", "hace 2 d" — para la fecha de la última importación. */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'fecha desconocida';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}
