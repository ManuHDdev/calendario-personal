import { estadoLabel, nextEstado } from '../utils/labels';
import type { Item } from '../types';
import './ItemCard.css';

interface Props {
  item: Item;
  onEdit: (item: Item) => void;
  onAdvance: (item: Item) => void;
  onDelete: (item: Item) => void;
}

export default function ItemCard({ item, onEdit, onAdvance, onDelete }: Props) {
  const siguiente = nextEstado(item.estado);

  const handleDelete = () => {
    if (window.confirm(`¿Borrar "${item.titulo}"?`)) {
      onDelete(item);
    }
  };

  return (
    <div className="item-card">
      {item.poster_url ? (
        <img src={item.poster_url} alt="" className="item-card-poster" />
      ) : (
        <div className="item-card-poster item-card-poster--placeholder">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>
          </svg>
        </div>
      )}

      <div className="item-card-body">
        <span className={`item-card-badge item-card-badge--${item.tipo}`}>
          {item.tipo === 'pelicula' ? 'Película' : item.tipo === 'serie' ? 'Serie' : 'Libro'}
        </span>

        <h3 className="item-card-titulo">{item.titulo}</h3>
        {item.tipo === 'libro' && item.autor && (
          <p className="item-card-autor">{item.autor}</p>
        )}

        {item.rating != null && (
          <div className="item-card-rating">
            {'★'.repeat(item.rating)}
            <span className="item-card-rating-empty">{'★'.repeat(5 - item.rating)}</span>
          </div>
        )}

        {item.nota && <p className="item-card-nota">{item.nota}</p>}

        <div className="item-card-actions">
          <button type="button" className="card-btn" onClick={() => onEdit(item)} title="Editar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
          </button>

          {siguiente && (
            <button
              type="button"
              className="card-btn card-btn--advance"
              onClick={() => onAdvance(item)}
              title={`Marcar como ${estadoLabel(item.tipo, siguiente)}`}
            >
              {estadoLabel(item.tipo, siguiente)}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14"/>
                <path d="M12 5l7 7-7 7"/>
              </svg>
            </button>
          )}

          <button type="button" className="card-btn card-btn--delete" onClick={handleDelete} title="Borrar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
