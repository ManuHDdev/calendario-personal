import { NOMBRE_PORTAL, type Anuncio } from '../types';
import { Semaforo, AvisoNoCertifica } from './veredicto';

interface Props {
  anuncio: Anuncio;
  onMarcarVisto: (id: number) => void;
  onDescartar: (id: number) => void;
}

function euros(v: number | null): string {
  return v === null ? '—' : `${v.toLocaleString('es-ES')} €`;
}

export default function AnuncioCard({ anuncio: a, onMarcarVisto, onDescartar }: Props) {
  const esFarmacia = a.tipo === 'farmacia';
  return (
    <li className={`anuncio-card${a.visto ? '' : ' anuncio-card--nuevo'}`}>
      <a className="anuncio-imagen" href={a.url} target="_blank" rel="noopener noreferrer">
        {a.imagen_url ? (
          <img src={a.imagen_url} alt="" loading="lazy" />
        ) : (
          <span className="anuncio-sin-imagen">Sin foto</span>
        )}
        {!a.visto && <span className="badge-nuevo">Nuevo</span>}
      </a>

      <div className="anuncio-cuerpo">
        <div className="anuncio-semaforo-fila">
          <Semaforo veredicto={a.veredicto} grande />
        </div>

        {a.veredicto_motivo && <p className="anuncio-veredicto-motivo">{a.veredicto_motivo}</p>}

        {a.distancia_farmacia_m !== null && (
          <p className="anuncio-distancia">
            🚶 {Math.round(a.distancia_farmacia_m)} m a la farmacia más cercana
          </p>
        )}

        <div className="anuncio-precio-fila">
          {esFarmacia ? (
            <span className="anuncio-precio">
              {a.facturacion !== null ? `${euros(a.facturacion)} facturación/año` : euros(a.precio)}
            </span>
          ) : (
            <>
              <span className="anuncio-precio">{euros(a.precio)}</span>
              {a.superficie_m2 !== null && <span className="anuncio-m2">{a.superficie_m2} m²</span>}
              {a.precio_m2 !== null && <span className="anuncio-m2">{euros(a.precio_m2)}/m²</span>}
            </>
          )}
        </div>

        {a.titulo && (
          <a className="anuncio-titulo" href={a.url} target="_blank" rel="noopener noreferrer">
            {a.titulo}
          </a>
        )}

        {a.municipio && <p className="anuncio-ubicacion">{a.municipio}{a.provincia ? `, ${a.provincia}` : ''}</p>}

        <p className="anuncio-meta">
          <span className="tag">{NOMBRE_PORTAL[a.portal] ?? a.portal}</span>
          {a.busqueda_nombre && <span>{a.busqueda_nombre}</span>}
          <a href={a.url} target="_blank" rel="noopener noreferrer">Ver anuncio ↗</a>
        </p>

        <div className="anuncio-acciones">
          {!a.visto && (
            <button className="btn-secondary btn-mini" onClick={() => onMarcarVisto(a.id)}>Visto</button>
          )}
          <button className="btn-secondary btn-mini" onClick={() => onDescartar(a.id)}>Descartar</button>
        </div>

        <AvisoNoCertifica />
      </div>
    </li>
  );
}
