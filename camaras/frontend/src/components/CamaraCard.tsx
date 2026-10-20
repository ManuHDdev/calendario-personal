import CamaraImagen from './CamaraImagen';
import type { Camara } from '../types';

interface Props {
  camara: Camara;
  ciudadNombre: string;
  onAbrir: (camara: Camara) => void;
  onFavorita: (camara: Camara) => void;
}

export default function CamaraCard({ camara, ciudadNombre, onAbrir, onFavorita }: Props) {
  return (
    <article className="cam-card">
      <button type="button" className="cam-card__abrir" onClick={() => onAbrir(camara)} aria-label={`Abrir ${camara.nombre}`}>
        <CamaraImagen id={camara.id} alt={camara.nombre} sinImagen={!camara.tieneImagen} refrescoSegundos={60} reintentable={false} />
      </button>
      <div className="cam-card__pie">
        <div className="cam-card__texto">
          <h3 title={camara.nombre}>{camara.nombre}</h3>
          <p>{ciudadNombre}{camara.carretera ? ` · ${camara.carretera}` : ''}</p>
        </div>
        <button
          type="button"
          className={`cam-icono-btn${camara.favorita ? ' cam-icono-btn--activo' : ''}`}
          onClick={() => onFavorita(camara)}
          aria-label={camara.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
          aria-pressed={camara.favorita}
        >
          {camara.favorita ? '★' : '☆'}
        </button>
      </div>
    </article>
  );
}
