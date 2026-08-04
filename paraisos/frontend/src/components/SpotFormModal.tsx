import { useState, useEffect } from 'react';
import { createSpot, updateSpot, upsertParking, deleteParking } from '../services/api';
import type { SpotDetail, SpotCreateData, SpotUpdateData } from '../types';
import './SpotFormModal.css';

interface Props {
  spot: SpotDetail | null;
  initialCoords?: { lat: number; lng: number } | null;
  pendingParkingCoords?: { lat: number; lng: number } | null;
  hidden?: boolean;
  onSave: () => void;
  onClose: () => void;
  onPickFromMap?: (target: 'spot' | 'parking') => void;
}

export default function SpotFormModal({ spot, initialCoords, pendingParkingCoords, hidden, onSave, onClose, onPickFromMap }: Props) {
  const isEditing = spot !== null;
  const [nombre, setNombre] = useState(spot?.nombre ?? '');
  const [region, setRegion] = useState(spot?.region ?? '');
  const [provincia, setProvincia] = useState(spot?.provincia ?? '');
  const [latitud, setLatitud] = useState(
    spot?.latitud?.toString() ?? initialCoords?.lat?.toFixed(6) ?? ''
  );
  const [longitud, setLongitud] = useState(
    spot?.longitud?.toString() ?? initialCoords?.lng?.toFixed(6) ?? ''
  );
  const [imagenUrl, setImagenUrl] = useState(spot?.imagen_url ?? '');
  const [descripcion, setDescripcion] = useState(spot?.descripcion ?? '');
  const [categoria, setCategoria] = useState<'piscina' | 'ruta' | 'playa'>(spot?.categoria ?? 'piscina');
  const [hasParking, setHasParking] = useState(spot?.parking != null);
  const [parkingLat, setParkingLat] = useState(spot?.parking?.latitud?.toString() ?? '');
  const [parkingLng, setParkingLng] = useState(spot?.parking?.longitud?.toString() ?? '');
  const [parkingDesc, setParkingDesc] = useState(spot?.parking?.descripcion ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update parking coords when returning from map pick
  useEffect(() => {
    if (pendingParkingCoords) {
      setParkingLat(pendingParkingCoords.lat.toFixed(6));
      setParkingLng(pendingParkingCoords.lng.toFixed(6));
      setHasParking(true);
    }
  }, [pendingParkingCoords]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const lat = parseFloat(latitud);
    const lng = parseFloat(longitud);

    if (!nombre.trim()) { setError('El nombre es obligatorio'); return; }
    if (isNaN(lat) || lat < -90 || lat > 90) { setError('Latitud inválida'); return; }
    if (isNaN(lng) || lng < -180 || lng > 180) { setError('Longitud inválida'); return; }

    if (hasParking) {
      const pLat = parseFloat(parkingLat);
      const pLng = parseFloat(parkingLng);
      if (isNaN(pLat) || pLat < -90 || pLat > 90) { setError('Latitud de aparcamiento inválida'); return; }
      if (isNaN(pLng) || pLng < -180 || pLng > 180) { setError('Longitud de aparcamiento inválida'); return; }
    }

    setSaving(true);
    try {
      let spotId: number;

      if (isEditing) {
        const data: SpotUpdateData = {
          nombre: nombre.trim(),
          region: region.trim() || undefined,
          provincia: provincia.trim() || undefined,
          latitud: lat,
          longitud: lng,
          imagen_url: imagenUrl.trim() || null,
          descripcion: descripcion.trim() || null,
          categoria,
        };
        await updateSpot(spot.id, data);
        spotId = spot.id;
      } else {
        const data: SpotCreateData = {
          nombre: nombre.trim(),
          region: region.trim() || undefined,
          provincia: provincia.trim() || undefined,
          latitud: lat,
          longitud: lng,
          imagen_url: imagenUrl.trim() || undefined,
          descripcion: descripcion.trim() || undefined,
          categoria,
        };
        const created = await createSpot(data);
        spotId = created.id;
      }

      // Handle parking
      if (hasParking) {
        const pLat = parseFloat(parkingLat);
        const pLng = parseFloat(parkingLng);
        await upsertParking(spotId, {
          latitud: pLat,
          longitud: pLng,
          descripcion: parkingDesc.trim() || undefined,
        });
      } else if (isEditing && spot?.parking) {
        await deleteParking(spot.id);
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={hidden ? { display: 'none' } : undefined}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? 'Editar spot' : 'Nuevo spot'}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="nombre">Nombre *</label>
            <input
              id="nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Garganta de los Infiernos"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="region">Región</label>
              <input
                id="region"
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Extremadura"
              />
            </div>
            <div className="form-group">
              <label htmlFor="provincia">Provincia</label>
              <input
                id="provincia"
                type="text"
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                placeholder="Cáceres"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="latitud">Latitud *</label>
              <input
                id="latitud"
                type="text"
                value={latitud}
                onChange={(e) => setLatitud(e.target.value)}
                placeholder="40.200967"
              />
            </div>
            <div className="form-group">
              <label htmlFor="longitud">Longitud *</label>
              <input
                id="longitud"
                type="text"
                value={longitud}
                onChange={(e) => setLongitud(e.target.value)}
                placeholder="-5.754287"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="imagen">URL de la imagen</label>
            <input
              id="imagen"
              type="url"
              value={imagenUrl}
              onChange={(e) => setImagenUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="descripcion">Descripción</label>
            <textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Notas sobre el lugar, cómo llegar, qué llevar..."
              rows={3}
              className="form-textarea"
            />
          </div>

          <div className="form-group">
            <label htmlFor="categoria">Categoría *</label>
            <div className="category-selector">
              {(['piscina', 'ruta', 'playa'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`category-option${categoria === cat ? ' category-option--active' : ''}`}
                  data-category={cat}
                  onClick={() => setCategoria(cat)}
                >
                  {cat === 'piscina' ? 'Piscina' : cat === 'ruta' ? 'Ruta' : 'Playa'}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" checked={hasParking} onChange={(e) => setHasParking(e.target.checked)} />
              <span>Tiene aparcamiento cercano</span>
            </label>
          </div>

          {hasParking && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="parkingLat">Lat. aparcamiento *</label>
                  <input
                    id="parkingLat"
                    type="text"
                    value={parkingLat}
                    onChange={(e) => setParkingLat(e.target.value)}
                    placeholder="40.200967"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="parkingLng">Lng. aparcamiento *</label>
                  <input
                    id="parkingLng"
                    type="text"
                    value={parkingLng}
                    onChange={(e) => setParkingLng(e.target.value)}
                    placeholder="-5.754287"
                  />
                </div>
              </div>
              {onPickFromMap && (
                <button type="button" className="pick-map-btn" onClick={() => onPickFromMap('parking')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    <circle cx="12" cy="9" r="2.5"/>
                  </svg>
                  Seleccionar aparcamiento en mapa
                </button>
              )}
              <div className="form-group">
                <label htmlFor="parkingDesc">Notas aparcamiento</label>
                <input
                  id="parkingDesc"
                  type="text"
                  value={parkingDesc}
                  onChange={(e) => setParkingDesc(e.target.value)}
                  placeholder="Parking gratuito junto al río"
                />
              </div>
            </>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear spot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
