import { useState } from 'react';
import CamaraImagen from './CamaraImagen';
import type { Camara, Ciudad } from '../types';
import { haceCuanto } from '../lib/tiempo';

interface Props {
  camara: Camara;
  ciudades: Ciudad[];
  onFavorita: (camara: Camara) => void;
  onEditar: (camara: Camara) => void;
  onOcultar: (camara: Camara) => Promise<void>;
  onCerrar: () => void;
}

export default function CamaraDetalle({ camara, ciudades, onFavorita, onEditar, onOcultar, onCerrar }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const ciudad = ciudades.find((c) => c.slug === camara.ciudad)?.nombre ?? camara.ciudad;

  const ocultar = async () => {
    setTrabajando(true);
    try {
      await onOcultar(camara);
    } finally {
      setTrabajando(false);
      setConfirmando(false);
    }
  };

  return (
    <aside className="cam-detalle" aria-label={`Detalle de ${camara.nombre}`}>
      <div className="cam-detalle__cabecera">
        <div>
          <h2>{camara.nombre}</h2>
          <p className="cam-detalle__sub">
            {ciudad}
            {camara.carretera ? ` · ${camara.carretera}` : ''}
            {camara.distanciaKm !== null ? ` · a ${camara.distanciaKm} km del centro` : ''}
          </p>
        </div>
        <button type="button" className="cam-icono-btn" onClick={onCerrar} aria-label="Cerrar detalle">✕</button>
      </div>

      <CamaraImagen id={camara.id} alt={camara.nombre} sinImagen={!camara.tieneImagen} refrescoSegundos={30} />

      <dl className="cam-detalle__meta">
        <div><dt>Fuente</dt><dd>{camara.fuente}</dd></div>
        {camara.vistoEn && <div><dt>Visto en el feed</dt><dd>{haceCuanto(camara.vistoEn)}</dd></div>}
        <div><dt>Coordenadas</dt><dd>{camara.latitud.toFixed(5)}, {camara.longitud.toFixed(5)}</dd></div>
      </dl>

      <div className="cam-detalle__acciones">
        <button type="button" className="btn-secondary" onClick={() => onFavorita(camara)} aria-pressed={camara.favorita}>
          {camara.favorita ? '★ Favorita' : '☆ Marcar favorita'}
        </button>
        {camara.urlPagina && (
          <a className="btn-secondary" href={camara.urlPagina} target="_blank" rel="noopener noreferrer">
            Ver en origen ↗
          </a>
        )}
        {camara.origen === 'manual' && (
          <button type="button" className="btn-secondary" onClick={() => onEditar(camara)}>Editar</button>
        )}
        {!confirmando ? (
          <button type="button" className="btn-danger-ghost" onClick={() => setConfirmando(true)}>Ocultar</button>
        ) : (
          <span className="cam-confirmar" role="alert">
            ¿Ocultar esta cámara?
            <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)} disabled={trabajando}>Cancelar</button>
            <button type="button" className="btn-danger" onClick={ocultar} disabled={trabajando}>
              {trabajando ? 'Ocultando…' : 'Ocultar'}
            </button>
          </span>
        )}
      </div>
      {camara.origen === 'dgt' && (
        <p className="cam-nota">Las cámaras de la DGT se actualizan solas con el catálogo; si la ocultas no volverá a aparecer.</p>
      )}
    </aside>
  );
}
