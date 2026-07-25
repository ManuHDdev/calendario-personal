import { extractDate } from './dateParser';
import { normalizeAmount, CURRENCY_NUMBER_SOURCE } from './amountParser';
import type { DraftGasto } from '../types/gasto';

// Perfil banco: solo cuentan números que llevan explícitamente el símbolo/
// sufijo de moneda o signo — así se evita confundir un importe con otros
// números en pantalla (hora, número de cuenta parcial, etc.) que no lo llevan.
const CURRENCY_WITH_SIGN_REGEX = new RegExp(
  `(${CURRENCY_NUMBER_SOURCE})\\s?(€|EUR)|(-${CURRENCY_NUMBER_SOURCE})`,
  'gi',
);
const LABEL_WORDS = /saldo|disponible|balance/i;
const NUMERIC_ONLY_LINE = /^[\d\s.,€$/:-]+$/;

const DEFAULT_CONCEPTO = 'Movimiento bancario';

/**
 * Perfil "banco": el importe es el número con formato de moneda (con € /
 * EUR / signo) más grande de toda la captura — las apps bancarias destacan el
 * importe como el número más prominente en pantalla; la fecha usa el mismo
 * regex que el perfil ticket; el concepto es la línea no numérica más cercana
 * al importe que no sea una etiqueta tipo "Saldo"/"Disponible". Ver design.md.
 */
export function parseBanco(text: string): DraftGasto {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  let bestLineIndex = -1;
  let bestAmount: number | null = null;

  lines.forEach((line, idx) => {
    // Las líneas de "Saldo"/"Disponible" casi siempre muestran un número
    // mayor que el importe real del movimiento — se excluyen de la búsqueda
    // del importe (no solo del concepto) para que no dominen la heurística
    // del "número más grande".
    if (LABEL_WORDS.test(line)) return;
    const matches = line.matchAll(CURRENCY_WITH_SIGN_REGEX);
    for (const m of matches) {
      const raw = m[1] ?? m[3] ?? m[0];
      const value = normalizeAmount(raw);
      if (value !== null && (bestAmount === null || Math.abs(value) > Math.abs(bestAmount))) {
        bestAmount = value;
        bestLineIndex = idx;
      }
    }
  });

  let comercio = DEFAULT_CONCEPTO;
  if (bestLineIndex >= 0) {
    const candidates = [lines[bestLineIndex - 1], lines[bestLineIndex + 1]].filter(
      (l): l is string => Boolean(l),
    );
    const found = candidates.find(
      (l) => l.length > 0 && !NUMERIC_ONLY_LINE.test(l) && !LABEL_WORDS.test(l),
    );
    if (found) comercio = found;
  }

  return {
    importe: bestAmount !== null ? Math.abs(bestAmount) : null,
    fecha: extractDate(text),
    comercio,
    concepto: comercio !== DEFAULT_CONCEPTO ? comercio : undefined,
  };
}
