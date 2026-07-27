import { useState, type FormEvent } from 'react';
import type { Busqueda, BusquedaFormData, Sitios } from '../types';

interface Props {
  initial?: Busqueda;
  onSubmit: (data: BusquedaFormData) => Promise<void>;
  onCancel?: () => void;
}

const defaultSitios: Sitios = {
  wallapop: { enabled: true },
  milanuncios: { enabled: false },
  vinted: { enabled: false },
};

/** Alta/edición de una búsqueda guardada — mismos campos que `busqueda` (ver design.md). */
export default function SearchForm({ initial, onSubmit, onCancel }: Props) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [keyword, setKeyword] = useState(initial?.keyword ?? '');
  const [precioMin, setPrecioMin] = useState(initial?.precio_min?.toString() ?? '');
  const [precioMax, setPrecioMax] = useState(initial?.precio_max?.toString() ?? '');
  const [latitude, setLatitude] = useState(initial?.latitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(initial?.longitude?.toString() ?? '');
  const [distanceKm, setDistanceKm] = useState(initial?.distance_km?.toString() ?? '');
  const [provinceSlug, setProvinceSlug] = useState(initial?.milanuncios_province_slug ?? '');
  const [languageFilter, setLanguageFilter] = useState(initial?.language_filter ?? '');
  const [sitios, setSitios] = useState<Sitios>(initial?.sitios ?? defaultSitios);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleSite = (site: keyof Sitios) => {
    setSitios((prev) => ({ ...prev, [site]: { enabled: !prev[site].enabled } }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!nombre.trim() || !keyword.trim()) {
      setError('Nombre y keyword son obligatorios');
      return;
    }
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const dist = parseFloat(distanceKm);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(dist) || dist <= 0) {
      setError('Latitud, longitud y distancia deben ser números válidos');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        keyword: keyword.trim(),
        precio_min: precioMin.trim() ? parseFloat(precioMin) : null,
        precio_max: precioMax.trim() ? parseFloat(precioMax) : null,
        latitude: lat,
        longitude: lon,
        distance_km: dist,
        milanuncios_province_slug: provinceSlug.trim() || null,
        language_filter: languageFilter.trim() || null,
        sitios,
      });
      if (!initial) {
        setNombre('');
        setKeyword('');
        setPrecioMin('');
        setPrecioMax('');
        setLatitude('');
        setLongitude('');
        setDistanceKm('');
        setProvinceSlug('');
        setLanguageFilter('');
        setSitios(defaultSitios);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la búsqueda');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      <div className="search-form-row">
        <input
          type="text" placeholder="Nombre (p. ej. Juegos DS baratos)"
          value={nombre} onChange={(e) => setNombre(e.target.value)} required
        />
        <input
          type="text" placeholder="Keyword de búsqueda"
          value={keyword} onChange={(e) => setKeyword(e.target.value)} required
        />
      </div>
      <div className="search-form-row">
        <input
          type="number" step="0.01" min="0" placeholder="Precio mínimo (opcional)"
          value={precioMin} onChange={(e) => setPrecioMin(e.target.value)}
        />
        <input
          type="number" step="0.01" min="0" placeholder="Precio máximo (opcional)"
          value={precioMax} onChange={(e) => setPrecioMax(e.target.value)}
        />
      </div>
      <div className="search-form-row">
        <input
          type="number" step="0.0001" placeholder="Latitud"
          value={latitude} onChange={(e) => setLatitude(e.target.value)} required
        />
        <input
          type="number" step="0.0001" placeholder="Longitud"
          value={longitude} onChange={(e) => setLongitude(e.target.value)} required
        />
        <input
          type="number" step="1" min="1" placeholder="Distancia (km)"
          value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} required
        />
      </div>
      <div className="search-form-row">
        <input
          type="text" placeholder="Slug de provincia Milanuncios (opcional)"
          value={provinceSlug} onChange={(e) => setProvinceSlug(e.target.value)}
        />
        <input
          type="text" placeholder="Idioma (es, opcional)" maxLength={2}
          value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}
        />
      </div>
      <div className="search-form-sites">
        {(Object.keys(sitios) as (keyof Sitios)[]).map((site) => (
          <label key={site} className="search-form-site-toggle">
            <input type="checkbox" checked={sitios[site].enabled} onChange={() => toggleSite(site)} />
            <span>{site}</span>
          </label>
        ))}
      </div>
      <div className="search-form-actions">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Añadir búsqueda'}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        )}
      </div>
      {error && <div className="search-form-error">{error}</div>}
    </form>
  );
}
