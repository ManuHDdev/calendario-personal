/** Acepta "38,8794" y "38.8794". Devuelve null si no es un número. */
export function parsearCoordenada(texto: string): number | null {
  const n = Number(texto.trim().replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) ? n : null;
}
