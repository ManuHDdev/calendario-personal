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

// Fallback: el preprocesado de imagen (escala de grises, contraste,
// umbralización) a veces hace que Tesseract pierda el separador decimal en
// capturas de apps bancarias — "99,50 €" se lee "9950 €". Como los importes
// bancarios en España siempre muestran 2 decimales, ante una tirada de 3+
// dígitos sin separador pegada al símbolo de moneda se interpretan los 2
// últimos como céntimos. Solo se usa si la búsqueda normal (con separador)
// no encontró nada, para no arriesgarse a reinterpretar un importe correcto.
const BARE_DIGITS_NEAR_CURRENCY_REGEX = /(-?)(\d{3,})\s?(€|EUR)/gi;

function normalizeBareDigits(sign: string, digits: string): number {
  const cents = digits.slice(-2);
  const whole = digits.slice(0, -2) || '0';
  const value = Number(`${whole}.${cents}`);
  return sign === '-' ? -value : value;
}

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

  if (bestAmount === null) {
    lines.forEach((line, idx) => {
      if (LABEL_WORDS.test(line)) return;
      const matches = line.matchAll(BARE_DIGITS_NEAR_CURRENCY_REGEX);
      for (const m of matches) {
        const value = normalizeBareDigits(m[1], m[2]);
        if (bestAmount === null || Math.abs(value) > Math.abs(bestAmount)) {
          bestAmount = value;
          bestLineIndex = idx;
        }
      }
    });
  }

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
