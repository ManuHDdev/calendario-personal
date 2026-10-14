export const MAX_SUGERENCIAS = 6;
export const SUGERENCIAS_VACIO = 5;

/** Lowercase, accent-free, trimmed: the form used to compare what someone typed with stored values. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Picks the suggestions to show for `texto` out of `opciones` (already ordered by usage by the server).
 * Empty input -> the 5 most used. Otherwise prefix matches first, then substring matches, each
 * keeping the server order, capped at 6. Duplicates (by normalised value) are dropped.
 */
export function sugerir(opciones: string[], texto: string): string[] {
  const unicas: string[] = [];
  const vistas = new Set<string>();
  for (const o of opciones) {
    const n = normalizar(o);
    if (!n || vistas.has(n)) continue;
    vistas.add(n);
    unicas.push(o);
  }

  const q = normalizar(texto);
  if (!q) return unicas.slice(0, SUGERENCIAS_VACIO);

  const prefijo: string[] = [];
  const contiene: string[] = [];
  for (const o of unicas) {
    const n = normalizar(o);
    if (n.startsWith(q)) prefijo.push(o);
    else if (n.includes(q)) contiene.push(o);
  }
  return [...prefijo, ...contiene].slice(0, MAX_SUGERENCIAS);
}

/** The stored option that equals `texto` ignoring case and accents, if any (keeps the stored spelling). */
export function opcionExacta(opciones: string[], texto: string): string | null {
  const q = normalizar(texto);
  if (!q) return null;
  return opciones.find((o) => normalizar(o) === q) ?? null;
}
