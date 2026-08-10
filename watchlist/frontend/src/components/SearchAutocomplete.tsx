import { useEffect, useRef, useState } from 'react';
import { searchMovies, searchTv, searchBooks, ApiError } from '../services/api';
import type { Tipo, SearchResult } from '../types';
import './SearchAutocomplete.css';

interface Props {
  tipo: Tipo;
  onSelect: (result: SearchResult) => void;
}

function searchFn(tipo: Tipo) {
  if (tipo === 'pelicula') return searchMovies;
  if (tipo === 'serie') return searchTv;
  return searchBooks;
}

export default function SearchAutocomplete({ tipo, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Reset resultados al cambiar de tipo (evita mostrar resultados de otra búsqueda)
    setQuery('');
    setResults([]);
    setSearched(false);
    setNotConfigured(false);
    setError(null);
  }, [tipo]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setNotConfigured(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      setNotConfigured(false);
      try {
        const data = await searchFn(tipo)(query.trim());
        setResults(data);
        setSearched(true);
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 503) {
          setNotConfigured(true);
        } else {
          setError(err instanceof Error ? err.message : 'Error al buscar');
        }
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tipo]);

  return (
    <div className="search-autocomplete">
      <input
        type="text"
        className="search-input"
        placeholder="Buscar por título…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading && <p className="search-hint">Buscando…</p>}

      {!loading && notConfigured && (
        <p className="search-hint search-hint--warn">
          Búsqueda no configurada — usa entrada manual.
        </p>
      )}

      {!loading && error && (
        <p className="search-hint search-hint--error">{error}</p>
      )}

      {!loading && !notConfigured && !error && searched && results.length === 0 && (
        <p className="search-hint">Sin resultados.</p>
      )}

      {!loading && results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.external_id}>
              <button
                type="button"
                className="search-result-item"
                onClick={() => onSelect(r)}
              >
                {r.poster_url ? (
                  <img src={r.poster_url} alt="" className="search-result-poster" />
                ) : (
                  <span className="search-result-poster search-result-poster--placeholder" />
                )}
                <span className="search-result-info">
                  <span className="search-result-titulo">{r.titulo}</span>
                  {r.autor && <span className="search-result-autor">{r.autor}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
