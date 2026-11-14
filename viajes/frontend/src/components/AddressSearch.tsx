import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { searchAddress } from '../services/api';
import { PLACE_TYPE_META } from '../lib/format';
import { formatViewbox, hitKind, hitName, hitSubtitle, nextIndex, type ListKey, type MapBounds } from '../lib/addressSearch';
import type { GeocodeHit } from '../types';

interface Props {
  onPick: (hit: GeocodeHit) => void;
  placeholder?: string;
  /** Current map bounds, used to rank nearby results first (never to exclude the rest). */
  getBounds?: () => MapBounds | null;
}

/**
 * Place search backed by the Nominatim proxy. Explicit submit only: the public
 * Nominatim server forbids search-as-you-type.
 */
export default function AddressSearch({ onPick, placeholder = 'Buscar lugar o dirección…', getBounds }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeHit[] | null>(null);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const open = !!results && results.length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || query.trim().length < 2) return;
    setLoading(true);
    setError('');
    try {
      const bounds = getBounds?.() ?? null;
      const viewbox = bounds ? formatViewbox(bounds) : null;
      setResults(await searchAddress(query.trim(), viewbox ? { viewbox } : undefined));
      setActive(-1);
    } catch (err) {
      setResults(null);
      setError(err instanceof Error ? err.message : 'Error en la búsqueda');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setResults(null);
    setActive(-1);
  };

  const pick = (hit: GeocodeHit) => {
    onPick(hit);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (results) {
        e.preventDefault();
        close();
      }
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => nextIndex(i, e.key as ListKey, results.length));
    } else if (e.key === 'Enter' && active >= 0) {
      // Pick the highlighted result instead of submitting the search again.
      e.preventDefault();
      pick(results[active]);
    }
  };

  return (
    <div className="address-search">
      <form onSubmit={submit} className="address-search-form" role="search">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Buscar lugar o dirección"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        />
        <button type="submit" className="btn-secondary" disabled={loading || query.trim().length < 2}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      <div aria-live="polite">
        {error && <p className="form-error">{error}</p>}
        {loading && <p className="empty-hint">Buscando…</p>}
        {!loading && results && results.length === 0 && <p className="empty-hint">Sin resultados para esa búsqueda.</p>}
      </div>
      <ul id={listId} className="address-results" role="listbox" aria-label="Resultados de la búsqueda" hidden={!open}>
        {open &&
          results.map((hit, i) => {
            const meta = PLACE_TYPE_META[hitKind(hit)];
            const subtitle = hitSubtitle(hit);
            return (
              <li
                key={`${hit.lat},${hit.lng},${i}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={`address-result${i === active ? ' address-result--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                // mousedown (not click) so the input keeps focus and the pick is never lost.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(hit);
                }}
              >
                <span className="place-dot" style={{ background: meta.color }} aria-hidden="true" />
                <span className="address-result-text">
                  <span className="address-result-head">
                    <strong className="address-result-name">{hitName(hit)}</strong>
                    {hit.kindLabel && <span className="address-result-type">{hit.kindLabel}</span>}
                  </span>
                  {subtitle && <span className="address-result-sub">{subtitle}</span>}
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
