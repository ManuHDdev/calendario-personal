import { ESTADOS, estadoLabel, tipoLabel } from '../utils/labels';
import ItemCard from './ItemCard';
import type { Item, Tipo, Estado } from '../types';
import './ItemBoard.css';

interface Props {
  items: Item[];
  tipoFiltro: Tipo | 'todos';
  onTipoFiltroChange: (tipo: Tipo | 'todos') => void;
  onEdit: (item: Item) => void;
  onAdvance: (item: Item) => void;
  onDelete: (item: Item) => void;
}

const TIPOS_FILTRO: Array<Tipo | 'todos'> = ['todos', 'pelicula', 'serie', 'libro'];

function columnLabel(estado: Estado, tipoFiltro: Tipo | 'todos'): string {
  if (tipoFiltro === 'todos') {
    if (estado === 'pendiente') return 'Pendiente';
    if (estado === 'en_curso') return 'En curso';
    return 'Completado';
  }
  return estadoLabel(tipoFiltro, estado);
}

export default function ItemBoard({ items, tipoFiltro, onTipoFiltroChange, onEdit, onAdvance, onDelete }: Props) {
  return (
    <div className="item-board">
      <div className="board-filters">
        {TIPOS_FILTRO.map((t) => (
          <button
            key={t}
            type="button"
            className={`board-filter-btn${tipoFiltro === t ? ' board-filter-btn--active' : ''}`}
            onClick={() => onTipoFiltroChange(t)}
          >
            {t === 'todos' ? 'Todos' : tipoLabel(t)}
          </button>
        ))}
      </div>

      <div className="board-columns">
        {ESTADOS.map((estado) => {
          const columnItems = items.filter((i) => i.estado === estado);
          return (
            <div key={estado} className="board-column">
              <h3 className="board-column-title">
                {columnLabel(estado, tipoFiltro)}
                <span className="board-column-count">{columnItems.length}</span>
              </h3>
              <div className="board-column-items">
                {columnItems.length === 0 && (
                  <p className="board-empty-hint">Sin ítems</p>
                )}
                {columnItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onEdit={onEdit}
                    onAdvance={onAdvance}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
