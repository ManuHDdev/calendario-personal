import { useState } from 'react';
import { comprobarViabilidad } from '../services/api';
import type { ComprobarBody, Medicion, ResultadoViabilidad } from '../types';
import { Semaforo, AvisoNoCertifica } from './veredicto';
import MapaViabilidad from './MapaViabilidad';

function ListaMediciones({ titulo, mediciones }: { titulo: string; mediciones: Medicion[] }) {
  if (mediciones.length === 0) return null;
  return (
    <div className="comprobacion-lista">
      <h4>{titulo}</h4>
      <ul>
        {mediciones.map((m) => (
          <li key={m.establecimiento.id}>
            <span>{m.establecimiento.nombre ?? 'Sin nombre'}</span>
            <span className="comprobacion-metros">
              {m.metros !== null ? `${Math.round(m.metros)} m caminando` : 'sin ruta peatonal'}
              {m.decisiva ? ' · decisiva' : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PanelComprobacion() {
  const [modo, setModo] = useState<'direccion' | 'coords'>('direccion');
  const [direccion, setDireccion] = useState('');
  const [comunidad, setComunidad] = useState('');
  const [latitud, setLatitud] = useState('');
  const [longitud, setLongitud] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<ResultadoViabilidad | null>(null);

  const handleComprobar = async () => {
    setError('');
    setResultado(null);
    const body: ComprobarBody = {};
    if (modo === 'direccion') {
      if (direccion.trim().length < 3) return setError('Escribe una dirección');
      body.direccion = direccion.trim();
      if (comunidad.trim()) body.comunidad = comunidad.trim();
    } else {
      const lat = Number(latitud);
      const lng = Number(longitud);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return setError('Latitud y longitud no válidas');
      body.latitud = lat;
      body.longitud = lng;
      if (comunidad.trim()) body.comunidad = comunidad.trim();
    }
    setCargando(true);
    try {
      setResultado(await comprobarViabilidad(body));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo comprobar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="comprobacion">
      <div className="busqueda-form">
        <fieldset className="grupo">
          <legend>Punto a comprobar</legend>
          <div className="chips">
            <label className={`chip${modo === 'direccion' ? ' chip--on' : ''}`}>
              <input type="radio" checked={modo === 'direccion'} onChange={() => setModo('direccion')} />
              Dirección
            </label>
            <label className={`chip${modo === 'coords' ? ' chip--on' : ''}`}>
              <input type="radio" checked={modo === 'coords'} onChange={() => setModo('coords')} />
              Coordenadas
            </label>
          </div>
        </fieldset>

        {modo === 'direccion' ? (
          <div className="campo-fila">
            <label className="campo campo--ancho">
              <span>Dirección (con número mejora la precisión)</span>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle Mayor 12, Badajoz" />
            </label>
          </div>
        ) : (
          <div className="campo-fila">
            <label className="campo">
              <span>Latitud</span>
              <input type="number" step="any" value={latitud} onChange={(e) => setLatitud(e.target.value)} placeholder="38.8794" />
            </label>
            <label className="campo">
              <span>Longitud</span>
              <input type="number" step="any" value={longitud} onChange={(e) => setLongitud(e.target.value)} placeholder="-6.9707" />
            </label>
          </div>
        )}

        <div className="campo-fila">
          <label className="campo">
            <span>Comunidad (opcional, fija la normativa)</span>
            <input value={comunidad} onChange={(e) => setComunidad(e.target.value)} placeholder="Extremadura" />
          </label>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-acciones">
          <button className="btn-primary" onClick={() => void handleComprobar()} disabled={cargando}>
            {cargando ? 'Comprobando…' : 'Comprobar viabilidad'}
          </button>
        </div>
      </div>

      {resultado && (
        <div className="comprobacion-resultado">
          <Semaforo veredicto={resultado.veredicto} grande />
          <p className="comprobacion-motivo">{resultado.motivo}</p>

          <p className="comprobacion-umbrales">
            Umbrales: farmacias {resultado.umbrales.distanciaFarmaciasM ?? '—'} m
            {resultado.umbrales.distanciaCentrosSanitariosM !== null
              ? ` · centros ${resultado.umbrales.distanciaCentrosSanitariosM} m`
              : ' · centros: no aplica'}
            {resultado.umbrales.verificado ? ' · verificado' : ' · sin verificar (mínimo estatal)'}
            {resultado.motor ? ` · motor ${resultado.motor}` : ''}
          </p>

          <ListaMediciones titulo="Farmacias cercanas" mediciones={resultado.farmacias} />
          <ListaMediciones titulo="Centros sanitarios cercanos" mediciones={resultado.centros} />

          <MapaViabilidad
            punto={{ lat: resultado.punto.lat, lng: resultado.punto.lng }}
            farmacias={resultado.farmacias}
            centros={resultado.centros}
            radioM={resultado.umbrales.distanciaFarmaciasM}
          />

          <AvisoNoCertifica />
        </div>
      )}
    </div>
  );
}
