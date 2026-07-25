// dd/mm/yyyy o dd-mm-yyyy, usado por ambos perfiles (ticket y banco) — ver design.md.
const DATE_REGEX = /\b(\d{2})[/-](\d{2})[/-](\d{4})\b/;

/**
 * Extrae la primera fecha dd/mm/yyyy o dd-mm-yyyy del texto OCR. Si no
 * encuentra ninguna, cae en la fecha de hoy (regla explícita del spec: nunca
 * dejar el campo vacío).
 */
export function extractDate(text: string, now: Date = new Date()): string {
  const match = text.match(DATE_REGEX);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
  }
  return now.toISOString().slice(0, 10);
}
