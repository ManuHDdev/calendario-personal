import { useState, type FormEvent } from 'react';
import {
  PORTALES_POR_TIPO,
  NOMBRE_PORTAL,
  type Busqueda,
  type BusquedaFormData,
  type TipoBusqueda,
} from '../types';

interface Props {
  inicial?: Busqueda;
  onSubmit: (data: BusquedaFormData) => Promise<void>;
  onCancel?: () => void;
}

function aNumero(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function aTexto(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}
type Tri = 'si' | 'no' | '';
function aTri(v: boolean | null | undefined): Tri {
  return v === true ? 'si' : v === false ? 'no' : '';
}
function deTri(v: Tri): boolean | null {
  return v === 'si' ? true : v === 'no' ? false : null;
}

export default function BusquedaForm({ inicial, onSubmit, onCancel }: Props) {
  const editando = Boolean(inicial);
  const [tipo, setTipo] = useState<TipoBusqueda>(inicial?.tipo ?? 'local');
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [comunidad, setComunidad] = useState(inicial?.comunidad ?? '');
  const [provincia, setProvincia] = useState(inicial?.provincia ?? '');
  const [zonaTexto, setZonaTexto] = useState(inicial?.zona_texto ?? '');
  const [latitud, setLatitud] = useState(aTexto(inicial?.latitud));
  const [longitud, setLongitud] = useState(aTexto(inicial?.longitud));
  const [radioKm, setRadioKm] = useState(aTexto(inicial?.radio_km));
  const [precioMin, setPrecioMin] = useState(aTexto(inicial?.precio_min));
  const [precioMax, setPrecioMax] = useState(aTexto(inicial?.precio_max));
  const [superficieMin, setSuperficieMin] = useState(aTexto(inicial?.superficie_min));
  const [superficieMax, setSuperficieMax] = useState(aTexto(inicial?.superficie_max));
  const [pieCalle, setPieCalle] = useState<Tri>(aTri(inicial?.pie_calle));
  const [facturacionMin, setFacturacionMin] = useState(aTexto(inicial?.facturacion_min));
  const [facturacionMax, setFacturacionMax] = useState(aTexto(inicial?.facturacion_max));
  const [comprobarFarmacias, setComprobarFarmacias] = useState(inicial?.comprobar_farmacias ?? true);
  const [comprobarCentros, setComprobarCentros] = useState(inicial?.comprobar_centros_sanitarios ?? false);
  const [distFarmacias, setDistFarmacias] = useState(aTexto(inicial?.distancia_farmacias_m));
  const [distCentros, setDistCentros] = useState(aTexto(inicial?.distancia_centros_sanitarios_m));
  const [notificar, setNotificar] = useState(inicial?.notificar ?? true);
  const [portales, setPortales] = useState<string[]>(
    inicial?.portales ?? [...PORTALES_POR_TIPO[inicial?.tipo ?? 'local']],
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cambiarTipo = (t: TipoBusqueda) => {
    setTipo(t);
    setPortales([...PORTALES_POR_TIPO[t]]);
  };

  const togglePortal = (id: string) =>
    setPortales((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) return setError('El nombre es obligatorio');
    if (portales.length === 0) return setError('Marca al menos un portal');

    const base: BusquedaFormData = {
      tipo,
      nombre: nombre.trim(),
      portales,
      comunidad: comunidad.trim() || null,
      provincia: provincia.trim() || null,
      comprobar_farmacias: comprobarFarmacias,
      comprobar_centros_sanitarios: comprobarCentros,
      distancia_farmacias_m: aNumero(distFarmacias),
      distancia_centros_sanitarios_m: aNumero(distCentros),
      notificar,
    };

    let data: BusquedaFormData;
    if (tipo === 'local') {
      data = {
        ...base,
        zona_texto: zonaTexto.trim() || null,
        latitud: aNumero(latitud),
        longitud: aNumero(longitud),
        radio_km: aNumero(radioKm),
        precio_min: aNumero(precioMin),
        precio_max: aNumero(precioMax),
        superficie_min: aNumero(superficieMin),
        superficie_max: aNumero(superficieMax),
        pie_calle: deTri(pieCalle),
      };
    } else {
      data = {
        ...base,
        facturacion_min: aNumero(facturacionMin),
        facturacion_max: aNumero(facturacionMax),
      };
    }

    setGuardando(true);
    try {
      await onSubmit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form className="busqueda-form" onSubmit={(e) => void handleSubmit(e)}>
      <fieldset className="grupo">
        <legend>Tipo de búsqueda</legend>
        <div className="chips">
          {(['local', 'farmacia'] as TipoBusqueda[]).map((t) => (
            <label key={t} className={`chip${tipo === t ? ' chip--on' : ''}`}>
              <input
                type="radio"
                name="tipo"
                checked={tipo === t}
                disabled={editando}
                onChange={() => cambiarTipo(t)}
              />
              {t === 'local' ? 'Local comercial' : 'Farmacia en venta'}
            </label>
          ))}
        </div>
        {editando && <p className="ayuda">El tipo no se puede cambiar en una búsqueda ya creada.</p>}
      </fieldset>

      <div className="campo-fila">
        <label className="campo campo--ancho">
          <span>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Local en Badajoz capital" />
        </label>
      </div>

      <div className="campo-fila">
        <label className="campo">
          <span>Comunidad autónoma</span>
          <input value={comunidad} onChange={(e) => setComunidad(e.target.value)} placeholder="Extremadura" />
        </label>
        {tipo === 'farmacia' && (
          <label className="campo">
            <span>Provincia</span>
            <input value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="Badajoz" />
          </label>
        )}
        {tipo === 'local' && (
          <label className="campo">
            <span>Zona (texto)</span>
            <input value={zonaTexto} onChange={(e) => setZonaTexto(e.target.value)} placeholder="Badajoz centro" />
          </label>
        )}
      </div>

      {tipo === 'local' ? (
        <>
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
              <input type="number" min="0" value={superficieMin} onChange={(e) => setSuperficieMin(e.target.value)} placeholder="—" />
            </label>
            <label className="campo">
              <span>m² máx.</span>
              <input type="number" min="0" value={superficieMax} onChange={(e) => setSuperficieMax(e.target.value)} placeholder="—" />
            </label>
          </div>

          <div className="campo-fila">
            <label className="campo">
              <span>Pie de calle</span>
              <select value={pieCalle} onChange={(e) => setPieCalle(e.target.value as Tri)}>
                <option value="">Indiferente</option>
                <option value="si">Sí, solo pie de calle</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>

          <div className="campo-fila">
            <label className="campo">
              <span>Latitud (opcional)</span>
              <input type="number" step="any" value={latitud} onChange={(e) => setLatitud(e.target.value)} placeholder="38.8794" />
            </label>
            <label className="campo">
              <span>Longitud (opcional)</span>
              <input type="number" step="any" value={longitud} onChange={(e) => setLongitud(e.target.value)} placeholder="-6.9707" />
            </label>
            <label className="campo">
              <span>Radio (km)</span>
              <input type="number" min="1" value={radioKm} onChange={(e) => setRadioKm(e.target.value)} placeholder="15" />
            </label>
          </div>
        </>
      ) : (
        <div className="campo-fila">
          <label className="campo">
            <span>Facturación mín. (€/año)</span>
            <input type="number" min="0" value={facturacionMin} onChange={(e) => setFacturacionMin(e.target.value)} placeholder="Sin mín." />
          </label>
          <label className="campo">
            <span>Facturación máx. (€/año)</span>
            <input type="number" min="0" value={facturacionMax} onChange={(e) => setFacturacionMax(e.target.value)} placeholder="Sin máx." />
          </label>
        </div>
      )}

      <fieldset className="grupo">
        <legend>Comprobación de distancias legales</legend>
        <div className="chips">
          <label className={`chip${comprobarFarmacias ? ' chip--on' : ''}`}>
            <input type="checkbox" checked={comprobarFarmacias} onChange={() => setComprobarFarmacias((v) => !v)} />
            Comprobar farmacias
          </label>
          <label className={`chip${comprobarCentros ? ' chip--on' : ''}`}>
            <input type="checkbox" checked={comprobarCentros} onChange={() => setComprobarCentros((v) => !v)} />
            Comprobar centros sanitarios
          </label>
        </div>
        <div className="campo-fila">
          <label className="campo">
            <span>Distancia farmacias (m) — override</span>
            <input type="number" min="1" value={distFarmacias} onChange={(e) => setDistFarmacias(e.target.value)} placeholder="Usa la normativa" />
          </label>
          <label className="campo">
            <span>Distancia centros (m) — override</span>
            <input type="number" min="1" value={distCentros} onChange={(e) => setDistCentros(e.target.value)} placeholder="Usa la normativa" />
          </label>
        </div>
        <p className="ayuda">
          Sin override se usa la distancia de la comunidad. El veredicto nunca dice «cumple»:
          descarta y prioriza.
        </p>
      </fieldset>

      <fieldset className="grupo">
        <legend>Portales ({tipo === 'local' ? 'locales' : 'farmacias'})</legend>
        <div className="chips">
          {PORTALES_POR_TIPO[tipo].map((id) => (
            <label key={id} className={`chip${portales.includes(id) ? ' chip--on' : ''}`}>
              <input type="checkbox" checked={portales.includes(id)} onChange={() => togglePortal(id)} />
              {NOMBRE_PORTAL[id] ?? id}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grupo">
        <legend>Avisos</legend>
        <div className="chips">
          <label className={`chip${notificar ? ' chip--on' : ''}`}>
            <input type="checkbox" checked={notificar} onChange={() => setNotificar((v) => !v)} />
            Avisar por Telegram
          </label>
        </div>
      </fieldset>

      {error && <div className="form-error">{error}</div>}

      <div className="form-acciones">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
        )}
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear búsqueda'}
        </button>
      </div>
    </form>
  );
}
