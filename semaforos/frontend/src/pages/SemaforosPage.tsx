import { useCallback, useEffect, useMemo, useState } from 'react';
import keycloak from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import SemaforosMap from '../components/SemaforosMap';
import AccesoPanel from '../components/AccesoPanel';
import CiudadBar from '../components/CiudadBar';
import {
  actualizarAcceso,
  borrarAcceso,
  borrarObservacion,
  crearAcceso,
  crearObservacion,
  getAcceso,
  getCiudades,
  getCruces,
  importarCiudad,
  renombrarCruce,
} from '../services/api';
import type { AccesoDetalle, Ciudad, Color, Cruce, ResumenImportacion } from '../types';
import './SemaforosPage.css';

const CLAVE_CIUDAD = 'semaforos.ciudad';

function recordarCiudad(ciudad: string | null) {
  try {
    if (ciudad) localStorage.setItem(CLAVE_CIUDAD, ciudad);
  } catch {
    /* sin almacenamiento: solo se pierde la comodidad de recordar la ciudad */
  }
}
function ciudadRecordada(): string | null {
  try {
    return localStorage.getItem(CLAVE_CIUDAD);
  } catch {
    return null;
  }
}

const mensaje = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export default function SemaforosPage() {
  const [ciudades, setCiudades] = useState<Ciudad[]>([]);
  const [ciudad, setCiudad] = useState<string | null>(null);
  const [cruces, setCruces] = useState<Cruce[]>([]);
  const [cruceId, setCruceId] = useState<number | null>(null);
  const [accesoId, setAccesoId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<AccesoDetalle | null>(null);
  const [busy, setBusy] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const [errorCiudad, setErrorCiudad] = useState<string | null>(null);
  const [errorPanel, setErrorPanel] = useState<string | null>(null);

  const roles: string[] =
    (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? [];
  const isAdmin = roles.includes('admin');

  const cruce = useMemo(() => cruces.find((c) => c.id === cruceId) ?? null, [cruces, cruceId]);

  const cargarCiudades = useCallback(async (preferida?: string | null) => {
    const lista = await getCiudades();
    setCiudades(lista);
    const elegida =
      lista.find((c) => c.ciudad === preferida)?.ciudad ??
      lista.find((c) => c.ciudad === ciudadRecordada())?.ciudad ??
      lista[0]?.ciudad ??
      null;
    setCiudad(elegida);
    return elegida;
  }, []);

  useEffect(() => {
    if (!isAdmin || !keycloak.authenticated) return;
    cargarCiudades().catch((err) => setErrorCiudad(mensaje(err, 'No se pudieron cargar las ciudades')));
  }, [isAdmin, cargarCiudades]);

  useEffect(() => {
    if (!ciudad) {
      setCruces([]);
      return;
    }
    recordarCiudad(ciudad);
    setCruceId(null);
    setAccesoId(null);
    setDetalle(null);
    getCruces(ciudad)
      .then(setCruces)
      .catch((err) => setErrorCiudad(mensaje(err, 'No se pudieron cargar los semáforos')));
  }, [ciudad]);

  /** Recarga un acceso y propaga su modelo nuevo al mapa. */
  const refrescarAcceso = useCallback(async (id: number) => {
    const fresco = await getAcceso(id);
    setDetalle(fresco);
    const { observaciones: _omit, ...acceso } = fresco;
    void _omit;
    setCruces((prev) =>
      prev.map((c) => (c.id === acceso.cruce_id ? { ...c, accesos: c.accesos.map((a) => (a.id === id ? acceso : a)) } : c)),
    );
  }, []);

  const recargarCruces = useCallback(async () => {
    if (ciudad) setCruces(await getCruces(ciudad));
  }, [ciudad]);

  const seleccionar = useCallback(
    (nuevoCruceId: number, nuevoAccesoId: number | null) => {
      setErrorPanel(null);
      setCruceId(nuevoCruceId);
      setAccesoId(nuevoAccesoId);
      setDetalle(null);
      if (nuevoAccesoId !== null) refrescarAcceso(nuevoAccesoId).catch((e) => setErrorPanel(mensaje(e, 'No se pudo cargar el acceso')));
    },
    [refrescarAcceso],
  );

  /** Ejecuta una accion del panel con el aviso de "ocupado" y el error en un solo sitio. */
  async function accion(fn: () => Promise<void>, fallback: string) {
    setBusy(true);
    setErrorPanel(null);
    try {
      await fn();
    } catch (e) {
      setErrorPanel(mensaje(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportar(nombre: string) {
    setImportando(true);
    setErrorCiudad(null);
    setResumen(null);
    try {
      const r = await importarCiudad(nombre);
      setResumen(r);
      const elegida = await cargarCiudades(r.ciudad);
      if (elegida === r.ciudad) setCruces(await getCruces(r.ciudad));
    } catch (e) {
      setErrorCiudad(mensaje(e, 'La importación falló'));
    } finally {
      setImportando(false);
    }
  }

  if (!keycloak.authenticated) {
    return (
      <div className="sem-gate">
        <h1>Semáforos</h1>
        <p>Inicia sesión para ver el estado de los semáforos.</p>
        <button className="sem-btn sem-btn--primary" onClick={() => keycloak.login()}>
          Iniciar sesión
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="sem-gate">
        <h1>Semáforos</h1>
        <p>No tienes acceso a esta aplicación.</p>
      </div>
    );
  }

  return (
    <div className="sem-page">
      <header className="sem-header">
        <div className="sem-header__left">
          <AppLauncher />
          <h1>Semáforos</h1>
          <span className="sem-header__tag">Estado estimado en el mapa</span>
        </div>
        <div className="sem-header__right">
          <ThemeToggle />
          <button className="sem-btn" onClick={() => keycloak.logout()}>
            Salir
          </button>
        </div>
      </header>

      <CiudadBar
        ciudades={ciudades}
        ciudad={ciudad}
        importando={importando}
        resumen={resumen}
        error={errorCiudad}
        onElegir={setCiudad}
        onImportar={handleImportar}
      />

      <div className="sem-body">
        <main className="sem-main">
          <SemaforosMap
            cruces={cruces}
            selectedAccesoId={accesoId}
            selectedCruceId={cruceId}
            onSelect={seleccionar}
          />
          {ciudades.length === 0 && !importando && (
            <div className="sem-vacio">
              <h2>Empieza importando una ciudad</h2>
              <p>
                Escribe el nombre de un municipio arriba. Los semáforos se descargan de OpenStreetMap; los
                tiempos los anotas tú.
              </p>
            </div>
          )}
        </main>

        {cruce && (
          <AccesoPanel
            cruce={cruce}
            accesoId={accesoId}
            detalle={detalle}
            busy={busy}
            error={errorPanel}
            onSelectAcceso={(id) => seleccionar(cruce.id, id)}
            onRegistrar={(color: Color, haceS) =>
              accion(async () => {
                if (accesoId === null) return;
                await crearObservacion(accesoId, color, haceS);
                await refrescarAcceso(accesoId);
              }, 'No se pudo anotar el cambio')
            }
            onBorrarObservacion={(id) =>
              accion(async () => {
                await borrarObservacion(id);
                if (accesoId !== null) await refrescarAcceso(accesoId);
              }, 'No se pudo borrar la anotación')
            }
            onManual={(color, valor) =>
              accion(async () => {
                if (accesoId === null) return;
                await actualizarAcceso(accesoId, { [`${color}_manual_s`]: valor });
                await refrescarAcceso(accesoId);
              }, 'No se pudo guardar la duración')
            }
            onRenombrarCruce={() => {
              const nombre = window.prompt('Nombre del cruce', cruce.nombre)?.trim();
              if (!nombre || nombre === cruce.nombre) return;
              void accion(async () => {
                await renombrarCruce(cruce.id, nombre);
                await recargarCruces();
              }, 'No se pudo renombrar el cruce');
            }}
            onRenombrarAcceso={() => {
              const actual = cruce.accesos.find((a) => a.id === accesoId);
              if (!actual) return;
              const nombre = window.prompt('Nombre del acceso', actual.nombre)?.trim();
              if (!nombre || nombre === actual.nombre) return;
              void accion(async () => {
                await actualizarAcceso(actual.id, { nombre });
                await refrescarAcceso(actual.id);
              }, 'No se pudo renombrar el acceso');
            }}
            onNuevoAcceso={() => {
              const nombre = window.prompt('Nombre del nuevo acceso (calle y sentido)')?.trim();
              if (!nombre) return;
              const rumboTxt = window.prompt('Rumbo de marcha en grados (0 = norte, 90 = este). Vacío si no lo sabes.');
              const rumbo = rumboTxt && rumboTxt.trim() !== '' ? Math.round(Number(rumboTxt)) : null;
              if (rumbo !== null && (!Number.isFinite(rumbo) || rumbo < 0 || rumbo > 359)) {
                setErrorPanel('El rumbo debe estar entre 0 y 359');
                return;
              }
              void accion(async () => {
                const nuevo = await crearAcceso(cruce.id, nombre, rumbo);
                await recargarCruces();
                seleccionar(cruce.id, nuevo.id);
              }, 'No se pudo crear el acceso');
            }}
            onBorrarAcceso={() => {
              if (accesoId === null) return;
              if (!window.confirm('¿Borrar este acceso y sus anotaciones? Esta acción no se puede deshacer.')) return;
              void accion(async () => {
                await borrarAcceso(accesoId);
                setAccesoId(null);
                setDetalle(null);
                await recargarCruces();
              }, 'No se pudo borrar el acceso');
            }}
            onCerrar={() => {
              setCruceId(null);
              setAccesoId(null);
              setDetalle(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
