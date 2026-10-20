import { useCallback, useEffect, useMemo, useState } from 'react';
import keycloak from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import CamaraMapa from '../components/CamaraMapa';
import CamaraCard from '../components/CamaraCard';
import CamaraDetalle from '../components/CamaraDetalle';
import CamaraFormModal from '../components/CamaraFormModal';
import { deleteCamara, getCamaras, getCiudades, getEstado, lanzarImportacion, updateCamara } from '../services/api';
import { coincide } from '../lib/texto';
import { resumirEstado } from '../lib/estado';
import type { Camara, Ciudad, EstadoImportacion } from '../types';
import './CamarasPage.css';

type Vista = 'mapa' | 'rejilla';

function vistaGuardada(): Vista {
  try {
    return localStorage.getItem('camaras.vista') === 'rejilla' ? 'rejilla' : 'mapa';
  } catch {
    return 'mapa';
  }
}

export default function CamarasPage() {
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [ciudades, setCiudades] = useState<Ciudad[]>([]);
  const [estado, setEstado] = useState<EstadoImportacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [ciudadActiva, setCiudadActiva] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloFavoritas, setSoloFavoritas] = useState(false);
  const [vista, setVista] = useState<Vista>(vistaGuardada);
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ camara: Camara | null } | null>(null);
  const [importando, setImportando] = useState(false);

  const usuario = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? 'admin';

  const cargar = useCallback(async () => {
    setError('');
    try {
      const [cs, cams, est] = await Promise.all([getCiudades(), getCamaras(), getEstado()]);
      setCiudades(cs);
      setCamaras(cams);
      setEstado(est);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las cámaras');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const cambiarVista = (v: Vista) => {
    setVista(v);
    setSeleccionadaId(null); // la selección del mapa no debe abrir un modal al pasar a la rejilla
    try { localStorage.setItem('camaras.vista', v); } catch { /* sin almacenamiento: da igual */ }
  };

  const nombreCiudad = useCallback(
    (slug: string) => ciudades.find((c) => c.slug === slug)?.nombre ?? slug,
    [ciudades],
  );

  const conteoPorCiudad = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const c of camaras) cuenta.set(c.ciudad, (cuenta.get(c.ciudad) ?? 0) + 1);
    return cuenta;
  }, [camaras]);

  const visibles = useMemo(
    () =>
      camaras.filter(
        (c) =>
          (ciudadActiva === null || c.ciudad === ciudadActiva) &&
          (!soloFavoritas || c.favorita) &&
          coincide(c, busqueda),
      ),
    [camaras, ciudadActiva, soloFavoritas, busqueda],
  );

  const seleccionada = camaras.find((c) => c.id === seleccionadaId) ?? null;

  const reemplazar = (guardada: Camara) =>
    setCamaras((previas) => previas.map((c) => (c.id === guardada.id ? guardada : c)));

  const alternarFavorita = async (camara: Camara) => {
    try {
      reemplazar(await updateCamara(camara.id, { favorita: !camara.favorita }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la favorita');
    }
  };

  const ocultar = async (camara: Camara) => {
    try {
      await deleteCamara(camara.id);
      setCamaras((previas) => previas.filter((c) => c.id !== camara.id));
      setSeleccionadaId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ocultar la cámara');
    }
  };

  const guardada = async (camara: Camara) => {
    setFormulario(null);
    await cargar(); // recarga: la cámara puede haber cambiado de ciudad u orden
    setSeleccionadaId(camara.id);
  };

  const actualizarCatalogo = async () => {
    setImportando(true);
    setError('');
    try {
      await lanzarImportacion();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La importación falló');
    } finally {
      await cargar(); // también tras un fallo: el estado guardado enseña el error
      setImportando(false);
    }
  };

  const resumen = resumirEstado(estado);
  const detalle = seleccionada && (
    <CamaraDetalle
      camara={seleccionada}
      ciudades={ciudades}
      onFavorita={alternarFavorita}
      onEditar={(c) => setFormulario({ camara: c })}
      onOcultar={ocultar}
      onCerrar={() => setSeleccionadaId(null)}
    />
  );

  return (
    <div className="cam-layout">
      <header className="cam-header">
        <div className="cam-header__izq">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5ac8fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="13" height="12" rx="2" /><path d="M15 10l7-4v12l-7-4z" />
          </svg>
          <h1>Cámaras</h1>
        </div>
        <div className="cam-header__der">
          <ThemeToggle />
          <AppLauncher />
          <span className="cam-usuario">{usuario}</span>
          <button className="cam-salir" onClick={() => keycloak.logout()}>Salir</button>
        </div>
      </header>

      <main className="cam-main">
        {error && <div className="cam-error-banner" role="alert">{error}</div>}

        <div className="cam-toolbar">
          <div className="cam-chips" role="tablist" aria-label="Ciudad">
            <button type="button" role="tab" aria-selected={ciudadActiva === null}
              className={`cam-chip${ciudadActiva === null ? ' cam-chip--activo' : ''}`} onClick={() => setCiudadActiva(null)}>
              Todas <span>{camaras.length}</span>
            </button>
            {ciudades.map((c) => (
              <button key={c.slug} type="button" role="tab" aria-selected={ciudadActiva === c.slug}
                className={`cam-chip${ciudadActiva === c.slug ? ' cam-chip--activo' : ''}`} onClick={() => setCiudadActiva(c.slug)}>
                {c.nombre} <span>{conteoPorCiudad.get(c.slug) ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="cam-toolbar__fila">
            <input
              type="search" className="cam-busqueda" placeholder="Buscar por nombre o carretera…"
              value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar cámaras"
            />
            <button type="button" className={`btn-secondary${soloFavoritas ? ' btn-secondary--activo' : ''}`}
              onClick={() => setSoloFavoritas((v) => !v)} aria-pressed={soloFavoritas}>
              ★ Favoritas
            </button>
            <div className="cam-segmento" role="group" aria-label="Vista">
              <button type="button" className={vista === 'mapa' ? 'activo' : ''} onClick={() => cambiarVista('mapa')} aria-pressed={vista === 'mapa'}>Mapa</button>
              <button type="button" className={vista === 'rejilla' ? 'activo' : ''} onClick={() => cambiarVista('rejilla')} aria-pressed={vista === 'rejilla'}>Rejilla</button>
            </div>
            <button type="button" className="btn-primary" onClick={() => setFormulario({ camara: null })} disabled={ciudades.length === 0}>
              + Añadir
            </button>
          </div>
        </div>

        <div className={`cam-estado cam-estado--${resumen.nivel}`}>
          <span>{resumen.texto}</span>
          <button type="button" className="cam-enlace" onClick={actualizarCatalogo} disabled={importando}>
            {importando ? 'Actualizando…' : 'Actualizar catálogo'}
          </button>
        </div>

        {cargando ? (
          <p className="cam-vacio">Cargando…</p>
        ) : camaras.length === 0 ? (
          <p className="cam-vacio">
            Aún no hay cámaras. Pulsa «Actualizar catálogo» para importar las de la DGT o añade una a mano.
          </p>
        ) : vista === 'mapa' ? (
          <div className="cam-mapa-layout">
            <CamaraMapa camaras={visibles} ciudades={ciudades} ciudadActiva={ciudadActiva}
              seleccionadaId={seleccionadaId} onSeleccionar={setSeleccionadaId} />
            {detalle}
          </div>
        ) : visibles.length === 0 ? (
          <p className="cam-vacio">Ninguna cámara coincide con los filtros.</p>
        ) : (
          <div className="cam-rejilla">
            {visibles.map((c) => (
              <CamaraCard key={c.id} camara={c} ciudadNombre={nombreCiudad(c.ciudad)}
                onAbrir={(x) => setSeleccionadaId(x.id)} onFavorita={alternarFavorita} />
            ))}
          </div>
        )}

        {vista === 'mapa' && !cargando && visibles.length === 0 && camaras.length > 0 && (
          <p className="cam-vacio">Ninguna cámara coincide con los filtros.</p>
        )}
      </main>

      {vista === 'rejilla' && seleccionada && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSeleccionadaId(null); }}>
          <div className="modal-content modal-content--ancho" role="dialog" aria-modal="true">{detalle}</div>
        </div>
      )}

      {formulario && (
        <CamaraFormModal
          camara={formulario.camara} ciudades={ciudades} ciudadInicial={ciudadActiva}
          onGuardada={guardada} onCerrar={() => setFormulario(null)}
        />
      )}
    </div>
  );
}
