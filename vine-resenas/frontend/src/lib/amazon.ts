// Same rule as the backend (domain/validation.ts): 10 chars, A-Z and 0-9.
const ASIN_RE = /^[A-Z0-9]{10}$/;

/** Amazon.es product page for an ASIN, or null when the ASIN is not valid. */
export function amazonUrl(asin: string): string | null {
  return ASIN_RE.test(asin) ? `https://www.amazon.es/dp/${asin}` : null;
}
