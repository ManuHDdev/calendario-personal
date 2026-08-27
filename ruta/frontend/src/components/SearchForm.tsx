import { useState, type FormEvent } from 'react';
import { geocode } from '../services/api';
import type { GeocodeResult, RouteSearchRequest } from '../types';

export interface SearchFormValues {
  origenTexto: string;
  destinoTexto: string;
  keyword: string;
  desvioMaxKm: number;
  minPrice: string;
  maxPrice: string;
  excluirPalabras: string;
}

export const EMPTY_FORM: SearchFormValues = {
  origenTexto: '',
  destinoTexto: '',
  keyword: '',
  desvioMaxKm: 5,
  minPrice: '',
  maxPrice: '',
  excluirPalabras: '',
};

interface Props {
  values: SearchFormValues;
  onChange: (values: SearchFormValues) => void;
  onSearch: (request: RouteSearchRequest, resolved: { origen: string; destino: string }) => void;
  onSave: (request: RouteSearchRequest, resolved: { origen: string; destino: string }) => void;
  searching: boolean;
}

function parsePrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export default function SearchForm({ values, onChange, onSearch, onSave, searching }: Props) {
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<{ origen: GeocodeResult; destino: GeocodeResult } | null>(
    null,
  );

  const set = <K extends keyof SearchFormValues>(key: K, value: SearchFormValues[K]) => {
    onChange({ ...values, [key]: value });
    // Any edit to the endpoints invalidates the confirmation shown below them.
    if (key === 'origenTexto' || key === 'destinoTexto') setPlaces(null);
  };

  /**
   * Resolves both endpoints and builds the request.
   *
   * Geocoding happens here rather than on every keystroke: Nominatim is a free
   * shared service with a one-request-per-second policy, so it is called only
   * when the user actually commits to a search.
   */
  async function buildRequest(): Promise<{
    request: RouteSearchRequest;
    resolved: { origen: string; destino: string };
  } | null> {
    setError(null);

    if (!values.origenTexto.trim() || !values.destinoTexto.trim()) {
      setError('Indica un origen y un destino');
      return null;
    }
    if (values.keyword.trim().length < 2) {
      setError('Escribe al menos 2 caracteres de lo que buscas');
      return null;
    }

    const minPrice = parsePrice(values.minPrice);
    const maxPrice = parsePrice(values.maxPrice);
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      setError('El precio minimo no puede ser mayor que el maximo');
      return null;
    }

    setResolving(true);
    try {
      // Sequential, not parallel: the backend serialises Nominatim calls to
      // honour its rate limit, so firing both at once only queues them anyway.
      const origen = await geocode(values.origenTexto);
      const destino = await geocode(values.destinoTexto);
      setPlaces({ origen, destino });

      return {
        request: {
          origen: { lat: origen.lat, lng: origen.lng },
          destino: { lat: destino.lat, lng: destino.lng },
          keyword: values.keyword.trim(),
          desvio_max_km: values.desvioMaxKm,
          min_price: minPrice,
          max_price: maxPrice,
          excluir_palabras: values.excluirPalabras.trim() || null,
        },
        resolved: { origen: origen.displayName, destino: destino.displayName },
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo resolver el trayecto');
      return null;
    } finally {
      setResolving(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const built = await buildRequest();
    if (built) onSearch(built.request, built.resolved);
  }

  async function handleSave() {
    const built = await buildRequest();
    if (built) onSave(built.request, built.resolved);
  }

  const busy = searching || resolving;

  return (
    <form className="ruta-form" onSubmit={handleSubmit}>
      <div className="ruta-form__row">
        <label htmlFor="origen">Desde</label>
        <input
          id="origen"
          type="text"
          placeholder="La Coronada"
          value={values.origenTexto}
          onChange={(e) => set('origenTexto', e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="ruta-form__row">
        <label htmlFor="destino">Hasta</label>
        <input
          id="destino"
          type="text"
          placeholder="Madrid"
          value={values.destinoTexto}
          onChange={(e) => set('destinoTexto', e.target.value)}
          disabled={busy}
        />
      </div>

      {places && (
        <p className="ruta-form__resolved">
          {places.origen.displayName} → {places.destino.displayName}
        </p>
      )}

      <div className="ruta-form__row">
        <label htmlFor="keyword">Que buscas</label>
        <input
          id="keyword"
          type="text"
          placeholder="bicicleta de montana"
          value={values.keyword}
          onChange={(e) => set('keyword', e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="ruta-form__row">
        <label htmlFor="desvio">
          Desvio maximo <strong>{values.desvioMaxKm} km</strong>
        </label>
        <input
          id="desvio"
          type="range"
          min={1}
          max={50}
          step={1}
          value={values.desvioMaxKm}
          onChange={(e) => set('desvioMaxKm', Number(e.target.value))}
          disabled={busy}
        />
      </div>

      <div className="ruta-form__row ruta-form__row--split">
        <div>
          <label htmlFor="min-price">Precio min</label>
          <input
            id="min-price"
            type="number"
            min={0}
            placeholder="—"
            value={values.minPrice}
            onChange={(e) => set('minPrice', e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor="max-price">Precio max</label>
          <input
            id="max-price"
            type="number"
            min={0}
            placeholder="—"
            value={values.maxPrice}
            onChange={(e) => set('maxPrice', e.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      <div className="ruta-form__row">
        <label htmlFor="excluir">Excluir palabras</label>
        <input
          id="excluir"
          type="text"
          placeholder="carta, cartas, funda"
          value={values.excluirPalabras}
          onChange={(e) => set('excluirPalabras', e.target.value)}
          disabled={busy}
        />
        <small>
          Separadas por comas. Wallapop busca de forma difusa y suele colar otro tipo de producto.
        </small>
      </div>

      {error && <p className="ruta-form__error">{error}</p>}

      <div className="ruta-form__actions">
        <button type="submit" className="ruta-btn ruta-btn--primary" disabled={busy}>
          {searching ? 'Buscando…' : resolving ? 'Localizando…' : 'Buscar en la ruta'}
        </button>
        <button type="button" className="ruta-btn" onClick={handleSave} disabled={busy}>
          Guardar
        </button>
      </div>
    </form>
  );
}
