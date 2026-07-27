/**
 * Fila única de `scraper_state` (id=1). Representa el on/off global del
 * scraper externo marketplace-watcher, controlado por el propietario desde
 * la UI de Ofertas.
 */
export interface ScraperState {
  running: boolean;
  updated_at: string;
}
