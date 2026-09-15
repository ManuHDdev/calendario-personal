import { useRef, useState, type FormEvent } from 'react';
import {
  PORTALES,
  NOMBRE_PORTAL,
  TIPOS,
  ICONO_TIPO,
  NOMBRE_TIPO,
  type BusquedaFormData,
  type PortalesConfig,
  type Busqueda,
  type TipoInmueble,
} from '../types';
import { CIUDADES_PRINCIPALES, buscarCiudad } from '../data/ciudades';

const PORTALES_POR_DEFECTO: PortalesConfig = {
  fotocasa: { enabled: true },
  pisos: { enabled: true },
  wallapop: { enabled: false },
};

interface Props {
  /** Si viene, el formulario edita esa búsqueda en lugar de crear una nueva. */
  inicial?: Busqueda;
  onSubmit: (data: BusquedaFormData) => Promise<void>;
  onCancel?: () => void;
}

/** Un campo numérico vacío es `null` ("sin límite"), nunca 0. */
function aNumero(valor: string): number | null {
  const limpio = valor.trim();
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function aTexto(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '' : String(valor);
}

export default function BusquedaForm({ inicial, onSubmit, onCancel }: Props) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoInmueble>(inicial?.tipo ?? 'vivienda');
  const [ubicacion, setUbicacion] = useState(inicial?.ubicacion ?? '');
  const [precioMin, setPrecioMin] = useState(aTexto(inicial?.precio_min));
  const [precioMax, setPrecioMax] = useState(aTexto(inicial?.precio_max));
  const [metrosMin, setMetrosMin] = useState(aTexto(inicial?.metros_min));
  const [metrosMax, setMetrosMax] = useState(aTexto(inicial?.metros_max));
  const [habitaciones, setHabitaciones] = useState(aTexto(inicial?.habitaciones_min));
  const [banos, setBanos] = useState(aTexto(inicial?.banos_min));
  const [latitud, setLatitud] = useState(aTexto(inicial?.latitud));
  const [longitud, setLongitud] = useState(aTexto(inicial?.longitud));
  const [radioKm, setRadioKm] = useState(aTexto(inicial?.radio_km));
  const [ascensor, setAscensor] = useState(inicial?.exige_ascensor ?? false);
  const [garaje, setGaraje] = useState(inicial?.exige_garaje ?? false);
  const [terraza, setTerraza] = useState(inicial?.exige_terraza ?? false);
  const [excluir, setExcluir] = useState(inicial?.excluir_palabras ?? '');
  const [notificar, setNotificar] = useState(inicial?.notificar ?? true);
  const [portales, setPortales] = useState<PortalesConfig>(inicial?.portales ?? PORTALES_POR_DEFECTO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Nombre de la ciudad cuyas coordenadas rellenamos nosotros, o `null` si las
  // que hay ahora en los campos las escribió el usuario (o vienen de `inicial`).
  // Solo pisamos coordenadas que sean "nuestras" y de una ciudad distinta.
  const coordsDeCiudad = useRef<string | null>(null);
  const [ciudadAutocompletada, setCiudadAutocompletada] = useState<string | null>(null);

  const cambiarUbicacion = (valor: string) => {
    setUbicacion(valor);
    const ciudad = buscarCiudad(valor);
    if (!ciudad) {
      setCiudadAutocompletada(null);
      return;
    }
    const sinCoords = !latitud.trim() && !longitud.trim();
    const coordsMiasDeOtraCiudad =
      coordsDeCiudad.current !== null && coordsDeCiudad.current !== ciudad.nombre;
    if (sinCoords || coordsMiasDeOtraCiudad) {
      setLatitud(String(ciudad.lat));
      setLongitud(String(ciudad.lng));
      coordsDeCiudad.current = ciudad.nombre;
      setCiudadAutocompletada(ciudad.nombre);
    } else {
      setCiudadAutocompletada(null);
    }
  };

  // Si el usuario toca lat/lng a mano, dejan de ser "nuestras": no volver a pisarlas.
  const editarLatitud = (valor: string) => {
    setLatitud(valor);
    coordsDeCiudad.current = null;
    setCiudadAutocompletada(null);
  };
  const editarLongitud = (valor: string) => {
    setLongitud(valor);
    coordsDeCiudad.current = null;
    setCiudadAutocompletada(null);
  };

  const esLocal = tipo === 'local';
  const wallapopActivo = portales.wallapop.enabled;
  const zonaIncompleta =
    wallapopActivo && !(latitud.trim() && longitud.trim() && radioKm.trim());

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!nombre.trim() || !ubicacion.trim()) {
      setError('El nombre y la ubicación son obligatorios');
      return;
    }
    if (!PORTALES.some((p) => portales[p].enabled)) {
      setError('Marca al menos un portal donde buscar');
      return;
    }
    if (zonaIncompleta) {
      setError('Wallapop busca por radio: rellena latitud, longitud y radio, o desmárcalo');
      return;
    }

    const hayZona = Boolean(latitud.trim() && longitud.trim() && radioKm.trim());

    setGuardando(true);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        tipo,
        ubicacion: ubicacion.trim(),
        latitud: hayZona ? aNumero(latitud) : null,
        longitud: hayZona ? aNumero(longitud) : null,
        radio_km: hayZona ? aNumero(radioKm) : null,
        precio_min: aNumero(precioMin),
        precio_max: aNumero(precioMax),
        metros_min: aNumero(metrosMin),
        metros_max: aNumero(metrosMax),
        // Un local no se filtra por habitaciones, baños ni ascensor/garaje/terraza.
        habitaciones_min: esLocal ? null : aNumero(habitaciones),
        banos_min: esLocal ? null : aNumero(banos),
        exige_ascensor: esLocal ? false : ascensor,
        exige_garaje: esLocal ? false : garaje,
        exige_terraza: esLocal ? false : terraza,
        excluir_palabras: excluir.trim() || null,
        portales,
        notificar,
      });
      if (!inicial) {
        setNombre('');
        setUbicacion('');
        coordsDeCiudad.current = null;
        setCiudadAutocompletada(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const togglePortal = (id: (typeof PORTALES)[number]) =>
    setPortales((prev) => ({ ...prev, [id]: { enabled: !prev[id].enabled } }));

  return (
    <form className="busqueda-form" onSubmit={(e) => void handleSubmit(e)}>
      <fieldset className="grupo">
        <legend>Tipo de inmueble</legend>
        <div className="chips">
          {TIPOS.map((t) => (
            <label
              key={t}
              className={`chip${tipo === t ? ' chip--on' : ''}${inicial ? ' chip--disabled' : ''}`}
            >
              <input
                type="radio"
                name="tipo"
                checked={tipo === t}
                disabled={Boolean(inicial)}
                onChange={() => setTipo(t)}
              />
              {ICONO_TIPO[t]} {NOMBRE_TIPO[t]}
            </label>
          ))}
        </div>
        {inicial && (
          <p className="ayuda">El tipo no se puede cambiar: crea otra búsqueda si necesitas el otro.</p>
        )}
      </fieldset>

      <div className="campo-fila">
        <label className="campo">
          <span>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Badajoz hasta 150k" />
        </label>
        <label className="campo">
          <span>Ubicación</span>
          <input
            value={ubicacion}
            onChange={(e) => cambiarUbicacion(e.target.value)}
            placeholder="Badajoz"
            list="ciudades-principales"
          />
          <datalist id="ciudades-principales">
            {CIUDADES_PRINCIPALES.map((c) => (
              <option key={c.nombre} value={c.nombre} />
            ))}
          </datalist>
          {ciudadAutocompletada && (
            <small className="ayuda">Coordenadas de {ciudadAutocompletada} añadidas para Wallapop.</small>
          )}
        </label>
      </div>

      <div className="campo-fila">
        <label className="campo">
          <span>Precio mín. (€)</span>
          <input type="number" min="0" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} placeholder="Sin mín." />
        </label>
        <label className="campo">
          <span>Precio máx. (€)</span>
          <input type="number" min="0" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} placeholder="Sin máx." />
        </label>
        <label className="campo">
          <span>m² mín.</span>
          <input type="number" min="0" value={metrosMin} onChange={(e) => setMetrosMin(e.target.value)} placeholder="—" />
        </label>
        <label className="campo">
          <span>m² máx.</span>
          <input type="number" min="0" value={metrosMax} onChange={(e) => setMetrosMax(e.target.value)} placeholder="—" />
        </label>
      </div>

      <div className="campo-fila">
        {!esLocal && (
          <label className="campo">
            <span>Habitaciones mín.</span>
            <input type="number" min="0" value={habitaciones} onChange={(e) => setHabitaciones(e.target.value)} placeholder="—" />
          </label>
        )}
        {!esLocal && (
          <label className="campo">
            <span>Baños mín.</span>
            <input type="number" min="0" value={banos} onChange={(e) => setBanos(e.target.value)} placeholder="—" />
          </label>
        )}
        <label className="campo campo--ancho">
          <span>Excluir si contiene (separado por comas)</span>
          <input value={excluir} onChange={(e) => setExcluir(e.target.value)} placeholder="subasta, nuda propiedad, okupa" />
        </label>
      </div>

      <fieldset className="grupo">
        <legend>Portales</legend>
        <div className="chips">
          {PORTALES.map((id) => (
            <label key={id} className={`chip${portales[id].enabled ? ' chip--on' : ''}`}>
              <input type="checkbox" checked={portales[id].enabled} onChange={() => togglePortal(id)} />
              {NOMBRE_PORTAL[id]}
            </label>
          ))}
        </div>
        {wallapopActivo && (
          <p className="ayuda">
            Wallapop busca por radio, no por nombre de zona: necesita centro y distancia.
          </p>
        )}
      </fieldset>

      <div className="campo-fila">
        <label className="campo">
          <span>Latitud {wallapopActivo && <em>(obligatoria)</em>}</span>
          <input type="number" step="any" value={latitud} onChange={(e) => editarLatitud(e.target.value)} placeholder="38.8794" />
        </label>
        <label className="campo">
          <span>Longitud {wallapopActivo && <em>(obligatoria)</em>}</span>
          <input type="number" step="any" value={longitud} onChange={(e) => editarLongitud(e.target.value)} placeholder="-6.9707" />
        </label>
        <label className="campo">
          <span>Radio (km)</span>
          <input type="number" min="1" value={radioKm} onChange={(e) => setRadioKm(e.target.value)} placeholder="30" />
        </label>
      </div>

      <fieldset className="grupo">
        <legend>{esLocal ? 'Avisos' : 'Requisitos'}</legend>
        <div className="chips">
          {!esLocal && (
            <>
              <label className={`chip${ascensor ? ' chip--on' : ''}`}>
                <input type="checkbox" checked={ascensor} onChange={() => setAscensor((v) => !v)} />
                Con ascensor
              </label>
              <label className={`chip${garaje ? ' chip--on' : ''}`}>
                <input type="checkbox" checked={garaje} onChange={() => setGaraje((v) => !v)} />
                Con garaje
              </label>
              <label className={`chip${terraza ? ' chip--on' : ''}`}>
                <input type="checkbox" checked={terraza} onChange={() => setTerraza((v) => !v)} />
                Con terraza
              </label>
            </>
          )}
          <label className={`chip${notificar ? ' chip--on' : ''}`}>
            <input type="checkbox" checked={notificar} onChange={() => setNotificar((v) => !v)} />
            Avisar por Telegram
          </label>
        </div>
        {!esLocal && (
          <p className="ayuda">
            Un requisito solo descarta el anuncio si el portal dice expresamente que no lo tiene.
            Si no lo menciona, el piso llega igualmente al listado.
          </p>
        )}
      </fieldset>

      {error && <div className="form-error">{error}</div>}

      <div className="form-acciones">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Crear búsqueda'}
        </button>
      </div>
    </form>
  );
}
