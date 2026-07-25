/**
 * Normaliza un número con formato de moneda español (separador de miles '.',
 * decimales ',') o el formato inverso, con o sin símbolo/sufijo de moneda, a
 * un `number` de JS. Devuelve null si no se puede interpretar como número.
 */
export function normalizeAmount(raw: string): number | null {
  let s = raw.replace(/[€$]/g, '').replace(/EUR/gi, '').trim();
  if (!s) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // El separador que aparece último es el decimal; el otro es de miles.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Número con formato de moneda: 1-3 dígitos, grupos opcionales de miles
// separados por '.' o ',', y dos decimales opcionales, con signo opcional.
export const CURRENCY_NUMBER_SOURCE = String.raw`-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?`;

/** Busca el primer número con formato de moneda en una línea de texto. */
export function findCurrencyNumber(line: string): string | null {
  const match = line.match(new RegExp(CURRENCY_NUMBER_SOURCE));
  return match ? match[0] : null;
}
