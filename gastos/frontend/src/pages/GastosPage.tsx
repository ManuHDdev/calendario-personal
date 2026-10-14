import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import keycloak from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import PeriodBar from '../components/PeriodBar';
import SummaryCards from '../components/SummaryCards';
import Filters, { type FiltroTipo } from '../components/Filters';
import YearOverview from '../components/YearOverview';
import MovementList from '../components/MovementList';
import PendingReview, { type ConfirmEdits } from '../components/PendingReview';
import PendingExpenses from '../components/PendingExpenses';
import MovementDialog from '../components/MovementDialog';
import OccurredDialog from '../components/OccurredDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  createGasto, deleteGasto, getCategorias, getComercios, getGastos, getTotales, updateGasto,
} from '../services/api';
import { filtrarBusqueda } from '../lib/agrupar';
import {
  formatFechaLarga, formatMoney, formatSignedMoney, hoyLocal, mesDe, nombreMesConAnio, parseFecha,
} from '../lib/formato';
import type { Gasto, MovimientoValores, TotalesPeriodo } from '../types';
import './GastosPage.css';

const MIN_ANIO = 2000;

type Dialogo =
  | { tipo: 'movimiento'; gasto?: Gasto }
  | { tipo: 'eliminar'; gasto: Gasto }
  | { tipo: 'descartar'; gasto: Gasto }
  | { tipo: 'ocurrido'; gasto: Gasto }
  | null;

function mensajeDe(err: unknown, porDefecto: string): string {
  return err instanceof Error && err.message ? err.message : porDefecto;
}

export default function GastosPage() {
  const anioActual = Number(hoyLocal().slice(0, 4));
  const [anio, setAnio] = useState(anioActual);
  const [mes, setMes] = useState<string | null>(null);
  const [tipo, setTipo] = useState<FiltroTipo>('todos');
  const [categoria, setCategoria] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [movimientos, setMovimientos] = useState<Gasto[]>([]);
  const [totalesAnio, setTotalesAnio] = useState<TotalesPeriodo | null>(null);
  const [totalesMes, setTotalesMes] = useState<TotalesPeriodo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorPeriodo, setErrorPeriodo] = useState('');

  const [previstos, setPrevistos] = useState<Gasto[]>([]);
  const [borradores, setBorradores] = useState<Gasto[]>([]);
  const [errorPendientes, setErrorPendientes] = useState('');

  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>([]);
  const [categoriasGasto, setCategoriasGasto] = useState<string[]>([]);
  const [comerciosGasto, setComerciosGasto] = useState<string[]>([]);

  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [aviso, setAviso] = useState('');
  const avisoTimer = useRef<number>();

  const periodoReq = useRef(0);
  const pendientesReq = useRef(0);
  const categoriasReq = useRef(0);
  const username = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? 'admin';

  // Whole period (year or month): list + totals. A newer request makes older responses irrelevant.
  const cargarPeriodo = useCallback(async (silencioso = false) => {
    const id = ++periodoReq.current;
    if (!silencioso) setCargando(true);
    setErrorPeriodo('');
    const cat = categoria || undefined;
    try {
      const [movs, tAnio, tMes] = await Promise.all([
        getGastos({
          estado: 'confirmado',
          ...(mes ? { mes } : { anio: String(anio) }),
          tipo: tipo === 'todos' ? undefined : tipo,
          categoria: cat,
        }),
        getTotales({ anio: String(anio), categoria: cat }),
        mes ? getTotales({ mes, categoria: cat }) : Promise.resolve(null),
      ]);
      if (id !== periodoReq.current) return;
      setMovimientos(movs);
      setTotalesAnio(tAnio);
      setTotalesMes(tMes);
    } catch (err) {
      if (id !== periodoReq.current) return;
      setErrorPeriodo(mensajeDe(err, 'No hemos podido cargar tus movimientos.'));
    } finally {
      if (id === periodoReq.current) setCargando(false);
    }
  }, [anio, mes, tipo, categoria]);

  useEffect(() => { void cargarPeriodo(); }, [cargarPeriodo]);

  // Forecasts and OCR drafts do not depend on the selected period.
  const cargarPendientes = useCallback(async () => {
    const id = ++pendientesReq.current;
    try {
      const [prev, pend] = await Promise.all([
        getGastos({ estado: 'previsto' }),
        getGastos({ estado: 'pendiente_revision' }),
      ]);
      if (id !== pendientesReq.current) return;
      setPrevistos(prev);
      setBorradores(pend);
      setErrorPendientes('');
    } catch (err) {
      if (id !== pendientesReq.current) return;
      setErrorPendientes(mensajeDe(err, 'No hemos podido cargar los previstos y los tickets por revisar.'));
    }
  }, []);

  useEffect(() => { void cargarPendientes(); }, [cargarPendientes]);

  const cargarCategoriasFiltro = useCallback(async () => {
    const id = ++categoriasReq.current;
    try {
      const cats = await getCategorias(tipo === 'todos' ? undefined : tipo);
      if (id !== categoriasReq.current) return;
      setCategoriasFiltro(cats);
    } catch { /* suggestions are best-effort */ }
  }, [tipo]);

  useEffect(() => { void cargarCategoriasFiltro(); }, [cargarCategoriasFiltro]);

  // Suggestions for the OCR draft rows (drafts are always expenses); only fetched when there are drafts.
  const hayBorradores = borradores.length > 0;
  useEffect(() => {
    if (!hayBorradores) return;
    Promise.all([getCategorias('gasto'), getComercios('gasto')])
      .then(([c, m]) => { setCategoriasGasto(c); setComerciosGasto(m); })
      .catch(() => { /* best-effort */ });
  }, [hayBorradores]);

  useEffect(() => () => window.clearTimeout(avisoTimer.current), []);

  const mostrarAviso = (texto: string) => {
    window.clearTimeout(avisoTimer.current);
    setAviso(texto);
    avisoTimer.current = window.setTimeout(() => setAviso(''), 4500);
  };

  // After a change the person should see where it landed: jump to its period and drop filters that would hide it.
  const mostrarMovimiento = (fecha: string | null, tipoMov: Gasto['tipo'], categoriaMov: string | null): boolean => {
    let cambiado = false;
    const p = parseFecha(fecha);
    if (p) {
      const m = mesDe(fecha);
      if (p.anio !== anio) {
        setAnio(p.anio);
        setMes(mes ? m : null);
        cambiado = true;
      } else if (mes && m !== mes) {
        setMes(m);
        cambiado = true;
      }
    }
    if (tipo !== 'todos' && tipo !== tipoMov) { setTipo('todos'); cambiado = true; }
    if (categoria && (categoriaMov ?? '') !== categoria) { setCategoria(''); cambiado = true; }
    return cambiado;
  };

  const refrescar = async (periodoYaCambia = false) => {
    await Promise.all([
      periodoYaCambia ? Promise.resolve() : cargarPeriodo(true),
      cargarPendientes(),
      cargarCategoriasFiltro(),
    ]);
  };

  const guardarMovimiento = async (valores: MovimientoValores) => {
    const editado = dialogo?.tipo === 'movimiento' ? dialogo.gasto : undefined;
    const estado = valores.previsto ? 'previsto' : 'confirmado';

    if (editado) {
      await updateGasto(editado.id, {
        importe: valores.importe,
        // A forecast may have its date cleared (null); any other estado always carries one.
        ...(valores.previsto ? { fecha: valores.fecha ?? null } : valores.fecha ? { fecha: valores.fecha } : {}),
        comercio: valores.comercio,
        concepto: valores.concepto || null,
        categoria: valores.categoria || null,
        estado,
        tipo: valores.tipo,
      });
    } else {
      await createGasto({
        importe: valores.importe,
        ...(valores.fecha ? { fecha: valores.fecha } : {}),
        comercio: valores.comercio,
        ...(valores.concepto ? { concepto: valores.concepto } : {}),
        ...(valores.categoria ? { categoria: valores.categoria } : {}),
        estado,
        tipo: valores.tipo,
      });
    }

    setDialogo(null);
    const cambia = valores.previsto ? false : mostrarMovimiento(valores.fecha, valores.tipo, valores.categoria || null);
    mostrarAviso(
      editado ? 'Cambios guardados.'
        : valores.previsto ? 'Previsión guardada.'
          : valores.tipo === 'ganancia' ? 'Ganancia guardada.' : 'Gasto guardado.',
    );
    await refrescar(cambia);
  };

  const confirmarPrevisto = async (gasto: Gasto, fecha: string) => {
    await updateGasto(gasto.id, { estado: 'confirmado', fecha });
    setDialogo(null);
    const cambia = mostrarMovimiento(fecha, gasto.tipo, gasto.categoria);
    mostrarAviso(gasto.tipo === 'ganancia' ? 'Anotado como cobrado.' : 'Anotado como pagado.');
    await refrescar(cambia);
  };

  const confirmarBorrador = async (id: string, edits: ConfirmEdits) => {
    await updateGasto(id, { ...edits, estado: 'confirmado' });
    const cambia = mostrarMovimiento(edits.fecha, 'gasto', edits.categoria ?? null);
    mostrarAviso('Gasto confirmado.');
    await refrescar(cambia);
  };

  const eliminar = async (gasto: Gasto, aviso_: string) => {
    await deleteGasto(gasto.id);
    setDialogo(null);
    mostrarAviso(aviso_);
    await refrescar();
  };

  const visibles = useMemo(() => filtrarBusqueda(movimientos, busqueda), [movimientos, busqueda]);
  const hayFiltros = tipo !== 'todos' || !!categoria || !!busqueda.trim();
  const periodoTexto = mes ? nombreMesConAnio(mes) : String(anio);
  const totalesActuales = mes ? totalesMes : totalesAnio;
  const porMesDelAnio = totalesAnio?.anio === String(anio) ? totalesAnio.porMes : undefined;

  const limpiarFiltros = () => {
    setTipo('todos');
    setCategoria('');
    setBusqueda('');
  };

  const cambiarAnio = (nuevo: number) => {
    setAnio(nuevo);
    setMes(null);
  };

  const irAPrevistos = () => {
    const el = document.getElementById('previstos');
    if (!el) return;
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: sinMovimiento ? 'auto' : 'smooth', block: 'start' });
  };

  const abrirAnadir = () => setDialogo({ tipo: 'movimiento' });

  return (
    <div className="gastos-layout">
      <header className="gastos-header">
        <div className="gastos-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e8b400" strokeWidth="1.8" aria-hidden="true">
            <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
            <path d="M16 12h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3a2 2 0 0 1 0-4z"/>
          </svg>
          <h1 className="gastos-title">Gastos</h1>
        </div>
        <div className="gastos-header-right">
          <ThemeToggle />
          <AppLauncher />
          <span className="gastos-username">{username}</span>
          <button type="button" className="gastos-logout-btn" onClick={() => keycloak.logout()}>Salir</button>
        </div>
      </header>

      <div className="fab-wrap">
        <div className="fab-inner">
          <button type="button" className="btn btn--primary btn--lg fab" onClick={abrirAnadir}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Añadir
          </button>
        </div>
      </div>

      <main className="gastos-main">
        <div className="sr-only" role="status" aria-live="polite">
          {cargando ? 'Cargando movimientos…' : aviso}
        </div>
        {aviso && <div className="toast" aria-hidden="true">{aviso}</div>}

        {errorPendientes && (
          <div className="notice notice--error" role="alert">
            <span>{errorPendientes}</span>
            <button type="button" className="link-btn" onClick={() => void cargarPendientes()}>Reintentar</button>
          </div>
        )}

        <PendingReview
          gastos={borradores}
          categorias={categoriasGasto}
          comercios={comerciosGasto}
          onConfirm={confirmarBorrador}
          onDiscard={(gasto) => setDialogo({ tipo: 'descartar', gasto })}
        />

        <PeriodBar
          anio={anio}
          minAnio={MIN_ANIO}
          maxAnio={anioActual + 1}
          mes={mes}
          porMes={porMesDelAnio}
          onAnioChange={cambiarAnio}
          onMesChange={setMes}
        />

        <SummaryCards
          totales={cargando ? null : totalesActuales}
          periodoTexto={periodoTexto}
          categoria={categoria}
          loading={cargando}
        />

        {previstos.length > 0 && (
          <button type="button" className="forecast-jump" onClick={irAPrevistos}>
            {previstos.length === 1 ? 'Tienes 1 movimiento previsto' : `Tienes ${previstos.length} movimientos previstos`}
            <span className="forecast-jump-link">Ver</span>
          </button>
        )}

        <Filters
          tipo={tipo}
          onTipoChange={setTipo}
          categoria={categoria}
          categoriasDisponibles={categoriasFiltro}
          onCategoriaChange={setCategoria}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
          hayFiltros={hayFiltros}
          onLimpiar={limpiarFiltros}
        />

        {!mes && !cargando && !errorPeriodo && porMesDelAnio && (
          <YearOverview porMes={porMesDelAnio} anio={anio} onSelectMes={setMes} />
        )}

        <section className="movements-section" aria-label="Movimientos" aria-busy={cargando}>
          {errorPeriodo ? (
            <div className="empty-state empty-state--error" role="alert">
              <p className="empty-title">No hemos podido cargar tus movimientos</p>
              <p className="empty-text">{errorPeriodo}</p>
              <button type="button" className="btn btn--primary" onClick={() => void cargarPeriodo()}>Reintentar</button>
            </div>
          ) : cargando ? (
            <div className="skeleton-list" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton-row" />)}
            </div>
          ) : visibles.length === 0 ? (
            hayFiltros ? (
              <div className="empty-state">
                <p className="empty-title">No hay nada que coincida</p>
                <p className="empty-text">Prueba con otros filtros o quítalos para ver todo {mes ? 'el mes' : 'el año'}.</p>
                <button type="button" className="btn btn--tonal" onClick={limpiarFiltros}>Quitar filtros</button>
              </div>
            ) : (
              <div className="empty-state">
                <p className="empty-title">Todavía no hay movimientos en {periodoTexto}</p>
                <p className="empty-text">Cuando anotes un gasto o una ganancia aparecerá aquí.</p>
                <button type="button" className="btn btn--primary" onClick={abrirAnadir}>Añadir el primero</button>
              </div>
            )
          ) : (
            <MovementList
              movimientos={visibles}
              onEdit={(gasto) => setDialogo({ tipo: 'movimiento', gasto })}
              onDelete={(gasto) => setDialogo({ tipo: 'eliminar', gasto })}
            />
          )}
        </section>

        <PendingExpenses
          gastos={previstos}
          onOccurred={(gasto) => setDialogo({ tipo: 'ocurrido', gasto })}
          onEdit={(gasto) => setDialogo({ tipo: 'movimiento', gasto })}
          onDiscard={(gasto) => setDialogo({ tipo: 'descartar', gasto })}
        />
      </main>

      {dialogo?.tipo === 'movimiento' && (
        <MovementDialog
          gasto={dialogo.gasto}
          tipoInicial={tipo === 'ganancia' ? 'ganancia' : 'gasto'}
          onClose={() => setDialogo(null)}
          onSave={guardarMovimiento}
        />
      )}

      {dialogo?.tipo === 'ocurrido' && (
        <OccurredDialog
          gasto={dialogo.gasto}
          onClose={() => setDialogo(null)}
          onConfirm={(fecha) => confirmarPrevisto(dialogo.gasto, fecha)}
        />
      )}

      {dialogo?.tipo === 'eliminar' && (
        <ConfirmDialog
          title="¿Eliminar este movimiento?"
          confirmLabel="Eliminar"
          danger
          onClose={() => setDialogo(null)}
          onConfirm={() => eliminar(dialogo.gasto, 'Movimiento eliminado.')}
        >
          <p>
            <strong>{dialogo.gasto.comercio}</strong>
            {' · '}{formatSignedMoney(dialogo.gasto.importe, dialogo.gasto.tipo)}
            {dialogo.gasto.fecha && <> · {formatFechaLarga(dialogo.gasto.fecha)}</>}
          </p>
          <p>Dejará de contar en tus totales. No se puede deshacer desde aquí.</p>
        </ConfirmDialog>
      )}

      {dialogo?.tipo === 'descartar' && (
        <ConfirmDialog
          title={dialogo.gasto.estado === 'previsto' ? '¿Descartar este previsto?' : '¿Descartar este ticket?'}
          confirmLabel="Descartar"
          danger
          onClose={() => setDialogo(null)}
          onConfirm={() => eliminar(dialogo.gasto, 'Descartado.')}
        >
          <p>
            <strong>{dialogo.gasto.comercio}</strong> · {formatMoney(dialogo.gasto.importe)}
          </p>
          <p>Se quitará de la lista y no contará en tus totales.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
