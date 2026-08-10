import { useEffect, useState } from 'react';
import { createItem, updateItem } from '../services/api';
import { estadoLabel, tipoLabel } from '../utils/labels';
import SearchAutocomplete from './SearchAutocomplete';
import type { Item, Tipo, Fuente, Estado, SearchResult } from '../types';
import './ItemFormModal.css';

interface Props {
  item: Item | null;
  defaultTipo?: Tipo;
  onSave: () => void;
  onClose: () => void;
}

const TIPOS: Tipo[] = ['pelicula', 'serie', 'libro'];
const ESTADOS: Estado[] = ['pendiente', 'en_curso', 'completado'];

function fuenteForTipo(tipo: Tipo): Fuente {
  return tipo === 'libro' ? 'google_books' : 'tmdb';
}

export default function ItemFormModal({ item, defaultTipo, onSave, onClose }: Props) {
  const isEditing = item !== null;

  const [tipo, setTipo] = useState<Tipo>(item?.tipo ?? defaultTipo ?? 'pelicula');
  const [manual, setManual] = useState(isEditing ? item.fuente === 'manual' || item.fuente == null : false);
  const [titulo, setTitulo] = useState(item?.titulo ?? '');
  const [autor, setAutor] = useState(item?.autor ?? '');
  const [posterUrl, setPosterUrl] = useState(item?.poster_url ?? '');
  const [sinopsis, setSinopsis] = useState(item?.sinopsis ?? '');
  const [externalId, setExternalId] = useState<string | undefined>(item?.external_id ?? undefined);
  const [fuente, setFuente] = useState<Fuente | undefined>(item?.fuente ?? undefined);
  const [nota, setNota] = useState(item?.nota ?? '');
  const [estado, setEstado] = useState<Estado>(item?.estado ?? 'pendiente');
  const [rating, setRating] = useState<number | null>(item?.rating ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSelectResult = (result: SearchResult) => {
    setTitulo(result.titulo);
    setAutor(result.autor ?? '');
    setPosterUrl(result.poster_url ?? '');
    setSinopsis(result.sinopsis ?? '');
    setExternalId(result.external_id);
    setFuente(fuenteForTipo(tipo));
  };

  const handleManualToggle = (value: boolean) => {
    setManual(value);
    if (value) {
      setExternalId(undefined);
      setFuente('manual');
    } else {
      setExternalId(undefined);
      setFuente(undefined);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!titulo.trim()) {
      setError('El título es obligatorio');
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateItem(item.id, {
          titulo: titulo.trim(),
          autor: autor.trim() || null,
          poster_url: posterUrl.trim() || null,
          sinopsis: sinopsis.trim() || null,
          external_id: manual ? null : externalId ?? null,
          fuente: manual ? 'manual' : fuente ?? null,
          nota: nota.trim() || null,
          estado,
          rating,
        });
      } else {
        await createItem({
          tipo,
          titulo: titulo.trim(),
          autor: autor.trim() || undefined,
          poster_url: posterUrl.trim() || undefined,
          sinopsis: sinopsis.trim() || undefined,
          external_id: manual ? undefined : externalId,
          fuente: manual ? 'manual' : fuente,
          nota: nota.trim() || undefined,
          estado,
          rating: rating ?? undefined,
        });
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? 'Editar ítem' : 'Nuevo ítem'}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Tipo</label>
            {isEditing ? (
              <p className="form-static">{tipoLabel(tipo)}</p>
            ) : (
              <div className="tipo-selector">
                {TIPOS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`tipo-option${tipo === t ? ' tipo-option--active' : ''}`}
                    data-tipo={t}
                    onClick={() => {
                      setTipo(t);
                      setExternalId(undefined);
                      setFuente(manual ? 'manual' : undefined);
                    }}
                  >
                    {tipoLabel(t)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={manual}
                onChange={(e) => handleManualToggle(e.target.checked)}
              />
              <span>Entrada manual (sin buscar)</span>
            </label>
          </div>

          {!manual && (
            <div className="form-group">
              <label>Buscar</label>
              <SearchAutocomplete tipo={tipo} onSelect={handleSelectResult} />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="titulo">Título *</label>
            <input
              id="titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título"
            />
          </div>

          {tipo === 'libro' && (
            <div className="form-group">
              <label htmlFor="autor">Autor</label>
              <input
                id="autor"
                type="text"
                value={autor}
                onChange={(e) => setAutor(e.target.value)}
                placeholder="Autor"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="posterUrl">URL del póster</label>
            <input
              id="posterUrl"
              type="url"
              value={posterUrl}
              onChange={(e) => setPosterUrl(e.target.value)}
              placeholder="https://..."
            />
            {posterUrl && <img src={posterUrl} alt="Vista previa" className="image-preview" />}
          </div>

          <div className="form-group">
            <label htmlFor="sinopsis">Sinopsis</label>
            <textarea
              id="sinopsis"
              value={sinopsis}
              onChange={(e) => setSinopsis(e.target.value)}
              placeholder="Sinopsis breve..."
              rows={3}
              className="form-textarea"
            />
          </div>

          <div className="form-group">
            <label htmlFor="nota">Nota</label>
            <textarea
              id="nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Notas personales..."
              rows={2}
              className="form-textarea"
            />
          </div>

          <div className="form-group">
            <label htmlFor="estado">Estado</label>
            <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value as Estado)}>
              {ESTADOS.map((es) => (
                <option key={es} value={es}>{estadoLabel(tipo, es)}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Valoración</label>
            <div className="rating-picker">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`rating-star${rating != null && n <= rating ? ' rating-star--active' : ''}`}
                  onClick={() => setRating(rating === n ? null : n)}
                  aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
