import { useState, type FormEvent } from 'react';
import { createCamara, updateCamara } from '../services/api';
import type { Camara, CamaraInput, Ciudad } from '../types';
import { parsearCoordenada } from '../lib/coordenadas';

interface Props {
  camara: Camara | null; // null = alta
  ciudades: Ciudad[];
  ciudadInicial: string | null;
  onGuardada: (camara: Camara) => void;
  onCerrar: () => void;
}

export default function CamaraFormModal({ camara, ciudades, ciudadInicial, onGuardada, onCerrar }: Props) {
  const inicial = ciudades.find((c) => c.slug === (camara?.ciudad ?? ciudadInicial)) ?? ciudades[0];
  const [nombre, setNombre] = useState(camara?.nombre ?? '');
  const [ciudad, setCiudad] = useState(inicial?.slug ?? '');
  const [latitud, setLatitud] = useState(String(camara?.latitud ?? inicial?.latitud ?? ''));
  const [longitud, setLongitud] = useState(String(camara?.longitud ?? inicial?.longitud ?? ''));
  const [carretera, setCarretera] = useState(camara?.carretera ?? '');
  const [urlImagen, setUrlImagen] = useState('');
  const [urlPagina, setUrlPagina] = useState(camara?.urlPagina ?? '');
  const [fuente, setFuente] = useState(camara && camara.fuente !== 'Manual' ? camara.fuente : '');
  const [favorita, setFavorita] = useState(camara?.favorita ?? false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // La URL de origen de la imagen no sale del backend, así que al editar no se
  // puede precargar: vacío = "no cambiar"; el botón de abajo la quita.
  const [quitarImagen, setQuitarImagen] = useState(false);
  const editando = camara !== null;

  const cambiarCiudad = (slug: string) => {
    setCiudad(slug);
    // En un alta, mueve las coordenadas al centro de la ciudad nueva si no se han tocado.
    if (!editando) {
      const c = ciudades.find((x) => x.slug === slug);
      if (c) {
        setLatitud(String(c.latitud));
        setLongitud(String(c.longitud));
      }
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const lat = parsearCoordenada(latitud);
    const lng = parsearCoordenada(longitud);
    if (lat === null || lng === null) return setError('Latitud y longitud deben ser números');
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return setError('Coordenadas fuera de rango');
    if (nombre.trim() === '') return setError('El nombre es obligatorio');
    if (!editando && urlImagen.trim() === '' && urlPagina.trim() === '') {
      return setError('Indica al menos una URL de imagen o una URL de página');
    }

    setGuardando(true);
    try {
      let guardada: Camara;
      if (editando) {
        guardada = await updateCamara(camara.id, {
          nombre: nombre.trim(),
          ciudad,
          latitud: lat,
          longitud: lng,
          carretera: carretera.trim() || null,
          urlPagina: urlPagina.trim() || null,
          fuente: fuente.trim() || null,
          favorita,
          ...(urlImagen.trim() ? { urlImagen: urlImagen.trim() } : quitarImagen ? { urlImagen: null } : {}),
        });
      } else {
        const datos: CamaraInput = {
          nombre: nombre.trim(), ciudad, latitud: lat, longitud: lng, favorita,
          ...(carretera.trim() ? { carretera: carretera.trim() } : {}),
          ...(urlImagen.trim() ? { urlImagen: urlImagen.trim() } : {}),
          ...(urlPagina.trim() ? { urlPagina: urlPagina.trim() } : {}),
          ...(fuente.trim() ? { fuente: fuente.trim() } : {}),
        };
        guardada = await createCamara(datos);
      }
      onGuardada(guardada);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="cam-form-titulo">
        <div className="modal-header">
          <h2 id="cam-form-titulo">{editando ? 'Editar cámara' : 'Añadir cámara'}</h2>
          <button type="button" className="cam-icono-btn" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <form className="modal-form" onSubmit={enviar}>
          <div className="form-group">
            <label htmlFor="cam-nombre">Nombre</label>
            <input id="cam-nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} autoFocus />
          </div>

          <div className="form-group">
            <label htmlFor="cam-ciudad">Ciudad</label>
            <select id="cam-ciudad" value={ciudad} onChange={(e) => cambiarCiudad(e.target.value)}>
              {ciudades.map((c) => <option key={c.slug} value={c.slug}>{c.nombre}</option>)}
            </select>
          </div>

          <div className="form-fila">
            <div className="form-group">
              <label htmlFor="cam-lat">Latitud</label>
              <input id="cam-lat" type="text" inputMode="decimal" value={latitud} onChange={(e) => setLatitud(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="cam-lng">Longitud</label>
              <input id="cam-lng" type="text" inputMode="decimal" value={longitud} onChange={(e) => setLongitud(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="cam-imagen">URL de la imagen (JPEG/PNG que se actualiza)</label>
            <input
              id="cam-imagen" type="url" value={urlImagen} onChange={(e) => setUrlImagen(e.target.value)}
              placeholder={editando && camara.tieneImagen && !quitarImagen ? 'Dejar vacío para no cambiarla' : 'https://…/camara.jpg'}
            />
            {editando && camara.tieneImagen && (
              <label className="checkbox-label">
                <input type="checkbox" checked={quitarImagen} onChange={(e) => setQuitarImagen(e.target.checked)} />
                Quitar la imagen (dejar solo el enlace)
              </label>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="cam-pagina">URL de la página del directo (opcional)</label>
            <input id="cam-pagina" type="url" value={urlPagina} onChange={(e) => setUrlPagina(e.target.value)} placeholder="https://…" />
          </div>

          <div className="form-fila">
            <div className="form-group">
              <label htmlFor="cam-carretera">Carretera</label>
              <input id="cam-carretera" type="text" value={carretera} onChange={(e) => setCarretera(e.target.value)} maxLength={50} />
            </div>
            <div className="form-group">
              <label htmlFor="cam-fuente">Fuente / atribución</label>
              <input id="cam-fuente" type="text" value={fuente} onChange={(e) => setFuente(e.target.value)} maxLength={100} placeholder="Ayuntamiento, turismo…" />
            </div>
          </div>

          <label className="checkbox-label">
            <input type="checkbox" checked={favorita} onChange={(e) => setFavorita(e.target.checked)} />
            Favorita
          </label>

          {error && <p className="cam-error" role="alert">{error}</p>}

          <div className="form-acciones">
            <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
