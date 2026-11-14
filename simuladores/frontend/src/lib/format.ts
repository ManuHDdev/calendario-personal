const intFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

/** Integer with Spanish thousands separators. */
export function formatInt(n: number): string {
  return intFmt.format(n);
}

/** Decimal with a fixed number of digits, Spanish style (comma). */
export function formatDecimal(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Probability as a percentage. Very small values switch to scientific notation. */
export function formatPercent(p: number, digits = 2): string {
  if (!Number.isFinite(p)) return '—';
  const pct = p * 100;
  if (pct !== 0 && Math.abs(pct) < 10 ** -digits) return `${formatScientific(pct)} %`;
  return `${formatDecimal(pct, digits)} %`;
}

/** 7,89·10⁻³¹ style. */
export function formatScientific(x: number, digits = 2): string {
  if (x === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(x)));
  const mant = x / 10 ** exp;
  return `${formatDecimal(mant, digits)}·10${toSuperscript(exp)}`;
}

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

function toSuperscript(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join('');
}
