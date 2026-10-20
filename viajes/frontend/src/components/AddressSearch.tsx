import { useState, type FormEvent } from 'react';
import { searchAddress } from '../services/api';
import type { GeocodeHit } from '../types';

interface Props {
  onPick: (hit: GeocodeHit) => void;
  placeholder?: string;
}

/** Address search backed by the Nominatim proxy; results are chosen explicitly. */
export default function AddressSearch({ onPick, placeholder = 'Buscar dirección o lugar…' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true);
    setError('');
    try {
      setResults(await searchAddress(query.trim()));
    } catch (err) {
      setResults(null);
      setError(err instanceof Error ? err.message : 'Error en la búsqueda');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="address-search">
      <form onSubmit={submit} className="address-search-form" role="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Buscar dirección"
        />
        <button type="submit" className="btn-secondary" disabled={loading || query.trim().length < 2}>
          {loading ? '…' : 'Buscar'}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {results && results.length === 0 && <p className="empty-hint">Sin resultados para esa búsqueda.</p>}
      {results && results.length > 0 && (
        <ul className="address-results">
          {results.map((hit, i) => (
            <li key={`${hit.lat},${hit.lng},${i}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(hit);
                  setResults(null);
                }}
              >
                {hit.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
