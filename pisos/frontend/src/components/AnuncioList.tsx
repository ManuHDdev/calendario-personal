import { NOMBRE_PORTAL, type Anuncio } from '../types';

interface Props {
  anuncios: Anuncio[];
  onMarcarVisto: (id: string) => Promise<void>;
  onDescartar: (id: string) => Promise<void>;
}

function euros(valor: number | null): string {
  return valor === null ? '—' : `${valor.toLocaleString('es-ES')} €`;
}

function caracteristicas(a: Anuncio): string {
  return (
    [
      a.metros !== null ? `${a.metros} m²` : null,
      a.habitaciones !== null ? `${a.habitaciones} hab` : null,
      a.banos !== null ? `${a.banos} baños` : null,
      a.planta,
    ]
      .filter(Boolean)
      .join(' · ') || 'Sin detalles publicados'
  );
}

function antiguedad(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 60) return `hace ${Math.max(1, minutos)} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

export default function AnuncioList({ anuncios, onMarcarVisto, onDescartar }: Props) {
  if (anuncios.length === 0) {
    return (
      <p className="empty-hint">
        Nada por aquí. Si acabas de crear una búsqueda, pulsa «Buscar ahora» para la primera pasada.
      </p>
    );
  }

  return (
    <ul className="anuncio-grid">
      {anuncios.map((a) => {
        const bajada = a.precio !== null && a.precio_previo !== null && a.precio < a.precio_previo;
        return (
          <li key={a.id} className={`anuncio-card${a.visto ? '' : ' anuncio-card--nuevo'}`}>
            <a className="anuncio-imagen" href={a.url} target="_blank" rel="noopener noreferrer">
              {a.imagen_url ? (
                <img src={a.imagen_url} alt="" loading="lazy" />
              ) : (
                <span className="anuncio-sin-imagen">Sin foto</span>
              )}
              {!a.visto && <span className="badge-nuevo">Nuevo</span>}
            </a>

            <div className="anuncio-cuerpo">
              <div className="anuncio-precio-fila">
                <span className="anuncio-precio">{euros(a.precio)}</span>
                {bajada && <span className="anuncio-antes">{euros(a.precio_previo)}</span>}
                {a.precio_m2 !== null && <span className="anuncio-m2">{euros(a.precio_m2)}/m²</span>}
              </div>

              <a className="anuncio-titulo" href={a.url} target="_blank" rel="noopener noreferrer">
                {a.titulo}
              </a>

              <p className="anuncio-caract">{caracteristicas(a)}</p>
              {a.ubicacion && <p className="anuncio-ubicacion">{a.ubicacion}</p>}

              <p className="anuncio-meta">
                <span className="tag">{NOMBRE_PORTAL[a.portal] ?? a.portal}</span>
                <span>{a.busqueda_nombre}</span>
                <span>{antiguedad(a.created_at)}</span>
              </p>

              <div className="anuncio-acciones">
                {!a.visto && (
                  <button className="btn-secondary btn-mini" onClick={() => void onMarcarVisto(a.id)}>
                    Visto
                  </button>
                )}
                <button className="btn-secondary btn-mini" onClick={() => void onDescartar(a.id)}>
                  Descartar
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
