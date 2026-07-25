import { extractDate } from './dateParser';
import { normalizeAmount, findCurrencyNumber } from './amountParser';
import type { DraftGasto } from '../types/gasto';

const TOTAL_LINE_REGEX = /\b(TOTAL|IMPORTE\s+TOTAL|A\s+PAGAR)\b/i;
// Una línea es "puramente numérica" (fecha, importe, código de barras, etc.)
// si tras quitar dígitos/espacios/separadores de moneda no queda nada.
const NUMERIC_ONLY_LINE = /^[\d\s.,€$/:-]+$/;

const DEFAULT_COMERCIO = 'Comercio no detectado';

/**
 * Perfil "ticket": busca una línea TOTAL/IMPORTE TOTAL/A PAGAR y el número con
 * formato de moneda más cercano (misma línea o la siguiente); la fecha con el
 * regex dd/mm/yyyy o dd-mm-yyyy (hoy si no aparece); el comercio es la primera
 * línea no vacía y no puramente numérica del ticket (típicamente cabecera con
 * el nombre de la tienda). Ver openspec design.md.
 */
export function parseTicket(text: string): DraftGasto {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  let importe: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!TOTAL_LINE_REGEX.test(lines[i])) continue;
    const onSameLine = findCurrencyNumber(lines[i].replace(TOTAL_LINE_REGEX, ''));
    const onNextLine = onSameLine ? null : findCurrencyNumber(lines[i + 1] ?? '');
    const raw = onSameLine ?? onNextLine;
    if (raw) {
      const value = normalizeAmount(raw);
      if (value !== null) {
        importe = value;
        break;
      }
    }
  }

  const comercio =
    lines.find((l) => l.length > 0 && !NUMERIC_ONLY_LINE.test(l) && !TOTAL_LINE_REGEX.test(l)) ||
    DEFAULT_COMERCIO;

  return {
    importe,
    fecha: extractDate(text),
    comercio,
  };
}
