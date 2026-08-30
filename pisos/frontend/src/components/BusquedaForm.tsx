import { useState, type FormEvent } from 'react';
import { PORTALES, NOMBRE_PORTAL, type BusquedaFormData, type PortalesConfig, type Busqueda } from '../types';

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
        ubicacion: ubicacion.trim(),
        latitud: hayZona ? aNumero(latitud) : null,
        longitud: hayZona ? aNumero(longitud) : null,
        radio_km: hayZona ? aNumero(radioKm) : null,
        precio_min: aNumero(precioMin),
        precio_max: aNumero(precioMax),
        metros_min: aNumero(metrosMin),
        metros_max: aNumero(metrosMax),
        habitaciones_min: aNumero(habitaciones),
        banos_min: aNumero(banos),
        exige_ascensor: ascensor,
        exige_garaje: garaje,
        exige_terraza: terraza,
        excluir_palabras: excluir.trim() || null,
        portales,
        notificar,
      });
      if (!inicial) {
        setNombre('');
        setUbicacion('');
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
      <div className="campo-fila">
        <label className="campo">
          <span>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Badajoz hasta 150k" />
        </label>
        <label className="campo">
          <span>Ubicación</span>
          <input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Badajoz" />
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
        <label className="campo">
          <span>Habitaciones mín.</span>
          <input type="number" min="0" value={habitaciones} onChange={(e) => setHabitaciones(e.target.value)} placeholder="—" />
        </label>
        <label className="campo">
          <span>Baños mín.</span>
          <input type="number" min="0" value={banos} onChange={(e) => setBanos(e.target.value)} placeholder="—" />
        </label>
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
          <input type="number" step="any" value={latitud} onChange={(e) => setLatitud(e.target.value)} placeholder="38.8794" />
        </label>
        <label className="campo">
          <span>Longitud {wallapopActivo && <em>(obligatoria)</em>}</span>
          <input type="number" step="any" value={longitud} onChange={(e) => setLongitud(e.target.value)} placeholder="-6.9707" />
        </label>
        <label className="campo">
          <span>Radio (km)</span>
          <input type="number" min="1" value={radioKm} onChange={(e) => setRadioKm(e.target.value)} placeholder="30" />
        </label>
      </div>

      <fieldset className="grupo">
        <legend>Requisitos</legend>
        <div className="chips">
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
          <label className={`chip${notificar ? ' chip--on' : ''}`}>
            <input type="checkbox" checked={notificar} onChange={() => setNotificar((v) => !v)} />
            Avisar por Telegram
          </label>
        </div>
        <p className="ayuda">
          Un requisito solo descarta el anuncio si el portal dice expresamente que no lo tiene.
          Si no lo menciona, el piso llega igualmente al listado.
        </p>
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
